# Stef — History

## Project Context

- **Project:** theme-park-wait-times — Platform for tracking ride wait times, logging visits, crowd calendars, and crowd-sourced data.
- **Stack:** React/Next.js, TypeScript, Firebase (Firestore, Auth, Security Rules), Vercel
- **Role:** QA & Test Infrastructure Lead

## Current Sprint — Stats Dashboard + Trip Sharing (2026-05-01)

**Your Role:** QA & test infrastructure for Sprint A (Stats + Sharing)  
**Status:** 🔄 IN PROGRESS

### Your Work (Sprint A Item #6)

Writing comprehensive test suite for stats aggregation + share modal:

**Tests to write:**
1. **Unit tests:** Career stats aggregation
   - `computeCareerStats()` with various ride logs
   - `filterByDateRange()` edge cases
   - `computeRideDistributionByPark()` and `computeAttractionCounts()` ranking

2. **Integration test:** Full stats roll-up
   - Add 5 rides across 2 trips
   - Verify aggregation correct
   - Verify date filter scoping

3. **E2E tests:** Trip sharing flow
   - Share button → modal opens
   - Copy link to clipboard
   - Toggle "Make Shareable" on/off
   - Open public link → verify data visible
   - Verify shareId created/deleted

**Test Dependencies:**
- Data: `career-stats.ts` (ready ✅)
- Mouth: ShareModal, PublicTripView (ready ✅)

---

## Test Suite Overview

| Phase | Tests | Status |
|---|---|---|
| Phase 1 Core Auth + UI | 99 | ✅ Passing |
| Phase 2 Ride Logging + Crowd | 66 | ✅ Passing |
| Phase 1 Expansion | 44 | ✅ Passing |
| Crowd Calendar | 58 | ✅ Passing |
| Auto-Refresh Hooks | 27 | ✅ Passing |
| E2E Critical Flows | 13 | ✅ In Progress |

**Total:** 309+ passing tests

## Key Testing Patterns

- **Vitest:** Native ESM/TS, jsdom for units, node for integration
- **Coverage:** 80% lines/functions, 75% branches
- **Security Rules:** 40+ tests covering access matrix (unauth, owner, other user, admin)
- **Contract Tests:** RED BY DESIGN tests define API contracts before implementation
- **Firebase Mocking:** Mock `@/lib/firebase/config` to prevent key errors
- **Factory Functions:** Reusable mock factories with auto-incrementing IDs
- **Playwright E2E:** Chromium-only, deterministic mocked backend, real Next.js dev server

## Current Status

✅ 354+ tests passing (486 passing in full suite; 14 pre-existing failures in parks tests)
✅ All Phase 1–2 features covered by contracts  
✅ Playwright E2E infrastructure ready  
✅ Sprint A testing complete (career-stats + ShareModal)

*Full history: see history-archive-2026-05-01T18-28-49Z.md*

## Learnings

- `computeCareerStats` is a pure function — no Firebase mocking needed, tests are fast (~11ms for 25 tests)
- ShareModal uses `role="switch"` with `aria-checked` — good accessibility pattern, testable via RTL's `getByRole('switch')`
- The backdrop div uses `aria-hidden="true"` but no ARIA role; query it via DOM selector not role queries
- Pre-existing test failures in parks-listing/park-detail (12+ tests) due to unimplemented schedule mock (`scheduleRes.json is not a function`) — not caused by Sprint A changes
- Career stats handles ties via insertion order (first-encountered wins in Object.entries iteration) — deterministic but not alphabetically stable

---
## 2026-05-01 Team Spawn

Team session initiated with background agents. Decisions merged:
- Park Hours & Closures Data Strategy (P0) — mikey
- Expandable Calendar UX Paradigm — mouth
- Mobile-First Directive applied (user requirement)

Tester (stef) reported: 45 tests written (25 career-stats, 20 ShareModal), all passing.

## 2026-08-11 Regression Coverage Complete — Final Release Batch

Comprehensive regression coverage for data-trust boundaries. Firestore rules validation automation exposed and integrated into CI. Full test suite passing (532 tests) with one pre-existing unrelated Ban mock failure.

**Coverage Scope:**
- Firestore rules unit tests (emulator-backed via `npm run test:rules`)
- Cron endpoint authorization and concurrency bounds
- Calendar estimate disclosure contract in UI
- Cold-start fallback read-only and timestamp-preserving behavior
- API response shape for source, fetchedAt, ageSeconds
- ParkPulse branding and localStorage migration

**Build Status:** 532 tests passing. Java required on PATH for Firestore emulator (setup documented).


## 2026-08-11 Cross-Agent Learnings — Stef

**Security Rules Need Test Coverage as Much as Application Code**
The wait-time outage was caused by a Firestore rules path mismatch that had zero test coverage. If `npm run test:rules` had been part of CI from the start, the bug would have been caught before code shipped. Rules drift just like application code; treat them with the same rigor.

**Test Contracts Should Enforce Release Boundaries**
Making persistent fallback and calendar disclosure test requirements (not optional) prevented them from being cut under time pressure. Contracts are a form of guardrails; teams respect them more than verbal agreements.

**Java Dependency in CI Is Non-Obvious**
Firestore emulator-backed rule tests require Java on PATH. This isn't mentioned in firebase-tools documentation and caused local blocking issues. Document this explicitly in README and CI setup; otherwise contributors hit silent failures and waste time.

---


## 2026-08-12 Integrated Review — Auth Redirects, Auto-Refresh Split, Seed Parity — APPROVED

Independent QA pass over Mouth's redirect/auto-refresh/park-detail split and Data's seed-parity fix.

**Verdict:** ✅ Approved. No production code revision required.

**Scope reviewed:**
- Signin/signup redirect target `/dashboard` → `/parks` (3 call sites each, push + replace + Google sign-in)
- `useAutoRefresh`: new `initialDataAge`/`lastRefreshError`, arrival-vs-visibility dedupe via shared in-flight guard
- Parks listing (10-min staleness) and park detail (2-min staleness) wired to `initialDataAge`
- Park detail page split into `fetchPark`/`fetchAttractions`/`fetchWaitTimes` with independently classified `coreError`/`attractionsIssue`/`waitTimesIssue`
- `scripts/seed-parks.ts` fuzzy-keyword → `SEED_DESTINATION_IDS` UUID matching, `main()` guarded behind an ESM entry-point check, new `tests/scripts/seed-parks-parity.test.ts`

**Results:**
- Targeted: 136/136 passing (`useAutoRefresh.test.ts`, signin/signup, seed-parks-parity, park-detail, parks-listing, parks/components)
- `tsc --noEmit`: clean, zero errors
- Full suite: 569 passed, 58 todo/skipped (pre-existing), 0 failures
- `npm run build`: succeeds; only pre-existing unrelated lint warnings (unused vars, one exhaustive-deps) in files outside this change set

**Acceptance criteria verified against real tests (not just hook unit tests):**
- Auth → `/parks` confirmed at all 6 call sites
- Stale-on-arrival triggers one non-blocking refresh; fresh-on-arrival fires none (asserted via `getCollection` call counts in park-detail/parks-listing, not just mocked hook behavior)
- Mount+visibility dedupe covered by hook tests (in-flight guard shared between triggers)
- Refresh failure retains cached data + surfaces `lastRefreshError` without throwing (explicit tests, including error-then-recover clearing the flag)
- Park vs. attraction failures classified and independently retryable — dedicated "Alton Towers scenario" test proves a park still renders when only its attraction directory 403s
- Alton Towers present in both `park-registry.ts` and `SEED_DESTINATION_IDS`; parity test asserts registry↔seed-list consistency
- Invalid/typo seed ids throw (fail-fast) in `resolveSeedDestinations`; a registry-valid id temporarily missing upstream skips gracefully instead of throwing

**Remaining risk:** None found in this diff. The only unresolved action is the already-flagged, unchanged one: `npm run seed:parks` still requires explicit human approval before running against production — not run as part of this review.

**Files touched by me:** None (review only; no test or production code required changes).

---


## 2026-08-12 Crowd Calendar False-CLOSED Audit Fix — Independent Review — APPROVED

Reviewed the combined Chunk (audit) / Data (fix) / Mouth (identity boundary) crowd-calendar work addressing "Worlds of Fun shows CLOSED in August."

**Verdict:** ✅ Approved. No test-owned defects, no production rejection warranted.

**Independent verification (not just trusting the write-ups):**
- Live read-only calls to `api.themeparks.wiki/v1/entity/{id}` confirmed all 12 corrected UUIDs (11 malformed + Oceans of Fun's stale id) resolve to the *intended* live entities by name, and all 4 old/malformed ids 404 as expected.
- Confirmed Worlds of Fun's live August schedule is `OPERATING` daily, reproducing the reported bug's ground truth.
- Read full diffs: `constants.ts` (`resolveScheduleParkId`), `park-registry.ts` (12 id corrections), `park-schedule-check.ts` (`getLocalDateString`, `timezone` field), `types/crowd-calendar.ts` (`CrowdDataQuality`), `route.ts` (hasData-before-isOpen in both `generatePlaceholderData` and `computeFamilyCrowdDays`; per-park-timezone "today"), `calendar/page.tsx` (`normalizeParkId` boundary reusing `resolveScheduleParkId`), `seed-parks.ts`/`sync-all-parks.ts` (virtual-split removal, no destructive deletes, purely additive `merge:true` writes).
- Ran targeted suites directly: schedule-identity, real-path, quality, registry-integrity, seed-parity, calendar-identity, calendar-disclosure — 39/39 passing.
- `tsc --noEmit`: clean. Full suite: **592 passed, 58 todo, 0 failed** (matches Mouth's reported count). `npm run build`: succeeds, only pre-existing unrelated lint warnings.

**Production status:** No deploy/commit/cache purge performed by me (out of scope for review). TTL self-heal is sufficient for the `/api/crowd-calendar` 6h cache. Firestore `parks`/`attractions` docs for the 12 corrected parks need an explicitly-approved `npm run seed:parks` re-run to un-orphan (additive only, doesn't delete old stale-id docs) — not run this session.

**Files changed by me:** None (review only).

---


## 2026-08-13 IoA Schedule-Hang / Contradictory Loading Fix — Independent Review — APPROVED

Reviewed the combined Mouth (frontend decoupling) + Data (bounded schedule I/O, cron-gated forecast aggregation, IoA slug normalization) fix for the reported bug: Islands of Adventure showed per-row "Unavailable" plus a header stuck on "Loading wait times" indefinitely.

**Verdict:** ✅ Approved. No production code revision required.

**Root cause confirmed fixed:** `fetchWaitTimes` previously awaited the Firestore wait read AND an unbounded `/api/park-schedule` fetch together via `Promise.all` — a schedule hang meant `waitTimesLoading` never settled while every row was hard-coded `UNKNOWN`→"Unavailable". Now `fetchWaitTimes` and the new independent `fetchSchedule` (bounded, `AbortSignal.timeout(10_000)`) are fully separate functions/state, and `AttractionRow`'s `isPendingUnknown = loading && status === 'UNKNOWN'` makes "Checking…" and "Unavailable" structurally mutually exclusive.

**Verified directly (not just trusted):**
- All 6 deterministic scenarios (hung schedule + good waits, failed waits + good schedule, both success, both fail, schedule retry recovery, no-contradictory-Unavailable-while-loading) pass in `tests/parks/park-detail.test.tsx`.
- `/api/park-schedule` bounded I/O: hung cache read degrades to miss (3s), both cache+upstream hang → explicit 504 (15s route deadline, 20s `maxDuration`), cache write never blocks response (`after()`-deferred) — `tests/api/park-schedule.test.ts`.
- Forecast aggregation is cron-only (`awaitMaintenance`-gated); the actual per-request `writeCurrentWaitTimes` persistence is unconditional and unaffected — `tests/api/wait-times-universal-persistence.test.ts` (Universal-shaped 0-forecast payload persists reliably, persist-write/persist-maintenance telemetry present, no silent failures).
- IoA slug redirect (`universal-islands-of-adventure` → `islands-of-adventure`) + registry/seed slug parity — `tests/parks/islands-of-adventure-slug-identity.test.ts`, `park-registry-integrity.test.ts`, `seed-parks-parity.test.ts`.

**Results:** Targeted 6-file run: 73/73 passing. `tsc --noEmit`: clean. Full suite run twice for stability: **637 passed, 0 failed, 58 todo** both times (matches Data's reported count exactly). `npm run build`: succeeds, only pre-existing unrelated lint warnings. Confirmed the previously-flagged scratch diagnostic test/fixture (`diag-universal-persistence.test.ts` / `diag-live-magic-kingdom.json`) are both gone — no scratch artifacts remain.

**Rollout plan issued:** standard Vercel auto-deploy; flagged that the IoA slug redirect and an additive `npm run seed:parks` reseed (rewrites IoA's `slug` field, `merge:true`, non-destructive) must land together — deploying the redirect without reseeding would leave the canonical `/parks/islands-of-adventure` URL 404ing until the reseed runs. Manual live-check list defined for IoA (old+new slug), Magic Kingdom, and Alton Towers post-deploy.

**Files changed by me:** None (review only).

---


## 2026-08-14 — Crowd-calendar August QA approval

Focused QA passed on the rolling-window and stale-selection fixes: 26 targeted tests plus a clean TypeScript check. Verified that unknown dates stay distinct from explicit closures, older family responses cannot replace the latest selection, and the release includes the needed regression coverage.

---

## 2026-08-17T09:42:03.584-07:00 — Rollout instruction correction

D48 governs current rollout. This repository has no Vercel Git integration, so a push does not deploy. After review, push the reviewed commit, create a clean detached worktree pinned to that exact SHA, run the Vercel production deployment from that worktree—never from the dirty development checkout—verify the deployment is Ready and aliased to the production domain, then smoke-test production.

This correction supersedes only the stale “standard Vercel auto-deploy” rollout instruction in the 2026-08-13 entry. All other historical review evidence and rollout notes in that entry remain unchanged.
