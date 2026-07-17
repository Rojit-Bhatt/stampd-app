const bcrypt = require("bcryptjs");
const { PLATFORM_NAME, DEFAULT_PROGRAM } = require("../config/platform");
const { earnCenti, toCenti } = require("../utils/pointsMath");

// Seeds the whole demo world: a platform admin, three companies with
// differing outlet counts, per-outlet admin credentials, and customers —
// some of whom are members of several outlets AND several companies, which
// is what exercises the global CustomerAccount → per-outlet membership model.
//
// Everything here is idempotent-by-existence: each block checks first, so a
// re-boot against a persistent DB won't duplicate. Against the in-memory
// mock DB it simply runs fresh every time.
const HUNDRED_YEARS_MS = 100 * 365 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const COMPANIES = [
  {
    slug: "coffesarowar",
    name: "Coffesarowar Group",
    owner: { name: "Coffesarowar Owner", email: "owner@coffesarowar.com" },
    outlets: [
      { slug: "durbarmarg", name: "Coffesarowar Durbarmarg", category: "cafe", admin: "durbarmarg@coffesarowar.com" },
      { slug: "patan", name: "Coffesarowar Patan", category: "cafe", admin: "patan@coffesarowar.com" },
      { slug: "thamel", name: "Coffesarowar Thamel", category: "cafe", admin: "thamel@coffesarowar.com" }
    ]
  },
  {
    slug: "himalayan-bites",
    name: "Himalayan Bites",
    owner: { name: "Himalayan Owner", email: "owner@himalayanbites.com" },
    outlets: [
      { slug: "durbarmarg", name: "Himalayan Bites Durbarmarg", category: "restaurant", admin: "durbarmarg@himalayanbites.com" },
      { slug: "lakeside", name: "Himalayan Bites Lakeside", category: "restaurant", admin: "lakeside@himalayanbites.com" }
    ]
  },
  {
    slug: "sweet-corner",
    name: "Sweet Corner",
    owner: { name: "Sweet Corner Owner", email: "owner@sweetcorner.com" },
    outlets: [
      { slug: "main", name: "Sweet Corner Bakery", category: "bakery", admin: "main@sweetcorner.com" }
    ]
  }
];

// Deliberate overlaps: asha is a member of two outlets of ONE company; bikash
// is a member of outlets across TWO different companies. Both prove points
// and memberships never bleed across the organizationId boundary.
const CUSTOMERS = [
  {
    name: "Asha Sharma",
    email: "asha@example.com",
    phone: "+9779800000001",
    memberships: [
      { company: "coffesarowar", outlet: "durbarmarg", visits: 3 },
      { company: "coffesarowar", outlet: "patan", visits: 1 }
    ]
  },
  {
    name: "Bikash Thapa",
    email: "bikash@example.com",
    phone: "+9779800000002",
    memberships: [
      { company: "coffesarowar", outlet: "durbarmarg", visits: 4 },
      { company: "himalayan-bites", outlet: "lakeside", visits: 2 },
      { company: "sweet-corner", outlet: "main", visits: 0 }
    ]
  },
  {
    name: "Chandra Rai",
    email: "chandra@example.com",
    phone: "+9779800000003",
    memberships: [{ company: "himalayan-bites", outlet: "durbarmarg", visits: 2 }]
  }
];

const seedDemoData = async () => {
  const User = require("../models/User");
  const Company = require("../models/Company");
  const Organization = require("../models/Organization");
  const AdminAccount = require("../models/AdminAccount");
  const CustomerAccount = require("../models/CustomerAccount");
  const PointsBalance = require("../models/PointsBalance");
  const PointsTransaction = require("../models/PointsTransaction");
  const Campaign = require("../models/Campaign");
  const RewardItem = require("../models/RewardItem");
  const Subscription = require("../models/Subscription");
  const MenuItem = require("../models/MenuItem");
  const { ensureDefaultPlansSeeded } = require("../services/subscriptionPlanService");

  try {
    await ensureDefaultPlansSeeded();

    // 1. Platform super-admin — the only staff identity that is still a User
    // row rather than an AdminAccount.
    const platformEmail = "admin@stampd.co";
    let platformAdmin = await User.findOne({ email: platformEmail, role: "platform" });
    if (!platformAdmin) {
      platformAdmin = await User.create({
        organizationId: null,
        name: `${PLATFORM_NAME} Admin`,
        email: platformEmail,
        password: await bcrypt.hash("password", 10),
        role: "platform",
        emailVerified: true
      });
      console.log(`[seed] Platform admin: ${platformEmail} / password`);
    }

    const passwordHash = await bcrypt.hash("password", 10);
    const now = new Date();
    // Keyed "companySlug/outletSlug" — outlet slugs repeat across companies
    // (both Coffesarowar and Himalayan Bites have a "durbarmarg"), which is
    // exactly the collision the compound index has to survive.
    const outletsByKey = new Map();

    // 2. Companies, their owners, their outlets + outlet admins.
    for (const def of COMPANIES) {
      let company = await Company.findOne({ slug: def.slug });
      if (!company) {
        company = await Company.create({
          slug: def.slug,
          name: def.name,
          branding: { logoUrl: "", primaryColor: "#7c3f1d" },
          programDefaults: { ...DEFAULT_PROGRAM }
        });

        await AdminAccount.create({
          name: def.owner.name,
          email: def.owner.email,
          password: passwordHash,
          kind: "company_owner",
          companyId: company._id,
          organizationId: null,
          emailVerified: true
        });

        await Subscription.create({
          companyId: company._id,
          planId: null,
          planSlug: "grandfathered",
          status: "active",
          outletLimitAtPurchase: 10,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + HUNDRED_YEARS_MS),
          isComped: true
        });

        console.log(`[seed] Company: ${def.name} (/${def.slug}) — owner ${def.owner.email} / password`);
      }

      for (const outletDef of def.outlets) {
        let outlet = await Organization.findOne({ companyId: company._id, slug: outletDef.slug });
        if (!outlet) {
          outlet = await Organization.create({
            companyId: company._id,
            slug: outletDef.slug,
            name: outletDef.name,
            category: outletDef.category,
            createdBy: platformAdmin._id,
            branding: {
              tagline: "Every visit earns you closer to a reward.",
              logoUrl: "",
              bannerUrl: "",
              primaryColor: "#7c3f1d"
            },
            // All null — inherits the company's programDefaults.
            program: { earnPercent: null, pointsExpiryDays: null },
            menuEnabled: true
          });

          const adminAccount = await AdminAccount.create({
            name: `${outletDef.name} Admin`,
            email: outletDef.admin,
            password: passwordHash,
            kind: "outlet_admin",
            companyId: company._id,
            organizationId: outlet._id,
            emailVerified: true
          });

          await User.create({
            organizationId: outlet._id,
            companyId: company._id,
            adminAccountId: adminAccount._id,
            name: adminAccount.name,
            email: adminAccount.email,
            role: "business_admin",
            emailVerified: true
          });

          // Two items on purpose: one redeemable, one menu-only, so the
          // redeem catalog has something in it AND something it correctly
          // leaves out on a cold boot.
          await MenuItem.create({
            organizationId: outlet._id,
            name: "House Coffee",
            description: "The daily pour.",
            price: 180,
            category: "Drinks",
            pointsPriceCenti: toCenti(180),
            isFeatured: true
          });

          await MenuItem.create({
            organizationId: outlet._id,
            name: "Seasonal Special",
            description: "Whatever the kitchen is proud of this week.",
            price: 420,
            category: "Food",
            pointsPriceCenti: null
          });

          // A standalone reward — something the outlet doesn't sell, so it
          // only exists for points.
          await RewardItem.create({
            organizationId: outlet._id,
            name: "Tote Bag",
            description: "Canvas, our logo on it.",
            pointsPriceCenti: toCenti(500),
            sortOrder: 1
          });

          // One live campaign, on ONE outlet, so a cold boot shows both
          // states side by side: thamel is running 2x, its siblings aren't.
          //
          // Deliberately NOT durbarmarg: that's the outlet the test suite
          // earns against ~30 times, and a live multiplier there would
          // silently double every expected figure. Seed data that changes
          // earn math has to live where nothing is asserting on it.
          if (def.slug === "coffesarowar" && outletDef.slug === "thamel") {
            await Campaign.create({
              organizationId: outlet._id,
              name: "Opening Week",
              description: "Double points on every bill this week.",
              multiplier: 2,
              startAt: new Date(now.getTime() - 2 * DAY_MS),
              endAt: new Date(now.getTime() + 5 * DAY_MS),
              daysOfWeek: [],
              isActive: true
            });
          }

          console.log(`[seed]   Outlet: /${def.slug}/${outletDef.slug} — admin ${outletDef.admin} / password`);
        }
        outletsByKey.set(`${def.slug}/${outletDef.slug}`, outlet);
      }
    }

    // 3. Customers. Each is ONE global CustomerAccount with a per-outlet User
    // membership — including across different companies, which is the case
    // the isolation invariant has to hold for.
    for (const def of CUSTOMERS) {
      let account = await CustomerAccount.findOne({ email: def.email });
      if (!account) {
        account = await CustomerAccount.create({
          name: def.name,
          email: def.email,
          password: passwordHash,
          phone: def.phone,
          emailVerified: true
        });
        console.log(`[seed] Customer: ${def.email} / password (${def.memberships.length} membership(s))`);
      }

      for (const m of def.memberships) {
        const outlet = outletsByKey.get(`${m.company}/${m.outlet}`);
        if (!outlet) continue;

        let membership = await User.findOne({ organizationId: outlet._id, customerAccountId: account._id });
        if (!membership) {
          membership = await User.create({
            organizationId: outlet._id,
            customerAccountId: account._id,
            name: account.name,
            email: account.email,
            phone: account.phone,
            // Customers keep a password on the membership row (that's what
            // authService.registerUser writes for a tenant-scoped signup) —
            // unlike admins, whose credential lives solely on AdminAccount.
            password: passwordHash,
            role: "customer",
            emailVerified: true
          });
          // Backdated visits, each one a real bill and its earn row, so the
          // ledger and the balance agree exactly the way the service would
          // have left them. Reports and velocity charts then render real
          // history on a cold boot instead of an empty series.
          let balanceCenti = 0;
          let lastActivityAt = null;

          for (let i = 0; i < m.visits; i += 1) {
            const billAmount = 250 + i * 50;
            const earnedCenti = earnCenti(billAmount, DEFAULT_PROGRAM.earnPercent);
            const createdAt = new Date(now.getTime() - (m.visits - i) * 2 * DAY_MS);

            balanceCenti += earnedCenti;
            lastActivityAt = createdAt;

            await PointsTransaction.create({
              organizationId: outlet._id,
              userId: membership._id,
              type: "earn",
              pointsCenti: earnedCenti,
              balanceAfterCenti: balanceCenti,
              billAmount,
              earnPercent: DEFAULT_PROGRAM.earnPercent,
              multiplier: 1,
              token: `seed-${outlet._id}-${membership._id}-${i}`,
              createdAt
            });
          }

          await PointsBalance.create({
            organizationId: outlet._id,
            userId: membership._id,
            balanceCenti,
            lastActivityAt
          });
        }
      }
    }
  } catch (err) {
    console.error("Failed to seed demo data:", err);
  }
};

module.exports = { seedDemoData };
