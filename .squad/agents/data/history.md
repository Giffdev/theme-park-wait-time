# Data — History

## Project Context

- **Project:** theme-park-wait-times — A platform for theme park visitors to track ride wait times, log visits, plan trips with crowd calendars, and crowd-source real-time wait data.
- **Stack:** React/Next.js, TypeScript, Firebase (Firestore, Auth, Security Rules, Cloud Functions), Vercel
- **User:** Devin Sinha
- **Key concern:** Database structure for user accounts, public vs private data separation. Crowd calendars and wait times should be public; user ride logs and profiles should be private.
- **Deployment pattern:** Similar to Devin's arkham-horror-tracker and unmatched apps (Firebase + Vercel).

*Detailed history of early work (2026-04-28 through mid-2026-04-29) archived in history-archive.md.*

## Scribe Batch Update (2026-04-29T22:06:00Z)

**Orchestration:** ParkFlow Rename + Parks Page Redesign  
**Status:** ✅ Complete. Deployed to production.

### Your Contributions

1. **Mobile Nav Item Priority**
   - Restructured `AuthNavMobile` in `src/components/AuthNav.tsx` with conditional rendering
   - Logged-in nav (5 items): Home, Parks, My Rides, Trips, Dashboard
   - Non-logged-in nav (4 items): Home, Parks, Calendar, Sign In
   - Calendar dropped from logged-in nav (accessible from home/parks, lower priority for at-park users)
   - My Rides uses ticket icon SVG for visual distinction from Trips (calendar icon)

2. **Park Schedule API Design**
   - Implemented `/api/parks/[slug]/schedule` — single-park schedule resolution
     - Slug→UUID lookup via Firestore, calls ThemeParks Wiki API
     - Returns today's full schedule entries + computed OPEN/CLOSED status
   - Implemented `/api/park-hours` — batch endpoint for all parks
     - Returns minimal payload: slug, name, timezone, status, openingTime, closingTime
     - Designed for Mouth's parks listing page
     - Individual park failures don't break full response (graceful degradation)
     - 5-minute caching on schedule calls
   - Slug-based routing fully integrated

3. **Seed Script Generalization**
   - Refactored `scripts/seed-parks.ts` from Orlando-only to multi-destination configuration
   - `SEED_DESTINATIONS` map with keywords, parkFilter (UUID allowlist), timezoneOverride
   - Graceful error handling: 404s skip with warning instead of crash
   - Worlds of Fun: seeded with 94 attractions, timezone `America/Chicago`
   - Adding new parks now requires config entry only, no structural code changes

4. **Separate Trip and Ride Log Fetches**
   - Decoupled trip + ride logs fetch in `src/app/trips/[tripId]/page.tsx`
   - Independent try/catch blocks prevent ride log errors from blocking trip display
   - Ride logs are supplementary; trip is primary
   - Added composite index to `firestore.indexes.json`: `tripId` ASC + `rodeAt` DESC

### Decisions Processed

- Decision: Park Schedule API Design
- Decision: Seed Script Generalized to Multi-Destination
- Decision: Separate Trip and Ride Log Fetches
- Decision: Mobile Nav Item Priority (Logged-In Users)

### Tests & QA

✅ All tests passing  
✅ No breaking changes to existing API contracts  
✅ Deployed to production alongside Mouth team

### Handoff Notes

- **All agents:** To add new parks, edit `SEED_DESTINATIONS` in `scripts/seed-parks.ts` and run `npx tsx scripts/seed-parks.ts`
- **Firestore:** Composite index on `rideLogs` required for trip detail page query to function
- **Frontend:** `/api/park-hours` endpoint contract documented in ParkCard interface
- **Caching:** 5-minute revalidate on park schedule API calls

### Dependencies

- Requires Firestore indexes: `parks.slug`, `attractions.slug`, composite index on rideLogs (tripId + rodeAt)
- ThemeParks Wiki API for live schedule data

---

## Recent Work (2026-04-29)

### Blended Forecast System — Phase 1

Built forecast resolution logic per Mikey's architecture decision.

**Files Created/Modified:**
- `src/lib/forecast/blender.ts` — `resolveForecast()` function implements decision logic: live wins, historical fallback at ≥15 totalSamples, confidence = min(totalSamples/50, 1), skips hours with <3 samples. Exports `BlendedForecastResult` interface.
- `src/types/queue.ts` — Added `ForecastAggregate` and `ForecastMeta` interfaces (Chunk's aggregation module also needs these).
- `src/app/api/wait-times/route.ts` — Added `blendForecasts()` helper that batch-reads aggregate docs for attractions missing live forecasts (uses `adminDb.getAll()` for efficiency). `formatWaitTimeEntry` now accepts and includes `forecastMeta` field. `forecast` field remains backward-compatible (entries array or null). Historical entries replace null forecasts when available.
- `firestore.rules` — Added `forecastAggregates/{parkId}/{document=**}` rule: public read, server-only write.
- Graceful degradation: aggregate read failures fall back to `source: 'none'` with console error. No user-facing errors.
- TypeScript compiles clean. Next.js build passes.

### Crowd Calendar Historical Fix

Fixed crowd calendar showing empty data for non-today dates. Root cause: `computeFamilyCrowdDays` only read live forecast data from `waitTimes/{parkId}/current` docs which only contain TODAY's hourly forecast. Fix: rewrote function to read historical aggregate data from `forecastAggregates/{parkId}/byDayOfWeek/{dow}/attractions/` for all days in the month. Live data still wins for today. Aggregates require totalSamples ≥ 15 and hourly sampleCount ≥ 3 (matching blender thresholds). Updated `hasRealData` check: if ≥50% of days have data, treat as real (not placeholder). Falls back to `generatePlaceholderData` on cold start. Build passes clean.

## Scribe Batch Update (2026-04-29 21:55:00Z)

**Orchestration:** Blended Forecast System Completion

Successfully shipped forecast blending + crowd calendar historical fix. 11 decisions merged into main decisions.md. All three agents (Chunk, Data, Mouth) delivered core components in parallel.

**Your Contributions to This Batch:**
- Blending logic: `resolveForecast()` returns live > historical > none with confidence thresholds
- API response includes `forecastMeta` with source, confidence, dataRange for all attractions
- Firestore security rules: `forecastAggregates` public read, server-only write
- Crowd calendar fixed to source from historical aggregates for all days in month
- No breaking changes — `forecast` field unchanged; metadata in sibling field

**Decisions Processed (18–26):**
- Blended Forecast Architecture
- Crowd Calendar Aggregate Sourcing
- Park Family Calendar UX redesign
- 4-Tier Crowd Algorithm
- Park Family Calendar Design Decisions
- FamilySelector Combobox Implementation
- Dual Temperature Format (°F/°C)
- Relative Time Freshness Indicator
- Home Page Auth-Aware Pattern

**Status:** Batch orchestration complete. Decisions archived. All components integrated. Ready for Phase 2 refinement.

## Scribe Batch Update (2026-04-29 21:55:00Z)

**Orchestration:** Blended Forecast System Completion

Successfully shipped forecast blending + crowd calendar historical fix. 11 decisions merged into main decisions.md. All three agents (Chunk, Data, Mouth) delivered core components in parallel.

**Your Contributions to This Batch:**
- Blending logic: `resolveForecast()` returns live > historical > none with confidence thresholds
- API response includes `forecastMeta` with source, confidence, dataRange for all attractions
- Firestore security rules: `forecastAggregates` public read, server-only write
- Crowd calendar fixed to source from historical aggregates for all days in month
- No breaking changes — `forecast` field unchanged; metadata in sibling field

**Decisions Processed (18–26):**
- Blended Forecast Architecture
- Crowd Calendar Aggregate Sourcing
- Park Family Calendar UX redesign
- 4-Tier Crowd Algorithm
- Park Family Calendar Design Decisions
- FamilySelector Combobox Implementation
- Dual Temperature Format (°F/°C)
- Relative Time Freshness Indicator
- Home Page Auth-Aware Pattern

**Status:** Batch orchestration complete. Decisions archived. All components integrated. Ready for Phase 2 refinement.


## Recent Work (2026-04-29T15:04:45-07:00)

### Worlds of Fun Park Registration

Added Worlds of Fun (Kansas City) park family to both registries:
- `src/lib/constants.ts` - Added `worlds-of-fun` entry with parks: Worlds of Fun, Oceans of Fun
- `src/lib/crowd-calendar/park-families.ts` - Added `worlds-of-fun` entry with slug `wof`, real UUID for Worlds of Fun (`bb731eae-7bd3-4713-bd7b-89d79b031743`), placeholder ID `oceans-of-fun-kc` for water park (not yet in ThemeParks Wiki API)
- Build passes, deployed to Vercel prod.

## Recent Work (2026-04-29T15:16:06-07:00)

### Seed Script Generalization + Worlds of Fun Seeding

Refactored `scripts/seed-parks.ts` from Orlando-only to a multi-destination architecture:
- `SEED_DESTINATIONS` config map: each entry has `keywords` (for matching API destinations), optional `parkFilter` (UUID allowlist to exclude water parks not in API), and optional `timezoneOverride`.
- `fetchJson` now returns `null` on 404 instead of throwing — enables graceful skip for removed parks.
- Parks that return no data from API are warned and skipped, not crashed.
- Worlds of Fun seeded: UUID `bb731eae-7bd3-4713-bd7b-89d79b031743`, timezone `America/Chicago`, 94 attractions.
- Oceans of Fun excluded via `parkFilter` (not in ThemeParks Wiki API).
- Total: 13 parks, 627 attractions seeded across Orlando + Kansas City.

## Recent Work (2026-04-29T15:23:30-07:00)

### Park Schedule API + Batch Hours Endpoint

Wired up real operating hours from ThemeParks Wiki API:

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
