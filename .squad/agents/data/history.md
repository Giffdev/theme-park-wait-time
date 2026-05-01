# Data — History

## Project Context

- **Project:** theme-park-wait-times — Platform for tracking ride wait times, logging visits, crowd calendars, and crowd-sourced data.
- **Stack:** React/Next.js, TypeScript, Firebase (Firestore, Auth, Security Rules), Vercel
- **Architecture:** Public data (parks, attractions, wait times, calendars) vs private (users, trips, ride logs)

*Detailed early work archived in history-archive-20260501.md*

## Recent Sprints

| Sprint | Status | Deliverables |
|---|---|---|
| ParkFlow Brand + Schedule API | ✅ Shipped | `/api/parks/[slug]/schedule`, `/api/park-hours`, mobile nav, seed script multi-destination |
| Forecast System Phase 1 | ✅ Shipped | `resolveForecast()`, confidence thresholds, historical aggregates |
| Stale Data + Auto-Refresh | ✅ Shipped | Triple-layer cache fix, hooks, 19 unit tests |
| Slug Resolution Debug | ✅ Fixed | Wait-times route accepts slug/UUID, 15 tests pass |

## Key Contributions

**Schedule APIs:**
- `/api/parks/[slug]/schedule` — single park, slug→UUID lookup, 5-min cache
- `/api/park-hours` — batch endpoint, graceful degradation, minimal payload (slug, name, timezone, status, hours)

**Forecast Blending:**
- `resolveForecast()` — live > historical > none, confidence = min(samples/50, 1)
- Threshold: ≥15 samples, ≥3 per hour, public read, server-only write

**Data Resilience:**
- Triple-layer cache: Next.js revalidate + CDN + app state
- Crowd calendar historical fix: reads `forecastAggregates/byDayOfWeek` for non-today dates
- Graceful degradation on API outages (429/5xx) with stale fallback

**Seed Script Generalization:**
- Multi-destination config: `SEED_DESTINATIONS` with `keywords`, `parkFilter`, `timezoneOverride`
- Worlds of Fun: 94 attractions, `America/Chicago` timezone
- 13 parks × 627 attractions seeded (Orlando + Kansas City)

**Architecture Patterns:**
- Slug-based routing: Firestore queries use slug; resolve to UUID for upstream API
- Trip/ride-log decoupling: independent try/catch, ride logs supplementary
- Park registration: `DESTINATION_FAMILIES` → `park-registry.ts` for slug↔UUID mapping
- Firestore indexes: `parks.slug`, `attractions.slug`, composite (rideLogs: tripId+rodeAt)

## Status

✅ All tests passing (15+ suites)  
✅ Production deployed  
✅ All endpoints slug-aware  
✅ Forecast blending integrated

**Files Modified/Created:**
- `src/app/api/parks/[parkId]/schedule/route.ts` — Replaced placeholder with real implementation. Looks up park by slug in Firestore to get UUID, calls `https://api.themeparks.wiki/v1/entity/{id}/schedule`, returns today's operating hours with timezone. Handles: park not found (404), wiki API down (502), no schedule data (NO_DATA status).
- `src/app/api/park-hours/route.ts` (NEW) — Batch endpoint for parks listing page. Fetches schedule for ALL parks in parallel, returns slug, name, timezone, status (OPEN/CLOSED/NO_DATA/ERROR), and opening/closing times. Frontend can call once to get all parks' status.

**Design Choices:**
- Schedule route uses slug-based lookup (Firestore query `where('slug', '==', slug)`) since URLs use slugs not UUIDs.
- Today's date computed in park's local timezone using `toLocaleDateString('en-CA', { timeZone })` for correct YYYY-MM-DD.
- 5-minute revalidation cache on wiki API calls (`next: { revalidate: 300 }`).
- OPERATING entry type determines open/closed; other types (EXTRA_HOURS, etc.) included in full schedule response.
- Batch endpoint uses `Promise.all` — individual park failures don't break the batch.

## Recent Work (2026-04-29T22:00:33-07:00)

### P2 Audit — Mobile Nav + Feature Cards

**AuthNav.tsx — Mobile nav restructure:**
- Logged-in users: Home, Parks, My Rides (ticket icon), Trips, Dashboard (5 items)
- Non-logged-in users: Home, Parks, Calendar, Sign In (4 items)
- Calendar dropped from logged-in mobile nav (accessible from home/parks)
- My Rides links to `/ride-log` with ticket SVG icon

**FeatureCards.tsx — Added 4th card:**
- "Track Your Rides" / "My Ride History" (auth-aware title) with 🎢 emoji
- Links to `/ride-log` (logged in) or `/auth/signin` (guest)
- coral color scheme: `bg-coral-50 hover:bg-coral-100 border-coral-200`
- Grid updated from `lg:grid-cols-3` to `lg:grid-cols-4` for 2×2 / 4-across layout

**ParkPulse check:** Neither file contains any ParkPulse references. Clean.

All tests pass (vitest).

## Learnings

- Park registration requires entries in TWO files:`src/lib/constants.ts` (PARK_FAMILIES) and `src/lib/crowd-calendar/park-families.ts` (PARK_FAMILY_REGISTRY). The first uses simple string IDs; the second uses ThemeParks Wiki UUIDs.
- When a park isn't in the ThemeParks Wiki API yet, use a descriptive placeholder ID (e.g., `oceans-of-fun-kc`) - it won't have live data but reserves the slot.
- User wants to eventually add ALL parks from the wiki. Current approach: add incrementally per request.
- `scripts/seed-parks.ts` now uses a `SEED_DESTINATIONS` config map — to add a new destination, just add an entry with keywords, optional parkFilter (UUID list), and optional timezoneOverride. No structural changes needed.
- Firestore seeding uses `service-account.json` at project root (or `FIREBASE_SERVICE_ACCOUNT` env var).
- ThemeParks Wiki API destination for Worlds of Fun ID: `c4231018-dc6f-4d8d-bfc2-7a21a6c9e9fa`. The destination contains both Worlds of Fun and Oceans of Fun, but only WoF is in the API.
- ThemeParks Wiki schedule API: `GET /v1/entity/{parkId}/schedule` returns `{ schedule: [{ date, type, openingTime, closingTime }] }`. The `type` field is key — `OPERATING` = normal hours, others are extra hours/events. Dates and times are ISO strings.
- Park slug → UUID resolution: Firestore `parks` collection has a `slug` field. Query `where('slug', '==', slug).limit(1)` to resolve.
- Compound Firestore queries (multiple `where` + `orderBy`) require composite indexes. If the index is missing, the query throws and can cascade-fail other fetches if wrapped in `Promise.all`. Always separate independent fetches so one failure doesn't mask the other.
- `firestore.indexes.json` is the source of truth for deployed indexes. Always add new composite indexes there when adding compound queries.
- Vercel CLI deployment (2026-05-01): `npx vercel --prod` works from project root. Spinner animations break terminal buffer capture — pipe to `Out-File` to get final output. Production alias: `https://theme-park-wait-times.vercel.app`. Build region: iad1 (Washington D.C.). Project scope: `giffdevs-projects`.
- **Wait-times API slug resolution (2026-05-01):** The `/api/wait-times` route previously passed the `parkId` query param directly to ThemeParks Wiki API. The API requires entity UUIDs, not slugs. Fixed by adding `getParkBySlug()` resolution from `src/lib/parks/park-registry.ts`. The endpoint now accepts both slugs (`magic-kingdom`) and UUIDs. Unknown slugs return 400 instead of 500. The response `parks` object is keyed by the original `parkId` the caller sent (slug or UUID), but Firestore writes use the resolved UUID.
- `src/lib/parks/park-registry.ts` exports `getParkBySlug(slug)` and `getParkById(uuid)` — use these for any slug↔UUID resolution in API routes.

## Recent Work (2026-04-30T15:07:41-07:00)

### UX Bug-Fix Sprint — Park Names & Background Refresh

**Trip-service.ts updates:**
- `updateTripStats()` now uses `getParkById` registry lookup when `parkNames` is missing or incomplete. Backfill strategy: write-path adds registry data; read-path uses fallbacks when data absent.
- `getTrips()` now applies `availableParks` fallback list for trips with empty `parkNames`, enabling card display to work with "X parks visited" summary without requiring populated names array.

**Park drill-down page alphabetical sort:**
- When parks in timeline have no names (empty `parkNames` array), fallback to alphabetical sort by parkId after applying `getParkById` registry lookup. Ensures consistent ordering even with incomplete data.

**Key pattern applied:** `log.parkName || trip.parkNames[index] || getParkById(parkId) || 'Unknown'` — three-level fallback for any displayed park name.

## Recent Work (2026-05-01T09:47:02-07:00)

### Stale Refresh Bug Fix + Auto-Refresh Hooks

**Root cause of stale data on refresh:**
The `/api/wait-times` route handler was being cached at multiple levels:
1. No `export const dynamic = 'force-dynamic'` — Next.js/Vercel could cache the route response at the edge (the internal `{ next: { revalidate: 60 } }` fetch hint contributed to this)
2. No `Cache-Control: no-store` response header — browsers could serve cached 200 responses
3. Client `fetch()` in `handleRefresh` had no `cache: 'no-store'` option

Result: user clicks refresh → browser/edge serves cached response → API never re-runs → Firestore data stays stale → "updated as of 3:16 PM" persists.

**Fix applied (3 layers):**
- `src/app/api/wait-times/route.ts`: Added `export const dynamic = 'force-dynamic'` + `Cache-Control: no-store, max-age=0` on response
- `src/app/parks/[parkId]/page.tsx`: Added `cache: 'no-store'` to both the refresh fetch and the schedule fetch

**New hooks built (per Mikey's architecture):**
- `src/hooks/useVisibility.ts` — Page Visibility API + iOS Safari blur/focus fallback + 5s debounce
- `src/hooks/useAutoRefresh.ts` — Staleness-aware refresh with silent background execution, in-flight dedup, error silence

## Sprint Complete: Auto-Refresh (2026-05-01)

**Decision:** D28 Force-Dynamic Wait Times API + Cache-Busting Client Fetches (Implemented)

**Root Cause Fixed:** Triple-layer caching bug from previous session — Vercel edge cached responses, browser cached HTTP, client fetch lacked no-store directive.

**Implementation:**
- `export const dynamic = 'force-dynamic'` on /api/wait-times route (ensures Vercel never caches handler response)
- `Cache-Control: no-store, max-age=0` response header (prevents browser/CDN caching)
- `cache: 'no-store'` on all volatile data fetches

**Hooks Implemented:**
- `useVisibility.ts` — Low-level visibility detection with iOS Safari fallback
- `useAutoRefresh.ts` — Full orchestrator with staleness thresholds, silent background refresh, error suppression

**Test Coverage:** 19 useAutoRefresh unit tests (all passing) covering staleness logic, debounce, in-flight dedup, iOS events

**Related Decisions:** D28 (cache-busting), D27 (overall architecture)

---

## Team Update (2026-05-01T17:45:00Z)

### Multi-Agent Investigation: API 500 Error & Stale Cache

**Status:** ✅ Both issues resolved

**Issue 1: `/api/wait-times?parkId=magic-kingdom` returning 500**
- **Root Cause:** Endpoint accepted park slugs but passed them directly to ThemeParks Wiki API, which requires UUIDs
- **Fix:** Added slug-to-UUID resolution via `getParkBySlug()` in wait-times route. Endpoint now accepts both formats.
- **Impact:** Parks listing page can now use slugs for API calls (which already use them for URLs). All 15 tests passing.
- **Commit:** 9b62920

**Issue 2: Frontend stale "last refresh" timestamp (Mouth team)**
- **Root Cause:** Parks list fetch was being cached, preventing fresh timestamp on each navigation
- **Fix:** Added `cache: no-store` to fetch in parks listing page
- **Impact:** Parks list now shows accurate real-time status
- **Commit:** 4432553

**Decision Merged:**
- Decision: Wait-times API accepts both slugs and UUIDs (implemented, fully tested)

**Next Steps:** Monitor production for any edge cases with slug resolution.
## Key Patterns & Decisions

- **API slug resolution:** Endpoints accept both slug and UUID formats. Slug-to-UUID lookup via Firestore.
- **Graceful degradation:** Non-blocking API calls (schedule, hours) don't break responses if data unavailable.
- **Forecast blending:** esolveForecast() returns live > historical > none with confidence = min(samples/50, 1)
- **Firestore security rules:** forecastAggregates public read, server-only write. Attractions as park subcollection.
- **Triple-layer caching:** Next.js revalidate + CloudFlare CDN + app-level state for performance
- **Seed script generalization:** Multi-destination config with parkFilter allowlists (excludes water parks not in API)
- **Park registration:** DESTINATION_FAMILIES maps destinations to park groups; park-registry.ts handles slug↔UUID resolution

## Current Status

✅ All tests passing (15+ test suites)  
✅ Production deployed  
✅ Seed script supports multi-destination parks  
✅ Slug resolution working for all endpoints
