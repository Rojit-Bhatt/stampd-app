const crypto = require("crypto");

const db = {}; // modelName -> array of documents
class ObjectId {
  constructor(id) {
    this._id = id || crypto.randomBytes(12).toString("hex");
  }
  toString() {
    return this._id;
  }
}

function castToId(val) {
  if (val && val._id) return val._id;
  if (val && typeof val.toString === 'function') return val.toString();
  return val;
}

class Schema {
  constructor(definition, options) {
    this.definition = definition;
    this.options = options;
  }
  index() {}
}
Schema.Types = {
  ObjectId: ObjectId
};

function matchesQuery(doc, query) {
  if (!query) return true;
  for (const key of Object.keys(query)) {
    if (key === "$or") {
      const orConditions = query[key];
      let matchesOr = false;
      for (const cond of orConditions) {
        if (matchesQuery(doc, cond)) {
          matchesOr = true;
          break;
        }
      }
      if (!matchesOr) return false;
      continue;
    }
    
    let queryVal = query[key];
    let docVal = doc[key];

    // Handle operators. Only treat the value as an operator object when it
    // actually carries $-prefixed operator keys. Without this guard, a scalar
    // object value like an ObjectId ({ _id, toString }) is misread as an
    // operator object with no known operators, which makes the field match
    // ANY document — so findOne({ _id: someObjectId }) returns the first doc
    // in the collection instead of the one with that id.
    const isOperatorObject =
      queryVal && typeof queryVal === 'object' && !Array.isArray(queryVal) &&
      !(queryVal instanceof Date) && Object.keys(queryVal).some(k => k.startsWith('$'));
    if (isOperatorObject) {
      let matchesOps = true;
      for (const op of Object.keys(queryVal)) {
        // Unsupported operators MUST throw, not fall through. Silently
        // leaving matchesOps true made the field match every document —
        // e.g. find({x: {$ne: 5}}) returned the whole collection while real
        // Mongo returns only non-5 rows, and no test could see the
        // difference. A loud dev-time failure beats a plausible wrong
        // answer; add the operator here if you genuinely need it.
        if (op !== "$lte" && op !== "$gte" && op !== "$in" && op !== "$regex") {
          throw new Error(
            `[Mock Mongoose] Unsupported query operator "${op}". Only $lte/$gte/$in/$regex/$or/equality are implemented — ` +
            `see CLAUDE.md. Express this as a JS filter after fetching instead.`
          );
        }

        const opVal = queryVal[op];
        if (docVal === null || docVal === undefined) {
          matchesOps = false;
          continue;
        }

        // Compare numbers numerically and dates as dates. The previous
        // unconditional `new Date(...)` coercion truncated fractional
        // numbers to whole milliseconds — {$gte: 10.9} matched a value of
        // 10.5, because Date(10.5) and Date(10.9) are both 10ms. That let a
        // "sufficient balance" guard pass on an insufficient balance.
        const bothNumeric = typeof docVal === "number" && typeof opVal === "number";
        const left = bothNumeric ? docVal : new Date(docVal).getTime();
        const right = bothNumeric ? opVal : new Date(opVal).getTime();

        if (op === "$lte" && left > right) matchesOps = false;
        if (op === "$gte" && left < right) matchesOps = false;
        // $in: array-valued. Compared with ObjectId/Date/number awareness —
        // the same semantics the real driver gives {field: {$in: arr}}.
        if (op === "$in") {
          if (!Array.isArray(opVal) || opVal.length === 0) {
            matchesOps = false;
          } else {
            let hit = false;
            for (const candidate of opVal) {
              if (castToId(docVal) === castToId(candidate)) { hit = true; break; }
            }
            if (!hit) matchesOps = false;
          }
        }
      }
      if (!matchesOps) return false;
      continue;
    }
    
    if (isOperatorObject && Object.keys(queryVal).length === 1 && Object.keys(queryVal)[0] === "$regex") {
      // {field: {$regex: ...}} — anchor-anchored pattern match only when
      // the pattern is a /^.../ style, which is how the seed hook looks up
      // its own rows. Loose substring matches would silently over-select.
      const pattern = queryVal.$regex;
      if (!(pattern instanceof RegExp)) return false;
      return pattern.test(String(docVal));
    }
    if (castToId(docVal) !== castToId(queryVal)) {
      return false;
    }
  }
  return true;
}

function updateDoc(doc, update) {
  if (!update) return;
  const set = update.$set;
  const inc = update.$inc;
  const setOnInsert = update.$setOnInsert;
  
  if (set) {
    for (const [k, v] of Object.entries(set)) {
      doc[k] = v;
    }
  }
  if (inc) {
    for (const [k, v] of Object.entries(inc)) {
      doc[k] = (doc[k] || 0) + v;
    }
  }
  if (setOnInsert) {
    for (const [k, v] of Object.entries(setOnInsert)) {
      if (doc[k] === undefined) {
        doc[k] = v;
      }
    }
  }
}

// A "leaf" field descriptor is a plain field definition (has type/default/ref),
// as opposed to a nested object of sub-fields (like branding/program).
function isLeafDescriptor(val) {
  return val && typeof val === "object" &&
    ("type" in val || "default" in val || "ref" in val);
}

// Recursively compute default values from a schema definition, including nested
// sub-documents. Real Mongoose fills these automatically; the mock previously
// only filled top-level defaults, leaving nested objects (e.g. Organization
// .program / .branding) undefined.
function computeDefaults(definition) {
  const out = {};
  for (const [k, val] of Object.entries(definition)) {
    if (val && typeof val === "object" && !Array.isArray(val) &&
        typeof val !== "function" && !isLeafDescriptor(val)) {
      const nested = computeDefaults(val);
      if (Object.keys(nested).length) out[k] = nested;
    } else if (val && typeof val === "object" && val.default !== undefined) {
      out[k] = typeof val.default === "function" ? val.default() : val.default;
    }
  }
  return out;
}

class Document {
  constructor(modelName, data) {
    this._modelName = modelName;
    this._id = data._id || new ObjectId();
    this.id = this._id.toString();

    const schema = mongoose.modelSchemas[modelName];
    if (schema && schema.definition) {
      const defaults = computeDefaults(schema.definition);
      for (const [k, v] of Object.entries(defaults)) {
        this[k] = v;
      }
    }

    for (const [k, v] of Object.entries(data)) {
      if (k !== "_id" && k !== "id") {
        this[k] = v;
      }
    }
  }
  
  async save() {
    const list = db[this._modelName];
    const idx = list.findIndex(d => d.id === this.id);
    if (idx >= 0) {
      list[idx] = this;
    } else {
      list.push(this);
    }
    return this;
  }
  
  toObject() {
    const obj = { ...this };
    delete obj._modelName;
    return obj;
  }
  
  toJSON() {
    return this.toObject();
  }
}

class Query {
  constructor(execFn) {
    this.execFn = execFn;
    this.populates = [];
    this.sortSpec = null;
    this.limitVal = null;
  }

  populate(path, select) {
    this.populates.push({ path, select });
    return this;
  }

  sort(spec) {
    this.sortSpec = spec;
    return this;
  }

  limit(n) {
    this.limitVal = n;
    return this;
  }

  session(sess) {
    return this;
  }

  then(onFulfilled, onRejected) {
    countFind();
    return this.execFn(this).then(onFulfilled, onRejected);
  }
}

const mongoose = {
  Schema,
  Types: { ObjectId },
  modelSchemas: {},
  
  connect: async () => {
    console.log("[Mock Mongoose] Connected to in-memory database successfully.");
    // A minimal fake connection object — real driver's `mongoose.connection`
    // is what middleware (e.g. the dev/TEST round-trip counters in
    // testHookRoutes) reaches through; expose one here so that access does
    // not throw.
    mongoose.connection = { host: "in-memory" };
    return { connection: mongoose.connection };
  },
  
  startSession: async () => {
    return {
      startTransaction: () => {},
      commitTransaction: () => {},
      abortTransaction: () => {},
      endSession: () => {},
      // Real MongoDB rolls every write inside `fn` back on a throw. Callers
      // rely on that — e.g. pointsService.redeemPoints consumes the redeem
      // QR token before the atomic balance check, trusting a failed check to
      // un-consume it; pendingClaimService's already-fulfilled race guard
      // depends on it too. A bare passthrough here left both of those races
      // live in every dev/test run (the only place this mock is used), so
      // this snapshots every collection before `fn` runs and restores it —
      // in place, onto the same Document references, so any `.save()`/
      // `.toObject()` a caller still holds keeps working — on failure.
      withTransaction: async (fn) => {
        const modelNames = Object.keys(db);
        const snapshot = {};
        for (const name of modelNames) {
          snapshot[name] = db[name].map((doc) => [doc, { ...doc }]);
        }
        try {
          return await fn();
        } catch (err) {
          for (const name of modelNames) {
            db[name] = snapshot[name].map(([doc, props]) => {
              for (const k of Object.keys(doc)) {
                if (!(k in props)) delete doc[k];
              }
              Object.assign(doc, props);
              return doc;
            });
          }
          throw err;
        }
      }
    };
  },
  
  model: (name, schema) => {
    if (schema) {
      mongoose.modelSchemas[name] = schema;
    }
    if (!db[name]) {
      db[name] = [];
    }
    
    const ModelClass = class {
      constructor(data) {
        return new Document(name, data || {});
      }
      
      static get modelName() {
        return name;
      }
      
      static find(query) {
        return new Query(async (q) => {
          let list = db[name] || [];
          let matches = list.filter(doc => matchesQuery(doc, query));
          
          let results = matches.map(doc => doc);
          
          if (q.sortSpec) {
            let key = typeof q.sortSpec === 'string' ? q.sortSpec : Object.keys(q.sortSpec)[0];
            let dir = 1;
            if (typeof q.sortSpec === 'string' && q.sortSpec.startsWith('-')) {
              key = q.sortSpec.slice(1);
              dir = -1;
            } else if (q.sortSpec[key] === -1 || q.sortSpec[key] === 'desc') {
              dir = -1;
            }
            results.sort((a, b) => {
              const valA = a[key];
              const valB = b[key];
              if (valA < valB) return -1 * dir;
              if (valA > valB) return 1 * dir;
              return 0;
            });
          }

          if (q.limitVal !== null) {
            results = results.slice(0, q.limitVal);
          }

          for (const pop of q.populates) {
            if (pop.path === "userId") {
              const users = db["User"] || [];
              for (let i = 0; i < results.length; i++) {
                const uId = castToId(results[i].userId);
                const foundUser = users.find(u => u.id === uId);
                if (foundUser) {
                  results[i] = new Document(name, {
                    ...results[i].toObject(),
                    userId: {
                      _id: foundUser._id,
                      id: foundUser.id,
                      name: foundUser.name,
                      email: foundUser.email,
                      role: foundUser.role
                    }
                  });
                }
              }
            }
          }

          return results;
        });
      }
      
      static findOne(query) {
        return new Query(async (q) => {
          const list = db[name] || [];
          const found = list.find(doc => matchesQuery(doc, query));
          if (!found) return null;
          
          let resultDoc = found;
          for (const pop of q.populates) {
            if (pop.path === "userId") {
              const users = db["User"] || [];
              const uId = castToId(resultDoc.userId);
              const foundUser = users.find(u => u.id === uId);
              if (foundUser) {
                resultDoc = new Document(name, {
                  ...resultDoc.toObject(),
                  userId: {
                    _id: foundUser._id,
                    id: foundUser.id,
                    name: foundUser.name,
                    email: foundUser.email,
                    role: foundUser.role
                  }
                });
              }
            }
          }
          return resultDoc;
        });
      }
      
      static async create(docOrDocs, options) {
        const list = db[name] || [];
        const docs = Array.isArray(docOrDocs) ? docOrDocs : [docOrDocs];
        const inserted = docs.map((d) => new Document(name, d));
        for (const doc of inserted) list.push(doc);
        countWrite(docs.length);
        return Array.isArray(docOrDocs) ? inserted : inserted[0];
      }
      // Bulk write path for the batch-writes benchmarks — same semantics
      // as the real driver: array in, documents with real _ids out. Order
      // is preserved because tests assert insert ordering occasionally.
      static async insertMany(docs, _options) {
        const list = db[name] || [];
        const inserted = docs.map((d) => new Document(name, d));
        for (const doc of inserted) list.push(doc);
        countWrite(docs.length);
        return inserted;
      }
      
      static findOneAndUpdate(query, update, options) {
        return new Query(async (q) => {
          const list = db[name] || [];
          let found = list.find(doc => matchesQuery(doc, query));
          
          const isNew = options && options.new;
          const upsert = options && options.upsert;
          
          let oldDoc = null;
          if (found) {
            oldDoc = new Document(name, found.toObject());
            updateDoc(found, update);
          } else if (upsert) {
            const newDocData = { ...query };
            if (query.$or) {
              for (const cond of query.$or) {
                for (const [k, v] of Object.entries(cond)) {
                  if (!k.startsWith("$")) newDocData[k] = v;
                }
              }
              delete newDocData.$or;
            }
            found = new Document(name, newDocData);
            updateDoc(found, update);
            list.push(found);
          } else {
            return null;
          }
          
          let returnDoc = isNew ? found : (oldDoc || found);

          for (const pop of q.populates) {
            if (pop.path === "userId") {
              const users = db["User"] || [];
              const uId = castToId(returnDoc.userId);
              const foundUser = users.find(u => u.id === uId);
              if (foundUser) {
                returnDoc = new Document(name, {
                  ...returnDoc.toObject(),
                  userId: {
                    _id: foundUser._id,
                    id: foundUser.id,
                    name: foundUser.name,
                    email: foundUser.email,
                    role: foundUser.role
                  }
                });
              }
            }
          }
          return returnDoc;
        });
      }
      
      static async updateOne(query, update, options) {
        const list = db[name] || [];
        const found = list.find(doc => matchesQuery(doc, query));
        const upsert = options && options.upsert;
        if (found) {
          updateDoc(found, update);
          return { acknowledged: true, modifiedCount: 1 };
        }
        if (upsert) {
          // Real Mongoose builds the new doc from the query predicates plus
          // the update operators; schema defaults are filled by the Document
          // constructor (same path findOneAndUpdate's upsert branch uses).
          const newDocData = { ...query };
          if (query.$or) {
            for (const cond of query.$or) {
              for (const [k, v] of Object.entries(cond)) {
                if (!k.startsWith("$")) newDocData[k] = v;
              }
            }
            delete newDocData.$or;
          }
          const newDoc = new Document(name, newDocData);
          updateDoc(newDoc, update);
          list.push(newDoc);
          return { acknowledged: true, modifiedCount: 0, upsertedId: newDoc._id };
        }
        return { acknowledged: true, modifiedCount: 0 };
      }

      static async updateMany(query, update, options) {
        const list = db[name] || [];
        const matches = list.filter(doc => matchesQuery(doc, query));
        for (const doc of matches) {
          updateDoc(doc, update);
        }
        return { acknowledged: true, matchedCount: matches.length, modifiedCount: matches.length };
      }
      
      static async deleteOne(query) {
        const list = db[name] || [];
        const idx = list.findIndex(doc => matchesQuery(doc, query));
        if (idx >= 0) {
          list.splice(idx, 1);
          return { acknowledged: true, deletedCount: 1 };
        }
        return { acknowledged: true, deletedCount: 0 };
      }

      static async deleteMany(query) {
        const list = db[name] || [];
        const before = list.length;
        db[name] = list.filter(doc => !matchesQuery(doc, query));
        return { acknowledged: true, deletedCount: before - db[name].length };
      }

      static async countDocuments(query) {
        const list = db[name] || [];
        return list.filter(doc => matchesQuery(doc, query)).length;
      }
    };
    
    return ModelClass;
  }
};

// Round-trip counters for the batch-writes benchmark. The mock engine never
// goes near the real driver, so express-rate-limit-style commandStarted
// monitoring stays at zero in tests — the benchmark therefore reads these
// counters through mongoose.connection.__mockOpStats (via testHookRoutes).
let findOps = 0;
let writeOps = 0;
const countFind = () => { findOps++; };
const countWrite = (n = 1) => { writeOps += n; };
Object.defineProperty(mongoose, "__mockOpStats", {
  get: () => ({ findOps, writeOps }),
  configurable: true
});
Object.defineProperty(mongoose, "__mockResetOps", {
  value: () => { findOps = 0; writeOps = 0; },
  configurable: true
});

module.exports = mongoose;
