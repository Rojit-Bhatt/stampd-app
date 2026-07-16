const { DEFAULT_PROGRAM } = require("../config/platform");

const PROGRAM_FIELDS = Object.keys(DEFAULT_PROGRAM);

// The ONLY place loyalty config is resolved. An outlet overrides its company
// field-by-field: a non-null Organization.program value wins, otherwise the
// Company.programDefaults value, otherwise the platform default.
//
// Uses `??`, never `||` — 0 is a legitimate configured value (a 0 minimum
// bill, "never expires"), and `||` would silently fall through to the parent
// for every one of them.
//
// Always resolved in JS from already-fetched documents. Never query a nested
// path (`{"program.x": 1}`): the mock DB's matchesQuery reads `doc[key]`
// literally, so a dotted key matches nothing, and a dotted `$set` would
// create a literal key named "program.x" instead of nesting.
const resolveProgram = (company, organization) => {
  const outletProgram = (organization && organization.program) || {};
  const companyDefaults = (company && company.programDefaults) || {};

  const resolved = {};
  for (const field of PROGRAM_FIELDS) {
    resolved[field] = outletProgram[field] ?? companyDefaults[field] ?? DEFAULT_PROGRAM[field];
  }
  return resolved;
};

// Which fields this outlet actually overrides — powers the admin console's
// "inherited vs overridden" affordance.
const getOverriddenFields = (organization) => {
  const outletProgram = (organization && organization.program) || {};
  return PROGRAM_FIELDS.filter((field) => outletProgram[field] !== null && outletProgram[field] !== undefined);
};

module.exports = { resolveProgram, getOverriddenFields, PROGRAM_FIELDS };
