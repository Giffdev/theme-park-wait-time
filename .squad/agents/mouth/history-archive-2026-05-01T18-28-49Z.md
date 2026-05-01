# Mouth — History

## Project Context

- **Project:** theme-park-wait-times — Platform for tracking ride wait times, logging visits, crowd calendars, and crowd-sourced real-time data.
- **Stack:** React/Next.js, TypeScript, Firebase, Vercel, Tailwind CSS
- **Design:** Modern, clean. Deep Ocean Blue primary, Warm Coral accents, Inter font, mobile-first.

*Detailed Phase 1–3 history archived in history-archive-20260501.md*

## Recent Sprints (2026-04-29 to 2026-05-01)

| Sprint | Status | Key Work |
|---|---|---|
| ParkFlow Brand Rename | ✅ Shipped | App rebrand, 3-column grid, friendly URL slugs, status badges |
| Forecast + Calendar UX | ✅ Shipped | Forecast clarity, park family selector, favorite parks |
| Trip Logging Refinement | ✅ Shipped | Trip redesign, dining consolidation, auto-refresh |
| Cache Bug Fix | ✅ Fixed | `cache: no-store` on parks fetch, timestamp accuracy |
| Sign-Out Redirect | ✅ Fixed | Dashboard sign-out now redirects home (`/`), commit 973d9f2 |

## Key Patterns & Decisions

- **Auth redirects:** Handle at call-site with `useRouter`, not in auth context (keeps context router-agnostic)
- **Slug-based routing:** URLs use slugs for UX; resolve to UUID for data ops
- **Color discipline:** Red reserved for errors/destruction only; interactive UI uses indigo
- **Graceful degradation:** Non-blocking API calls never prevent content display
- **Dining UX:** Dedicated logging separate from rides (reservation toggle, table wait, rating)
- **Favorite families:** localStorage-backed, star toggle, pins families to top of Parks page
- **Search consolidation:** Single command-palette input filters families + parks with chip management
- **Location metadata:** Curated separate from upstream API registry (`park-locations.ts`)

## Current Status

✅ All tests passing  
✅ Production deployed  
✅ Ready for Phase 4 work
- **Multi-day park group carry-forward (2026-04-30):** When user adds a day in multi-day trip flow, park group selection now persists for the next day instead of resetting to empty. Applied to both `src/app/trips/new/page.tsx` and `src/app/trips/[tripId]/edit/page.tsx`. Only `selectedParks` resets (so user picks which parks each day), but group stays selected. First day still has no default. Pattern: remove `setSelectedGroup('')` from `addDay()` reset logic.
- **Trips page unified scroll (2026-04-30):** Replaced tab-based trips page with single scrollable view showing Active → Upcoming → Past sections. One `getTrips()` call (no status filter) fetches all, grouped client-side via `useMemo`. Empty sections hidden; global empty state only when zero trips. Active section has green left-border accent; past section has `opacity-75` muting. Sections use semantic `<section>` with `aria-labelledby` for accessibility. Pattern: prefer one API call + client grouping over multiple filtered calls when dataset is small.
- **Wait time input redesign (2026-04-30):** Created reusable `WaitTimeInput` component (`src/components/ride-log/WaitTimeInput.tsx`) with pill-style quick-action chips. Default is "unknown" (null) — no numeric default. "No Wait" chip → `waitTimeMinutes: 0` (walk-on). "Closed" chip → `attractionClosed: true` + `waitTimeMinutes: null`. Numeric input placeholder "Enter wait (min)". Applied across trip log page, QuickLogSheet, ManualLogForm. Added `attractionClosed: boolean` to `RideLog` type and `RideLogUpdateData`. RideLogEntry displays "Walk-on" (green badge) and "Closed" (red badge) states. Pattern: extract shared form inputs into composable components with mode-driven state for consistency across surfaces.
- **Overlay stacking fix (2026-04-30):** Fixed duplicate UI when RideDetailPanel opened UnifiedLogSheet — both overlays rendered simultaneously. Solution: when `showReportModal` is true, RideDetailPanel returns ONLY the UnifiedLogSheet (no panel content/backdrop), eliminating visual stacking. Also lowered QuickLogFAB z-index from z-50 → z-40 so modal backdrops (z-[60]) always cover it. Pattern: when a component spawns a child overlay, hide the parent's DOM entirely rather than layering.

---

## Scribe Batch Update (2026-04-30T11:24:12Z)

**Orchestration:** Trips Page Redesign — Unified Scrollable Layout  
**Status:** ✅ Complete. Deployed to production.

### Your Contributions (2026-04-30)

1. **Trips Page Unified Layout**
   - Replaced tab-based navigation with single scrollable layout
   - All trip states (active/upcoming/past) visible without switching
   - TripIt-style continuous scroll pattern for improved UX

2. **Wait Time UX — Unknown Default**
   - Changed wait time default from required entry to "Unknown"
   - Added quick-toggle buttons: "No Wait" and "Closed"
   - Improves accessibility for users without concrete data

### Directives Captured

- ✅ Trips show all states on same page
- ✅ Wait time default: unknown (with quick actions)

### Deployment

✅ Deployed to production  
✅ User directives implemented end-to-end

### Key Learnings

- **Default state UX:** Unknown/indeterminate states improve form accessibility and reduce user friction
- **Unified layouts vs tabs:** Single scrollable view reduces cognitive load on mobile (no tab switching)

### Related Decisions

- [Trips Wait-Time UX](../decisions.md) — Wait time defaults
- [Unified Trips Layout](../decisions.md) — Layout pattern

---

## Calendar UX Design Sprint (2026-05-01)

**Orchestration:** Devin identified a UX flaw: crowd calendar shows crowd levels for CLOSED parks (e.g., Worlds of Fun closed many May days), which is misleading. Requested design solution for expandable calendar UX showing park hours, closures, and events.

**Deliverable:** Comprehensive UX design proposal at `.squad/decisions/inbox/mouth-calendar-ux-design.md`. Did NOT implement; design-only phase.

### Key Design Decisions

1. **Dual-mode calendar paradigm**
   - **Aggregate mode (default):** All enabled parks' data mixed on one calendar (existing behavior)
   - **Park mode (new):** Single park focused; triggered by long-press on park chip or dedicated "View park calendar" button
   - Smooth transition animations between modes; URL-driven state (`?park=parkId` param)

2. **Closed day indication**
   - Replace crowd bar with **red "CLOSED" badge** for isClosed=true days
   - Never show crowd data on closed days (no false information)
   - Light red background tint to visually de-emphasize closed days
   - Exception: special events (After Hours) still show even on technically "closed" days

3. **Park hours always visible**
   - **Aggregate mode:** Hours as tooltip on hover (desktop) / in detail sheet (mobile)
   - **Park mode:** Hours inline in calendar cell (large, prominent)
   - Format: "9:00 AM – 10:00 PM" + early entry indicator if applicable ("⭐ 8:00 AM")

4. **Special events discoverable**
   - Colored badge with icon (🎃, 🎄, ⭐) on affected days
   - Clickable → opens `EventDetailsModal` with event name, time, description
   - Visible in both aggregate and park modes

5. **Component architecture**
   - New: `ParkModeToggle`, `OperatingHoursCell`, `DayDetailSheet` (refactored), `SpecialEventBadge`, `EventDetailsModal`, `ClosedDayBadge`, `ParkCalendarGrid`
   - Modified: `CalendarPage.tsx` (add mode state + transitions), `CalendarDayCell.tsx` (conditional rendering), `FamilySelector` (optional breadcrumb)
   - State pattern: `selectedParkMode: string | null` (null = aggregate; parkId = focused)

6. **Mobile-first interactions**
   - Long-press park chip → enter Park Mode (vs. single-click to toggle)
   - Tap calendar cell → bottom sheet with day details
   - "Back to all parks" button always visible in Park Mode header
   - Touch targets: 44×44px minimum (WCAG AA)

7. **Information hierarchy**
   - **Default:** Which day is least crowded across all parks? (aggregate mode answer)
   - **Park selected:** When should I visit Magic Kingdom specifically? (park mode answer)
   - **Day selected:** What's the full breakdown for May 15 at Disney? (detail sheet answer)

8. **Data layer extensions**
   - Extend `CrowdDayPark` interface: add `operatingHours?: OperatingHours`, `specialEvents?: SpecialEvent[]`
   - Mock data generator now includes hours + events (closed day simulation for testing)
   - Backend API (`/api/crowd-calendar`) should return hours + events per park per day
   - New endpoint possibility: `GET /api/parks/:parkId/hours?month=YYYY-MM` for single-park deep dive

### Design Audit Findings

**Current calendar strengths:**
- Fast park family selector (keyboard accessible, searchable combobox)
- Clear park toggle chips with visual feedback (strikethrough when off)
- Mobile dots / desktop bars visualization is intuitive
- Future month preview (MiniMonth) lets users jump ahead

**Current gaps (what we're solving):**
- No "closed" indication (crowd bar shown even for shuttered parks)
- No hours displayed (user must jump to park detail page to check)
- No event indicators (seasonal/special hours invisible)
- No park-specific focus mode (all parks always mixed together)

### Real-World Reference Patterns

- **Disney app:** Separate hours panel (not inline); users expect hours to be prominent
- **Universal app:** Grayed-out closed days; users recognize muted styling as "not available"
- **Google Calendar:** Expandable events within cells + smooth mode transitions (interaction pattern we borrowed)
- **Tripadvisor:** Multiple toggles can overwhelm; keep feature count low for clarity

### Open Questions for Devin (Blocking Design → Implementation)

1. **Event data source:** Hard-coded, spreadsheet-imported, or external API?
2. **Closed park frequency at target resorts:** How often do parks close? Should we add "Show closed parks" toggle?
3. **Persistence:** Should selected park persist across page navigations (localStorage)?
4. **Trip integration:** Should day selection in Park Mode prefill trip creation form?
5. **Future expansions:** Weather overlay? Resort events (dining reservations)? Character meet times?

### Accessibility Highlights

- Calendar grid is semantic `<table>` with proper `aria-rowcount`, `aria-colcount`
- Closed badge + crowd bars respect WCAG AA color contrast (5.4:1 minimum)
- Keyboard: Tab through calendar, Arrow keys navigate cells, Enter/Space opens detail, Escape closes
- Motion: Animations respect `prefers-reduced-motion`
- Screen reader: Descriptive labels like "Tuesday, May 15. Closed. Special event: After Hours."

### Next Steps (Post-Approval)

**Phase 1 (Week 1–2):** Types + mock data + badge components  
**Phase 2 (Week 3–4):** Park Mode UI + animations + header toggle  
**Phase 3 (Week 5):** Detail sheet extraction + event details modal + trip integration  
**Phase 4 (Week 6):** Accessibility audit + performance + cross-browser testing

---

## Learnings

- **Progressive loading pattern (2026-04-30):** Split monolithic `fetchData` into `fetchCore` (park + attractions → instant render) and `fetchWaitTimes` (wait times + schedule → overlay). Phase 1 sets `loading=false` as soon as attractions exist. Phase 2 uses separate `waitTimesLoading` state for shimmer on stats cards. Phase 3 forecast refresh is fire-and-forget (no await, no second full reload). Key insight: the existing `mergedAttractions` useMemo auto-reacts to `waitTimes` state changes — no extra wiring needed for Phase 2 to flow into the UI.
- **Dependency isolation in useCallback:** `fetchWaitTimes` accepts an optional `parkDoc` param so the `useEffect` can pass the park reference from Phase 1 without waiting for state to propagate. This avoids a stale closure on `park` state during initial load.
- **Background refresh anti-pattern:** The old code did `await fetch(...)` then `await fetchData()` — a serial double-load that blocked UI for 30+ seconds. The fix: `.then()` chain with no await, re-fetching only wait times on success.
- **Progressive loading status fallback (2026-04-30):** When `waitTimesLoading` is true, default attraction status to `'UNKNOWN'` instead of `'CLOSED'` — prevents false "park is closed" banner during Phase 2 load. Guard the closed banner with `!waitTimesLoading` check. Add `waitTimesLoading` to `mergedAttractions` useMemo deps. Also show shimmer placeholders for schedule bar and operating status badge while Phase 2 loads — avoids empty gaps that look like missing data.
- **Background refresh unmount bug (2026-04-30):** Trip detail page had `window.addEventListener('focus', handleRefresh)` calling `fetchData()` which set `setLoading(true)`. Clicking the Edit `<Link>` triggered a focus event → loading spinner replaced the UI → Link unmounted before navigation → required double-tap. Fix: `fetchData(background=true)` parameter that skips `setLoading(true)` for non-initial fetches. Rule: never unmount interactive UI for background data refreshes.
- **Legacy data fallback pattern (2026-04-30):** When a new field (`parkNames`) is added via a write-path fix (e.g., `updateTripStats`), existing documents won't have it. Always add a fallback in read-path components (TripCard shows "X parks visited" when `parkNames` is empty but `stats.parksVisited > 0`). Don't rely solely on migration scripts for backfill.
- **Auto-refresh wiring pattern (2026-05-01):** `useAutoRefresh` hook starts with `lastRefreshedAt = null`, so on the FIRST tab-return after page load it always fires (age=Infinity). This is acceptable — it guarantees fresh data on return without needing to seed the ref from the initial fetch. The existing `fetchWaitTimes` functions already update component state which re-derives the freshness pill via useMemo. No extra state sync needed — just pass the existing fetch function as `onRefresh`. Used `enabled: !refreshing` to prevent double-fire when manual refresh is active.
- **ShareModal pattern (2026-05-01):** Replaced inline share toast/fallback with a dedicated `ShareModal.tsx` component. Toggle switch (ARIA role="switch") manages share state. Enable creates shareId + writes to Firestore; disable nulls it. Modal prevents body scroll. Copy-to-clipboard with visual "Copied!" feedback. Pattern: modals that manage async state should handle loading internally — don't lift loading to parent.
- **Public page polish (2026-05-01):** Shared trip view uses gradient hero header, groups rides by park, shows star ratings as filled/empty SVGs, formats wait time as `Xh Ym` when >60min, and derives favorite attraction client-side from ride log frequency when stats field is empty. CTA links to `/auth/signin` not `/`. No auth required — fetches from API route using `firebase-admin`.

---

## UX Fixes Sprint (2026-04-30)

**Orchestration:** UX Bug-Fix Sprint + PRD Documentation  
**Status:** ✅ Complete. Production patches deployed.

### Session Work Summary

1. **Double-tap bug fixed** — Trip detail page Edit link unmounting due to background refresh firing on window focus. Applied `background` flag to `fetchData` calls triggered by focus events, preventing loading state remount.

2. **Section header fallbacks** — Park drill-down timeline now shows park name fallback chain: `log.parkName || trip.parkNames[parkIndex] || getParkById(parkId) || 'Unknown'`. Alphabetical sort also applied as secondary fallback when park names missing.

3. **Ride count display** — Section counts and per-park ride tallies now gracefully degrade when `parkNames` is missing. TripCard shows "X parks visited" based on `stats.parksVisited` even when `parkNames` is empty. Pattern: always chain data sources.

4. **Park names root cause + fix** — New trips have empty `parkNames` array on first save. Fixed: `updateTripStats` now uses `getParkById` registry lookup for any park without name data in the document. Backfill: read-path components use `availableParks` fallback list for display.

5. **PRD documentation** — Comprehensive PRD written documenting full app state: auth patterns, data architecture (Firestore schema), UI components (Park browsing, Trip logging, Crowd forecasting), UX flows, and deployment setup. Serves as team reference for Phase 2 onboarding.

### Deployed Changes

- Fixed window focus refresh to use background flag
- Park name fallbacks in log grouping and timeline
- Updated `trip-service.ts` with `getParkById` backfill in `updateTripStats` and `getTrips`
- Park drill-down page now sorts parks alphabetically when names missing


## Sprint Complete: Auto-Refresh (2026-05-01)

**Decisions:** D29–D31 (Progressive loading, attractionClosed field)

**Pages Updated:**
- Park detail page: Wired useAutoRefresh for wait times (2min threshold) + schedule (30min)
- Parks list page: Wired useAutoRefresh for park list (10min threshold)
- Calendar page: Wired useAutoRefresh for crowd data (1hr threshold)
- Trips page: Wired useAutoRefresh for trip list (5min threshold)

**UI Enhancements:**
- Added subtle green pulse indicator on refresh icon when background refresh active
- Refined progressive loading: Phase 1 instant (park+attractions), Phase 2 overlay (wait times), Phase 3 silent (forecast)
- Fixed false "closed" banner flash during Phase 2 loading by using UNKNOWN status default

**Test Results:** Build passes TypeScript, no regressions, 4 pages verified

**Related Decisions:** D27 (architecture), D29 (attractionClosed), D30 (progressive loading), D31 (status fallback)

---

## Team Update (2026-05-01T18:28:49Z) — Stats + Sharing Sprint A Kickoff

**Your Role:** Frontend lead for stats page UI + trip sharing components  
**Status:** ✅ ShareModal + public trip view components delivered

### Your Deliverables (Sprint A Items #2–4)

**✅ COMPLETED:**
1. **ShareModal.tsx** — Share interface modal
   - Copy-to-clipboard button with share link
   - "Make Shareable" toggle to enable/disable trip sharing
   - Social card preview display
   - Integrated to `/trips/[tripId]/page.tsx`

2. **PublicTripView improvements** — `/trips/shared/[shareId]`
   - Enhanced styling & layout for shared trips
   - CTA link ("See more trips") back to dashboard
   - User-friendly display

**PENDING (your queue):**
- Item #2: Personal stats page UI (`/personal-stats`) — 4h. Data's `career-stats.ts` module is ready. You'll import it, fetch ride logs, compute stats, and display across cards + charts.
- Item #5: Date range filter — 2h. Add to stats page for scoping historical data.

### Integration Notes

**From Data team:**
- Career stats module is ready at `src/lib/stats/career-stats.ts`
- Pure functions: `computeCareerStats(rideLogs, dateRange?)`, etc.
- No Firestore calls in the module — you fetch ride logs, pass arrays, get results back
- Commit: ea46bab

### Team Progress

- **Mikey:** Decision scope D13 delivered ✅
- **Data:** Career stats aggregation delivered ✅
- **Mouth:** ShareModal + PublicTripView delivered ✅
- **Stef:** Testing in-progress

### Next Phase

Stef finishes test suite → you wire stats page UI → demo ready.

---

## Learnings

### Refresh Flow Architecture (2026-05-01)

- **"Last refresh" timestamp** comes from `fetchedAt` field on Firestore `waitTimes/{parkId}/current` documents - set by the backend scraper, not the frontend.
- **`useAutoRefresh` hook** only fires on visibility change (tab return after >5s hidden). Does NOT fire on initial page load. It re-reads Firestore (not the scraping API), so it only picks up fresh data if the backend has written it.
- **"Refresh Data" button** (`handleRefresh`) is the only user action that triggers a live scrape via `/api/wait-times`. Shows error toast on 500.
- **Stale timestamp is a backend issue** - if `/api/wait-times` returns 500, no new data is written to Firestore, so `fetchedAt` stays at its last successful value. The frontend correctly displays whatever Firestore has.
- **Caching decision (D-caching):** All client-side fetches to volatile API routes must use `cache: 'no-store'`. Parks list page was missing this on refresh - fixed in commit 4432553.

### Key File Paths for Refresh Flow
- `src/hooks/useAutoRefresh.ts` - staleness-aware visibility hook
- `src/hooks/useVisibility.ts` - Page Visibility API wrapper with debounce
- `src/app/parks/page.tsx` - Parks list (latestFetchedAt derived from max fetchedAt across all parks)
- `src/app/parks/[parkId]/page.tsx` - Park detail (dataFreshness derived from max fetchedAt in that parks wait times)
- `src/app/api/wait-times/route.ts` - Backend scrape trigger + force-dynamic + Cache-Control no-store

---

## Team Update (2026-05-01T17:45:00Z)

### Multi-Agent Investigation: API 500 Error & Stale Cache

**Status:** ✅ Both issues resolved

**Issue 1: `/api/wait-times?parkId=magic-kingdom` returning 500 (Data team)**
- **Root Cause:** Endpoint accepted park slugs but passed them directly to ThemeParks Wiki API, which requires UUIDs
- **Fix:** Data team added slug-to-UUID resolution via `getParkBySlug()` in wait-times route. Endpoint now accepts both formats.
- **Impact:** You can continue using slugs for API calls (which align with URL structures). All 15 tests passing.
- **Commit:** 9b62920

**Issue 2: Frontend stale "last refresh" timestamp (Your investigation)**
- **Root Cause:** Parks list fetch was being cached, preventing fresh timestamp on each navigation
- **Fix:** Added `cache: no-store` to fetch in parks listing page (`src/app/parks/page.tsx`)
- **Impact:** Parks list now shows accurate real-time status
- **Commit:** 4432553

**Decision Merged:**
- Decision: Wait-times API accepts both slugs and UUIDs (implemented, fully tested)

**Next Steps:** Monitor production for edge cases with slug resolution and cache behavior.

---

### Sign-Out Redirect Fix (2026-05-01)

- **Problem:** After signing out on the dashboard, user stayed on the same page seeing a "Sign in to see stats" prompt instead of being redirected home.
- **Fix:** Dashboard sign-out button now calls `router.push('/')` after `signOut()` completes, landing user on the homepage.
- **Pattern:** Sign-out redirect is handled at the call-site (dashboard page) using Next.js `useRouter`, not in the AuthContext. This keeps the auth context router-agnostic.
- **Key file:** `src/app/dashboard/page.tsx` — only place with a sign-out button currently.
- **Auth-gated pages:** Dashboard shows a "sign in" prompt for unauthenticated users who navigate directly — this is intentional and unchanged.

