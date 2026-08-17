# Squad Decisions

## Active Decisions

### 4. Park Hours & Closures Data Strategy

**Architect:** Mikey
**Date:** 2026-05-01
**Status:** Proposed
**Priority:** P0 (blocking P1-P3 work)

[Full proposal in mikey-park-hours-architecture.md — integrating park schedule/closure data into crowd calendar pipeline]

---

### 5. Expandable Calendar UX Paradigm

**Designer:** Mouth (Frontend)
**Date:** 2026-05-01
**Status:** Proposed

[Full proposal in mouth-calendar-ux-design.md — mobile-first expandable calendar design for crowd visualization]

---

### 6. Mobile-First Directive

**By:** Devin Sinha (via Copilot)
**Date:** 2026-05-01
**Status:** Team Requirement

**What:** The experience must look good on mobile just as well as larger computer screens. Mobile-first responsive design is a hard requirement for all features, especially the crowd calendar expansion.

**Why:** User request — captured for team memory

---

## Current Canonical Decisions (D39–D65; 2026-05-01 and 2026-08-11 through 2026-08-17)

These records are the canonical representation of decisions D39–D65. Earlier
decision material is retained under `decisions/archive/` with explicit archival
provenance. D48 originated on 2026-05-01; the other decisions in this section
were recorded from 2026-08-11 through 2026-08-17.

### D39: Restore Precise Wait-Time Reads and Preserve Stale-Data Age

**By:** Data
**Date:** 2026-08-11
**Status:** Implemented

#### Decision

Public clients may read only `waitTimes/{parkId}/current/{attractionId}` and may not write there. The wait-times API now reports per-park `source`, `fetchedAt`, and `ageSeconds`, and never rewrites stale memory-cache data as fresh.

#### Rationale

The client reads this exact collection, while the Admin SDK writes it. Precise rules restore the site without exposing sibling data, and preserving source timestamps prevents stale upstream fallback data from appearing newly refreshed.

#### Impact

- Firestore rule tests pass; legacy caching behavior fixed

---

### D40: Add Persistent Fallback and Hobby-Compatible Wait-Time Polling

**By:** Data
**Date:** 2026-08-11
**Status:** Implemented

#### Decision

Wait-time refreshes now fall back from ThemeParks.wiki and the instance memory cache to `waitTimes/{parkId}/current`, returning `source: firestore-cache` without rewriting fallback data. A secured `/api/cron/refresh-wait-times` endpoint refreshes configured supported parks with concurrency 6, and Vercel invokes it daily at 12:00 UTC.

#### Rationale

Firestore survives serverless cold starts, while the precise source and original timestamps keep stale data honest. Vercel Hobby cron schedules may run only daily; more frequent polling requires a paid plan or an external scheduler calling the same `CRON_SECRET`-protected endpoint.

#### Impact

- All supported parks receive daily refreshes without cold-start data loss
- Stale cache clearly labeled; live API returns fresh upstream data

---

### D41: Treat Persistent Fallback and Disclosure as Release Contracts

**By:** Stef
**Date:** 2026-08-11
**Status:** Implemented

#### Decision

Regression coverage now requires cold-start Firestore fallback to remain read-only and timestamp-preserving, cron refreshes to remain authorized and bounded to supported parks, and calendar estimates to remain hidden unless verifiable coverage metadata is disclosed.

#### Rationale

These are the trust and availability boundaries that prevent provider outages, server cold starts, or thin historical data from being presented as fresh or measured wait-time information.

#### Impact

- `npm run test:rules` validates fallback immutability
- Cron authorization verified by `CRON_SECRET`
- Calendar estimates require `dataQuality` disclosure (see D43)

---

### D42: Make Firestore Rules Regressions Runnable from Repository

**By:** Stef
**Date:** 2026-08-11
**Status:** Implemented

#### Decision

Keep `@firebase/rules-unit-testing` and `firebase-tools` as dev dependencies and expose `npm run test:rules` for the emulator-backed rules suite.

#### Rationale

The wait-time outage was caused by a security-rules path mismatch. CI and local validation need a deterministic command that exercises the deployed rules contract; the command requires Java on PATH for the Firestore emulator.

#### Impact

- Rules regression tests integrated into CI
- Local developers can validate rules without `firebase emulator:start`
- Java required on PATH (document in README)

---

### D43: Expose Crowd-Calendar Coverage and Source

**By:** Data
**Date:** 2026-08-11
**Status:** Implemented

#### Decision

Crowd-calendar responses include `dataQuality` with source, day coverage, and generation time. Historical data requires at least 50% day coverage; stale cache is labeled separately; deterministic fallback reports `estimated` with zero historical coverage.

#### Rationale

Synthetic schedule-aware fallback can look like measured forecasts. A small explicit quality contract lets the UI disclose provenance without changing the calendar payload shape.

#### Impact

- Calendar frontend can now enforce visibility rules based on coverage
- Mock data always reports `dataQuality.estimated: true`

---

### D44: Crowd Calendar Requires Coverage Disclosure

**By:** Mouth
**Date:** 2026-08-11
**Status:** Implemented

#### Decision

Crowd-calendar responses must expose `dataQuality` with source, coverage ratio, covered-day count, and total-day count. The UI labels every crowd calendar as an estimate, flags coverage below 50%, and refuses to render unlabeled responses or client-generated fallback levels.

#### Rationale

Synthetic or weakly covered levels must never look like measured crowd intelligence. The existing API already uses 50% day coverage as its quality threshold, so the frontend now makes that contract visible.

#### Impact

- Calendar page rejects responses without `dataQuality`
- Fallback mock data properly labeled as estimate
- Users see coverage disclaimer even for valid data

---

### D45: Post-Login Redirect and Initial-Arrival Refresh for Parks Pages

**By:** Mouth
**Date:** 2026-08-12
**Status:** Implemented

#### Decision

Sign-in and sign-up now redirect to `/parks` (previously hard-coded `/dashboard`), matching the product's primary landing surface. `useAutoRefresh` gained an opt-in `initialDataAge` option: callers pass the age (ms) of the cached data already on screen, and the hook fires a single non-blocking background refresh on mount if that data is already stale — reusing the same in-flight guard as the existing hidden→visible check, so mount and visibility triggers can never double-fire. The hook also now exposes `lastRefreshError` so pages can show a "may be out of date" signal without ever discarding last-known-good data. Parks listing and park detail wired this in using their existing `onRefresh` callbacks and staleness thresholds (10 min / 2 min).

#### Rationale

Users were landing on the account dashboard after login instead of the parks list, and stale Firestore-cached wait-time snapshots persisted on arrival because auto-refresh only ever fired on a hidden→visible tab transition, never on first mount. Separately, any error downstream of the park-document lookup (e.g. an attractions-query failure) was being shown as if the whole park were unavailable, which is misleading when the park itself loaded fine.

#### Follow-ups

The real root cause of the Alton Towers "unavailable" report (why its attraction/wait-time reads fail) is a backend/data investigation owned by Data; this change only ensures the frontend classifies and surfaces that failure correctly rather than fixing the underlying data/access issue.

#### Impact

- Users land at parks list after login (not dashboard)
- Stale data refreshes on mount if age exceeds threshold
- Park detail shows partial-failure states separately (park vs. attractions)

---

### D46: Missing Wait Data Is Unknown, Not Closed

**By:** Mouth
**Date:** 2026-08-11
**Status:** Implemented

#### Decision

The frontend now treats attractions omitted from a wait-time snapshot as `UNKNOWN`. Only an explicit feed status is shown as closed/down/refurbishment. Snapshots are visibly stale after the existing two-minute wait-time freshness threshold.

#### Rationale

Missing or unreadable Firestore data must not be presented as a live closure. This keeps permission failures, empty feeds, stale snapshots, and confirmed ride closures meaningfully distinct.

#### Impact

- Park detail page shows "Attraction data unavailable" (not "Closed")
- Stale wait-time snapshots labeled with age
- No silent omission of attractions

---

### D47: ParkPulse Is the Canonical UI Brand

**By:** Mouth
**Date:** 2026-08-11
**Status:** Implemented

#### Decision

User-facing branding and new localStorage keys use ParkPulse. Existing ParkFlow favorites and last-park preferences migrate to ParkPulse keys without losing saved values.

#### Rationale

The integrated product review required resolving mixed ParkFlow/ParkPulse branding while preserving existing users' local preferences.

#### Impact

- UI branding unified to "ParkPulse"
- localStorage keys migrated with data preservation
- Repo name remains `theme-park-wait-times`

---

### D48: User Directive — Push, Exact-Commit Production Deploy, and Live Verification

**By:** Devin Sinha (via Copilot)
**Date:** 2026-05-01T11:48:56Z
**Status:** Team Requirement

#### Decision

Once a live fix is completed and reviewed, the checked-in fix should be pushed,
deployed to Vercel, and verified in production. A push to `master` does **not**
currently deploy this repository because it has no Vercel Git integration.

The approved release path is to deploy exactly the reviewed commit from a clean,
detached worktree pinned to that commit, then smoke-test
https://theme-park-wait-times.vercel.app. Never deploy from the dirty development
checkout.

#### Rationale

This preserves the user's desired outcome—completed, tested live fixes are pushed
and verified in production—without treating a source push as a deployment or
allowing unrelated working-tree changes into a release.

#### Provenance and Supersession

This decision supersedes D12's deployment-policy wording. D12 is retained in the
archive only for its unique historical and troubleshooting context: recovery
from a missing Git remote and a hanging Vercel CLI attempt. Durable release
history established that production deployments were performed from a clean,
detached worktree pinned to the reviewed commit, not triggered automatically by
push.

---

### D49: Wait-Times 504 Robustness Fix — Architecture Implementation

**By:** Data
**Date:** 2026-08-12T12:51:00Z
**Status:** Implemented (NOT deployed pending Stef approval)

#### Decision

Implemented the minimum robust fix for the wait-times 504 outage per Stef's test gate. Key changes:

1. **Non-blocking persistence** — Firestore write + maintenance wrapped in single deferred promise via Next's `after()`, no longer awaited before response
2. **Read-first Firestore cache** — New `waitTimes/{parkId}` doc checked first (300ms timeout, 45s TTL) before upstream, returns immediately on hit
3. **Per-stage timeboxing** — Cache read (300ms), forecast blend (500ms), fallback cache (3000ms) all have explicit timeouts
4. **Firebase Admin `preferRest: true`** — Mitigates gRPC cold-start latency in serverless
5. **Bounded no-parkId concurrency** — New `refreshParksBoundedWithData()` export (worker pool, concurrency=8) replaces sequential loop
6. **CDN cache-control carve-out** — Single-park success: `Cache-Control: public, s-maxage=20, stale-while-revalidate=60` (error paths keep no-store)
7. **Server-Timing telemetry** — Internal timing fields + `Server-Timing` header with stage names and durations

#### Validation

- `tsc --noEmit`: clean
- Targeted suite (9 files): 48/48 passing
- Full suite: 615 passed, 0 failed (vs. prior 609/6)
- `npm run build`: succeeds

#### Files Changed

- `src/lib/wait-times/refresh.ts` — substantial; new helpers, timeouts, cache logic, non-blocking persistence, `refreshParksBoundedWithData` export
- `src/lib/firebase/admin.ts` — `preferRest: true` + fallback
- `src/app/api/wait-times/route.ts` — bounded no-parkId, Server-Timing header, outcome-dependent cache-control
- `vercel.json` — per-route header restructure

#### Status

Awaiting Stef's gate re-run. NOT deployed, NOT committed.

---

### D50: Wait-Times 504 Architecture Test Gate (Stef Review)

**By:** Stef
**Date:** 2026-08-12T20:42:35Z
**Status:** Contract defined (REJECT issued; gaps found)

#### Decision

Built independent test gate for wait-times 504 architecture per 8-point reliability contract. Found 4 concrete gaps via test-driven validation:

1. **No-parkId path still sequential** — Measured concurrency=1 on 4-park mock; time scales linearly with park count. Fix: swap to `refreshParksBounded` (concurrency 6).
2. **Forecast blend Firestore read unbounded** — No timeout on `blendForecasts()` read; hung Firestore stalls entire response. Fix: add explicit timeout race with graceful degrade.
3. **No CDN cache-control for edge coalescing** — Blanket `no-store` on all /api/wait-times responses defeats edge-level request collapsing. Fix: scoped `s-maxage`/`stale-while-revalidate` for single-park path.
4. **No Server-Timing telemetry** — No visibility into which stage caused slow responses. Fix: add Server-Timing header naming each stage.

#### Test Files Created

- `tests/api/wait-times-response-deadline.test.ts` — maintains non-blocking contract
- `tests/api/wait-times-blend-deadline.test.ts` — proves timeout + graceful degrade
- `tests/api/wait-times-no-parkid-bounded.test.ts` — proves bounded concurrency
- `tests/api/wait-times-cdn-coalescing.test.ts` — proves CDN cache-control scoping
- `tests/api/wait-times-telemetry-contract.test.ts` — proves Server-Timing + no secrets
- `tests/config/wait-times-cold-concurrent-matrix.ts` + `.test.ts` — defines preview/production matrix (5 scenarios, explicit thresholds)

#### Verdict

**REJECT (changes requested).** All 4 gaps test-proven, not speculative. Data to address; re-run gate after fixes.

#### What's Already Solid

- Same-process in-flight coalescing
- Maintenance never blocks response
- Stale-cache-honest behavior
- Cron auth & schedule intact
- Public API contract unchanged

---

### D51: Wait-Times 504 Revision V2 (Mikey Independent Review)

**By:** Mikey
**Date:** 2026-08-12T20-58:23Z
**Status:** Implemented, approved for production

#### Decision

Independent revision of wait-times 504 artifact under lockout from Data. Addresses all 4 of Stef's findings:

1. **No-parkId bounded fan-out** — Replaced sequential loop with `refreshParksBoundedWithData(supported, { concurrency: 6, deadlineMs: 20_000 })`. Keeps read-first cache for warm catalog (zero upstream in steady state), bounded fan-out for cold, hard 20s deadline.
2. **Forecast blend timeout** — Verified already in place: `withTimeout(..., BLEND_TIMEOUT_MS = 500)`. Closed related gap: `getConfiguredParkIds()` now `withDeadline(..., 3_000)`.
3. **CDN s-maxage / stale-while-revalidate** — Outcome-dependent: fresh → `public, s-maxage=30, stale-while-revalidate=60`; stale → `public, s-maxage=5, stale-while-revalidate=30`; error → `no-store`. Deleted platform-level rule; route owns policy.
4. **Server-Timing + telemetry** — Every response carries `Server-Timing: cache;dur=N, upstream;dur=N, blend;dur=N, parks;dur=N, route;dur=N`. Structured log line per request (timings only, no secrets/env values).

#### Contracts Preserved

- No user response awaits writes/maintenance
- Fresh-cache-first behavior
- Explicit deadlines at every Firestore await
- `stale`/`source`/`fetchedAt`/`ageSeconds` unchanged and honest
- Public JSON shape unchanged
- Cron auth & daily 0 12 * * * schedule untouched
- New: 502 when all parks fail (no empty-success shells)

#### Validation

- `tsc --noEmit`: clean
- Full suite: 615 passed, 0 failed (vs. prior 609/6)
- `npm run build`: clean

#### Files Changed

- `src/app/api/wait-times/route.ts` (rewritten)
- `src/lib/wait-times/refresh.ts` (RefreshDeadlineError, `withDeadline`, `refreshParksBoundedWithData`, outcome-dependent cache)
- `vercel.json` (per-route headers; removed platform /api/wait-times override)

#### Status

Not deployed, not committed. Awaiting production canary gate (Stef's cold-concurrent matrix against preview URL).

---

### D52: Production Canary Final Outcome — dpl_GCtDWVRPMVVgUgYMMBZXa5miVFjc

**By:** Mikey (deployed); Scribe (documented)
**Date:** 2026-08-13T10:49:04Z
**Status:** Deployed and verified ✅

#### Decision

Production canary deployment approved by user with rollback available. Deployment `dpl_GCtDWVRPMVVgUgYMMBZXa5miVFjc` (containing Data + Stef + Mikey changes across 67 team files) deployed to production and kept live. All reliability gates passed.

#### Reliability Matrix Results

**Five-scenario matrix: 5/5 passed ✅**
- Cold (no-parkId all-parks): 6.676s ✅ (budget 20s)
- Warm (single-park repeat): p95 215ms ✅ (budget 2s)
- Concurrent (4x same-park): p95 174ms ✅ (budget 2s)
- Multi-park (20 requests): p95 2.498s ✅ (budget 3s)
- **Aggregate**: 31/31 HTTP 200, zero 5xx, zero 504 ✅

#### Live Verification

| Check | Result | Notes |
|-------|--------|-------|
| Server-Timing header | ✅ | 31/31 responses, stage breakdowns present |
| HTTP 200 rate | 31/31 ✅ | No 5xx errors |
| Cron authorization | 401 ✅ | Correctly unauthenticated |
| Cron schedule | ✅ | Daily 0 12 * * *, unchanged |
| Crowd calendar | ✅ | Worlds of Fun matches baseline, `dataQuality` present |
| Park detail (Alton Towers) | ✅ | Live, attraction directory serving, zero console errors |
| Park detail (Magic Kingdom) | ✅ | 200, waits rendering, stale markers visible |
| API error rate | 0% ✅ | No production incidents |

#### Outcome

**No rollback triggered.** All matrices passed; canary authorized but NOT revoked. Deployment kept live.

#### Known Issues (Not Rollback Triggers)

**Issue 1: Orphan Firestore park docs (pre-existing data drift)**
- 57 documents in `parks` collection not in supported registry
- Causes all-parks response to include errors, downgrades cache-control from `s-maxage=30` to `no-store`
- Prevents all-parks edge caching until resolved
- Recommendation: Separate Data task to reconcile collection & registry

**Issue 2: Uncommitted production working tree**
- Deployment ships entire 67-file working tree (uncommitted locally)
- Audit note: diff against prior deployment `dpl_3iKb7iGiFKcYtSXCV7bJdBq82W31` for full visibility
- Recommendation: Decide on commit strategy for audit trail clarity

#### No Actions Taken

- ✅ No rollback (all matrices passed)
- ✅ No commit
- ✅ No push
- ✅ No Firestore rules deployment
- ✅ No seed script run

#### Next Steps

1. Monitor production Server-Timing telemetry over 24–48 hours for anomalies
2. (Team) Reconcile 57 orphan Firestore park docs with registry
3. (Team) Decide commit strategy for deployed working tree

---

### D53: Vercel Timeout Notification Diagnosis

**By:** Data
**Date:** 2026-08-14
**Status:** Documented
**Scope:** Production timeout investigation / response lifecycle

#### Decision

No product source change is warranted from the retained evidence. The deployed wait-time and schedule hardening remains in place. The timeout notification was not a user-facing 5xx: retained production logs show 200 responses, live wait-time probes return 200, and Firestore history shows the daily cron reached 76 active parks at 12:37Z. Two of the three parks without cron history currently return zero upstream live entities; the remaining gap is consistent with a transient per-park upstream failure. The strongest remaining explanation is a `/api/wait-times` invocation whose `after()` persistence/maintenance tail exceeded the function lifetime after its HTTP 200 had already been sent.

---

### D54: Crowd Calendar Audit Findings and Expanded Blast Radius

**By:** Chunk
**Date:** 2026-08-12
**Status:** Documented

#### Decision

Live audit confirmed the Worlds of Fun false-CLOSED root cause and widened the blast radius: the ThemeParks.wiki schedule feed is rolling-window only, 11 registry UUIDs were malformed, and Oceans of Fun was pointing at a decommissioned id. The real `{isOpen:false, hasData:false}` failure shape also needed explicit coverage.

#### Rationale

The public schedule API is not a historical archive. Unknown dates must stay unknown until published, and malformed or stale ids must be repaired at the registry boundary rather than patched ad hoc in consumers.

#### Impact

- Guided the multi-file crowd-calendar fix
- Established the exact regression scope for Data, Mouth, and Stef

---

### D55: Crowd-Calendar Schedule Identity, hasData, and Per-Park Today Fix

**By:** Data
**Date:** 2026-08-12
**Status:** Implemented

#### Decision

The crowd-calendar backend now resolves schedule lookups through `resolveScheduleParkId()`, treats `hasData:false` as `NO_DATA` instead of `CLOSED`, and computes "today" in each park's own timezone. Registry UUID corrections and seed/sync parity updates landed alongside it.

#### Rationale

Slug ids do not belong in the ThemeParks schedule API contract, and a missing schedule entry is not proof of closure. Localizing the date boundary and repairing the registry/seed ids keeps the schedule and calendar contracts honest.

#### Impact

- Worlds of Fun no longer shows false closures in August
- Oceans of Fun uses the live canonical entity id
- Registry and seed scripts stay in parity

---

### D56: Canonical Park-Identity Boundary for Crowd Calendar Filtering

**By:** Mouth
**Date:** 2026-08-12
**Status:** Implemented

#### Decision

The calendar frontend normalizes park ids once at the fetch boundary, translating legacy slugs to canonical UUIDs before filtering. Slugs remain user-facing only in chip labels and `/parks/{slug}` links.

#### Rationale

The backend contract had already moved to UUID-keyed park ids. Normalizing once avoids a broken slug/UUID split across every consumer and keeps legacy cached payloads backward compatible.

#### Impact

- Real UUID-keyed payloads render correctly
- Legacy slug-keyed cache entries still work during TTL overlap
- Calendar filtering and grouping use one canonical id space

---

### D57: Crowd-Calendar Identity/hasData/Registry Audit Fix — Approved

**By:** Stef
**Date:** 2026-08-12
**Status:** Approved

#### Decision

Independent QA re-verified Chunk's audit, Data's backend fix, and Mouth's frontend boundary. The combined fix set passed targeted regression coverage, TypeScript, and build checks with no release-blocking defect.

#### Rationale

The live API evidence and test coverage aligned with the reported bug and the broadened registry blast radius. The fix matched the audited failure shapes rather than a narrower symptom.

#### Impact

- Approved for production rollout
- Seed reconciliation remains an explicit, separately-approved action

---

### D58: Treat Schedule Dates Outside the Published Rolling Window as Unknown

**By:** Chunk
**Date:** 2026-08-14
**Status:** Implemented

#### Decision

Schedule status now carries an explicit `hasData` signal, and dates outside the published rolling window are `NO_DATA` rather than `CLOSED`. Legacy cached empty schedules without `hasData` are refetched once.

#### Rationale

ThemeParks.wiki publishes a rolling present/future feed, not a complete month archive. Persisting beyond-horizon negatives would hide newly published dates and mislead the calendar.

#### Impact

- Published future dates remain discoverable as the horizon advances
- Older ambiguous empties stop replaying as closures

---

### D59: Cache Only Confirmed Schedule Coverage in the Shared Schema

**By:** Data
**Date:** 2026-08-14
**Status:** Implemented

#### Decision

`park-schedule-check.ts` and `/api/park-schedule` now share the same `CachedParkSchedule` schema and rolling-window coverage helper. Confirmed dates cache with `hasData:true`; `hasData:false` entries are not cached.

#### Rationale

One shared discriminator prevents the two writers from drifting apart and keeps ambiguous empty schedules from being stored as if they were authoritative.

#### Impact

- Negative/ambiguous schedule responses are refetched, not replayed
- Coverage semantics stay interoperable across both writers

---

### D60: Crowd Calendar Only Accepts the Latest Selection Response

**By:** Mouth
**Date:** 2026-08-14
**Status:** Implemented

#### Decision

Each family/month refresh now gets a request id, and state updates from older requests are ignored after the user changes family, month, or triggers another refresh.

#### Rationale

Slower stale responses were able to overwrite the latest selection and make the active calendar appear empty. The UI should only reflect the newest selection, not whichever fetch happens to finish last.

#### Impact

- Stale family responses can no longer replace the current selection
- Worlds of Fun and Oceans of Fun stay visible while older requests finish

---

### D61: Crowd-Calendar August Fixes Pass Focused QA

**By:** Stef
**Date:** 2026-08-14
**Status:** Approved

#### Decision

Focused QA validated the rolling-window and request-ordering fixes with 26 tests plus a clean TypeScript check. The August release is approved with the new regression coverage included.

#### Rationale

The tests now distinguish unknown dates from explicit closures, reject stale selection responses, and cover the exact August 2026 failure shape.

#### Impact

- Release is QA-approved
- `tests/api/park-schedule-boundary.test.ts` must ship with the change

---

### D62: Require Checked-In Live Fixes

**By:** Copilot Scribe
**Date:** 2026-08-13T19:57:14.982Z
**Status:** Team Requirement

#### What

Do not call a task done until the latest fixes are validated, committed/checked in, pushed, deployed, and verified live before the user checks the production URL.

#### Why

The user explicitly required live-verifiable fixes, not just local test completion.

#### Notes

This requirement is implemented through D48's exact-commit deployment and live
smoke-test path; it does not imply that a push automatically deploys.

---

### D63: Require CRON_SECRET for Production Cron

**By:** Mikey (Final Review)
**Original Date:** 2026-08-11
**Canonicalized:** 2026-08-17
**Status:** Deployment Requirement

#### Decision

Production deployments that expose `/api/cron/refresh-wait-times` require `CRON_SECRET` in the Vercel environment so unauthorized invocations remain rejected.

---

### D64: Deploy Firestore Rules as a Separate Production Step

**By:** Mikey (Final Review)
**Original Date:** 2026-08-11
**Canonicalized:** 2026-08-17
**Status:** Deployment Requirement

#### Decision

Application deployment does not deploy Firestore security rules. Any approved rules change must be deployed separately with `firebase deploy --only firestore:rules`.

---

### D65: Catalog Reconciliation Is Reviewed, State-Bound, and Upsert-Only

**By:** Data, Mikey, Andy, Keaton, Sloth, Rosalita; Scribe (canonicalized)
**Date:** 2026-08-17
**Status:** Implemented and production-reconciled

#### Decision

`DESTINATION_FAMILIES` remains the product-support boundary: 64 destinations and 96 canonical parks, with ThemeParks.wiki UUIDs owning park and child identity. The shipped catalog implementation at `f6bf8f2` uses complete-feed and no-shrinkage gates, creates missing canonical parks, pins reviewed child identities, and applies resumable upsert phases only when exact pending actions and Firestore preconditions match the reviewed state.

Production upsert reconciliation completed successfully for exact manifest `0039074c56d64862f4b426317f8cd99815b6500b11d8b9fd8711abed339577b7`; zero upserts remain. Deletion and retirement remain review-only and disabled: no production delete path was enabled or executed.

#### Rationale

State-bound, additive convergence makes retries auditable and idempotent without promoting unsupported parks or risking removal of live or user-linked data.

---

### D66: Add a Firestore Reliability Specialist After Reviewer Deadlock

**By:** Devin Sinha (approval); Squad Coordinator (recorded)
**Date:** 2026-08-17
**Status:** Implemented

#### Decision

After successive reviewer rejections locked every existing eligible implementation
agent out of the ride-logging artifact, Devin explicitly approved adding a new
specialist to finish the bounded Firestore consensus transaction. The Coordinator
added Andy as Firestore Reliability Engineer within the existing Goonies casting
universe and routed only the remaining transaction-bound blocker to him.

#### Rationale

Reviewer lockout prohibited reusing the prior authors, while the user chose to
continue rather than pause the unshipped fix. A narrowly scoped specialist
resolved the deadlock without weakening the reviewer protocol.

#### Impact

- Andy owns bounded Firestore transactions, contention, and aggregation reliability.
- The existing team universe remains unchanged and within capacity.
- The ride-logging release was independently approved after Andy's revision.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

## Archives

- `archive/2026-08-14-pre-2026-08-11.md` contains the earlier canonical decision set.
- `archive/legacy-decisions-log-through-2026-05-01.md` preserves unique provenance
  from the superseded legacy log; canonical decisions take precedence.
