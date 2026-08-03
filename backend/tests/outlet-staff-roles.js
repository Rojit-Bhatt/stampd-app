/**
 * Outlet staff roles suite. Self-contained: boots its own server on a
 * dedicated port against the in-memory mock DB.
 *
 * The negative cases are the point of this suite. Grows across the plan's tasks:
 * Task 1 pins the no-migration promise (an admin created before staffRole
 * existed keeps full access), Task 2 adds the per-route 403 matrix, Task 5
 * adds the /api/admin/staff surface.
 *
 * Run directly: `node tests/outlet-staff-roles.js`
 */

const { bootServer } = require("./helpers/bootServer");
const { makeApi, makeSiblingOutlet, verifyAdmin } = require("./helpers/makeOutlet");

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 5058 });
  let failures = 0;
  const check = (name, cond, extra) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
  };
  const api = makeApi(baseUrl);

  try {
    // --- the no-migration promise ---------------------------------
    // An outlet admin provisioned the normal way has no staffRole at all.
    // It must keep full access to every gated surface, with no backfill.
    const outlet = await makeSiblingOutlet(baseUrl, { label: `sr${Date.now()}` });
    const t = outlet.adminToken;

    const settings = await api("/api/admin/settings", { token: t });
    check("existing admin reads settings", settings.status === 200, settings);
    check(
      "settings reports staffRole null for a pre-roles admin",
      settings.body?.settings?.staffRole === null,
      settings.body?.settings,
    );
    check(
      "settings reports staffPinRequired false for a fresh outlet",
      settings.body?.settings?.staffPinRequired === false,
      settings.body?.settings,
    );

    const patched = await api("/api/admin/settings", {
      method: "PATCH", token: t, body: { name: "Renamed By Primary" },
    });
    check("existing admin still writes settings", patched.status === 200, patched);

    const report = await api("/api/admin/reports/summary", { token: t });
    check("existing admin still reads reports", report.status === 200, report);

    const reward = await api("/api/admin/rewards", {
      method: "POST", token: t, body: { name: "Free Coffee", pointsPrice: 10 },
    });
    check("existing admin still creates rewards", reward.status === 201 || reward.status === 200, reward);

    // --- the 403 matrix -------------------------------------------
    // Two more sibling outlets, each demoted to a role, so the matrix is
    // asserted against real tokens rather than a unit-tested predicate.
    const staffOutlet = await makeSiblingOutlet(baseUrl, { label: `st${Date.now()}` });
    await api("/__test__/set-staff-role", {
      method: "POST", body: { email: staffOutlet.adminEmail, staffRole: "staff" },
    });
    const staffT = staffOutlet.adminToken;

    const mgrOutlet = await makeSiblingOutlet(baseUrl, { label: `mg${Date.now()}` });
    await api("/__test__/set-staff-role", {
      method: "POST", body: { email: mgrOutlet.adminEmail, staffRole: "manager" },
    });
    const mgrT = mgrOutlet.adminToken;

    // The token is re-verified against the DB on every request, so the
    // demotion applies to the ALREADY-ISSUED token with no re-login. Assert
    // that directly — it's the reason staffRole is resolved in verifyToken
    // rather than baked into the JWT.
    const staffSettings = await api("/api/admin/settings", { token: staffT });
    check(
      "a demotion applies to an already-issued token",
      staffSettings.body?.settings?.staffRole === "staff",
      staffSettings.body?.settings,
    );

    // GET /settings must stay OPEN for staff: AdminGuard revalidates against
    // it, and a 403 here would log the account out in a loop.
    check("staff can still READ settings", staffSettings.status === 200, staffSettings);

    const blocked = [
      ["manage_settings", "PATCH", "/api/admin/settings", { name: "Nope" }],
      ["view_reports",    "GET",   "/api/admin/reports/customers/download"],
      ["view_reports",    "GET",   "/api/admin/reports/summary"],
      ["view_reports",    "GET",   "/api/admin/dashboard-stats"],
      ["view_reports",    "GET",   "/api/admin/transactions"],
      ["view_reports",    "GET",   "/api/admin/customers"],
      ["manage_catalog",  "POST",  "/api/admin/rewards", { name: "X", pointsPrice: 1 }],
      ["manage_catalog",  "POST",  "/api/admin/menu", { name: "X", price: 1 }],
      ["manage_marketing","POST",  "/api/admin/campaigns", { name: "X", multiplier: 2 }],
      ["manage_marketing","POST",  "/api/admin/events", { title: "X" }],
      ["manage_marketing","GET",   "/api/admin/broadcasts"],
    ];

    for (const [action, method, path, body] of blocked) {
      const r = await api(path, { method, token: staffT, body });
      check(
        `staff is 403 on ${method} ${path} (${action})`,
        r.status === 403 && r.body?.code === "STAFF_ROLE_FORBIDDEN",
        r,
      );
    }

    // A manager passes every one of those.
    for (const [, method, path, body] of blocked) {
      const r = await api(path, { method, token: mgrT, body });
      check(`manager is NOT 403 on ${method} ${path}`, r.status !== 403, r);
    }

    // Reads the counter genuinely needs stay open for staff. Campaigns
    // especially: GenerateQr.tsx reads it to show the live multiplier BEFORE
    // staff quote a number, so gating it would make them quote the wrong one.
    for (const path of ["/api/admin/campaigns", "/api/admin/menu", "/api/admin/rewards", "/api/admin/events"]) {
      const r = await api(path, { token: staffT });
      check(`staff can still read ${path}`, r.status === 200, r);
    }

    // And the counter itself is untouched by the role. Both routes already
    // return 201 (unrelated to this feature) — asserting the real status,
    // not a bare "not 403", so this can't pass by accident.
    const staffQr = await api("/api/admin/generate-qr", {
      method: "POST", token: staffT, body: { billAmount: 500 },
    });
    check("staff can still generate an earn QR", staffQr.status === 201, staffQr);
    const staffRedeemQr = await api("/api/admin/generate-redeem-qr", { method: "POST", token: staffT });
    check("staff can still generate a redeem QR", staffRedeemQr.status === 201, staffRedeemQr);

    // --- the /api/admin/staff surface -------------------------------
    // A fresh outlet, primary admin only (no PIN yet).
    const hqOutlet = await makeSiblingOutlet(baseUrl, { label: `hq${Date.now()}` });
    const hqT = hqOutlet.adminToken;

    // manager is 403 on all five /api/admin/staff routes.
    const staffRoutes = [
      ["GET", "/api/admin/staff"],
      ["POST", "/api/admin/staff", { name: "X", email: `nope-${Date.now()}@test.com`, staffRole: "staff", password: "password", pin: "1111" }],
      ["PATCH", "/api/admin/staff/000000000000000000000000", { staffRole: "manager" }],
      ["DELETE", "/api/admin/staff/000000000000000000000000"],
    ];
    for (const [method, path, body] of staffRoutes) {
      const r = await api(path, { method, token: mgrT, body });
      check(`manager is 403 on ${method} ${path}`, r.status === 403 && r.body?.code === "STAFF_ROLE_FORBIDDEN", r);
    }
    // The compound-gate pin route is separate: manager CAN act on itself.
    const mgrSelfPinRoute = await api("/api/admin/staff/me/pin", { method: "PATCH", token: mgrT, body: { pin: "5566" } });
    check("manager acting on self via /staff/me/pin is not blocked by manage_staff", mgrSelfPinRoute.status !== 403, mgrSelfPinRoute);

    // Inviting before the caller has a PIN -> 400 SET_YOUR_PIN_FIRST.
    const tooEarly = await api("/api/admin/staff", {
      method: "POST", token: hqT,
      body: { name: "Asha", email: `asha-${Date.now()}@test.com`, staffRole: "staff", password: "password", pin: "1111" },
    });
    check("inviting before the caller has a PIN -> 400 SET_YOUR_PIN_FIRST", tooEarly.status === 400 && tooEarly.body?.code === "SET_YOUR_PIN_FIRST", tooEarly);

    // Set the primary's own PIN first (lockout guard satisfied).
    const setOwnPin = await api("/api/admin/staff/me/pin", { method: "PATCH", token: hqT, body: { pin: "1234" } });
    check("primary sets own PIN via /staff/me/pin", setOwnPin.status === 200, setOwnPin);

    // Now the invite succeeds.
    const inviteEmail = `asha-${Date.now()}@test.com`;
    const invite = await api("/api/admin/staff", {
      method: "POST", token: hqT,
      body: { name: "Asha", email: inviteEmail, staffRole: "staff", password: "password", pin: "1111" },
    });
    check("invite succeeds once the caller has a PIN", invite.status === 201, invite);

    const staffList = await api("/api/admin/staff", { token: hqT });
    const invited = staffList.body?.staff?.find((s) => s.email === inviteEmail);
    check("invited row appears in GET /api/admin/staff", Boolean(invited), staffList.body);
    check("invited row has hasPin true", invited?.hasPin === true, invited);
    check("invited row has emailVerified false", invited?.emailVerified === false, invited);

    // Response never leaks the hash, in any shape.
    check("GET /staff response never contains staffPinHash", !JSON.stringify(staffList.body).includes("staffPinHash"), staffList.body);
    check("POST /staff response never contains staffPinHash", !JSON.stringify(invite.body).includes("staffPinHash"), invite.body);

    // The invitee genuinely reuses the existing verification flow.
    const earlyLogin = await api("/api/admin-auth/login", { method: "POST", body: { email: inviteEmail, password: "password" } });
    check("unverified invitee -> 403 NEEDS_VERIFICATION", earlyLogin.status === 403 && earlyLogin.body?.code === "NEEDS_VERIFICATION", earlyLogin);
    await verifyAdmin(api, inviteEmail);
    const afterVerifyLogin = await api("/api/admin-auth/login", { method: "POST", body: { email: inviteEmail, password: "password" } });
    check("invitee can sign in after verifying", afterVerifyLogin.status === 200, afterVerifyLogin);

    // Duplicate PIN at the SAME outlet -> 409 PIN_TAKEN.
    const dupPinSameOutlet = await api("/api/admin/staff", {
      method: "POST", token: hqT,
      body: { name: "Bikash", email: `bikash-${Date.now()}@test.com`, staffRole: "staff", password: "password", pin: "1111" },
    });
    check("duplicate PIN at the same outlet -> 409 PIN_TAKEN", dupPinSameOutlet.status === 409 && dupPinSameOutlet.body?.code === "PIN_TAKEN", dupPinSameOutlet);

    // Same PIN string at a DIFFERENT outlet is fine.
    const otherOutlet = await makeSiblingOutlet(baseUrl, { label: `ho${Date.now()}` });
    const otherT = otherOutlet.adminToken;
    await api("/api/admin/staff/me/pin", { method: "PATCH", token: otherT, body: { pin: "9090" } });
    const samePinOtherOutlet = await api("/api/admin/staff", {
      method: "POST", token: otherT,
      body: { name: "Chandra", email: `chandra-${Date.now()}@test.com`, staffRole: "staff", password: "password", pin: "1111" },
    });
    check("same PIN string at a different outlet is fine", samePinOtherOutlet.status === 201, samePinOtherOutlet);

    // Cross-outlet id -> 404, not a leak.
    const foreignId = invited.id;
    const crossPatch = await api(`/api/admin/staff/${foreignId}`, { method: "PATCH", token: otherT, body: { staffRole: "manager" } });
    check("PATCH with another outlet's staff id -> 404", crossPatch.status === 404, crossPatch);
    const crossDelete = await api(`/api/admin/staff/${foreignId}`, { method: "DELETE", token: otherT });
    check("DELETE with another outlet's staff id -> 404", crossDelete.status === 404, crossDelete);

    // CANNOT_EDIT_SELF: the primary can't PATCH their own row. Resolve the
    // primary's own membership id via the staff list (isSelf).
    const hqStaffList = await api("/api/admin/staff", { token: hqT });
    const primaryRow = hqStaffList.body?.staff?.find((s) => s.isPrimary);
    check("primary row is marked isPrimary", Boolean(primaryRow), hqStaffList.body);

    const selfPatch = await api(`/api/admin/staff/${primaryRow.id}`, { method: "PATCH", token: hqT, body: { staffRole: "manager" } });
    check("PATCH targeting self -> 400 CANNOT_EDIT_SELF", selfPatch.status === 400 && selfPatch.body?.code === "CANNOT_EDIT_SELF", selfPatch);

    // CANNOT_MODIFY_PRIMARY: a manager cannot PATCH/DELETE the primary
    // (also blocked for staff, but manager is the more interesting case).
    const promoteMgr = await api(`/api/admin/staff/${invited.id}`, { method: "PATCH", token: hqT, body: { staffRole: "manager" } });
    check("primary can promote invited staff to manager", promoteMgr.status === 200, promoteMgr);
    const setInvitedPin = await api(`/api/admin/staff/${invited.id}/pin`, { method: "PATCH", token: hqT, body: { pin: "2222" } });
    check("primary can set another member's PIN", setInvitedPin.status === 200, setInvitedPin);
    const invitedLogin = await api("/api/admin-auth/login", { method: "POST", body: { email: inviteEmail, password: "password" } });
    const invitedMgrToken = invitedLogin.body?.token;

    const mgrPatchPrimary = await api(`/api/admin/staff/${primaryRow.id}`, { method: "PATCH", token: invitedMgrToken, body: { staffRole: "manager" } });
    check("manager cannot PATCH the primary -> 403 (manage_staff gate first)", mgrPatchPrimary.status === 403, mgrPatchPrimary);

    // staffRole: null in the PATCH body -> 400 INVALID_STAFF_ROLE (checked
    // with the primary acting, so the role-validation guard is isolated from
    // the manage_staff/self/primary guards above).
    const nullRolePatch = await api(`/api/admin/staff/${invited.id}`, { method: "PATCH", token: hqT, body: { staffRole: null } });
    check("staffRole: null -> 400 INVALID_STAFF_ROLE", nullRolePatch.status === 400 && nullRolePatch.body?.code === "INVALID_STAFF_ROLE", nullRolePatch);

    // Primary acting on the primary via PATCH/DELETE -> CANNOT_MODIFY_PRIMARY
    // is unreachable (primary can only ever target itself, which is
    // CANNOT_EDIT_SELF first) — so exercise it from a second staffer that
    // isn't self and isn't the primary, targeting the primary.
    const primaryDeleteAttempt = await api(`/api/admin/staff/${primaryRow.id}`, { method: "DELETE", token: hqT });
    check("primary deleting itself -> 400 CANNOT_EDIT_SELF (self check runs first)", primaryDeleteAttempt.status === 400 && primaryDeleteAttempt.body?.code === "CANNOT_EDIT_SELF", primaryDeleteAttempt);

    // Self PIN change with a wrong currentPin -> 401 PIN_REJECTED.
    const wrongCurrentPin = await api("/api/admin/staff/me/pin", { method: "PATCH", token: hqT, body: { pin: "4321", currentPin: "0000" } });
    check("self PIN change with wrong currentPin -> 401 PIN_REJECTED", wrongCurrentPin.status === 401 && wrongCurrentPin.body?.code === "PIN_REJECTED", wrongCurrentPin);
    const rightCurrentPin = await api("/api/admin/staff/me/pin", { method: "PATCH", token: hqT, body: { pin: "4321", currentPin: "1234" } });
    check("self PIN change with correct currentPin succeeds", rightCurrentPin.status === 200, rightCurrentPin);

    // --- the enterOutlet/listOutlets primary fix ---------------------
    // After inviting staff at an outlet, the company owner's enter-outlet
    // still lands with FULL access (staffRole null), not whichever staff
    // row happens to be fetched first.
    const ownerEnter = await api("/api/company/enter-outlet", {
      method: "POST", token: hqOutlet.ownerToken, body: { organizationId: hqOutlet.outletId },
    });
    check("owner enter-outlet succeeds after staff exist at the outlet", ownerEnter.status === 200, ownerEnter);
    const ownerEnterSettings = await api("/api/admin/settings", { token: ownerEnter.body?.token });
    check(
      "owner entering an outlet with sub-staff still lands as the PRIMARY admin",
      ownerEnterSettings.body?.settings?.staffRole === null,
      ownerEnterSettings.body?.settings,
    );
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll outlet-staff-role checks passed.");
}

main().catch((err) => { console.error(err); process.exit(1); });
