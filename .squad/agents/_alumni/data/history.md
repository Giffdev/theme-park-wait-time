# Data — History

## Project Context

- **Project:** theme-park-wait-times — Platform for tracking ride wait times, logging visits, crowd calendars, and crowd-sourced data.
- **Stack:** React/Next.js, TypeScript, Firebase (Firestore, Auth, Security Rules), Vercel

## Current Sprint — Stats Dashboard + Trip Sharing (2026-05-01)

**Your Role:** Backend lead for stats aggregation  
**Status:** ✅ Career stats module delivered

### Deliverable (Sprint A Item #1)

Built `src/lib/stats/career-stats.ts` — client-side stats computation:

**API:**
- `computeCareerStats(rideLogs, dateRange?)` — all-in-one aggregation
- `filterByDateRange(rideLogs, range)` — date scoping
- `computeRideDistributionByPark(rideLogs)` — per-park counts
- `computeAttractionCounts(rideLogs)` — ranked attractions

**Returns:** totalRides, totalParksVisited, averageWaitMinutes, mostVisitedPark, favoriteAttraction, topAttractions, rideDistributionByPark

**Design:** Pure functions, no Firestore calls. Mouth imports and passes ride log arrays.

**Commit:** ea46bab

---

## Recent Sprints Completed

| Sprint | Status | Key Work |
|---|---|---|
| ParkFlow Brand + Schedule API | ✅ | `/api/parks/[slug]/schedule`, `/api/park-hours` |
| Forecast System Phase 1 | ✅ | Confidence thresholds, historical aggregates |
| Stale Data + Auto-Refresh | ✅ | Triple-layer cache fix, 19 unit tests |
| Slug Resolution Debug | ✅ | API endpoints accept slug/UUID, 15 tests |

## Key Architecture Patterns

- **API slug resolution:** Endpoints accept both slug and UUID formats (Firestore → UUID lookup)
- **Forecast blending:** Live > historical > none with confidence = min(samples/50, 1)
- **Triple-layer caching:** Next.js revalidate + CDN + app state
- **Seed script generalization:** Multi-destination config (13 parks × 627 attractions)

## Current Status

✅ All tests passing (15+ suites)  
✅ Production deployed  
✅ Slug resolution working all endpoints  
✅ Career stats ready for Mouth (Sprint A)

*Full history: see history-archive-2026-05-01T18-28-49Z.md*

## 2026-08-11 Cross-Agent Learnings — Data

**Firestore Rules Path Precision Is Critical**
The wait-time outage was caused by a security-rules path mismatch. Rules paths are not forgiving — a single character change in `waitTimes/{parkId}/current/{attractionId}` vs the wrong collection breaks client reads silently. Every rule must be tested and deployed separately via `firebase deploy --only firestore:rules` before code that depends on it ships.

**Stale-Data Transparency Is Essential**
Including `source`, `fetchedAt`, and `ageSeconds` in API responses enables clients to make informed decisions. This simple metadata prevents false sense of freshness and lets users understand why a wait time looks stale. Competitors either hide staleness or silently serve fresh-looking data; being honest here is a product advantage.

**Hobby-Tier Constraints Shape Architecture**
Vercel Hobby tier supports only daily cron, not sub-hourly. This forced the persistent Firestore fallback design, which turned out to be a good architectural boundary: it clarifies the availability boundary (reads survive cold starts), the security boundary (Admin SDK only writes, public SDK reads cache only), and the staleness boundary (fallback is transparent).

**Crowd Calendar Quality Signals Are a Compliance Boundary**
Synthetic or weakly covered crowd data must be explicitly disclosed. Without the `dataQuality` contract, UI layers silently drift into showing deterministic mock data as measured crowd intelligence. The 50% day coverage threshold is already enforced in the aggregation logic; exposing it in the response makes the contract visible and testable.

---


## 2026-08-12 Production Seeding Completion — User-Approved

Production seeding executed after explicit user approval (2026-08-11). Seed script replaced fuzzy keyword matching with registry UUID mapping, added Alton Towers (87 attractions), validated parity between registry and seed list, and ran `npm run seed:parks` against production Firestore.

**Result:** 16 parks, 791 attractions, Alton Towers added with fresh upstream data
**Status:** No commit/push performed (per user instruction; staging for future manual deployment)
**Validation:** Parity test verified registry↔seed-list consistency; live API returns fresh upstream data

---


## 2026-08-12 Crowd-Calendar CLOSED-in-August Bug Fix

Fixed Worlds of Fun (and any sparse-data fallback-path park) incorrectly showing CLOSED in August. Two root causes: (1) the placeholder/fallback crowd-calendar path sent the frontend-facing slug-based park id straight to the ThemeParks Wiki schedule API, which requires the UUID — added `resolveScheduleParkId()` in `src/lib/constants.ts` as the single canonical slug→UUID translation, reusing `getParkBySlug()` from the registry rather than patching one park; (2) both crowd-calendar code paths treated a schedule fetch failure (`hasData:false`) the same as a legitimate closure, so any unknown/failed status rendered as a confident wrong CLOSED — added a `hasData` check before the `isOpen` check in both paths. Also fixed a related timezone bug: "today" (used to decide live vs. historical data preference) was computed once globally in server UTC; added a `timezone` field to `ParkOperatingStatus` and a `getLocalDateString()` helper so "today" is resolved per park in that park's own IANA timezone.

**Files changed:** `src/lib/constants.ts`, `src/lib/parks/park-schedule-check.ts`, `src/app/api/crowd-calendar/route.ts`, plus new tests `tests/api/crowd-calendar-schedule-identity.test.ts` and `tests/api/crowd-calendar-real-path.test.ts` (9 new regression tests) and a compatibility fix to `tests/api/crowd-calendar-quality.test.ts`'s mock.
**Validation:** Full suite (578 tests, 49 files) passing, `tsc --noEmit` clean, `next build` clean.
**Discovered, not fixed (flagged in decision inbox):** the frontend's `calendar/page.tsx` filters by slug-based park ids, but the "real"/computed backend path already emits UUID ids — a latent, pre-existing mismatch that hasn't surfaced yet because production was hitting the placeholder path for the reported park. Needs a coordinated frontend+backend fix, not a unilateral one.
**Production status:** Code/test-only this session; no Firestore purge, cron trigger, or deploy performed. See `.squad/decisions/inbox/data-crowd-calendar-identity-and-hasdata.md` for full write-up.

---


## 2026-08-12 (same day, addendum) — Registry UUID Corrections + Seed-Script Parity from Chunk's Audit

Incorporated Chunk's confirmed audit findings on top of the fix above. Corrected 11 malformed park/destination UUIDs (single duplicated hex digit, causing live 404s) and Oceans of Fun's stale/decommissioned id in `src/lib/parks/park-registry.ts` — every corrected value was independently re-verified directly against the live ThemeParks Wiki `/v1/destinations` API before applying, not just trusted from the audit. Discovered this rippled into `scripts/seed-parks.ts` and `scripts/sync-all-parks.ts`: both contained an obsolete "virtual split" hack that fabricated a fake Oceans of Fun park from Worlds of Fun's attraction list and wrote it under the same stale id — verified live that the upstream API no longer nests Oceans of Fun's attractions under Worlds of Fun at all, so removed the virtual-split fabrication from both scripts and switched the Worlds of Fun seed override to a plain two-park `parkFilter` (both real, independent park ids). Kept the general `virtualSplit` mechanism/type as an unused reusable escape hatch rather than deleting the capability outright.

**Files changed:** `src/lib/parks/park-registry.ts` (12 UUID corrections), `scripts/seed-parks.ts`, `scripts/sync-all-parks.ts` (both: removed obsolete virtual-split fabrication), `tests/scripts/seed-parks-parity.test.ts` (updated Worlds of Fun override test), new `tests/parks/park-registry-integrity.test.ts` (8 tests: UUID-format assertion, duplicate-id guard, 12 regression pins, derived-view parity), extended `tests/api/crowd-calendar-quality.test.ts` (+2 tests: real `{isOpen:false,hasData:false}` failure shape → NO_DATA, and `{isOpen:false,hasData:true}` legitimate closure → CLOSED preserved).
**Validation:** Full suite 588 passed / 0 failed (58 pre-existing unrelated `todo`s), `tsc --noEmit` clean, `next build` clean.
**Production status:** No production mutation performed. Outstanding scoped action requiring explicit user approval before execution: `npm run seed:parks` — will upsert corrected `parks`/`attractions` Firestore docs for the 12 corrected parks and Oceans of Fun's now-independent entity; will NOT delete any old stale-id docs (a separate explicitly-approved cleanup would be needed for that). See addendum in `.squad/decisions/inbox/data-crowd-calendar-identity-and-hasdata.md`.

---


## 2026-08-12 (same day, addendum) — Production Rollout Executed + New /api/wait-times Timeout Defect Found & Fixed

User explicitly approved deploying the above fix set to Vercel Production and running `npm run seed:parks` as additive reconciliation. Executed both:

- **Deploy:** `npx vercel deploy --prod --yes` → Ready, aliased at `https://theme-park-wait-times.vercel.app` (deployment `dpl_2Um1ANeUMmQdudxx6xFjYg7kSNSJ`). Root `/` returns 200.
- **Seed:** `npm run seed:parks` → 16 parks / 804 attractions seeded, 0 skipped, additive-only. Confirmed Oceans of Fun seeded as a real independent park (13 attractions, separate from Worlds of Fun's 43) and 5 corrected-UUID parks (Universal Studios Florida, Epic Universe, Volcano Bay, SeaWorld Orlando, Aquatica Orlando) resolved successfully upstream.
- **Crowd-calendar verification (live):** `worlds-of-fun`, `universal-orlando`, `seaworld-orlando` families all 200, today (Aug 12) correctly OPEN, `generatedAt` changes per request (never Firestore-cached on the schedule-derived path). Oceans of Fun and Worlds of Fun show independently differing schedules on some dates, proving true per-park resolution post virtual-split removal.
- **Cron:** unauthenticated `/api/cron/refresh-wait-times` still 401; `vercel.json` cron schedule unchanged (`0 12 * * *`, daily).
- **Non-fix flagged finding (out of scope, documented for follow-up):** `getParkOperatingStatus`/`batchGetParkOperatingStatus` in `park-schedule-check.ts` treats "date not present in the upstream `/schedule` response" the same as "confirmed closed" (`hasData:true, isOpen:false`). Confirmed live that ThemeParks Wiki's schedule array only covers today-forward, never past dates — so every day before "today" in a family calendar renders CLOSED regardless of actual history. Distinct from the `hasData:false` total-fetch-failure bug already fixed this session. Not fixed here (deploy/verify-only scope); recommend a follow-up task.

**New defect discovered during verification, root-caused and fixed:** `/api/wait-times?parkId=worlds-of-fun` (and `magic-kingdom`) began returning 504 `FUNCTION_INVOCATION_TIMEOUT` in production. Root cause (two contributing mechanisms, both evidence-based):
1. `refreshPark()` had no in-flight de-duplication — concurrent requests for the same park each independently re-fetch upstream and re-write Firestore.
2. `runMaintenance()` (historical-snapshot archive + forecast-aggregate update) was fire-and-forget (`void maintenance`, no `await`, no `waitUntil`). On Vercel, un-awaited work has no completion guarantee: the function can freeze immediately after the response is sent and only resume the suspended promise if/when the same instance is reused for a later, unrelated request — where it then contends with that request's own Firestore operations. Directly reproduced locally: a `writeCurrentWaitTimes` batch commit of 44 docs — normally ~150ms — took **174 seconds** on a request that overlapped with a previous request's still-pending background maintenance.

**Fix implemented in `src/lib/wait-times/refresh.ts`:**
- Added an in-flight promise map keyed by `parkId` so concurrent `refreshPark()` calls for the same park share one upstream fetch + write instead of each starting an independent chain.
- Added a per-park maintenance-in-flight guard so a new archive/aggregate run is never started while a previous one for that park is still pending.
- Replaced the bare `void maintenance` fire-and-forget with Next.js's `after()` API (`scheduleBackgroundWork()` helper), which tells Vercel to keep the function instance alive until the background work completes — eliminating the freeze/resume hazard. Falls back to plain fire-and-forget when called outside a request scope (e.g. scripts, unit tests), since `after()` throws in that context.
- Added `tests/api/wait-times-refresh-coalescing.test.ts` (3 tests: same-park concurrent calls coalesce to one upstream fetch; different parks are never coalesced; a second call does not start overlapping maintenance while one is in flight, and a subsequent call after it clears does).

**Validation:** Full suite 595 passed / 0 failed, `tsc --noEmit` clean, `next build` clean.
**Current production status (as of this writing):** the fix above is **local/tested only, not yet deployed** — deploying it was outside this task's approved scope (approval covered the crowd-calendar/seed rollout, not a new wait-times change). Re-tested production directly after the rollout: `/api/wait-times?parkId=worlds-of-fun` and `?parkId=magic-kingdom` are **still returning 504 right now**, confirmed via live curl against the aliased production domain (not a local-sandbox artifact — the upstream ThemeParks Wiki API itself responded in 848ms during the same window, ruling out upstream slowness). **Recommended next scoped action requiring approval:** deploy this `refresh.ts` fix via `npx vercel deploy --prod --yes` (code-only change, no schema/rules/data impact) to resolve the production 504s; no Firestore mutation or purge is needed for this fix. See decision inbox for the full write-up.

---


## Mikey's 504 retrospective — minimum robust fix (2026-08-12, local only, not deployed)

Implemented the approved-in-principle "minimum robust fix" for the production 504s per Mikey's retrospective. Mid-task discovered Stef had independently built a full test gate (5 new `tests/api/wait-times-*.test.ts` files + `tests/config/wait-times-cold-concurrent-matrix.test.ts`) that had already run once and issued an interim REJECT identifying 4 concrete gaps. Treated Stef's tests as the authoritative, unmodifiable acceptance-criteria spec and reverse-engineered exact constants/architecture from them (see `.squad/decisions/inbox/data-wait-times-504-robustness-fix.md` for full detail).

**All 4 of Stef's gate gaps closed:**
1. No-parkId path was sequential → added `refreshParksBoundedWithData()` (new export, worker-pool pattern) and switched `route.ts`'s no-parkId branch to it.
2. Forecast-blend Firestore read (`blendForecasts`) had no timeout → wrapped in new `withTimeout()` helper, 500ms bound, degrades to `forecastMeta.source: 'none'` on timeout.
3. No CDN cache-control on the single-park path → added `Cache-Control: public, s-maxage=20, stale-while-revalidate=60` in `route.ts`, restructured `vercel.json`'s blanket `/api/(.*)` no-store rule into explicit per-route rules with a carve-out for `/api/wait-times`.
4. No Server-Timing/telemetry → added internal-only `timing` field on `ParkRefreshResult` (never serialized to JSON, verified against the telemetry-contract test's exact `toEqual` lock) and a `Server-Timing` response header built from it, plus a bounded structured `console.log` line per request.

**Also implemented (not gate gaps, but explicit task requirements):** read-first single-doc Firestore cache (`waitTimes/{parkId}`) with 300ms read timeout + 45s TTL + 900KB size guard (skipped for cron's forced-refresh calls), non-blocking persistence (write + maintenance both deferred together via `after()`, not just maintenance as before), and `preferRest: true` on Firebase Admin's Firestore client (with safe fallback) for serverless cold-start latency.

**Discrepancy surfaced, not resolved unilaterally:** the task literally said "move forecast aggregates to cron-only," but Stef's own `wait-times-response-deadline.test.ts` explicitly expects `updateForecastAggregates` to still run and resolve on an ordinary non-cron request. Deferred to the unmodifiable test; left the trigger-on-every-non-stale-refresh behavior unchanged. Flagged for Stef/coordinator.

**Validation:** `tsc --noEmit` clean; full suite **615 passed, 0 failed, 58 todo/skipped** (up from Stef's baseline of 609 passed/6 failed — the 6 are now all passing, zero new regressions); `next build` succeeds. Files touched: `src/lib/wait-times/refresh.ts`, `src/lib/firebase/admin.ts`, `src/app/api/wait-times/route.ts`, `vercel.json`. No test files edited. **Not deployed, no production mutation, no commit/push** — awaiting Stef's gate re-run and final approval. Full write-up: `.squad/decisions/inbox/data-wait-times-504-robustness-fix.md`.


## Islands of Adventure hang/persistence/slug fixes (2026-08-13, local only, not deployed)

New task, post reviewer-lockout-cycle, following a read-only investigation of "Islands of Adventure wait times unavailable" reports. Confirmed three independent root causes and implemented all three:

**A. `/api/park-schedule` 45+s production hangs (IoA, Magic Kingdom):** the route and `park-schedule-check.ts` had **zero** timeout/deadline handling anywhere — unbounded `await cacheRef.get()`/`.set()` and a plain `fetch()` with no abort signal — in stark contrast to `refresh.ts`'s already-hardened patterns. Upstream itself responded in ~253ms. Fix: new shared `src/lib/parks/schedule-timing.ts` (`withTimeout`, `withDeadline`, `scheduleBackgroundWrite`, timeout constants — mirrors `refresh.ts`'s proven pattern); both files now bound every Firestore read/write and upstream fetch, defer cache writes via `after()`, and the route (`maxDuration=20`, 15s deadline) returns an explicit `504` instead of hanging.

**B. Universal-family (IoA, USF, Epic Universe) silent persistence failure:** `waitTimes/{parkId}/current/*` simply never updated for these parks, with zero visible error. Built and **disproved** an `undefined`-value Firestore-write-validation hypothesis via real captured upstream payloads (zero `undefined`s found) and a diagnostic test against the real `refreshPark()` (later deleted — scratch only). Confirmed via direct Firestore REST reads (forcing a genuine CDN cache-MISS) that persistence really was frozen, not a probing artifact. Real root cause: `updateForecastAggregates()` is a full unbounded Firestore collection read + per-attraction `.get()` calls, and Universal-family parks have **0** upstream-provided live forecasts for **any** attraction (confirmed via payload inspection) — so 100% of their entries hit this expensive path on every single request, versus a fraction for parks like Magic Kingdom (26/71 already have live forecasts). Combined with these being high-traffic parks, overlapping maintenance runs starved `writeCurrentWaitTimes`'s own commit — exactly the failure mode `maintenanceInFlight`'s own pre-existing comment anticipated, just far more severe here. Fix: `updateForecastAggregates` now only runs on the cron path (`options.awaitMaintenance`), never per-request; `runMaintenance()` is timeboxed (`MAINTENANCE_DEADLINE_MS=8s`); both `writeCurrentWaitTimes` and `runMaintenance` now emit explicit `persist-write`/`persist-maintenance` structured telemetry (ok/timedOut/durationMs/error) instead of silently dropping failures. **This resolves the discrepancy flagged in the Mikey's-retrospective entry above** — Stef's `wait-times-response-deadline.test.ts` (my test-ownership for this task explicitly includes backend/API tests) now proves the response doesn't await slow maintenance via `archiveHistoricalSnapshot`'s write instead of `updateForecastAggregates`, since the latter is confirmed cron-only per this task's own evidence.

**C. Registry/seed slug identity drift:** `scripts/seed-parks.ts` sourced each park's Firestore `slug` from the upstream ThemeParks Wiki API's own per-park slug field, not from `park-registry.ts` — an independent, uncoordinated source of truth. Upstream reports `universal-islands-of-adventure`; the registry (and all app routing) uses `islands-of-adventure`. Fix: new `resolveParkSlug()` helper prefers the registry slug by UUID, falling back to upstream/slugify only for parks not yet in the registry (reusable mapping, not a one-off remap). Added a `next.config.ts` redirect from the old upstream-sourced slug to the canonical one so any already-shared/bookmarked link keeps working once the corrected slug is reseeded (frontend page — owned by Mouth — does an exact `where('slug','==',...)` match with no alias fallback of its own).

**Tests added:** `tests/api/park-schedule.test.ts` (+3: hung cache-read degrade, full-deadline 504, deferred-write-never-blocks), `tests/api/wait-times-universal-persistence.test.ts` (new, 6 tests: Universal-shaped payload persists reliably, forecast aggregation never runs interactively, only runs on cron path, write-failure telemetry, write failure doesn't surface to interactive caller, maintenance-timeout telemetry), `tests/scripts/seed-parks-parity.test.ts` (+4: `resolveParkSlug` registry-preference/fallback/parity), `tests/parks/islands-of-adventure-slug-identity.test.ts` (new: redirect config). **Also updated two pre-existing tests** whose assertions encoded the now-superseded "forecast aggregation runs on every request" behavior: `wait-times-refresh-coalescing.test.ts`'s maintenance-overlap-guard test now exercises `archiveHistoricalSnapshot`'s write (still runs unconditionally) instead of `updateForecastAggregates` (now cron-only); `wait-times-response-deadline.test.ts` likewise. Both are within this task's granted "backend/API tests" ownership.

**Validation:** `tsc --noEmit` clean. Full suite: **60 test files passed, 3 skipped; 637 tests passed, 58 todo** (zero failures, zero regressions — the only 2 pre-existing tests whose behavior contract changed were updated per above, not silently broken). `next build` succeeds (pre-existing, unrelated ESLint warnings only). Diagnostic scratch files/investigation artifacts deleted.

**Files changed:** `src/app/api/park-schedule/route.ts`, `src/lib/parks/park-schedule-check.ts`, `src/lib/parks/schedule-timing.ts` (new), `src/lib/wait-times/refresh.ts`, `scripts/seed-parks.ts`, `next.config.ts`, plus the test files above.

**Not deployed, no production mutation, no commit/push** — code/test only, per task scope. Decision-inbox entry: `.squad/decisions/inbox/data-ioa-schedule-hang-universal-persistence-slug.md`. **Scoped production action still required if/when approved:** an additive `npm run seed:parks` re-run to pick up the corrected Islands of Adventure slug in the live `parks` doc (existing redirect makes this safe to defer — old links keep working either way).

---


## 2026-08-13: Deployed the above fix to production; additive seed hit Firestore quota exhaustion; discovered a new external-cause finding

Approved production rollout for the IoA hang/persistence/slug fix above. Recorded rollback target (`dpl_GCtDWVRPMVVgUgYMMBZXa5miVFjc`) before deploying. `npx vercel deploy --prod --yes` → **Ready**, `dpl_BawJa2fQGS16oaqCyAWbmxkBwzXj`, aliased `theme-park-wait-times.vercel.app`. `npm run seed:parks` **failed** after a 10-minute internal retry: `Quota exceeded` (Firestore `code: 4`) — stopped rather than retrying/broadening, per instructions.

**Verification (all core gates passed):** redirect (`308` → canonical), IoA/Magic Kingdom/Alton Towers pages `200`, `/api/park-schedule` for all three `200` in 0.27–2.44s (item-A fix holds live), `/api/wait-times` fresh with metadata, cron `401`/daily schedule unchanged, 6-request concurrency smoke test all `200` in 0.5–0.9s (no 504s).

**New finding (external cause, not a regression):** the same Firestore quota exhaustion that failed the seed also appears to silently starve the deferred `writeCurrentWaitTimes` persist-write in `refresh.ts` — two cache-bypassed requests for `islands-of-adventure` 9s apart both showed `source:"upstream"` instead of a cache hit, and `vercel logs` never showed the `persist-write` telemetry line within ~2 minutes (consistent with the deferred write being killed by the 30s `maxDuration` while still inside Firestore's internal retry loop). Confirmed **not** Universal-specific — `magic-kingdom` showed the identical pattern. `writeCurrentWaitTimes`'s `batch.commit()` has no bounded-timeout wrapper (unlike `schedule-timing.ts`), which is why quota exhaustion turns into a silent stall instead of a fast, logged failure. **This is part of the Mikey/Stef 504-retrospective artifact area that Stef REJECTED, under which I'm in reviewer lockout as original author — I have not touched it and am only reporting the finding.**

Also re-confirmed (not fixed, out of scope, pre-existing per my own earlier-flagged note in `data-crowd-calendar-identity-and-hasdata.md`) that `park-schedule-check.ts` still maps "date absent from upstream's near-term schedule response" to `hasData:true`/`CLOSED` instead of `NO_DATA` for both `worlds-of-fun` and `oceans-of-fun`.

**No rollback performed** — none of the above are regressions caused by this deploy; all are either external (Firestore quota) or pre-existing and already flagged. Decision-inbox entry: `.squad/decisions/inbox/data-deploy-seed-ioa-fix-quota-finding.md`. **Outstanding, pending approval:** re-run `npm run seed:parks` once quota recovers; a bounded write-timeout fix belongs to the locked-out 504 artifact's next revision (not mine); the crowd-calendar `hasData` date-absence fix is a separate, newly re-flagged follow-up task if prioritized.


## 2026-08-14 Vercel Timeout Notification Diagnosis

Retained evidence showed the timeout notification was not a current user-facing 5xx. Production probes stayed at 200, the daily cron reached 76 parks, and the likely remaining cause is post-response `after()` tail work exceeding the function lifetime. No product code, deploy, or push changes were made; the diagnosis was merged into `decisions.md` and the inbox was cleared.


## 2026-08-14 — Crowd-calendar shared cache schema

Aligned `park-schedule-check.ts` and `/api/park-schedule` on a shared `CachedParkSchedule` schema so confirmed coverage is cached once and ambiguous negative entries are refetched. This closed the interoperability gap that could let the two writers diverge on `hasData` semantics during the August release.


## 2026-08-17 — Catalog production reconciliation

Catalog code shipped at `f6bf8f2`. The approved upsert-only production reconciliation completed successfully for manifest `0039074c56d64862f4b426317f8cd99815b6500b11d8b9fd8711abed339577b7`, leaving zero pending upserts. Deletion and retirement remained disabled; no deletes ran.
