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
