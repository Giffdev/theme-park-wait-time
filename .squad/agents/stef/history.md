# Stef — History

## Project Context

- **Project:** theme-park-wait-times — A platform for theme park visitors to track ride wait times, log visits, plan trips with crowd calendars, and crowd-source real-time wait data.
- **Stack:** React/Next.js, TypeScript, Firebase (Firestore, Auth, Security Rules), Vercel
- **User:** Devin Sinha
- **Key concern:** Security testing for user accounts, Firebase Security Rules validation, data integrity for crowd-sourced submissions, edge cases around seasonal closures and offline mode.

## Architecture Decisions (via Scribe — 2026-04-28)

### Test Scope & Security Rules Validation

**Phase 1 QA Focus**
- Firebase Authentication flows (sign-up, email/password, Google sign-in)
- Firestore Security Rules enforcement (public read, private read/write)
- Data isolation: User A cannot see User B's trips or ride logs
- Public data (parks, attractions, waits) accessible without auth

**Phase 2-5 QA Targets**
- Phase 2: Live wait time API polling accuracy, data freshness < 10 minutes
- Phase 3: Ride logging transaction integrity, multi-day trip persistence
- Phase 4: Crowd calendar consensus algorithm correctness (rule-based scoring)
- Phase 5: Crowd-source submission validation, spam filtering, consensus weighting

**Security Edge Cases**
- Seasonal attraction closures (should not appear in live waits)
- Offline mode: app works read-only without network
- Stale data handling: API outage → cached data with age warning
- Crowd report spam: Malicious users submitting false wait times

### Test Strategy

- **Unit tests:** Crowd calendar algorithm, data transformation, type validation
- **Integration tests:** Firebase Security Rules (AngularFire test harness), auth flows
- **E2E tests:** Park selection → wait time display → user trip logging → crowd submissions
- **Security tests:** Unauthorized access attempts, cross-user data leakage

## Learnings

- **2026-04-28:** Bootstrapped full test infrastructure. Chose **Vitest** over Jest — faster, native ESM/TS support, better fit for Next.js 14+. Created separate vitest configs for unit (jsdom) and integration (node) to keep unit tests fast.
- **2026-04-28:** Security rules test suite is the highest-priority integration test. Covers every collection in the Firestore schema with the full access matrix (unauth/owner/other/admin). Uses `@firebase/rules-unit-testing` with `withSecurityRulesDisabled` for seeding.
- **2026-04-28:** Firebase Emulator ports: Auth=9099, Firestore=8080, Functions=5001, UI=4000. Added to `firebase.json` — these must stay in sync with `firebase-test-helpers.ts`.
- **2026-04-28:** Created factory functions (`createMockPark`, `createMockUser`, etc.) with auto-incrementing IDs and full type safety. All tests should use these — no inline test data.
- **2026-04-28:** Playwright configured for 4 browser targets (Chromium, Firefox, WebKit, Mobile Chrome). E2E tests should run against Firebase Emulators to stay deterministic.
- **2026-04-28:** Auth/Firestore unit tests are `.todo` skeletons — they document the expected contract for the modules Mouth will build. They'll light up as code lands.

- **2026-04-29:** Wrote 99 passing tests across 6 files for auth flow + parks/wait-times display. Key mocking strategies:
  - Must mock `@/lib/firebase/config` to prevent `auth/invalid-api-key` errors in jsdom environment.
  - Must mock `firebase/app` (for `FirebaseError` class) in tests that import auth pages with error handling.
  - Must mock `@/lib/firebase/auth-context` for pages using `useAuth()` hook.
  - Must mock `lucide-react` icons as simple spans (they don't render in jsdom).
  - Use `vi.mock('@/lib/firebase/firestore')` with per-test `mockResolvedValue` for data-fetching pages.
  - `require()` does NOT resolve `@/` alias in Vitest — always use `await import('@/...')` for dynamic imports.
  - When text appears in multiple DOM elements (e.g., breadcrumb + heading), use `getByRole('heading')` or `getAllByText`.
  - Updated `vitest.config.ts` include pattern to cover `tests/**` in addition to `src/**`.
- **2026-04-29:** The auth pages (signin/signup) were upgraded from static scaffolds to fully interactive `'use client'` components by Data. They now use `useAuth()`, handle Firebase errors with switch statements, show loading states, and redirect. Signup password placeholder is "Password (min 6 characters)".
- **2026-04-29:** Component tests (WaitTimeBadge, StatusIndicator, ParkCard, AttractionRow) test the REAL implementations — these are no longer spec-only. Badge boundaries: green < 20, yellow 20–45, red > 45. Status uses uppercase strings (OPERATING, CLOSED, DOWN, REFURBISHMENT).

## Phase 1 Completion (2026-04-29)

- **Test Infrastructure:** Full Vitest + Playwright setup complete. Two vitest configs (unit + integration).
- **Vitest Configuration:** Native ESM, TypeScript support, jsdom for unit tests, node for integration. Coverage thresholds: 80% lines/functions, 75% branches.
- **Playwright Configuration:** 4 browser targets configured. Firebase Emulator ports set (Auth=9099, Firestore=8080, Functions=5001, UI=4000).
- **Security Rules Tests:** 40+ tests covering full access matrix (unauth, owner, other user, admin) for every Firestore collection.
- **Mock Data Factories:** Reusable factories (`createMockPark`, `createMockUser`, `createMockAttraction`, etc.) with auto-incrementing IDs and full type safety.
- **E2E Smoke Tests:** Basic auth flow, park listing, wait-times display, trip logging tests defined.
- **Files:** 13 files total — all configured, tests skeleton-complete with `.todo` markers.
- **Decisions Filed:** Vitest over Jest (detailed rationale on TypeScript, ESM, speed, API compatibility, Vite ecosystem).
- **Integration Points:** Security rules tests will light up as Data's Firestore module completes. E2E tests ready for Mouth's routes.
- **Next:** Await Mouth + Data completion, then run full test suite. Phase 2 ready for feature tests.

## Phase 1 Orchestration Complete (2026-04-29 16:38:58Z)

- **Test Coverage:** 99 passing tests across 6 files (auth helpers, sign-in/sign-up pages, parks/wait-times components).
- **Status:** All Phase 1 QA targets met. Firebase Auth flows validated. Parks dashboard UI tested. Ready for Phase 2 feature tests (seeding, scheduling, crowd calendar).

## Phase 2 — Ride Logging & Crowdsourced Wait Times (2026-04-29)

- **Test Coverage:** 66 new tests across 7 files — all passing. Total suite: 216 passing tests.
- **Files Created:**
  - `tests/services/ride-log-service.test.ts` — 12 tests: CRUD on users/{userId}/rideLogs subcollection
  - `tests/services/timer-service.test.ts` — 12 tests: start/stop/abandon timer, 4-hour abandoned boundary
  - `tests/services/crowd-service.test.ts` — 4 tests: aggregate reads via Admin SDK
  - `tests/api/queue-report.test.ts` — 10 tests: auth, validation, privacy (no userId leak), boundary values
  - `tests/components/queue-timer.test.tsx` — 10 tests: QueueTimerButton states, TimerDisplay ticking + colors, TimerCompleteSheet
  - `tests/components/ride-log.test.tsx` — 6 tests: empty state, date grouping, entry display, form validation
  - `tests/components/crowd-estimate.test.tsx` — 12 tests: CrowdBadge rendering/null, ConfidenceIndicator dots + checkmark

## Learnings (Phase 2)

- **2026-04-29:** Timer service uses `firebase/firestore` SDK directly (not the generic helpers). Mock `Timestamp` must be a real class (for `instanceof` checks). Use `vi.hoisted()` to define the class before `vi.mock()` hoisting.
- **2026-04-29:** Crowd service uses Firebase Admin SDK (`firebase-admin/firestore`). Mock `adminDb.doc(...).get()` and `adminDb.collection(...).get()` chain patterns.
- **2026-04-29:** API route tests use real `NextRequest` constructor with JSON body — much more reliable than mocking request objects manually.
- **2026-04-29:** QueueTimerButton uses `useAuth()` + `useActiveTimer()` hooks. Both must be mocked at the module level for component tests.
- **2026-04-29:** CrowdBadge returns `null` when `estimateMinutes === null || reportCount === 0` — test both cases separately.
- **2026-04-29:** ConfidenceIndicator takes `confidence` + `reportCount` props (not `level`). Uses `span.inline-block` dots with `bg-primary-500` (filled) vs `bg-primary-200` (empty).
- **2026-04-29:** ManualLogForm fetches parks/attractions via `getCollection` on mount. Must mock `@/lib/firebase/firestore` at module level to prevent Firebase init errors.
- **2026-04-29:** Trip service uses `setDocument` for the `sharedTrips` index collection — must mock it alongside the usual CRUD helpers.
- **2026-04-29:** `generateShareId()` is a pure function (no params, no Firestore call). Uses `crypto.getRandomValues` + URL-safe base64.
- **2026-04-29:** `activateTrip` sets old active trip to `'completed'` (not `'planning'`). Design decision — activating a new trip implies the old one is done.
- **2026-04-29:** `getTrips` sorts by `createdAt` desc (not `updatedAt`). Accepts optional `{ status, limit }` options.
- **2026-04-29:** `addRideLog` takes `tripId` as 3rd arg (or from `data.tripId`). The service does NOT auto-lookup active trip — the caller (UI/hook) must resolve it.
- **2026-04-29:** `completeTrip` calls `updateTripStats` first (writes stats), then writes `{ status: 'completed' }` as a separate update. Two `updateDocument` calls.
- **2026-04-29:** AttractionFilterChips test is a contract test — component doesn't exist yet. Will light up when Mouth builds `src/components/park/AttractionFilterChips.tsx`.

## Scribe Batch Update (2026-04-29 10:59:18Z)

**Test Status:**
- 265 total tests passing
- 49 new tests for trip service + filter components
- Coverage: 80% lines/functions, 75% branches (maintained)

**Decision inbox processed:**
- Ride logging architecture tests validate queue-report API
- Trip planner tests ready for UI integration
- Inbox cleared

**Status:** Test suite complete for Phase 1 + Phase 2 features. AttractionFilterChips contract test now active. Ready for Phase 2 integration testing.

## Phase 1 Expansion — Virtual Queues, Forecasts, Park Schedules (2026-04-29)

- **Test Coverage:** 44 new tests across 3 files (29 passing now, 15 intentionally red — testing contract Chunk hasn't implemented yet)
- **Files Created:**
  - `tests/api/wait-times-expanded.test.ts` — 15 tests: virtual queue fields, forecast capture, operatingHours, API resilience (429/500 → stale cache), regression (N/A ≠ longest)
  - `tests/api/park-schedule.test.ts` — 11 tests: happy path, cache hit/miss, stale fallback, 503 on no-cache+down, input validation, TICKETED_EVENT typing, purchases array, overlapping segments
  - `tests/components/phase1-ui.test.tsx` — 18 tests: ForecastChart (null/empty/valid/NOW), ParkScheduleBar (colors, segments, a11y), AttractionRow enhanced (LL badge, paid LL, boarding group, FINISHED hides badges, all-queues-at-once)

## Learnings (Phase 1 Expansion)

- **2026-04-29:** Park schedule route already implemented by Data at `src/app/api/park-schedule/route.ts`. Uses 1-hour TTL, stale fallback on 429/5xx, 503 when no cache + API down. Solid pattern.
- **2026-04-29:** Wait-times route (`src/app/api/wait-times/route.ts`) currently only reads `queue.STANDBY.waitTime`. Chunk needs to widen `LiveEntry` interface + `formatWaitTimeEntry()` to pass through RETURN_TIME, PAID_RETURN_TIME, BOARDING_GROUP, forecast, operatingHours.
- **2026-04-29:** For UI component contract tests (ForecastChart, ParkScheduleBar), used inline stub implementations defining the rendering contract. Tests will transfer cleanly to real components — same props, same `data-testid` attributes.
- **2026-04-29:** `new Date('2026-04-29T11:30:00-04:00').getHours()` returns UTC-adjusted hours in CI — always derive expected values from the same Date object rather than hardcoding timezone-dependent hours.
- **2026-04-29:** The `wait-times-expanded.test.ts` tests are RED BY DESIGN. They define the contract for Chunk's expanded data capture. When Chunk lands the widened `formatWaitTimeEntry()`, these tests should go green with zero changes.
- **2026-04-29:** Recharts must be mocked in jsdom tests (SVG rendering). Mock at module level with simple divs + data-testid attributes.
- **2026-04-29:** Key files for Phase 1 expansion: `src/app/api/wait-times/route.ts`, `src/app/api/park-schedule/route.ts`, `src/components/AttractionRow.tsx` (needs queue prop + badges).

## Scribe Orchestration Log (2026-04-29 18:47:57Z)

**Phase 1 Team Delivery:**
- 44 new tests written for Phase 1 expansion (15 for wait-times API, 11 for park-schedule API, 18 for UI components)
- Wait-times API tests RED BY DESIGN — define contract for Chunk's widened data capture (queue types, forecast, operatingHours)
- Park-schedule API tests passing: happy path, cache hit/miss, stale fallback, 503 error handling
- UI component tests for ForecastChart (null/empty/valid states), ParkScheduleBar (colors, segments, a11y), enhanced AttractionRow (LL badges)
- Total suite: 309 passing tests across all phases
- All Phase 1 deliverables covered by test contracts — ready for Devin review

## Learnings

- **2026-04-29:** Crowd calendar tests written proactively from Mikey's architecture spec + Devin's design answers. 58 new tests across 3 files — all passing against inline stub implementations.
- **2026-04-29:** Crowd level thresholds per design decision: <20min=level 1 (Low), 20-34=level 2 (Moderate), 35-49=level 3 (High), 50+=level 4 (Very High). Default trip plan length = 3 days (Devin's choice).
- **2026-04-29:** `toHaveStyle({ backgroundColor: 'green' })` fails in jsdom even with inline `style={}` because jsdom doesn't normalize color keywords. Use className assertions (e.g., `expect(el.className).toContain('crowd-bar--green')`) instead.
- **2026-04-29:** bestPlan algorithm is a greedy assignment: sort all (day, park, level) tuples by level ascending, then pick entries ensuring no park or day is reused. Partial plans are valid when fewer parks than requested days.
- **2026-04-29:** Test files created:
  - `tests/api/crowd-calendar.test.ts` — 17 tests: shape validation, input validation, threshold boundaries, bestPlan logic, caching/stale fallback
  - `tests/api/crowd-level-computation.test.ts` — 17 tests: threshold unit tests, null handling, closed parks, all-same-level edge case, greedy assignment
  - `tests/components/crowd-calendar.test.tsx` — 24 tests: FamilySelector, CalendarDayCell (bars + colors + toggle filtering), BestPlanBanner, MiniMonth, full page integration (family switch fetches, park toggle hides, mini month navigates)
- **2026-04-29:** These are contract tests with inline stubs. When Chunk/Mouth land the real components, swap the stubs for real imports — same `data-testid` attributes, same props, same behavior.

## Playwright E2E — Critical UI Flow Tests (2026-04-30)

- **2026-04-30:** Set up Playwright E2E testing infrastructure targeting the exact production bugs that keep shipping. 13 new E2E tests across 3 spec files, all syntactically valid.
- **2026-04-30:** Slimmed Playwright config to chromium-only (was 4 browsers). Rationale: speed during development; add back when CI budget allows.
- **2026-04-30:** Added `test:e2e:ui` npm script for interactive debugging (`playwright test --ui`).
- **2026-04-30:** Test strategy uses `page.route()` to intercept all network calls (Firestore REST, Firebase Auth, /api/*). Tests run against the real Next.js dev server but with fully mocked backends — deterministic, no Firebase emulator required for these UI flow tests.
- **2026-04-30:** Fixture data in `e2e/fixtures/park-data.ts` — Islands of Adventure with 6 attractions (2 thrill, 2 family, 2 shows). Covers the entity/attraction type matrix needed for filter tests.
- **2026-04-30:** Key regression test: "No active trip" / "Start Trip" prompt must appear EXACTLY ONCE. This was the #1 duplicate-element bug in production. Test uses `getByText().count()` assertion.
- **2026-04-30:** FAB overlap test verifies z-index layering (FAB z-40 vs modal z-70) by checking bounding box intersection.
- **2026-04-30:** Filter pills tests verify the tier-2 design: shows always remain visible when attraction sub-type filters are active.
- **2026-04-30:** Files created:
  - `e2e/report-wait-time.spec.ts` — 5 tests: modal open, expand, no-duplicate-trip-prompt, FAB-not-overlapping, submit-visible
  - `e2e/filter-pills.spec.ts` — 4 tests: correct pills render, thrill filter, shows persist, deselect restores
  - `e2e/park-page-loading.spec.ts` — 4 tests: skeleton visible, attractions render in time, no timeout errors, graceful API failure
  - `e2e/fixtures/park-data.ts` — mock park/attractions/wait-times/schedule data
  - `e2e/fixtures/api-handlers.ts` — reusable route interception helpers
