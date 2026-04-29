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
