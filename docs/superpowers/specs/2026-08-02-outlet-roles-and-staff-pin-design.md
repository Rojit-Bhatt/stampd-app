# Outlet roles and the staff PIN

Date: 2026-08-02
Status: approved, not implemented

Roadmap sub-projects 8 and 9, specified together because neither is complete
without the other: the role dimension decides *what* an account may reach, and
the PIN decides *who* is acting on a shared counter device. One touches the
permission model, the other the ledger's attribution — and they meet on the
two counter routes, where the PIN is the enforcement point for the role.

## What this is not

A previous design pass on "staff PIN" read it as a **customer self-service
earn code**: the customer types a code and awards themselves points. That
reading is rejected and stays rejected. It breaks the staff-attested-bill
invariant the whole loyalty loop rests on (CLAUDE.md, "The points loop"): the
bill is mandatory, the award is a function of it, and a customer must never be
able to move their own balance. A customer-entered code makes the bill an
unattested claim.

What this actually is: a shared counter device, signed in once under one
login, with several people working the till across a shift. The PIN says
**which of them is at the counter right now**. It is stamped onto the ledger
row for the audit trail, and — for `staff`-role accounts — it is the moment
the permission check actually bites.

This adds an identification layer *on top of* an unchanged loyalty core.
Explicitly untouched:

- The bill stays mandatory for earn.
- Redeem stays staff-initiated.
- `DynamicQRToken.purpose` still gates earn vs redeem on consume.
- The single-use `consumeDynamicQrToken` guard is not modified.
- The atomic `findOneAndUpdate({balanceCenti: {$gte: price}})` redeem guard is
  not modified.
- `isBusinessAdmin` is not weakened. Every new check is layered *after* it,
  never instead of it.

## 1. The role dimension

### `AdminAccount.staffRole`

```js
// Only meaningful when kind === "outlet_admin". null/unset means FULL access,
// including managing other staff — deliberate, so every outlet admin that
// existed before this field keeps working with no migration. This is the same
// convention User.platformRole already uses for platform admins.
//
//   null      -> the outlet's primary admin. Everything.
//   "manager" -> everything except managing other staff.
//   "staff"   -> the counter only: generate an earn QR, generate a redeem QR.
staffRole: { type: String, enum: ["manager", "staff"], default: null }
```

Three tiers, not two, because `null` is load-bearing: it is both "the account
that has been here since before roles existed" and "the outlet's primary
admin". Collapsing `null` into `manager` would silently take staff management
away from every existing outlet on deploy.

The enum lists only the two assignable values. Mongoose lets an unset/`null`
value past an enum when the field isn't `required`, which is exactly how
`User.platformRole` already encodes its own "unset means full access" — so
`null` is reachable as a *default* but is never something a client can set.
That asymmetry is deliberate: an outlet has exactly one primary admin, created
with the outlet, and nothing in this feature promotes a second one (§1.4).

### 1.1 Where the role is resolved

In `verifyToken` (`middleware/authMiddleware.js`), alongside the existing
`platformRole` resolution, and for the same stated reason: **read fresh from
the DB on every request rather than trusting the JWT**, so a demotion takes
effect immediately instead of riding out `JWT_EXPIRES_IN`.

```js
req.user.staffRole = user.role === "business_admin" ? resolvedStaffRole : null;
```

Resolution is one extra `AdminAccount.findOne({_id: user.adminAccountId})`,
and only for `business_admin` rows. A `business_admin` User row with a null
`adminAccountId` (none exist today, but the schema permits it) resolves to
`null` — full access, matching the no-migration promise.

`req.user.staffRole` is therefore universally available, which is the point:
a guard that has to remember to fetch its own subject is a guard that will
eventually be added without the fetch.

### 1.2 `requireStaffPermission(action)`

New export from `middleware/authMiddleware.js`, mounted **after**
`isBusinessAdmin` on every gated route. It never authenticates and never
resolves a tenant; it reads `req.user.staffRole` and answers one question.

```js
const staffRoleAllows = (staffRole, action) => {
  if (!staffRole) return true;                    // primary admin / legacy
  if (staffRole === "manager") return action !== "manage_staff";
  return false;                                   // "staff": counter only
};
```

Five actions. They are coarse on purpose — one action per *console area*, not
per route — so the mapping table below stays readable and a new route in an
existing area cannot accidentally land ungated with a plausible-looking new
action name.

| action | covers |
|---|---|
| `manage_settings` | the outlet's own configuration: name, category, branding, contact, program, tiers, messaging triggers, customer-info toggles, menu on/off |
| `manage_catalog` | what the outlet sells or gives away: menu CRUD + import, rewards CRUD, image upload/delete |
| `manage_marketing` | campaigns CRUD, events CRUD, broadcasts (all verbs) |
| `view_reports` | every aggregate or roster view: dashboard stats, tier distribution, the summary report, all three `.xlsx` downloads, the transaction ledger, the customer list |
| `manage_staff` | the sub-admin surface itself |

Failure shape matches `isPlatformOwner` exactly:

```
403 { success: false, message: "Forbidden: this action isn't available for your role.", code: "STAFF_ROLE_FORBIDDEN" }
```

A single message for all five actions. Naming the action back to the caller
would tell a `staff` account the shape of the permission model it is being
kept out of, and buys the legitimate user nothing they can act on.

### 1.3 Every route that becomes staff-restricted, and why

All of these already sit behind `verifyToken` + `isBusinessAdmin`. The column
says what a `staff`-role account gets; `manager` passes everything here except
the `manage_staff` block; `null` passes all of it.

**`manage_settings`**

| route | why |
|---|---|
| `PATCH /api/admin/settings` | The single write path for branding, contact, the **points program** (`earnPercent`, `pointsExpiryDays`), tier thresholds, messaging triggers and the customer-info toggles. A till operator who can raise `earnPercent` can hand out unlimited value; one who can lower `pointsExpiryDays` can vaporise every idle balance at the outlet. This is the highest-value write in the console. |

**`manage_catalog`**

| route | why |
|---|---|
| `POST /api/admin/menu` | Creating an item with a `pointsPriceCenti` puts something new on the redemption catalog. |
| `PATCH /api/admin/menu/:id` | Re-pricing an existing item in points is the same power, applied to something customers already see. |
| `DELETE /api/admin/menu/:id` | Destructive, and silently removes a redeemable. |
| `POST /api/admin/menu/import/preview` | Reads an uploaded spreadsheet. Harmless alone, but it is the first half of a two-step write and there is no reason for a till operator to start one. |
| `POST /api/admin/menu/import/confirm` | Bulk write through `createItem`/`updateItem` — the largest single mutation in the console. |
| `POST /api/admin/rewards` | Mints something redeemable for points. Direct give-away power. |
| `PATCH /api/admin/rewards/:id` | Re-pricing a reward to 1 point is a total loss of control over the balance sheet. |
| `DELETE /api/admin/rewards/:id` | Destructive. |
| `POST /api/admin/images` | Only ever used to attach a picture to a reward, an event, or branding — all three of which are themselves gated. Leaving it open would let a `staff` account fill the image collection with 256KB rows it can never attach to anything. |
| `DELETE /api/admin/images/:id` | Destructive, and can strip the outlet's own logo. |

`GET /api/admin/menu` and `GET /api/admin/rewards` stay **open**. Both serve
data the customer app already publishes unauthenticated (`/api/menu`,
`/api/points/catalog`); gating the admin read buys nothing and would break the
console's own catalog views for no benefit.

`GET /api/admin/menu/template` (the blank import spreadsheet) stays open — it
is a static file with no outlet data in it at all.

**`manage_marketing`**

| route | why |
|---|---|
| `POST /api/admin/campaigns` | A campaign multiplies what every bill earns. Creating a 10× campaign is the most direct way to give away the outlet's money, and it is invisible on the till screen beyond a badge. |
| `PATCH /api/admin/campaigns/:id` | Same, applied to a live one. |
| `DELETE /api/admin/campaigns/:id` | Destructive; also silently drops a promise the outlet is advertising. |
| `POST /api/admin/events` | Publishes copy to the outlet's public customer page. |
| `PATCH /api/admin/events/:id` | Same. |
| `DELETE /api/admin/events/:id` | Destructive. |
| `GET /api/admin/broadcasts` | Unlike the catalog, a broadcast is **not** customer-visible: it holds message bodies and audience filters. Read is gated with the writes. |
| `GET /api/admin/broadcasts/:id` | Same, plus recipient figures. |
| `POST /api/admin/broadcasts` | Sends messages to customers in the outlet's name. |
| `PATCH /api/admin/broadcasts/:id` | Same. |
| `DELETE /api/admin/broadcasts/:id` | Destructive. |

`GET /api/admin/campaigns` and `GET /api/admin/events` stay **open**, for the
same reason the catalog reads do — and in the campaigns case it is a hard
requirement, not a courtesy: `GenerateQr.tsx` calls `useCampaigns()` to show
staff the live multiplier *before they quote a number to the customer*.
Gating it would leave a `staff` account quoting the un-multiplied figure.

**`view_reports`**

| route | why |
|---|---|
| `GET /api/admin/dashboard-stats` | Outlet revenue and points-issued totals. Commercially sensitive; nothing at the till needs it. |
| `GET /api/admin/tier-distribution` | Customer-base composition. |
| `GET /api/admin/reports/summary` | The full date-ranged business report on screen. |
| `GET /api/admin/reports/summary/download` | The same as a downloadable `.xlsx` — a file that leaves the building. |
| `GET /api/admin/reports/customers/download` | **A spreadsheet of every customer's name, email and phone.** The single largest PII exfiltration surface in the outlet console. |
| `GET /api/admin/reports/transactions/download` | The whole ledger, exportable. |
| `GET /api/admin/transactions` | The outlet's complete points ledger, on screen. |
| `GET /api/admin/customers` | The customer roster with contact details — the on-screen twin of the customers download, and gated for exactly the same reason. |

**`manage_staff`**

| route | why |
|---|---|
| `GET /api/admin/staff` | Lists colleagues' names, emails and roles, and reveals who has a PIN set. `manager` is excluded from this alongside `staff`: a manager who can enumerate PIN-holders and invite accounts can manufacture an identity to attribute their own actions to, which is precisely what the audit trail exists to prevent. |
| `POST /api/admin/staff` | Creates a credential that can sign into this outlet. |
| `PATCH /api/admin/staff/:id` | Changes a colleague's role. Ungated, a manager could promote themselves. |
| `DELETE /api/admin/staff/:id` | Revokes a colleague's access. |
| `PATCH /api/admin/staff/:id/pin` | Sets a PIN — i.e. sets who a ledger row can be attributed to. Gated by `manage_staff` **or** self (§2.6). |

**Deliberately left open to every role, including `staff`:**

| route | why |
|---|---|
| `GET /api/admin/settings` | `AdminGuard` revalidates its cached token against this endpoint; gating it would strand a `staff` account in the permanent "Verifying credentials" loop the guard was written to avoid. It is also where the console learns its own `staffRole`. Contents are the outlet's own configuration, which the acting user works under anyway. |
| `POST /api/admin/generate-qr` | The job. Gated by PIN instead (§2). |
| `POST /api/admin/generate-redeem-qr` | The job. Gated by PIN instead (§2). |
| `POST /api/admin/verify-pin` | Must be reachable *by* a `staff` account — it is how one identifies itself. Rate-limited instead (§2.5). |
| `GET /api/admin/menu`, `/rewards`, `/campaigns`, `/events`, `/menu/template` | Reasoned above. |
| `/api/account/*` | Own profile and own password, for any authenticated role. Not outlet data. |

### 1.4 What roles cannot do

- **No self-promotion.** `PATCH /api/admin/staff/:id` rejects `:id` resolving
  to the caller's own membership (400 `CANNOT_EDIT_SELF`), so even the primary
  admin cannot use this route on themselves.
- **`staffRole: null` is not assignable.** `PATCH /api/admin/staff/:id` accepts
  only `"manager"` or `"staff"`. There is exactly one primary admin per
  outlet, it is created with the outlet, and promoting a second one would
  break the "who is the primary" lookups in §1.5.
- **The primary admin cannot be demoted or deleted** through this surface
  (400 `CANNOT_MODIFY_PRIMARY`). Deleting it would leave `enterOutlet` with no
  membership to hand a company owner.
- **No cross-outlet reach.** Every staff query is scoped to
  `req.user.organizationId`, taken from the JWT and never from the request.
  See §4.

### 1.5 Two existing lookups that assumed one admin per outlet

Both are ambiguous the moment a second `outlet_admin` AdminAccount exists, and
both must resolve to the **primary** (the `staffRole`-null account):

- `companyService.enterOutlet` — `User.findOne({organizationId, role: "business_admin"})`.
  A company owner entering their outlet must land with full access, so this
  must pick the primary, not whichever staff row the DB returns first.
- `companyService.listOutlets` — `AdminAccount.findOne({organizationId})`,
  which feeds the owner console's "admin" column. It must show the outlet's
  actual admin, not a barista.

Both become: fetch the candidates (org-scoped, top-level equality only), then
pick the primary in JS, falling back to the first row if somehow none is
primary. The mock DB has no `$exists`/`$ne`, so the JS filter is mandatory
anyway, not merely convenient.

### 1.6 The `AdminAccount` unique index

Today:

```js
AdminAccountSchema.index(
  { organizationId: 1 },
  { unique: true, partialFilterExpression: { organizationId: { $type: "objectId" } } }
);
```

"One admin account per outlet" is exactly what this feature ends. But the
*intent* behind it — one unambiguous primary per outlet — is still wanted, and
is now enforceable more precisely:

```js
// One PRIMARY admin per outlet. Staff and managers (staffRole set) are
// unconstrained; the null-staffRole row stays unique, which is what makes
// "the outlet's primary admin" a well-defined lookup.
AdminAccountSchema.index(
  { organizationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      organizationId: { $type: "objectId" },
      staffRole: null
    }
  }
);
```

Indexes are not enforced by the mock DB, so — per CLAUDE.md — the guarantee is
*also* asserted in the service: `staffService.createStaff` always writes a
non-null `staffRole`, and no code path assigns `null`.

No migration is needed: the app has never been deployed against Atlas, so no
index exists in the field to drop.

## 2. The staff PIN

### 2.1 Where it lives

On the outlet-scoped `User` membership row, not on the global `AdminAccount`:

```js
// bcrypt hash of a 4-digit PIN, or null. Scoped to THIS outlet's membership
// on purpose — a PIN is a counter credential, not an identity, and two
// outlets have no reason to share one. Same collection, same hashing, same
// salt rounds as every other credential in this codebase.
staffPinHash: { type: String, default: null }
```

The membership row is also what `performedByUserId` points at, so verifying a
PIN and resolving an attribution are one lookup rather than two.

Hashed with `bcryptjs` at `SALT_ROUNDS = 10` — the same constant
`companyService` and `adminAuthService` already use. A 4-digit PIN is a tiny
space and hashing does not make it strong; it makes a database read
insufficient to impersonate someone at the counter, which is the actual
threat.

### 2.2 When a PIN is required

> **A PIN is required on the two counter routes if and only if at least one
> membership at that outlet has a PIN set.**

One predicate, computable in one org-scoped query, exposed to the frontend on
`GET /api/admin/settings` as `staffPinRequired`. Its consequences:

- **Every outlet that exists today is unaffected.** No PINs are set, so the
  counter routes behave byte-identically.
- **Setting the first PIN is the switch that turns the feature on.** It is a
  deliberate, visible act with a warning attached in the UI, not a side effect
  of some unrelated setting.
- **Creating a staff account requires setting their PIN in the same call**
  (§2.6), so "this outlet has sub-staff" and "this outlet requires PINs" are
  the same state in practice. The predicate is written on PIN presence rather
  than on staff presence because PIN presence is what the check actually needs
  to be true.

**Lockout is structurally impossible:** `POST /api/admin/staff` is rejected
with 400 `SET_YOUR_PIN_FIRST` unless the *calling* admin already has a PIN.
So the first PIN at any outlet is always the primary admin's own, set
knowingly, before anyone else exists to be locked out.

### 2.3 Verification

`staffService.verifyPin({ organizationId, pin })`:

1. `User.find({ organizationId, role: "business_admin" })` — top-level
   equality only, mock-DB safe, and **org-scoped by construction**.
2. Filter in JS to rows with a non-null `staffPinHash` (the mock DB has no
   `$ne`/`$exists`).
3. `bcrypt.compare` against each until one matches.
4. Load that row's `AdminAccount` for `staffRole`.
5. Return `{ userId, name, staffRole }`, or `null`.

Step 1 is the isolation boundary and it is not a filter that can be forgotten
later: there is no code path into this function that does not pass an
`organizationId`, and that value comes from the JWT. Outlet B's PIN cannot
match outlet A's staff because outlet B's rows are never in the candidate set,
**even when the two PINs are byte-identical** — which, in a 10,000-value
space across a multi-tenant platform, they routinely will be.

### 2.4 PIN uniqueness within an outlet

Two members of the same outlet must not share a PIN, or attribution is a coin
flip. On every set/reset, the new PIN is bcrypt-compared against every *other*
membership's hash at that outlet; a match is rejected with 409 `PIN_TAKEN`
("Someone here already uses that PIN — pick another"). Cross-outlet
collisions are fine and are not checked.

No index can express this (the values are hashed), so it is a service-level
check — the same posture `companyService.assertEmailAvailable` already takes
for a guarantee an index cannot carry into the mock DB.

### 2.5 `POST /api/admin/verify-pin`

Behind `verifyToken` + `isBusinessAdmin` + `pinLimiter`. **Not** behind
`requireStaffPermission` — a `staff` account calling this is the entire point.

Request: `{ pin: "0000" }`
Success `200`:

```json
{ "success": true, "staff": { "userId": "…", "name": "Asha", "staffRole": "staff" } }
```

Failures:

| status | code | when |
|---|---|---|
| 400 | `INVALID_PIN_FORMAT` | not exactly four digits |
| 401 | `PIN_REJECTED` | format fine, no membership at **this** outlet matches |
| 429 | — | limiter tripped |

`PIN_REJECTED` never distinguishes "no PIN matches" from "PINs aren't set up
here" — same posture as `adminLogin`'s single message for "no such account"
and "wrong password".

`organizationId` comes from `req.user.organizationId`. A client-supplied org
in the body is ignored; there is no parameter for one.

**Rate limiting.** New `pinLimiter` in `middleware/rateLimitMiddleware.js`,
following the existing shape (`jsonHandler`, `standardHeaders: true`,
`legacyHeaders: false`, default in-memory store, per-IP key):

```js
// 20 attempts / minute / IP, shared across verify-pin AND the two counter
// routes that re-verify a PIN inline.
//
// Its own bucket, never authLimiter's: a barista fumbling their PIN must not
// burn the budget that protects the login endpoints.
//
// 20/min is deliberately above what a busy counter does (a till generating a
// QR more than twenty times a minute is not a real till) and far below what a
// 10,000-value sweep needs — at 20/min an exhaustive search takes over eight
// hours of sustained traffic from a single IP against an endpoint that ALSO
// requires a valid tenant JWT for that exact outlet. The PIN is an
// attribution layer among people who already share a device and a login, not
// a perimeter; the perimeter is the JWT, and it is unchanged.
//
// `skip` is what makes it safe to hang this on the counter routes at all:
// only a request that actually CARRIES a pin consumes the budget. A request
// with no `pin` is not a PIN attempt and is not counted.
const pinLimiter = rateLimit({
  windowMs: MINUTE,
  limit: 20,
  skip: (req) => typeof req.body?.pin !== "string",
  ...
});
```

**The `skip` predicate is load-bearing, not an optimisation.** Without it,
every existing suite that generates QR codes in a loop (`points-earn.js`
alone does eleven, `integration-qa.js` and `multi-tenant-isolation.js` more)
would start tripping a limiter it has no idea exists — the same shared
127.0.0.1 bucket that `rate-limiting.js` relies on to trip *deliberately*.
Skipping pin-less requests keeps the counter routes byte-identical for every
outlet that hasn't turned PINs on, which is the same promise §2.2 makes.
`express.json()` is mounted globally before every route in `server.js`, so
`req.body` is populated by the time `skip` runs.

### 2.6 The staff-management endpoints

All under `/api/admin/staff`, all behind `verifyToken` + `isBusinessAdmin`,
all scoped to `req.user.organizationId`.

**`GET /api/admin/staff`** — `requireStaffPermission("manage_staff")`

```json
{
  "success": true,
  "staff": [
    { "id": "<User._id>", "name": "Rita", "email": "rita@…", "staffRole": null,
      "emailVerified": true, "hasPin": true, "isPrimary": true, "isSelf": true },
    { "id": "…", "name": "Asha", "email": "asha@…", "staffRole": "staff",
      "emailVerified": false, "hasPin": true, "isPrimary": false, "isSelf": false }
  ],
  "pinRequired": true
}
```

`id` is the **User membership id**, not the AdminAccount id — it is what
`performedByUserId` records and what every other route in this group takes.
The hash itself is never returned in any shape; `hasPin` is the only signal.

**`POST /api/admin/staff`** — `requireStaffPermission("manage_staff")`

Body: `{ name, email, staffRole: "manager"|"staff", password, pin }` — all
five required.

Reuses the existing provisioning mechanics wholesale, in this order:

1. `SET_YOUR_PIN_FIRST` guard (400) — the caller must already have a PIN.
2. Validate `staffRole ∈ {manager, staff}` (400 `INVALID_STAFF_ROLE`).
   `null` is not accepted; see §1.4.
3. Validate PIN format (400) and uniqueness within the outlet (409).
4. `companyService.assertEmailAvailable(email)` — the platform-wide staff
   email namespace, unchanged (409 `EMAIL_TAKEN`).
5. `AdminAccount.create({ kind: "outlet_admin", companyId, organizationId,
   staffRole, password: bcrypt(password), emailVerified: false })`.
6. `User.create({ organizationId, companyId, adminAccountId, role:
   "business_admin", emailVerified: false, staffPinHash: bcrypt(pin) })` —
   the same two-row pattern `companyService.createOutlet` uses.
7. `companyService.sendAdminVerifyEmail(account)` — the *same* function, not a
   fork. The invitee therefore goes through the identical verification flow
   every outlet admin already goes through, and `adminAuthService.adminLogin`
   refuses them with 403 `EMAIL_NOT_VERIFIED` until they complete it. No new
   email template, no new token type, no new route.

`companyId` is read from the *organization*, never from the request.

Returns `201` with the same row shape as the list.

**`PATCH /api/admin/staff/:id`** — `requireStaffPermission("manage_staff")`

Body: `{ staffRole: "manager"|"staff" }`. Guards, in order: target must exist
**within this organizationId** (404), must not be self (400
`CANNOT_EDIT_SELF`), must not be the primary (400 `CANNOT_MODIFY_PRIMARY`).

**`DELETE /api/admin/staff/:id`** — `requireStaffPermission("manage_staff")`

Same three guards. Deletes the `User` membership and the `AdminAccount`,
freeing the email. Ledger rows keep their `performedByUserId` pointing at a
row that no longer exists — which is why `performedByName` is denormalized
onto the transaction (§3), exactly as `rewardName` and `campaignName` already
are, so history survives the deletion of what it refers to.

**`PATCH /api/admin/staff/:id/pin`** — gated by `manage_staff` **or self**

The one route with a compound gate, and the reason is concrete: a `manager`
cannot `manage_staff`, so without a self path a manager could never set a PIN
and would be locked out of the counter the moment the outlet turns PINs on.

`:id` accepts the literal string **`me`**, resolving to `req.user.id`. Without
it the self path would be unreachable for exactly the roles that need it: a
`manager` cannot call `GET /api/admin/staff`, so it has no way to discover its
own membership id.

Body: `{ pin, currentPin? }`.

- Acting on **someone else** requires `manage_staff`; `currentPin` is not
  read.
- Acting on **yourself** is always allowed, but if you already have a PIN you
  must supply the matching `currentPin` (401 `PIN_REJECTED` otherwise) — so
  an unattended, already-unlocked till cannot be silently re-keyed by whoever
  walks up to it.
- Format and outlet-uniqueness checks apply either way.
- `{ pin: null }` clears a PIN. Rejected with 400 `PIN_REQUIRED_FOR_STAFF` if
  the target is a `staff`/`manager` account, because clearing it would leave
  an account that can sign in but can never be attributed. Only the primary
  admin's PIN may be cleared, and only while no sub-staff exist.

## 3. Attribution on the ledger

### 3.1 The fields

`PointsTransaction` gains two:

```js
// Which staff member was at the counter, when the outlet uses PINs. Null for
// every row written before this existed and for every outlet that has not
// turned PINs on — an absent attribution is a real state, not a defect.
performedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
// Denormalized for the same reason rewardName and campaignName are: the
// membership can be deleted, and the ledger has to keep saying who did this.
performedByName: { type: String, default: "" },
```

Nullable, on an append-only ledger, with no backfill. `expire` rows are never
attributed — no one initiates them.

### 3.2 How it reaches the row

The attribution is decided at the counter but written at the ledger, and those
are minutes apart on the earn path. It rides the artifacts that already bridge
that gap — both of which already carry `generatedBy` for exactly this reason:

```
staff PIN
   └─> DynamicQRToken.performedByUserId / .performedByName   (at generate)
         ├─ earn:   └─> PendingClaim.performedBy*            (at scan)
         │                └─> PointsTransaction.performedBy* (at fulfil)
         └─ redeem: └─> PointsTransaction.performedBy*       (at confirm)
```

No new lifetime, no new expiry, no new single-use semantics. `consumeDynamicQrToken`
already returns the consumed token document; the redeem path simply starts
capturing that return value, which it currently discards.

`awardPointsInTransaction` takes `performedByUserId` / `performedByName` as
optional parameters, defaulting to null/"", so `pendingClaimService`'s call
site and the direct claim call site converge on one signature.

### 3.3 The counter routes

`POST /api/admin/generate-qr` and `POST /api/admin/generate-redeem-qr` accept
an optional `pin` alongside their existing body.

```
if (outlet requires PIN):
    pin missing        -> 403 STAFF_PIN_REQUIRED
    pin malformed      -> 400 INVALID_PIN_FORMAT
    pin does not match -> 401 PIN_REJECTED
    pin matches        -> stamp {performedByUserId, performedByName}, proceed
else:
    pin ignored entirely, behaviour unchanged
```

**The routes take a raw PIN, never a client-supplied `staffUserId`.** A
verified identity handed back to the client and then handed forward by it is
not a verified identity — anyone holding the shared login could name a
colleague and attribute their own actions to them, which is the one thing this
feature exists to prevent. Re-verifying costs one bcrypt compare against a
handful of rows.

Both routes are additionally behind `pinLimiter`, sharing the bucket with
`verify-pin`, so the inline path cannot be used to sweep the PIN space at a
looser rate than the dedicated one — and, because the limiter skips requests
carrying no `pin`, a till at a PIN-less outlet is never counted at all (§2.5).

`staff`-role accounts pass these two routes on the strength of the PIN alone —
this is the sense in which the PIN "is the enforcement point" for that role.
The role check that blocks them everywhere else is `requireStaffPermission`;
here there is nothing to block, only someone to name.

## 4. Multi-tenant isolation review

Every new query, and where its `organizationId` comes from:

| query | scoped by | source |
|---|---|---|
| `verifyPin` candidate fetch | `User.find({organizationId, role})` | `req.user.organizationId` (JWT) |
| PIN uniqueness check | same candidate set | JWT |
| `staffPinRequired` predicate | same candidate set | JWT |
| `listStaff` | `User.find({organizationId, role})` | JWT |
| `createStaff` → `AdminAccount.create` | `organizationId` written from the resolved org | JWT |
| `createStaff` → `User.create` | same | JWT |
| `updateStaffRole` target lookup | `User.findOne({_id, organizationId, role})` | JWT |
| `deleteStaff` target lookup | `User.findOne({_id, organizationId, role})` | JWT |
| `setStaffPin` target lookup | `User.findOne({_id, organizationId, role})` | JWT |
| `resolveStaffRole` in `verifyToken` | `AdminAccount.findOne({_id: user.adminAccountId})` | the User row already fetched and already org-checked |
| `enterOutlet` primary lookup | `User.find({organizationId, role})` | company-owner session's verified outlet |
| `listOutlets` primary lookup | `AdminAccount.find({organizationId})` | the company's own outlet ids |

Notes on the two that are not a plain `{organizationId, …}` filter:

- **`resolveStaffRole`** queries `AdminAccount` by `_id` with no
  `organizationId` term. It is safe because the `_id` is read off the `User`
  row that `verifyToken` already fetched by the JWT's own `userId` — the
  caller supplies no id at any point, so there is nothing to tamper with.
- **`updateStaffRole` / `deleteStaff` / `setStaffPin`** take an `:id` from the
  URL. Each is fetched with `{_id, organizationId, role: "business_admin"}` in
  a **single** query, never fetched-then-checked: an id lifted from another
  outlet's staff list simply matches nothing and 404s. This is the same
  posture menu import already takes with a tampered `existingId`.

No new query reads `Company`, `CustomerAccount`, or any cross-outlet
collection. No new response exposes another outlet's existence. The
company-owner rollup is untouched.

Points still never pool across outlets: nothing here writes a
`PointsBalance`, and the ledger gains only two descriptive columns.

## 5. Frontend

### 5.1 The counter PIN step

`GenerateQr.tsx` and `RedeemPoints.tsx` gain the same shared component,
`components/admin/StaffPinGate.tsx`, driven by `settings.staffPinRequired`.

When the outlet does not require a PIN, neither page changes at all.

When it does, the page is fronted by a PIN pad until someone identifies
themselves. Once verified, a slim bar sits above the existing UI —
`Asha · staff` and a **Switch user** action — and the page underneath behaves
exactly as it does today.

**The PIN is held in React state only, for the life of the tab.** Never
localStorage, never sessionStorage, never a cookie. It is re-sent with every
generate call so the server re-verifies every action; the client is never
trusted to remember *that* it verified, only *what* was typed. "Switch user"
clears it. This is one PIN entry per shift rather than one per transaction,
which is the difference between a feature staff use and one they route
around.

A 401 `PIN_REJECTED` from a generate call (the PIN was reset mid-shift) drops
the gate back to the pad with a toast, rather than surfacing a bare error on a
screen that looks unlocked.

The pad is a 3×4 numeric grid with large targets — this is a phone or tablet
at a counter — plus a hidden `inputMode="numeric"` field so a hardware keypad
works. Four filled dots, auto-submit on the fourth digit, shake-and-clear on
rejection (through `useMotion()`, which resolves reduced motion). Digits are
masked; there is no reveal toggle.

### 5.2 The Sub-Admin tab

A third tab on `AdminSettings.tsx`, through the **existing**
`SettingsTabs` shell — whose own comment already anticipates this exact
addition — as `components/admin/SubAdminSettingsTab.tsx`. No new tab shell.

Contents: the staff list (name, email, role badge, PIN state, "unverified"
badge), an **Invite** dialog (name / email / role / password / PIN), and per
row a PIN reset and a remove action. The primary admin's row is marked and
carries no role or remove control. Destructive actions go through the existing
`alert-dialog` primitive.

Above the list, once and plainly: *"Once anyone here has a PIN, everyone needs
one to use the earn and redeem screens."* The switch in §2.2 must not be
something an admin discovers by having their till stop working.

The tab is only rendered for an account that can `manage_staff` — `staffRole`
is `null`. A `manager` sees the other two tabs; a `staff` account never
reaches Settings at all (§5.3). The frontend gate is convenience, not
security: the server refuses regardless.

### 5.3 Navigating as a `staff` account

`AdminLayout` builds its rail from a static list. For `staffRole === "staff"`
it collapses to the two pinned counter actions and the account menu; the
Overview, Transactions, Customers, Reports group and the entire Manage section
are not rendered, because every route behind them 403s.

`AdminGuard` (or the layout's index route) sends a `staff` account landing on
`/admin` to `/admin/generate` rather than the Overview, which would render a
page of failed queries.

`useAdminSettings` gains `staffRole: "manager" | "staff" | null` and
`staffPinRequired: boolean`, plus a `useStaff()` hook for the tab.

## 6. What is deliberately not built

- **No PIN for the customer.** See "What this is not".
- **No PIN on the management routes.** The role check is the gate there; a
  second factor on a settings save is friction with no threat behind it.
- **No PIN expiry, rotation policy, or lockout counter.** The rate limiter is
  the whole defence, and per CLAUDE.md there is no cron in this codebase to
  age anything out.
- **No `performedBy` filter on reports.** The column is written and is
  visible on a transaction row; slicing a report by staff member is a
  reporting feature, and reporting is a separate surface.
- **No backfill.** Historic rows have no attribution and truthfully say so.
- **No seed data.** `demoSeed.js` is untouched. Adding a second AdminAccount
  to a seeded outlet would change what `listOutlets` and `enterOutlet` return
  for suites that assert on them — the same class of trap CLAUDE.md already
  documents for the demo's live campaign.

## 7. Test obligations

Negative cases are the point of this feature, so each gets an explicit
assertion:

1. A `staff` account gets **403** on a representative route from all four
   restricted actions, and specifically on `PATCH /api/admin/settings`,
   `GET /api/admin/reports/customers/download`, `POST /api/admin/rewards`,
   `POST /api/admin/campaigns`.
2. A `manager` gets **200** on those same four, and **403** on every
   `/api/admin/staff` route.
3. A pre-existing admin (`staffRole` null) gets **200** everywhere — the
   no-migration promise, asserted rather than assumed.
4. A PIN that is valid at outlet B **never** matches at outlet A, asserted
   with the *same* PIN string set at both outlets.
5. A wrong PIN is rejected; a malformed PIN is rejected with a different code.
6. `pinLimiter` actually trips, with the app's JSON error shape — and a
   pin-less `POST /api/admin/generate-qr` hammered well past the threshold is
   **never** throttled, which is the assertion that keeps every existing
   points suite from becoming flaky.
7. The counter routes are unchanged for an outlet with no PINs set, and
   demand one the moment a PIN exists.
8. `performedByUserId` and `performedByName` land on the ledger row for both
   an earn and a redeem, and stay null for a no-PIN outlet.
9. `SET_YOUR_PIN_FIRST`, `PIN_TAKEN`, `CANNOT_EDIT_SELF`,
   `CANNOT_MODIFY_PRIMARY`, and the cross-outlet 404 on `:id` routes.
10. `multi-tenant-isolation.js` and `unified-admin-login.js` continue to pass
    unmodified.

## 8. Open decisions taken conservatively

Recorded because each could reasonably have gone the other way, and each was
resolved toward denying access:

- **`GET /api/admin/transactions` and `/customers` are gated**, though the
  brief named only the report *downloads*. They are the same data as the
  downloads, on screen. Denying is consistent; allowing would have made the
  download gate cosmetic.
- **`GET /api/admin/staff` is gated from `manager`**, not just from `staff`.
  Reasoned in §1.3.
- **`POST /api/admin/images` is gated**, though images are not one of the
  named CRUD areas. Every use of it is gated, so leaving it open is a write
  primitive with no legitimate caller.
- **The counter routes re-verify the raw PIN** rather than trusting a
  previously-verified identity from the client. Costs a bcrypt compare;
  removes the only way to forge an attribution.
- **PIN clearing is blocked for non-primary accounts**, so an account that can
  sign in can always be attributed.
