# Group B — Image pipeline (logo/banner/reward/event images not showing)

## Root cause
This app has two parallel image systems:
- **Legacy**: string URL fields (`logoUrl`, `bannerUrl`, `imageUrl`) — an external URL or old base64 data URI.
- **Current**: id-based (`logoImageId`/`bannerImageId`/`imageId` on the owning document → served from `/api/images/:id`), resolved on read via `lib/images.ts`'s `resolveImageUrl(imageId, fallbackUrl)` (id wins if present).

Upload flows correctly write the new id fields. Several **read** sites were never migrated off the legacy string field, so a freshly uploaded image never renders there:

- `CustomerLayout.tsx` — reads `tenant.branding.logoUrl` directly, ignores `branding.logoImageId`.
- The equivalent banner-rendering spot (same component/pattern) — same issue for `bannerUrl`/`bannerImageId`.
- `CustomerDashboard.tsx` reward tiles — read `item.imageUrl` directly, no `resolveImageUrl` call.
- **Backend**: `pointsService.js` `getRedeemCatalog`'s `fromRewards` mapping (~line 461-469) never includes `imageId` in the response at all — even a fixed frontend has nothing to resolve for reward-catalog items.
- `ExploreEvents.tsx` / `useExploreEvents.ts` — same raw-`imageUrl` pattern for event images.
- `Explore.tsx` / `ExploreMine.tsx` / `BusinessLanding.tsx` / `useDiscover.ts` — same pattern for outlet logos/banners in discovery listings.

(`MenuItem` has no image field at all — the `fromMenu` catalog entries' hardcoded `imageUrl: ""` is correct as-is, not a bug.)

## Design
One coherent fix, two parts:

1. **Backend**: `pointsService.js` `getRedeemCatalog`'s `fromRewards` map adds `imageId: item.imageId || null` alongside the existing `imageUrl`.
2. **Frontend**: at every site listed above, replace the raw `.logoUrl`/`.bannerUrl`/`.imageUrl` read with `resolveImageUrl(item.xImageId, item.xUrl)` from `lib/images.ts`. No new helper, no new pattern — just apply the existing one everywhere it was missed.

## Testing
- Backend: extend the redeem-catalog test to assert `imageId` is present in reward entries.
- Manual (browser): upload a fresh logo/banner in `Branding.tsx`, verify it renders in the customer console header immediately (no legacy fallback needed); upload a reward image, verify it renders in `CustomerDashboard.tsx`'s redeem tiles; check an event image renders in `ExploreEvents.tsx`.
