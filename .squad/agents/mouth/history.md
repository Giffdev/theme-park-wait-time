# Mouth — History

## Project Context

- **Project:** theme-park-wait-times — Platform for tracking ride wait times, logging visits, crowd calendars, and crowd-sourced real-time data.
- **Stack:** React/Next.js, TypeScript, Firebase, Vercel, Tailwind CSS
- **Design:** Modern, clean. Deep Ocean Blue primary, Warm Coral accents, Inter font, mobile-first.

## Current Sprint — Stats Dashboard + Trip Sharing (2026-05-01)

**Your Role:** Frontend lead for stats page UI + trip sharing components  
**Status:** ✅ ShareModal + public trip view components delivered

### Deliverables (Sprint A Items #2–4)

**✅ COMPLETED:**
1. **ShareModal.tsx** — Share interface modal
   - Copy-to-clipboard button with share link
   - "Make Shareable" toggle to enable/disable sharing
   - Social card preview display
   - Integrated to `/trips/[tripId]/page.tsx`

2. **PublicTripView improvements** — `/trips/shared/[shareId]`
   - Enhanced styling & layout for shared trips
   - CTA link ("See more trips") back to dashboard
   - User-friendly display

**PENDING (your queue):**
- Personal stats page UI (`/personal-stats`) — 4h. Import `career-stats.ts`, fetch ride logs, display stats.
- Date range filter — 2h. Add to stats page for scoping data.

### Integration Notes

**From Data team:**
- Career stats module ready: `src/lib/stats/career-stats.ts`
- Commit: ea46bab
- Pure functions: `computeCareerStats()`, etc. — pass ride log arrays, get results

---

## Recent Sprints Completed

| Sprint | Status | Key Work |
|---|---|---|
| ParkFlow Brand Rename | ✅ | Rebrand, 3-column grid, friendly URLs, status badges |
| Forecast + Calendar UX | ✅ | Forecast clarity, park family selector |
| Trip Logging Refinement | ✅ | Trip redesign, dining consolidation |
| Cache Bug Fix | ✅ | `cache: no-store` on parks fetch |
| Auto-Refresh Wiring | ✅ | Hooks on 4 pages, green pulse indicator |

## Key Patterns & Decisions

- **Auth redirects:** Handle at call-site with `useRouter`
- **Slug-based routing:** URLs use slugs; resolve to UUID for data ops
- **Graceful degradation:** Non-blocking API calls never prevent display
- **Color discipline:** Red reserved for errors/destruction
- **Favorite families:** localStorage-backed, star toggle

## Current Status

✅ All tests passing  
✅ Production deployed  
✅ Ready for stats page wiring

*Full history: see history-archive-2026-05-01T18-28-49Z.md*

## Learnings

- **2026-05-01:** Closed-day calendar UI: When adding optional fields to existing types, always make them `?` optional for backward compat with existing API consumers and mock data. The `status?: ParkDayStatus` pattern lets old data (no status field) gracefully default to 'OPEN' via `park.status ?? 'OPEN'`.
- **2026-05-01:** Mobile-first calendar badges: Red ✕ dots at 8px (2 w-2) are visible but tight; the expanded bottom sheet is where users actually read park status. Keep cell indicators minimal, detail in the overlay.
- **2026-05-01:** Mixed-state aggregate: When some parks are closed and some open, aggregate crowd level must only factor open parks. Show "X of Y parks closed" note so users understand the context.

---
## 2026-05-01 Team Spawn

Team session initiated with background agents. Decisions merged:
- Park Hours & Closures Data Strategy (P0) — mikey
- Expandable Calendar UX Paradigm — mouth
- Mobile-First Directive applied (user requirement)

Tester (stef) reported: 45 tests written (25 career-stats, 20 ShareModal), all passing.

## 2026-08-11 Cross-Agent Learnings — Mouth

**State Machine Clarity Prevents Data-Trust Failures**
Treating attractions omitted from wait-time snapshots as `UNKNOWN` (not `CLOSED`) was conceptually simple but architecturally important. It prevented users from seeing false ride closures during permission failures or stale data gaps. The distinction between "closed by the park", "unknown status", and "stale data" must be explicit in the UI.

**Freshness Signaling Must Be Visible**
Invisible staleness has caused confusion in competitor products. The two-minute wait-time freshness indicator combined with explicit stale markers lets users understand why data looks old. This transparency builds trust more than hiding staleness ever could.

**Brand Unification During Active Development Is Possible**
Migrating from ParkFlow to ParkPulse while preserving user preferences (favorites, last park) required treating localStorage keys as an API boundary. The migration logic (`getPreferredPark()` checking both old and new keys) let us clean up the brand without data loss. This pattern applies to other storage migrations too.

---


## 2026-08-12 — Post-Login Redirect, Initial-Arrival Refresh, Park-Detail Error Classification

Fixed three user-reported issues (requested by Scribe, design review from a prior session):
1. Sign-in/sign-up redirected to `/dashboard`; now redirect to `/parks`. Updated the placeholder "spec" tests in `tests/auth/signin.test.tsx` / `signup.test.tsx` into real assertions (form submit → `router.push('/parks')`; already-authenticated → `router.replace('/parks')`).
2. `useAutoRefresh` only checked staleness on hidden→visible tab transitions, never on mount — so arriving at `/parks` or a park detail page could show an old cached snapshot indefinitely. Added an opt-in `initialDataAge` option: hook fires one non-blocking refresh on mount if the data already on screen is stale, sharing the same in-flight guard as the visibility check (no double-fire), and seeds the staleness clock from the real data timestamp instead of treating "never refreshed by this hook" as infinitely stale. Also added `lastRefreshError` to the hook's return so a failed background refresh can be surfaced without ever discarding last-known-good data. Wired into parks listing (10 min threshold) and park detail (2 min threshold) using their existing `onRefresh` callbacks — no new API calls.
3. Alton Towers showed "Park details unavailable" immediately on click. Root cause: `fetchCore` lumped the park-document fetch and the attractions-collection fetch into one try/catch, so ANY failure downstream of finding the park (e.g. attractions query throwing) was shown as if the whole park didn't exist. Split into independent `fetchPark` / `fetchAttractions` phases with separate error states (`coreError` vs `attractionsIssue`), each with its own classified message (permission/network/unknown) and its own retry button. The park now renders as found even when only its attraction directory fails. Did not touch Data-owned backend/seed files — this only fixes frontend misclassification of the failure Data is separately investigating.

**Learning:** When a page fetches multiple independent resources in one function with one try/catch, a failure in resource B masks resource A having succeeded. Split fetches by resource so partial failures get partial, accurate error UI instead of a blanket "everything is broken" message.

**Validation:** `npx tsc --noEmit` clean. Full test suite: 569 passed, 58 todo, 0 failed. `npm run build` succeeds (pre-existing lint warnings only, unrelated to this change).

---


## 2026-08-12 (follow-up) — Crowd Calendar Canonical Identity Boundary

Data's backend fix made schedule lookups resolve slugs to canonical ThemeParks Wiki UUIDs, and real/computed `/api/crowd-calendar` responses now emit UUID-keyed `parkId`s. `src/app/calendar/page.tsx` still filtered/grouped by `PARK_FAMILIES` slugs, a latent mismatch flagged by Data during their validation (not yet user-visible since placeholder data is still slug-keyed). Added a single `normalizeParkId` boundary that reuses the existing `resolveScheduleParkId` helper (slug→UUID, no new registry/heuristics) applied once at the fetch boundary (`normalizeFamilyCrowdMonth`) and to `enabledParks` seeding — filtering/grouping now always operates in canonical-UUID space, while slugs stay user-facing (chip labels, `/parks/{slug}` links). Backward compatible with legacy slug-keyed cache entries still inside the 6h `/api/crowd-calendar` cache TTL (normalizer maps them to the same canonical UUID). Only file touched: `src/app/calendar/page.tsx` (plus tests) — no Data-owned files edited.

**Learning:** When a backend contract migrates an id format (slug → canonical UUID) but a legacy cache/rollout window still serves the old format, normalize once at the single point data enters the frontend rather than special-casing every consumer — makes both formats transparently interchangeable and the fix trivially backward-compatible.

**Validation:** `tsc --noEmit` clean. Full suite: 592 passed, 58 todo, 0 failed. `npm run build` succeeds. New `tests/calendar/crowd-calendar-identity.test.tsx` (4 tests, using the real `CalendarDayCell` so the actual filter executes) + fixed `crowd-calendar-disclosure.test.tsx`'s constants mock (added missing `resolveScheduleParkId`).

Decision filed: `.squad/decisions/inbox/mouth-crowd-calendar-identity-boundary.md`.

---


## 2026-08-14 — Crowd-calendar request ordering and canonical identity

Added request-id guarding so the calendar only accepts the latest family/month refresh response. Combined with the earlier UUID normalization boundary, stale responses can no longer overwrite the current selection or make the active calendar appear empty while a slower request finishes.
