const bcrypt = require("bcryptjs");
const { PLATFORM_NAME, DEFAULT_PROGRAM } = require("../config/platform");

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
      { company: "coffesarowar", outlet: "durbarmarg", stamps: 3 },
      { company: "coffesarowar", outlet: "patan", stamps: 1 }
    ]
  },
  {
    name: "Bikash Thapa",
    email: "bikash@example.com",
    phone: "+9779800000002",
    memberships: [
      { company: "coffesarowar", outlet: "durbarmarg", stamps: 4 },
      { company: "himalayan-bites", outlet: "lakeside", stamps: 2 },
      { company: "sweet-corner", outlet: "main", stamps: 0 }
    ]
  },
  {
    name: "Chandra Rai",
    email: "chandra@example.com",
    phone: "+9779800000003",
    memberships: [{ company: "himalayan-bites", outlet: "durbarmarg", stamps: 2 }]
  }
];

const seedDemoData = async () => {
  const User = require("../models/User");
  const Company = require("../models/Company");
  const Organization = require("../models/Organization");
  const AdminAccount = require("../models/AdminAccount");
  const CustomerAccount = require("../models/CustomerAccount");
  const StampCard = require("../models/StampCard");
  const StampClaimEvent = require("../models/StampClaimEvent");
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
            program: {
              stampsRequired: null, rewardTitle: null, rewardDescription: null,
              cooldownHours: null, minBillAmount: null, voucherExpiryDays: null
            },
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

          await MenuItem.create({
            organizationId: outlet._id,
            name: "House Coffee",
            description: "The daily pour.",
            price: 180,
            category: "Drinks",
            isFeatured: true
          });

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
            role: "customer",
            emailVerified: true
          });
          await StampCard.create({
            organizationId: outlet._id,
            userId: membership._id,
            stampsEarned: m.stamps,
            lastStampedAt: m.stamps > 0 ? new Date(now.getTime() - 2 * DAY_MS) : null
          });
          // Backdated claim events so reports/velocity charts render
          // something on a cold boot instead of an empty series.
          for (let i = 0; i < m.stamps; i += 1) {
            await StampClaimEvent.create({
              organizationId: outlet._id,
              userId: membership._id,
              token: `seed-${outlet._id}-${membership._id}-${i}`,
              billAmount: 250 + i * 50,
              createdAt: new Date(now.getTime() - (i + 1) * 2 * DAY_MS)
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to seed demo data:", err);
  }
};

module.exports = { seedDemoData };
