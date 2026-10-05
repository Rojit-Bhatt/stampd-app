// Brings an existing TTL index to the expireAfterSeconds the schema now
// declares. MongoDB never does this on its own: Mongoose's autoIndex sees an
// index on the same keys with different options and leaves the old one in
// place, so a changed TTL in a model is silently ignored in production.
//
// collMod changes the TTL in place. If the database user isn't allowed to
// run it, drop + recreate instead — both are ordinary index operations, and
// on a TTL index the only cost is that expiry pauses for the moment the
// index is missing. Idempotent: a no-op once the TTL matches. An absent
// index is left to autoIndex, which builds it with the schema's options.
const ensureTtlIndex = async (collection, db, key, expireAfterSeconds) => {
  const wanted = JSON.stringify(key);
  const existing = (await collection.indexes()).find((ix) => JSON.stringify(ix.key) === wanted);
  if (!existing || existing.expireAfterSeconds === expireAfterSeconds) {
    return { changed: false };
  }

  const from = existing.expireAfterSeconds;
  try {
    await db.command({
      collMod: collection.collectionName,
      index: { keyPattern: key, expireAfterSeconds }
    });
    return { changed: true, method: "collMod", from, to: expireAfterSeconds };
  } catch (_err) {
    await collection.dropIndex(existing.name);
    await collection.createIndex(key, { name: existing.name, expireAfterSeconds });
    return { changed: true, method: "recreate", from, to: expireAfterSeconds };
  }
};

module.exports = { ensureTtlIndex };
