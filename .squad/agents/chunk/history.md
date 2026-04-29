# Chunk — History

## Project Context

- **Project:** theme-park-wait-times — A platform for theme park visitors to track ride wait times, log visits, plan trips with crowd calendars, and crowd-source real-time wait data.
- **Stack:** React/Next.js, TypeScript, Firebase, Vercel
- **User:** Devin Sinha
- **Key concern:** Accurate ride data — which rides are open/closed by day, seasonal attractions, real wait times via public APIs + crowd-sourcing. Started with a few parks to prove out.
- **Competitors:** thrill-data.com (good data, bad UI)
- **Data needs:** Real-time wait times, historical patterns, crowd calendars, ride status, seasonal schedules.

## Learnings

### 2026-04-28 — Architecture Decision: Data Integration Strategy (via Scribe)

**APIs Evaluated:**
- **ThemeParks.wiki** (PRIMARY): 75+ parks, 300 req/min, free, no auth. Endpoints: `/v1/destinations`, `/v1/entity/{id}/live`, `/v1/entity/{id}/schedule`. GitHub: ThemeParks/parksapi. Best structured data.
- **Queue-Times.com** (SECONDARY): 80+ parks, ~5 min refresh, free with attribution required. Endpoints: `/parks.json`, `/parks/{id}/queue_times.json`. Has historical data since 2014 but no bulk download API.
- **park.fan**: ML-predicted wait times + weather. Good for enrichment.
- **Wartezeiten.APP**: Free, requires attribution link. EU-focused but global coverage.

**Key Decisions Made:**
- Launch with 6 Orlando parks (WDW 4 + Universal 2) — best API coverage, geographic cluster
- 5-minute polling interval matches data freshness of sources
- Crowd calendar starts rule-based (day of week + holidays + events), transitions to ML after 6 months
- Crowd-sourced data supplements APIs, never replaces them
- No scraping — APIs cover 95%+ of needs

**Architecture:**
- Firebase Cloud Functions for polling (scheduledPollWaitTimes every 5 min)
- Firestore structure: /parks/{id}/liveData/{rideId} for hot reads
- Historical data logged to /waitTimeHistory/ for crowd calendar training
- Confidence scoring (0.0-1.0) based on data age and source

**Cost Estimates:**
- ThemeParks.wiki: ~2,880 requests/day for 10 parks (well under 432,000/day limit)
- Firestore: minimal at launch scale
- Cloud Functions: ~288 invocations/day (free tier)

### 2026-04-29 — Aggregation Algorithms Implemented

Built pure-function aggregation pipeline for crowdsourced wait times (Phase 2 of ride-logging architecture):

**Files Created:**
- `src/types/ride-log.ts` — CrowdReport, CrowdAggregate, RideLog, ActiveTimer interfaces (Date-based for testability)
- `src/lib/aggregation/weighted-average.ts` — Time-weighted moving average with configurable halfLife (30 min default) and maxAge (120 min)
- `src/lib/aggregation/outlier-detection.ts` — 3-stage filter: hard bounds [2,180], statistical (2σ with ≥5 samples), velocity check (0.5x penalty for >60 min jumps)
- `src/lib/aggregation/confidence.ts` — Window-based confidence: none/low/medium/high based on report count in last 60 min
- `src/lib/aggregation/index.ts` — Barrel exports + `aggregateWaitTime()` pipeline function that chains all three stages

**Design Decisions:**
- All functions are pure — zero Firebase imports, zero side effects. Can run in any environment.
- Used Date objects (not Timestamps) throughout for test portability. Firestore layer will convert.
- `filterOutliers()` returns `FilteredReport` with `weightModifier` field so the aggregator can apply velocity penalties without losing the report entirely.
- `aggregateWaitTime()` returns a partial aggregate (omits attractionId/parkId/updatedAt) — the calling API route fills those in.
- Rounded estimates to 1 decimal place for display precision.

**Tests:** 51 tests across 4 test files, all passing. Covers edge cases: empty data, boundary values, same-day filtering, future reports, stdDev=0, custom options.

### 2026-04-29 — Attraction Type Enrichment Script

Created `scripts/enrich-attraction-types.ts` and `scripts/attraction-overrides.ts` to classify all 533 attractions with the `AttractionType` taxonomy (thrill | family | show | experience | parade | character-meet | dining-experience).

**Classification Pipeline (precedence order):**
1. Manual overrides map (~80 well-known attractions across Disney, Universal, Six Flags, SeaWorld)
2. Keyword matching on attraction name (coaster→thrill, meet→character-meet, parade→parade, show→show, tour→experience)
3. entityType mapping (SHOW→show, RESTAURANT→dining-experience, MERCHANDISE→skip)
4. Default: ATTRACTION without keywords → family

**Design Choices:**
- Idempotent: uses `batch.update()` with just the `attractionType` field — safe to re-run
- Batched writes (499 per batch, Firestore limit is 500)
- MERCHANDISE entities are skipped (not classified)
- `AttractionType` is exported from the enrichment script; the overrides file imports it to stay in sync
- npm script: `npm run enrich-types`

**Files:**
- `scripts/enrich-attraction-types.ts` — main enrichment logic
- `scripts/attraction-overrides.ts` — hardcoded map of ~80 well-known attractions

## Scribe Batch Update (2026-04-29 10:59:18Z)

**Decision inbox processed:**
- 4 decisions merged into main decisions.md
- Trip sharing, Vercel deployment, ride logging, trip planner + filters archived
- Inbox cleared

**Status:** Attraction enrichment complete. Ready for Phase 2 UI integration (Mouth). Trip filters shipped; attraction type taxonomy available for future refinement.

## Scribe Orchestration Log (2026-04-29 18:47:57Z)

**Phase 1 Team Delivery:**
- Widened wait-times API per Mikey's architecture: captures queue types, forecast, operatingHours, historical snapshots
- In-memory cache resilience: 429/5xx errors fall back to stale data with `stale` boolean indicator
- Response shape includes all virtual queue states (RETURN_TIME, PAID_RETURN_TIME, BOARDING_GROUP)
- Historical archiving started: snapshots appended to `waitTimeHistory/{parkId}/daily/{YYYY-MM-DD}/attractions/{attractionId}`
- Data team ready for Phase 2 aggregation work (time-weighted averages, outlier detection)
- Stef validated 14 API tests passing for expanded wait-times endpoint

### 2026-04-29 — Wait-Times API Expanded (Full Data Capture)

Widened `src/app/api/wait-times/route.ts` to capture all data from the ThemeParks Wiki `/entity/{id}/live` endpoint that we were previously discarding.

**New Data Captured:**
- `queue.RETURN_TIME` — Lightning Lane return windows (state, returnStart, returnEnd)
- `queue.PAID_RETURN_TIME` — Individual Lightning Lane (state, times, price with amount/currency/formatted)
- `queue.BOARDING_GROUP` — Virtual queue boarding groups (state, currentGroupStart/End, estimatedWait)
- `forecast[]` — Hourly wait time predictions per attraction (~60-70% coverage)
- `operatingHours[]` — Per-attraction operating hours (type, startTime, endTime)

**Historical Archiving:**
- On each poll, writes snapshot to `waitTimeHistory/{parkId}/daily/{YYYY-MM-DD}/attractions/{attractionId}`
- Uses `FieldValue.arrayUnion` to append `{time, waitMinutes}` to a `snapshots` array
- One doc per attraction per day — keeps docs small (~5KB/day at 5-min intervals)

**API Resilience:**
- In-memory stale cache per park — updated on every successful fetch
- On 429 or 5xx from ThemeParks Wiki, serves stale cached data instead of failing
- Response includes `stale: boolean` field so clients know when data is from cache
- Network errors (unreachable API) also fall back to stale cache

**Null Handling:**
- All new fields gracefully default to `null` if missing from the API response
- Forecast/operatingHours stored as `null` (not empty array) when absent — cleaner for client checks

**Key Files:**
- `src/app/api/wait-times/route.ts` — the single file modified
- Uses `FieldValue.arrayUnion` from `firebase-admin/firestore` for atomic snapshot appends

**Patterns:**
- Stale-while-revalidate at API layer (in-memory `parkDataCache` map)
- Null-coalescing throughout for optional API fields (`?? null`)
- Same batched Firestore write pattern (499 per batch) for both current + history

### 2026-04-29 — Park Family Crowd Calendar Data Model & Aggregation

Built the data layer for the park-family crowd calendar feature:

**Files Created:**
- `src/types/parkFamily.ts` — CrowdLevel enum (1-4), ParkFamilyDefinition, ParkCrowdDay, FamilyCrowdDay, FamilyCrowdMonth, BestPlan, CrowdCalendarResponse types
- `src/lib/crowd-calendar/park-families.ts` — Static registry of 6 park families with ThemeParks Wiki entity UUIDs (Universal Orlando, WDW, Disneyland, USH, SeaWorld, Busch Gardens)
- `src/lib/crowd-calendar/aggregation.ts` — Pure functions: deriveCrowdLevel, computeDailyAverage, computeParkCrowdDay, buildFamilyCrowdDay, computeBestPlan
- `src/lib/crowd-calendar/index.ts` — Barrel exports
- `src/app/api/crowd-calendar/route.ts` — GET endpoint with Firestore caching (6hr TTL), stale fallback, best-plan computation
- `src/lib/crowd-calendar/__tests__/aggregation.test.ts` — 18 tests, all passing

**Key Design Decisions:**
- 4-tier crowd levels: Low (<20min avg), Moderate (20-35), High (35-50), Extreme (50+)
- Best Plan greedy algorithm: sort all (day, park) combos by crowd level, pick lowest with unique dates/parks first, then allow repeats
- API derives crowd from forecast data already stored in `waitTimes/{parkId}/current/{attractionId}` — no new external API calls needed
- Firestore cache at `crowdCalendar/{familyId}/monthly/{YYYY-MM}` with 6-hour TTL
- Stale fallback: on computation failure, serves expired cache rather than 500
- All aggregation logic is pure (no Firebase imports) for testability
- Updated `src/lib/constants.ts` to include all 6 park families
- Updated `src/types/index.ts` to export new types

### 2026-04-29 — Forecast Aggregation Pipeline (Phase 1)

Built the core aggregation pipeline for the blended forecast system per Mikey's architecture decision.

**Files Created/Modified:**
- `src/lib/forecast/aggregation.ts` — Main `updateForecastAggregates()` function
- `src/lib/forecast/index.ts` — Barrel exports
- `src/types/queue.ts` — Added `ForecastAggregate` and `ForecastMeta` interfaces
- `src/types/index.ts` — Re-exported new types
- `src/app/api/wait-times/route.ts` — Integrated aggregation call after archive writes

**How It Works:**
1. After each `archiveHistoricalSnapshot` call, `updateForecastAggregates(parkId, dateStr)` fires (non-blocking)
2. Reads today's snapshot docs from `waitTimeHistory/{parkId}/daily/{date}/attractions/*`
3. Filters to attractions with ≥3 valid snapshots, groups by UTC hour
4. Reads existing aggregate docs from `forecastAggregates/{parkId}/byDayOfWeek/{dow}/attractions/{id}`
5. Merges using incremental weighted averaging and pooled variance for stdDev
6. Writes back with batched Firestore writes (499 per batch)

**Design Decisions:**
- Fire-and-forget: aggregation errors are logged but don't fail the API response
- Incremental averaging: `newAvg = oldAvg + (value - oldAvg) * batchCount / newCount`
- Pooled variance for combining stdDev across batches (statistically sound)
- ≥3 snapshots per day minimum before contributing to aggregates (noise filter)
- Phase 1 uses simple incremental averaging; exponential decay is Phase 2
- Also fixed pre-existing compile errors in `blender.ts` by providing the types it depended on

