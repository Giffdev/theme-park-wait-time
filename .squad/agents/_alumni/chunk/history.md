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

## Scribe Batch Update (2026-04-29 21:55:00Z)

**Orchestration:** Blended Forecast System Completion

Successfully shipped forecast blending + crowd calendar historical fix. 11 decisions merged into main decisions.md. All three agents (Chunk, Data, Mouth) delivered core components in parallel.

**Key Outcomes:**
- Aggregation pipeline now live. Pre-computed aggregates flowing into blender logic.
- Data team wired forecastMeta into API response. Firestore rules updated.
- Mouth integrated source badges into ForecastChart — blue for live, amber for historical.
- Crowd calendar now shows meaningful data for all days in month (not just today).
- Confidence threshold: 15 samples (Phase 2 decay weighting pending).

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

### 2026-04-29 — Full Park Catalog Sync (ALL ThemeParks Wiki Parks)

Queried the ThemeParks Wiki `/v1/destinations` endpoint and discovered 103 destinations containing 133 parks globally. Built a comprehensive sync pipeline and park registry.

**Files Created:**
- `src/lib/parks/park-registry.ts` — Static registry of 80+ parks organized into 9 destination families (Disney, Universal, Six Flags, Cedar Fair, SeaWorld/Busch Gardens, LEGOLAND, Independent US, European, Asian). Exports utility functions: `getAllParks()`, `getParkBySlug()`, `getParkById()`, `getDestinationsByFamily()`, `getAllFamilyIds()`.
- `src/lib/parks/index.ts` — Barrel exports
- `scripts/sync-all-parks.ts` — Full sync script that fetches all destinations from the API, iterates parks, writes to Firestore `parks` and `attractions` collections. Rate-limited (500ms delays), idempotent (merge writes), handles 429 retries. US parks sorted first.

**Sync Results:**
- 133 parks synced to Firestore
- 7,943 attractions synced
- 0 failures
- Covers: Disney (6 resorts, 14 parks), Universal (5 resorts), Six Flags (15 destinations), Cedar Fair (11 parks), SeaWorld/Busch Gardens (5 parks), LEGOLAND (8 parks), plus Dollywood, Hersheypark, Silver Dollar City, Kennywood, Knoebels, Europa-Park, Efteling, Phantasialand, Alton Towers, Thorpe Park, PortAventura, Parc Asterix, Liseberg, Gardaland, Everland, Lotte World, Fuji-Q, and many more.

**npm script:** `npm run sync:all-parks`

**Key Design Decisions:**
- Park registry is static TypeScript (no runtime API calls for park listing) — fast for frontend
- Sync script is the source of truth for Firestore data; registry is for frontend routing/display
- Slugs are URL-safe, hand-tuned for popular parks (e.g., "magic-kingdom" not "magic-kingdom-park")
- Families group parks for UI navigation (dropdown menus, filters, comparison views)

## 2026-08-11 Cross-Agent Learnings — Chunk

**Competitive Position Is Strongest in Data Provenance**
Competitors (thrill-data.com, etc.) serve deterministic mocks without labels or serve data without freshness timestamps. Our transparent coverage metadata (`dataQuality: { source, coveredDays, totalDays }`) and stale-data labeling are differentiators. Starting with a small park set and proving out the data quality story builds user trust before scaling.

**API Stability and Fallback Coverage Are Connected**
ThemeParks.wiki is excellent (75+ parks, 300 req/min), but fallbacks matter. Having multiple sources and documented fallback behavior (deterministic mock with explicit disclosure) makes the product more resilient. Users need to know when they're reading live data vs estimates vs historical averages.

**Product Positioning Requires Proving Out Small First**
Starting with 6 Orlando parks (WDW + Universal) revealed data-trust issues early and built confidence in the architecture before expanding to 100+ parks. This constraint-driven approach prevented shipping with hidden synthetic data.


### 2026-08-12 — Crowd Calendar False-CLOSED Audit (Read-Only, Documentation Only)

User reported Worlds of Fun showing CLOSED in August when actually open. Ran a full read-only audit (no code changes — Data owns the fix) against the live ThemeParks Wiki API and both family registries. Wrote findings to `docs/crowd-calendar-data-audit.md` and `.squad/decisions/inbox/chunk-crowd-calendar-audit-findings.md`.

**Confirmed the design review's root cause, plus two new defects it didn't cover:**
- Fallback `PARK_FAMILIES` (`src/lib/constants.ts`) uses park **slugs**; ThemeParks Wiki requires UUIDs — confirmed live (`entity/worlds-of-fun/schedule` → 404, `entity/{UUID}/schedule` → 200).
- Both call sites in `src/app/api/crowd-calendar/route.ts` (`computeFamilyCrowdDays` AND `generatePlaceholderData`) collapse `hasData:false` into `status:'CLOSED'` instead of `NO_DATA` — this happens on the **real-data path too**, not just the fallback.
- **New:** 11 entity UUIDs in `src/lib/parks/park-registry.ts` are malformed (one duplicated hex digit, 37 chars instead of 36) — Universal Studios Florida, Epic Universe, Volcano Bay, Universal Studios Beijing/Singapore, Six Flags Magic Mountain/Great America/Discovery Kingdom/Frontier City, SeaWorld Orlando, Aquatica Orlando. All confirmed 404 live; 6 of 11 correct values verified via `/v1/destinations`.
- **New:** Oceans of Fun's registry ID (`951987f7-...`) isn't a typo — it's a stale/decommissioned entity. Correct current ID confirmed live via the Worlds of Fun destination's `/children` endpoint: `b5a89552-3381-47ad-88cc-ab0087019c8b`.
- **Test gap:** `tests/api/crowd-calendar-quality.test.ts` mocks `batchGetParkOperatingStatus` with an empty `Map()`, which doesn't exercise the actual `{isOpen:false, hasData:false}` shape that causes the real bug.
- Confirmed legitimate seasonal/gap closures are handled correctly today (Worlds of Fun's post-Labor-Day weekday shutdown, Oceans of Fun's Aug weekday reduced hours) — the API succeeds with no OPERATING segment, so `hasData:true` is already correct there; only *failed* lookups get miscategorized.
- Verified date/timezone normalization is sound for the schedule path (code keys off the API's own `date` field, not a UTC-derived parse) — no bug found there. Flagged a separate, lower-severity issue: `computeFamilyCrowdDays`'s "prefer live forecast for today" check uses UTC `toISOString().slice(0,10)` against park-local timestamps, which can silently miss live data near a park's local midnight.

**Blast radius:** 9 of the registry's park families carry at least one park exposed to false CLOSED (not just Worlds of Fun) — this is bigger than the original design review scope and should inform Data's fix.


### 2026-08-13 — Independent Revision Under Reviewer Lockout (Release Artifact Rework)

PR Reviewer rejected the accumulated release artifact. Authored the revision independently (no contact with the original authors) across my ownership: `next.config.ts`, `scripts/seed-parks.ts` neighbourhood, `src/app/api/wait-times/route.ts`, `src/lib/wait-times/refresh.ts`, config/regression tests, `.gitignore`.

**What changed and why:**
- **IoA redirect deferred (blocker 1).** The `permanent: true` redirect from `/parks/universal-islands-of-adventure` to `/parks/islands-of-adventure` was removed. Read-only reconcile dry-run against live Firestore confirms the canonical doc does not exist: 8 seeded registry parks (incl. Magic Kingdom, Hollywood Studios, Animal Kingdom, IoA, Epic Universe, Volcano Bay) have **no** document carrying their registry slug. The listing links by the slug stored on each Firestore doc, so the redirect would have 308'd every IoA link to a URL with no document — and a 308 outlives the data fix. Alias retained as data (`LEGACY_PARK_SLUG_ALIASES`), enabled only via `ENABLE_CANONICAL_PARK_SLUG_REDIRECTS=true`, and always `permanent: false`.
- **`scripts/reconcile-parks.ts` (blocker 2).** Dry-run-by-default cleanup/parity tool; deletes only with `--apply --yes`. Only registry-unknown docs inside a seeded destination that shadow a canonical park's slug are retire-eligible. Live dry run: exactly **1** retire candidate — the retired virtual Oceans of Fun doc `951987f7-3387-4221-8368-2859469aebcd`, shadowing `oceans-of-fun` which canonical `b5a89552-3381-47ad-88cc-ab0087019c8b` already serves. The other 3 duplicate slugs (Hurricane Harbor Arlington/Oklahoma City, Disneyland Park) have no canonical doc and are correctly left for human review. No production mutation performed.
- **Catalog mismatch ≠ transient error (blocker 3).** `/api/wait-times` all-parks branch now tracks registry-unmatched catalog docs separately from runtime failures. Errors stay in the JSON body verbatim; only *transient* errors force `no-store`. Static mismatch alone now yields the degraded CDN window, so edge coalescing can finally engage on the listing path.
- **`vercel.json` cache-policy guard (blocker 4).** New filesystem-derived test asserting every API route except `/api/wait-times` is covered by an explicit `no-store` rule, and that nothing forces `no-store` onto wait-times.
- **Forced-refresh coalescing identity (blocker 5).** `refreshPark` in-flight key is now mode-scoped (`forced:`/`public:`). Cron's forced refresh can no longer adopt a public request's promise and silently report success without an upstream fetch or maintenance run.
- **`.gitignore` + EOF whitespace (blockers 6, 7).**

**Validation:** targeted tests, full suite (64 files / 665 tests pass), `tsc --noEmit` clean, `next build` clean, `eslint` clean (pre-existing warnings only), `git diff --check` clean. `npm run test:rules` could not run — local port 8080 is occupied by another process; no rules/client-query surface changed in this revision.

**Not self-approved.** Ready for a fresh pre-push review.

---


## 2026-08-13 — Post-review revision (independent author, reviewer lockout maintained)

Applied the PR Reviewer's 7 required post-ready changes. Original authors
(Data/Mouth/Mikey) remained locked out; no contact, no co-authorship.

1. Untracked 7 `spark-*.png` + `playwright-report/index.html` via `git rm --cached`
   so the new ignore rules take effect. All local files verified preserved on disk.
2. `scripts/reconcile-parks.ts --json` now emits exactly one parseable JSON
   document on stdout; every notice/progress/error line moved to stderr behind a
   `ReconcileIo` sink. Verified against live production data (read-only).
3. `applyRetirePlan` isolates per-document failures in a try/catch, attempts every
   planned delete, and returns `{attempted, deleted[], failed[]}`. Partial failure
   exits 1; `--apply` without `--yes` exits 1; empty plan exits 0.
4. `ORPHANED_PARK_DATA_PATHS` (10 park-id-keyed paths) is stated in retire text
   output, apply output, and the JSON report. Nothing extra is deleted.
5. `docs/parks-duplicate-slug-followups.md` records the 3 review-only duplicate
   slug pairs and why they must not be auto-remediated.
6. Root-anchored `/.mcp.json` and suffix-scoped `*.local-backup` ignore entries.
7. Validation: 21/21 reconcile tests, full suite 675 passed / 58 todo (64 files),
   tsc clean, build clean, lint clean (pre-existing warnings only),
   `git diff --check` clean on all in-scope files.

No commit, push, deploy, or production mutation. Not self-approved — awaiting
independent lightweight review.

---


## 2026-08-13 — Release shipped (approved by PR Reviewer)

- Commit `93c8c598631bde46029ab2c24a09f87d501aa868` on master, 90 files,
  +15158/-1304, including all 9 generated-artifact deletions
  (`deploy-output.txt`, `playwright-report/index.html`, 7x `spark-*.png`).
- Staged with explicit pathspecs only. Fail-closed audit confirmed no
  `.squad/**`, `.github/**`, `.copilot/**`, `.mcp.json`, `*.local-backup`,
  secret or log path was staged. Those remain unstaged and preserved.
- Pushed `249ed96..93c8c59 master -> master`; confirmed on origin/master.
- No Vercel Git integration on this project, so production was deployed from a
  detached `git worktree` pinned to 93c8c59 with a zero-entry `git status` —
  the committed tree, never the dirty worktree. Worktree removed afterwards.
- Deployment `dpl_DDLbyCw1UgzB3B76oZ3enyPXrS3M` — Ready, production, aliased to
  https://theme-park-wait-times.vercel.app.
- Verified live: IoA legacy URL 200 with no redirect; IoA/Magic Kingdom/Alton
  Towers all return real attraction data; all-parks CDN cache now engages
  (X-Vercel-Cache HIT/STALE, 217ms warm vs ~12s cold); Worlds of Fun August
  calendar is schedule-grounded (8 OPEN days, CLOSED days match empty upstream
  schedule segments); /api/park-schedule bounded at 151-274 bytes; cron 401
  unauthenticated with daily `0 12 * * *` retained; every non-wait-times API
  route still `no-store, max-age=0`.
- Still blocked pending separate approval: `reconcile-parks.ts --apply --yes`
  (deletes `parks/951987f7-3387-4221-8368-2859469aebcd`) and any production
  seed. No Firestore mutation was performed.


## 2026-08-14 — Crowd-calendar rolling-window audit

Audited the ThemeParks.wiki schedule surface read-only and confirmed it is a rolling present/future feed, not a historical month archive. That clarified why pre-horizon dates must remain `NO_DATA` instead of being replayed as closures, and why the current release needed both the schedule-window fix and the shared coverage contract. The audit also kept the blast radius honest: malformed registry ids and the stale Oceans of Fun id had to be repaired alongside the status logic.
