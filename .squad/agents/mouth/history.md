# Mouth — History

## Project Context

- **Project:** theme-park-wait-times — A platform for theme park visitors to track ride wait times, log visits, plan trips with crowd calendars, and crowd-source real-time wait data.
- **Stack:** React/Next.js, TypeScript, Firebase, Vercel, Tailwind CSS
- **User:** Devin Sinha
- **Design direction:** Modern, clean, data-focused but exciting. Deep Ocean Blue primary, Warm Coral accents, Inter font family. Mobile-first. Better UX than thrill-data.com.
- **PRD color scheme:** oklch-based triadic palette with WCAG AA+ contrast ratios defined.

*Detailed history of Phase 1–3 UI implementation archived in history-archive.md.*

---

## Scribe Batch Update (2026-04-29T22:06:00Z)

**Orchestration:** ParkFlow Rename + Parks Page Redesign  
**Status:** ✅ Complete. Deployed to production.

### Your Contributions

1. **ParkFlow Brand Rename**
   - Renamed app from "ParkPulse" to "ParkFlow" across all UI surfaces, metadata, constants, tests
   - Brand name now consistent across layout, footer, auth pages, about page, shared trips
   - Updated `APP_NAME` constant and all title templates

2. **Parks Page Redesign**
   - Migrated from dense 5-column grid to spacious 3-column layout (`grid-cols-3`)
   - Container max-width `max-w-6xl` for optimal readability
   - Added "View Park →" CTA to ParkCard (hover animation, improves discoverability)
   - Added coverage summary at page bottom (shows resort groups, parks, theme/water park counts)

3. **Friendly URL Slugs**
   - Migrated URLs from UUIDs (`/parks/75ea578a-adc8...`) to human-readable slugs (`/parks/magic-kingdom`)
   - Park detail page queries by slug, resolves to UUID for data ops
   - Attraction detail pages fully support slug-based routing
   - Updated ActiveTimer interface with optional `parkSlug` field (backward-compatible)

4. **Park Status UX Pattern**
   - Added open/closed status to park listing cards
   - Graceful degradation: `/api/park-hours` is non-blocking; missing data doesn't break cards
   - Closed parks muted with subtle tint (`bg-primary-50/60`), remain visible/clickable
   - Timezone display as abbreviations (ET, CT, PT) for compact cards
   - Detail page open/closed computed client-side from schedule.segments

5. **Parks Page Layout & Location Data**
   - Container widened to `max-w-[1600px]` for ultrawide monitors
   - Progressive responsive grid: 1→2→3→4→5 columns (lg: 3 cols instead of 4)
   - Added geographic location metadata (city/state/country) to park cards
   - Integrated location-based search
   - Mapped location data to `src/lib/parks/park-locations.ts` (curated, separate from registry)

### Decisions Processed

- Friendly URL Slugs for Parks and Attractions
- Park Status UX Pattern  
- ParkFlow Rename + Parks Page Redesign
- Parks Page Layout & Location Data

### Tests & Deployment

✅ All tests passing  
✅ No breaking changes  
✅ Data contracts unchanged  
✅ Deployed to production with Data team  

### Key Handoff Notes

- **Location gaps:** New park destinations need entry in `park-locations.ts`
- **SEO:** External refs should use "ParkFlow" branding
- **Dependencies:** Requires Data's `/api/park-hours` endpoint

---

## Learnings & Key Context

- **Server vs Client components:** Extract auth-dependent sections into client components using `useAuth()` hook; keep page layout as server component
- **Slug-based routing:** Firestore queries use slug field for UX-friendly URLs; resolve to UUID for data operations
- **Graceful degradation:** Non-blocking API calls (schedule, hours) should not prevent primary content display
- **Progressive responsive grid:** Use Tailwind breakpoints strategically; lg:grid-cols-3 works better at 1280px than lg:grid-cols-4
- **Location metadata:** Keep curated location data separate from upstream API registry structure
- **Favorite park families (2026-04-29):** Added localStorage-based favorites (`parkflow-favorite-families` key) that pin families to top of Parks page. Stores `familyId` values (not names) for stability. Star icon toggle (lucide `Star`, amber fill when active). Sorted: favorites alphabetical first, then non-favorites alphabetical. No page jump — uses CSS transition on icon color. Name↔ID mapping built from `DESTINATION_FAMILIES` registry at module level.
- **Homepage auth redirect (2026-04-29):** Converted `src/app/page.tsx` to client component with `useAuth()` + `useRouter()`. Authenticated users get `router.replace('/parks')` — returns `null` during loading/redirect to avoid flash. FeatureCards merged "Log Your Trip" + "My Ride History" into single card (uses "My Ride History" description), grid now `lg:grid-cols-3`.
- **Location display deduplication (2026-04-29):** Removed per-card location from parks listing (redundant within family groups — kept on family header only). Added location + family membership to park detail page header using `MapPin` icon + "Part of [destination] · [family]" pattern. Uses `getLocationByDestinationId`/`formatLocation` and `DESTINATION_FAMILIES.find()` for lookup.
- **Red purge for interactive chrome (2026-04-29):** User dislikes red in non-error UI. Changed Stop Timer button from `bg-red-500` → `bg-indigo-500` (interactive, not destructive). Changed "Longest Wait" stat from `text-red-600` → `text-amber-600` (data emphasis, not error). Kept red only for: error messages, destructive actions (delete/remove buttons, ConfirmDialog), status indicators (closed/down), and semantic data badges (high crowd, long wait thresholds). Rule: red = error/destruction ONLY.
- **Unified search control (2026-04-29):** Replaced separate text search + family dropdown with single command-palette-style input. One box does everything: typing shows matching park families (with star indicators for favorites) and individual parks in sectioned dropdown. Selecting a family shows it as a removable chip inside the input; typing further filters parks within that family. Backspace removes chip when input is empty. Escape closes dropdown. Clear-all X button resets everything. Dropdown limited to 8 park suggestions for performance. Uses `useRef` for input focus management after chip interactions.
- **Calendar family link fix (2026-04-30):** Park detail page "Crowd Calendar" link was passing the park's `destinationId` (UUID) as `?family=` param, but calendar page expects destination slugs (e.g., `disneyland-resort`). Fixed by looking up the destination entry from `DESTINATION_FAMILIES` by UUID, then using `dest.slug` (with `-dest` suffix stripped) to match `PARK_FAMILIES` IDs.
- **Forecast label clarity (2026-04-30):** Replaced confusing "Based on past visits · N% confidence" label on historical forecasts with "Estimated · Based on {sampleCount} reports" (or "Estimated from historical data" as fallback). Dropped raw confidence percentage — users don't understand what "47% confidence" means. Live forecasts keep their existing "Live forecast" badge unchanged.
- **Ride detail panel sizing (2026-04-30):** Enlarged flyout panel from `md:w-96` → `md:w-[28rem]`, `max-h-[80vh]` → `max-h-[90vh]`, and chart maxHeight from 200px → 240px. ForecastChart already rendered full-day data using operating hours bounds — the panel just needed more space to display it properly.
- **Dining logging UX (2026-04-30):** Enhanced dining log with dedicated UX distinct from ride logging. Added "Did you have a reservation?" (yes/no toggle), "Wait for table" (optional minutes with unknown default), and renamed rating label to "How was your dining experience?". Added "Dining" pill to TYPE_FILTERS that switches to dining tab. Replaced emoji icons with Lucide `Utensils` component for restaurants. Fixed filter pill active state from `bg-coral-500` → `bg-indigo-500` (no red in interactive chrome). Updated `DiningLog` type with `hadReservation: boolean | null` and `tableWaitMinutes: number | null` fields.
- **Park Group rename + keyword search (2026-04-30):** Renamed "Resort Group" → "Park Group" across all UI surfaces (trips/new, trips/edit, parks page stats). Added `keywords` field to `SearchableSelectOption` interface — filter logic now matches against both label and keywords array. Trip pages pass child park names as keywords so typing "Epcot" finds "Walt Disney World". Variable names updated from `resortGroups`/`resortGroupOptions` → `parkGroups`/`parkGroupOptions`.
- **Dining filter consolidation (2026-04-30):** Removed separate "Rides & Shows / Dining" tab toggle from trip log page. Dining is now accessed via the "🍽️ Dining" filter pill alongside other type filters (Thrill, Family, Show, etc.). When selected, the same list shows restaurants instead of rides. Tapping a restaurant opens the dining-specific modal (reservation, table wait, experience rating). Single unified list — filter pills are the pivot. No separate sections/tabs needed.
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

## Learnings

- **Progressive loading pattern (2026-04-30):** Split monolithic `fetchData` into `fetchCore` (park + attractions → instant render) and `fetchWaitTimes` (wait times + schedule → overlay). Phase 1 sets `loading=false` as soon as attractions exist. Phase 2 uses separate `waitTimesLoading` state for shimmer on stats cards. Phase 3 forecast refresh is fire-and-forget (no await, no second full reload). Key insight: the existing `mergedAttractions` useMemo auto-reacts to `waitTimes` state changes — no extra wiring needed for Phase 2 to flow into the UI.
- **Dependency isolation in useCallback:** `fetchWaitTimes` accepts an optional `parkDoc` param so the `useEffect` can pass the park reference from Phase 1 without waiting for state to propagate. This avoids a stale closure on `park` state during initial load.
- **Background refresh anti-pattern:** The old code did `await fetch(...)` then `await fetchData()` — a serial double-load that blocked UI for 30+ seconds. The fix: `.then()` chain with no await, re-fetching only wait times on success.
- **Progressive loading status fallback (2026-04-30):** When `waitTimesLoading` is true, default attraction status to `'UNKNOWN'` instead of `'CLOSED'` — prevents false "park is closed" banner during Phase 2 load. Guard the closed banner with `!waitTimesLoading` check. Add `waitTimesLoading` to `mergedAttractions` useMemo deps. Also show shimmer placeholders for schedule bar and operating status badge while Phase 2 loads — avoids empty gaps that look like missing data.
- **Background refresh unmount bug (2026-04-30):** Trip detail page had `window.addEventListener('focus', handleRefresh)` calling `fetchData()` which set `setLoading(true)`. Clicking the Edit `<Link>` triggered a focus event → loading spinner replaced the UI → Link unmounted before navigation → required double-tap. Fix: `fetchData(background=true)` parameter that skips `setLoading(true)` for non-initial fetches. Rule: never unmount interactive UI for background data refreshes.
- **Legacy data fallback pattern (2026-04-30):** When a new field (`parkNames`) is added via a write-path fix (e.g., `updateTripStats`), existing documents won't have it. Always add a fallback in read-path components (TripCard shows "X parks visited" when `parkNames` is empty but `stats.parksVisited > 0`). Don't rely solely on migration scripts for backfill.
- **Auto-refresh wiring pattern (2026-05-01):** `useAutoRefresh` hook starts with `lastRefreshedAt = null`, so on the FIRST tab-return after page load it always fires (age=Infinity). This is acceptable — it guarantees fresh data on return without needing to seed the ref from the initial fetch. The existing `fetchWaitTimes` functions already update component state which re-derives the freshness pill via useMemo. No extra state sync needed — just pass the existing fetch function as `onRefresh`. Used `enabled: !refreshing` to prevent double-fire when manual refresh is active.

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

