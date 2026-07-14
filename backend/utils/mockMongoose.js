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
        if (op === "$lte") {
          const lteVal = queryVal[op];
          if (docVal === null || docVal === undefined || new Date(docVal) > new Date(lteVal)) {
            matchesOps = false;
          }
        } else if (op === "$gte") {
          const gteVal = queryVal[op];
          if (docVal === null || docVal === undefined || new Date(docVal) < new Date(gteVal)) {
            matchesOps = false;
          }
        }
      }
      if (!matchesOps) return false;
      continue;
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
    return this.execFn(this).then(onFulfilled, onRejected);
  }
}

const mongoose = {
  Schema,
  Types: { ObjectId },
  modelSchemas: {},
  
  connect: async () => {
    console.log("[Mock Mongoose] Connected to in-memory database successfully.");
    return { connection: { host: "in-memory" } };
  },
  
  startSession: async () => {
    return {
      startTransaction: () => {},
      commitTransaction: () => {},
      abortTransaction: () => {},
      endSession: () => {},
      withTransaction: async (fn) => {
        return fn();
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
        if (Array.isArray(docOrDocs)) {
          const docs = docOrDocs.map(d => new Document(name, d));
          for (const doc of docs) {
            list.push(doc);
          }
          return docs;
        } else {
          const doc = new Document(name, docOrDocs);
          list.push(doc);
          return doc;
        }
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
        if (found) {
          updateDoc(found, update);
          return { acknowledged: true, modifiedCount: 1 };
        }
        return { acknowledged: true, modifiedCount: 0 };
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

module.exports = mongoose;
