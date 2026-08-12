/**
 * Public landing-page reads (platform marketing site).
 *
 * Self-contained: boots its own server on a dedicated port against the
 * in-memory mock DB. These two endpoints are deliberately unauthenticated —
 * the landing page at `/` is public — so the thing worth testing is not that
 * they answer, but that they answer with aggregates ONLY. A tenant name,
 * slug or id leaking into the marketing page would break the same isolation
 * invariant the rest of the product is built on.
 *
 * Run directly: `node tests/public-landing-endpoints.js`
 */

const { bootServer } = require("./helpers/bootServer");

// Anything that would identify a specific tenant or customer. Asserted against
// the serialized response body, not against a field list, so a future field
// addition trips this rather than silently shipping.
const FORBIDDEN_KEYS = [
  "companyId", "organizationId", "outletId", "userId", "customerAccountId",
  "slug", "companySlug", "outletSlug", "email", "phone"
];

async function main() {
  const { baseUrl, stop } = await bootServer({ port: 0 });
  let failures = 0;
  const check = (name, cond) => {
    if (cond) console.log(`PASS ${name}`);
    else { console.error(`FAIL ${name}`); failures++; }
  };
  const api = (path, { token } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, { headers }).then(async (r) => ({
      status: r.status,
      body: await r.json().catch(() => null)
    }));
  };

  try {
    const stats = await api("/api/platform/public-stats");
    check("GET public-stats without a token -> 200", stats.status === 200);
    check("public-stats returns a stats object", Boolean(stats.body?.stats));

    // The demo seed has 6 outlets across 3 companies, which is above the
    // 5-outlet visibility floor — so the seeded world must show figures.
    check("public-stats is visible on the seeded world", stats.body.stats.visible === true);
    check("public-stats reports outlets", typeof stats.body.stats.outlets === "number");
    check("public-stats reports customers", typeof stats.body.stats.customers === "number");
    check("public-stats reports monthly points", typeof stats.body.stats.pointsIssuedMonth === "number");

    // The seed has 3 CustomerAccounts. bikash belongs to outlets across three
    // DIFFERENT companies, so a count of User memberships would over-report.
    // Below 100 the floor is exact, so this asserts the distinct count.
    check("public-stats counts distinct accounts, not memberships", stats.body.stats.customers === 3);

    const statsBlob = JSON.stringify(stats.body);
    for (const key of FORBIDDEN_KEYS) {
      check(`public-stats leaks no ${key}`, !statsBlob.includes(key));
    }
    check("public-stats leaks no company name", !statsBlob.toLowerCase().includes("coffesarowar"));

    const plans = await api("/api/platform/public-plans");
    check("GET public-plans without a token -> 200", plans.status === 200);
    check("public-plans returns an array", Array.isArray(plans.body?.plans));

    for (const plan of plans.body.plans) {
      check(`plan ${plan.slug} exposes a name`, typeof plan.name === "string");
      check(`plan ${plan.slug} exposes a price`, typeof plan.priceNpr === "number");
      check(`plan ${plan.slug} exposes features`, Array.isArray(plan.features));
      // outletLimit is a subscription-enforcement detail, not a marketing
      // fact. It must not ride along into an anonymous response.
      check(`plan ${plan.slug} hides outletLimit`, plan.outletLimit === undefined);
      check(`plan ${plan.slug} hides its id`, plan._id === undefined && plan.id === undefined);
    }

    const plansBlob = JSON.stringify(plans.body);
    check("public-plans hides outletLimit entirely", !plansBlob.includes("outletLimit"));
    check("public-plans hides billingIntervalDays", !plansBlob.includes("billingIntervalDays"));
    check("public-plans hides isActive", !plansBlob.includes("isActive"));

    const { isReservedSlug } = require("../config/platform");
    check("privacy is a reserved slug", isReservedSlug("privacy"));
    check("terms is a reserved slug", isReservedSlug("terms"));
    // App.tsx matches /review-qr literally, before /:companySlug. A company
    // registered on that slug would be permanently unreachable.
    check("review-qr is a reserved slug", isReservedSlug("review-qr"));
    check("reserved-slug check is case-insensitive", isReservedSlug("Privacy"));

    if (failures === 0) console.log("\nAll public landing endpoint checks passed.");
    else console.error(`\n${failures} check(s) failed.`);
  } finally {
    stop();
  }

  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
