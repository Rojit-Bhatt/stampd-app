/**
 * Model index suite.
 *
 *   - Company.slug, SubscriptionPlan.slug and SubscriptionKey.code were each
 *     declared unique twice (field `unique: true` AND schema.index()), which
 *     is what logged Mongoose's "Duplicate schema index" warnings on every
 *     production boot. Exactly one declaration each.
 *   - DynamicQRToken's TTL index deleted every token 30s after creation,
 *     but a REDEEM token is valid for 180s at the app level
 *     (pointsService.REDEEM_TOKEN_TTL_SECONDS) — MongoDB removed it while the
 *     customer was still choosing a reward ("Invalid QR token"). The TTL
 *     must cover the longest token window.
 *   - MongoDB never changes an existing index's expireAfterSeconds on its
 *     own, so ensureTtlIndex migrates it at boot: collMod first, drop +
 *     recreate if the database user may not run collMod; a no-op when
 *     already right.
 *
 * Run directly: `node tests/model-indexes.js`
 */

const { ensureTtlIndex } = require("../utils/ensureTtlIndex");

let failures = 0;
const check = (name, cond, extra) => {
  if (cond) console.log(`PASS ${name}`);
  else { console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : ""); failures++; }
};

const indexesOn = (model, field) =>
  model.schema.indexes().filter(([fields]) => Object.keys(fields).length === 1 && fields[field] === 1);

for (const [name, field] of [["Company", "slug"], ["SubscriptionPlan", "slug"], ["SubscriptionKey", "code"]]) {
  const model = require(`../models/${name}`);
  const found = indexesOn(model, field);
  check(`${name}.${field}: exactly one index declaration`, found.length === 1, found);
  check(`${name}.${field}: still unique`, found[0] && found[0][1].unique === true, found);
}

const DynamicQRToken = require("../models/DynamicQRToken");
const { REDEEM_TOKEN_TTL_SECONDS } = require("../services/pointsService");
const ttl = DynamicQRToken.schema.indexes().find(([fields]) => fields.createdAt === 1);
check(
  "DynamicQRToken TTL covers the redeem window",
  ttl && ttl[1].expireAfterSeconds >= REDEEM_TOKEN_TTL_SECONDS,
  { ttl: ttl && ttl[1].expireAfterSeconds, redeem: REDEEM_TOKEN_TTL_SECONDS }
);

// --- ensureTtlIndex against a fake collection/db ---
const fake = ({ current, collModFails = false }) => {
  const calls = [];
  const collection = {
    collectionName: "dynamicqrtokens",
    indexes: async () => (current === null ? [] : [{ name: "createdAt_1", key: { createdAt: 1 }, expireAfterSeconds: current }]),
    dropIndex: async (n) => { calls.push(["dropIndex", n]); },
    createIndex: async (k, o) => { calls.push(["createIndex", k, o]); },
  };
  const db = {
    command: async (cmd) => {
      calls.push(["command", cmd]);
      if (collModFails) throw Object.assign(new Error("not authorized on stampd to execute command { collMod"), { code: 13 });
    },
  };
  return { collection, db, calls };
};

(async () => {
  {
    const f = fake({ current: 30 });
    const r = await ensureTtlIndex(f.collection, f.db, { createdAt: 1 }, 180);
    check("30s TTL -> collMod to 180", f.calls.length === 1 && f.calls[0][1].collMod === "dynamicqrtokens" && f.calls[0][1].index.expireAfterSeconds === 180, f.calls);
    check("reports what it changed", r.changed === true && r.from === 30 && r.to === 180, r);
  }
  {
    const f = fake({ current: 30, collModFails: true });
    const r = await ensureTtlIndex(f.collection, f.db, { createdAt: 1 }, 180);
    const names = f.calls.map((c) => c[0]);
    check("collMod not permitted -> drop + recreate", names.join(",") === "command,dropIndex,createIndex", names);
    check("recreated with the new TTL", f.calls[2] && f.calls[2][2].expireAfterSeconds === 180, f.calls[2]);
    check("reports the fallback", r.changed === true && r.method === "recreate", r);
  }
  {
    const f = fake({ current: 180 });
    const r = await ensureTtlIndex(f.collection, f.db, { createdAt: 1 }, 180);
    check("already 180 -> no-op", f.calls.length === 0 && r.changed === false, { calls: f.calls, r });
  }
  {
    const f = fake({ current: null });
    const r = await ensureTtlIndex(f.collection, f.db, { createdAt: 1 }, 180);
    check("index absent -> left to Mongoose autoIndex", f.calls.length === 0 && r.changed === false, { calls: f.calls, r });
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll model-index checks passed.");
})();
