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

// Validates and narrows a caller-supplied program object to just the known
// fields, so a registration/update endpoint can accept program config without
// each one re-implementing the same checks.
//
// `allowNull` is the difference between the two levels of the hierarchy:
//   Company.programDefaults are REAL values and must never be null — they're
//     the fallback everything else resolves to.
//   Organization.program fields may be null, which is precisely how an outlet
//     says "inherit this one from my company".
//
// Fields absent from the input are left absent rather than defaulted, so a
// partial update only touches what it names.
const sanitizeProgramInput = (input, { allowNull = false, label = "program" } = {}) => {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw Object.assign(new Error(`${label} must be an object.`), { statusCode: 400 });
  }

  const out = {};
  for (const field of PROGRAM_FIELDS) {
    if (!(field in input)) continue;
    const raw = input[field];

    if (raw === null || raw === "") {
      if (!allowNull) {
        throw Object.assign(
          new Error(`${label}.${field} can't be empty — it's the value outlets inherit.`),
          { statusCode: 400 },
        );
      }
      out[field] = null;
      continue;
    }

    const num = Number(raw);
    // Not `!num`: 0 is legitimate for pointsExpiryDays ("never expires") and
    // for earnPercent (a program that awards nothing), and must survive.
    if (!Number.isFinite(num) || num < 0) {
      throw Object.assign(
        new Error(`${label}.${field} must be a number of 0 or more.`),
        { statusCode: 400 },
      );
    }
    out[field] = num;
  }

  return Object.keys(out).length ? out : undefined;
};

module.exports = { resolveProgram, getOverriddenFields, sanitizeProgramInput, PROGRAM_FIELDS };
