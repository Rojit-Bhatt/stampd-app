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
    
    // Handle operators
    if (queryVal && typeof queryVal === 'object' && !Array.isArray(queryVal) && !(queryVal instanceof Date)) {
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

class Document {
  constructor(modelName, data) {
    this._modelName = modelName;
    this._id = data._id || new ObjectId();
    this.id = this._id.toString();
    
    const schema = mongoose.modelSchemas[modelName];
    if (schema && schema.definition) {
      for (const [k, val] of Object.entries(schema.definition)) {
        if (val && typeof val === 'object' && val.default !== undefined) {
          this[k] = typeof val.default === 'function' ? val.default() : val.default;
        }
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
      
      static async find(query) {
        const list = db[name] || [];
        const matches = list.filter(doc => matchesQuery(doc, query));
        
        const results = matches.map(doc => doc);
        
        const qArray = [...results];
        qArray.populate = function(path, select) {
          if (path === "userId") {
            const users = db["User"] || [];
            for (let i = 0; i < this.length; i++) {
              const uId = castToId(this[i].userId);
              const foundUser = users.find(u => u.id === uId);
              if (foundUser) {
                this[i].userId = {
                  _id: foundUser._id,
                  id: foundUser.id,
                  name: foundUser.name,
                  email: foundUser.email,
                  role: foundUser.role
                };
              }
            }
          }
          return this;
        };
        qArray.sort = function(spec) {
          if (spec) {
            let key = typeof spec === 'string' ? spec : Object.keys(spec)[0];
            let dir = 1;
            if (typeof spec === 'string' && spec.startsWith('-')) {
              key = spec.slice(1);
              dir = -1;
            } else if (spec[key] === -1 || spec[key] === 'desc') {
              dir = -1;
            }
            this.sort((a, b) => {
              const valA = a[key];
              const valB = b[key];
              if (valA < valB) return -1 * dir;
              if (valA > valB) return 1 * dir;
              return 0;
            });
          }
          return this;
        };
        qArray.limit = function(n) {
          return createQueryArray(this.slice(0, n));
        };
        qArray.session = function() { return this; };
        
        function createQueryArray(arr) {
          const res = [...arr];
          res.populate = qArray.populate;
          res.sort = qArray.sort;
          res.limit = qArray.limit;
          res.session = qArray.session;
          return res;
        }
        
        return qArray;
      }
      
      static async findOne(query) {
        const list = db[name] || [];
        const found = list.find(doc => matchesQuery(doc, query));
        if (!found) return null;
        
        const qOne = Promise.resolve(found);
        qOne.session = function() { return this; };
        qOne.populate = function() { return this; };
        return qOne;
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
      
      static async findOneAndUpdate(query, update, options) {
        const list = db[name] || [];
        let found = list.find(doc => matchesQuery(doc, query));
        
        const isNew = options && options.new;
        const upsert = options && options.upsert;
        
        let oldDoc = null;
        if (found) {
          oldDoc = { ...found };
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
        
        const returnDoc = isNew ? found : (oldDoc || found);
        const qOne = Promise.resolve(returnDoc);
        qOne.session = function() { return this; };
        qOne.populate = function() { return this; };
        return qOne;
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
    };
    
    return ModelClass;
  }
};

module.exports = mongoose;
