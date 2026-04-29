# Test Strategy — Theme Park Wait Times

> **Owner:** Stef (Tester / QA Engineer)  
> **Created:** 2026-04-28  
> **Status:** Active  
> **Principle:** If it breaks in production, it should have broken in my tests first.

---

## 1. Testing Pyramid

We follow the standard testing pyramid — wide base of fast unit tests, narrower integration layer, thin E2E cap. Ratio target: **70 / 20 / 10**.

```
          ┌───────┐
          │  E2E  │  10% — Playwright critical paths
         ─┤       ├─
        ┌─┴───────┴─┐
        │Integration │  20% — Firebase Emulator Suite
       ─┤            ├─
      ┌─┴────────────┴─┐
      │   Unit Tests    │  70% — Vitest (pure logic, hooks, utils)
      └─────────────────┘
```

### What lives at each level

| Level | Scope | Examples | Runner |
|-------|-------|---------|--------|
| **Unit** | Pure functions, utilities, hooks (mocked deps) | `busyLevel.ts` scoring, `validation.ts` input checks, `timeFormat.ts` helpers, React hooks with mocked Firestore | Vitest |
| **Integration** | Firebase interactions, security rules, auth flows, Firestore reads/writes | Auth sign-up/sign-in against emulator, Firestore CRUD against emulator, security rules allow/deny, Cloud Function triggers | Vitest + Firebase Emulator Suite |
| **E2E** | Full user journeys in browser | Browse parks → view wait times, Sign up → log a trip, Submit crowd report → see it reflected | Playwright |

---

## 2. Coverage Targets

| Metric | Floor | Stretch |
|--------|-------|---------|
| **Line coverage** | 80% | 90% |
| **Branch coverage** | 75% | 85% |
| **Function coverage** | 80% | 90% |
| **Critical paths** | 100% | 100% |

**Critical paths (must be 100%):**
- Authentication flows (sign up, sign in, sign out, token refresh)
- Firestore security rules (all allow/deny cases)
- Crowd report submission + validation
- Wait time data integrity (confidence scoring, staleness detection)
- User data privacy (can't read other users' profiles/trips)

---

## 3. Unit Testing — Vitest

### Configuration

- **Runner:** Vitest (aligns with Next.js + TypeScript; faster than Jest)
- **Environment:** `jsdom` for component tests, `node` for pure logic
- **Coverage:** `@vitest/coverage-v8`
- **Path aliases:** Mirror `tsconfig.json` paths (`@/` → `src/`)

### What to unit test

| Module | Key tests |
|--------|-----------|
| `utils/busy-level.ts` | Crowd score computation: base scores, modifier stacking, clamping 1–10 |
| `utils/time-format.ts` | Time formatting edge cases: midnight, timezone boundaries, null inputs |
| `utils/validation.ts` | Input validation: wait time range (-1 to 300), required fields, email format |
| `lib/constants.ts` | Confidence thresholds, staleness windows, rate limits |
| `hooks/use-auth.ts` | Auth state transitions (mocked Firebase Auth) |
| `hooks/use-wait-times.ts` | Subscription setup, staleness detection, data transforms |
| `services/crowd-calendar.ts` | Rule-based scoring algorithm, modifier application |
| `services/reporting.ts` | Outlier detection, consensus logic, time-gating |
| `components/*` | Rendering with various props, loading/error states, user interactions |

### Patterns

```typescript
// Pure logic — no mocks needed
describe('busyLevel', () => {
  it('clamps score to 1–10 range', () => { ... });
  it('applies holiday modifier correctly', () => { ... });
});

// Hooks — mock Firebase, test state transitions
describe('useAuth', () => {
  it('returns null user when signed out', () => { ... });
  it('updates user state on sign in', () => { ... });
});

// Components — render with providers, assert DOM
describe('WaitTimeBadge', () => {
  it('shows "Closed" when waitMinutes is -1', () => { ... });
  it('shows warning icon when data is stale', () => { ... });
});
```

---

## 4. Integration Testing — Firebase Emulator Suite

### Why emulators

Firebase Emulators let us run Firestore, Auth, and Cloud Functions **locally** with zero cost, zero side effects, and deterministic behavior. No production data is touched.

### Emulator setup

| Service | Port | Purpose |
|---------|------|---------|
| Auth | 9099 | Test sign-up, sign-in, token verification |
| Firestore | 8080 | Test reads, writes, queries, real-time listeners |
| Cloud Functions | 5001 | Test triggers (crowd report validation) |
| Emulator UI | 4000 | Visual debugging during development |

### What to integration test

| Area | Tests |
|------|-------|
| **Auth flows** | Email sign-up creates user doc, Google sign-in links profile, sign-out clears session, duplicate email rejected |
| **Firestore CRUD** | Read parks (public), write crowd report (auth), read user profile (owner only), real-time subscription updates |
| **Security rules** | Full matrix — see Section 5 below |
| **Data pipeline** | Wait time writes update `currentWaitTimes`, historical log appends correctly |
| **Cloud Functions** | `onCrowdReport` trigger validates and scores submissions |

### Test lifecycle

```
beforeAll:  Start emulators (or connect to running instance)
beforeEach: Clear Firestore data (clean slate per test)
afterAll:   Stop emulators
```

---

## 5. Firebase Security Rules Testing

This is the **highest-priority integration test suite**. A misconfigured rule = data breach.

### Approach

Use `@firebase/rules-unit-testing` v3 with the Firestore emulator. Each test creates authenticated/unauthenticated contexts and asserts allow/deny on specific operations.

### Test matrix

| Collection | Operation | Unauth | Auth (owner) | Auth (other) | Admin SDK |
|------------|-----------|--------|-------------|-------------|-----------|
| `/parks/{id}` | read | ✅ Allow | ✅ Allow | ✅ Allow | ✅ Allow |
| `/parks/{id}` | write | ❌ Deny | ❌ Deny | ❌ Deny | ✅ Allow |
| `/parks/{id}/attractions/{id}` | read | ✅ Allow | ✅ Allow | ✅ Allow | ✅ Allow |
| `/parks/{id}/attractions/{id}` | write | ❌ Deny | ❌ Deny | ❌ Deny | ✅ Allow |
| `/parks/{id}/currentWaitTimes/{id}` | read | ✅ Allow | ✅ Allow | ✅ Allow | ✅ Allow |
| `/parks/{id}/currentWaitTimes/{id}` | write | ❌ Deny | ❌ Deny | ❌ Deny | ✅ Allow |
| `/waitTimeHistory/{id}` | read | ✅ Allow | ✅ Allow | ✅ Allow | ✅ Allow |
| `/waitTimeHistory/{id}` | write | ❌ Deny | ❌ Deny | ❌ Deny | ✅ Allow |
| `/crowdCalendar/{id}` | read | ✅ Allow | ✅ Allow | ✅ Allow | ✅ Allow |
| `/crowdCalendar/{id}` | write | ❌ Deny | ❌ Deny | ❌ Deny | ✅ Allow |
| `/users/{uid}` | read | ❌ Deny | ✅ Allow | ❌ Deny | ✅ Allow |
| `/users/{uid}` | create | ❌ Deny | ✅ Allow | ❌ Deny | ✅ Allow |
| `/users/{uid}` | update | ❌ Deny | ✅ Allow | ❌ Deny | ✅ Allow |
| `/users/{uid}` | delete | ❌ Deny | ❌ Deny | ❌ Deny | ✅ Allow |
| `/users/{uid}/trips/{id}` | read/write | ❌ Deny | ✅ Allow | ❌ Deny | ✅ Allow |
| `/crowdReports/{id}` | read | ✅ Allow | ✅ Allow | ✅ Allow | ✅ Allow |
| `/crowdReports/{id}` | create | ❌ Deny | ✅ (own uid, valid data) | ✅ (own uid) | ✅ Allow |
| `/crowdReports/{id}` | update | ❌ Deny | ✅ (author only) | ❌ Deny | ✅ Allow |
| `/crowdReports/{id}` | delete | ❌ Deny | ❌ Deny | ❌ Deny | ✅ Allow |

### Edge cases to cover

- Crowd report with `waitMinutes > 300` → deny
- Crowd report with `waitMinutes < -1` → deny
- Crowd report where `userId` doesn't match `auth.uid` → deny
- User trying to read another user's profile → deny
- User trying to write to another user's trips → deny
- Deeply nested paths: `/users/{uid}/trips/{tripId}/rideLogs/{logId}` owner-only

---

## 6. E2E Testing — Playwright

### Configuration

- **Browser targets:** Chromium (primary), Firefox, WebKit (Safari)
- **Base URL:** `http://localhost:3000` (Next.js dev server)
- **Strategy:** Test against Firebase Emulators — no production calls

### Critical user flows to test

| # | Flow | Steps |
|---|------|-------|
| 1 | **Browse parks** | Home → Parks list → Select Magic Kingdom → See attractions |
| 2 | **View wait times** | Park page → Live wait times tab → Verify ride statuses displayed |
| 3 | **Sign up + sign in** | Sign up page → Create account → Verify redirect to dashboard |
| 4 | **Submit crowd report** | Sign in → Park page → Report wait time → See confirmation |
| 5 | **Log a ride** | Sign in → Dashboard → Log ride → See in ride history |
| 6 | **Crowd calendar** | Calendar page → Select park → See crowd levels → Navigate months |
| 7 | **Mobile navigation** | Resize viewport → Bottom nav appears → Navigate via mobile nav |

### Smoke test (CI gate)

A minimal smoke test runs on every PR:
1. App loads without errors
2. Parks page renders at least one park
3. No console errors on critical pages

---

## 7. CI/CD Pipeline Integration

### PR Checks (every push)

```yaml
jobs:
  test-unit:
    # Vitest unit tests — fast, no emulators
    # ~30s target
    run: npm run test

  test-integration:
    # Start Firebase Emulators, run integration + rules tests
    # ~2 min target
    run: npm run test:integration

  test-e2e:
    # Start dev server + emulators, run Playwright
    # ~3 min target
    run: npm run test:e2e

  coverage:
    # Merge coverage reports, enforce 80% floor
    run: npm run test:coverage
    fail-if: coverage < 80%
```

### Merge to main

- All tests must pass
- Coverage must meet floor
- Security rules tests are a hard gate — never skip

### Nightly

- Full E2E suite across all browser targets
- Performance benchmarks (Lighthouse CI)
- Dependency vulnerability scan

---

## 8. npm Scripts

These scripts should be added to `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "firebase emulators:exec --only auth,firestore 'vitest run --config vitest.integration.config.ts'",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:rules": "firebase emulators:exec --only firestore 'vitest run tests/security-rules/'",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run --coverage && firebase emulators:exec --only auth,firestore 'vitest run --config vitest.integration.config.ts'"
  }
}
```

---

## 9. Test Data Strategy

### Factory functions

All test data is created via factory functions in `src/lib/test-utils/mock-data.ts`. This ensures:

- Consistent, realistic data across all tests
- Easy to override specific fields per test
- Type-safe (TypeScript generics)

### Seeding for E2E

E2E tests seed the Firebase Emulator with a known dataset before running:
- 2 parks (Magic Kingdom, EPCOT)
- 5 attractions per park
- Current wait times for all attractions
- 1 test user with profile and trip history
- 2 crowd reports

---

## 10. Security Testing Checklist

Beyond Firebase rules, we test:

- [ ] **Auth token validation** — expired tokens rejected, forged tokens rejected
- [ ] **Input sanitization** — XSS in user notes/display names, SQL-style injection in search
- [ ] **Rate limiting** — crowd report submission throttled per user
- [ ] **Data leakage** — user IDs not exposed in public API responses
- [ ] **CORS** — API routes only accept same-origin requests
- [ ] **Environment variables** — Firebase config keys are public-safe (no admin secrets in client bundle)

---

## 11. Tools & Dependencies

| Tool | Version | Purpose |
|------|---------|---------|
| **Vitest** | ^3.x | Unit + integration test runner |
| **@vitest/coverage-v8** | ^3.x | Code coverage |
| **@testing-library/react** | ^16.x | Component testing |
| **@testing-library/jest-dom** | ^6.x | DOM assertions |
| **@firebase/rules-unit-testing** | ^4.x | Security rules testing |
| **firebase-tools** | ^13.x | Emulator Suite CLI |
| **Playwright** | ^1.50 | E2E browser testing |
| **msw** | ^2.x | API mocking for unit tests (mock external APIs) |
