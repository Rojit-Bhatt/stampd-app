# Image Serving Migration (G20) — Deferred

## Why it was deferred

Rewriting image serving (QR codes, brand assets, customer avatars) from
base64-in-DB to object storage (Cloudflare R2 / AWS S3) touches every client
surface at once — web, PWA service worker, admin uploads, menu import, QR
rendering. Getting it wrong costs more than it buys, so Phase 3 documents the
path and hardens what already exists (Dockerfile pinned base image,
healthcheck, non-root user, bundle budget, k6 script) instead of shipping a
half-done migration.

## Current state

| Surface | Storage today | Risk |
|---|---|---|
| QR codes | rendered on demand, base64 `data:` URI | Low — small, cached |
| Brand / menu images | uploaded, base64 into MongoDB | Medium — 16MB doc limit, big rows |
| Customer avatars | base64 into `CustomerAvatar.image` (capped by `MAX_AVATAR_BYTES`) | Medium — bounded but fat rows |
| PWA icons | static assets on Cloudflare Workers | None |

## Migration plan (when prioritised)

1. **Double-write**: uploads continue writing base64 AND upload to R2/S3
   (`images/{tenant}/{filename}`). New reads serve object-storage URLs with
   signed, short-lived GET URLs (7 days, enough for cache TTLs).
2. **Backfill**: one-off job reads existing base64 rows, uploads to storage,
   sets a `storageKey` field, clears the base64 on the next write.
3. **Verify + flip**: checksum of image bytes pre/post migration; when 100% of
   rows have `storageKey`, remove base64 from response payloads.
4. **Delete rows**: drop base64 fields from schema; archive the migration job
   logs.

Risks: QR generation latency if offloaded — keep on-server render, only move
persisted assets. Rollback: keep `image` field in schema through step 3 so a
`storageKey`-absent row falls back to base64.
