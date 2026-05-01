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
