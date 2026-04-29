# Mouth — History

## Project Context

- **Project:** theme-park-wait-times — A platform for theme park visitors to track ride wait times, log visits, plan trips with crowd calendars, and crowd-source real-time wait data.
- **Stack:** React/Next.js, TypeScript, Firebase, Vercel, Tailwind CSS
- **User:** Devin Sinha
- **Design direction:** Modern, clean, data-focused but exciting. Deep Ocean Blue primary, Warm Coral accents, Inter font family. Mobile-first. Better UX than thrill-data.com.
- **PRD color scheme:** oklch-based triadic palette with WCAG AA+ contrast ratios defined.

## Architecture Decisions (via Scribe — 2026-04-28)

### Component & Routing Scope

**Next.js App Router (not Pages Router)**
- Server components for data fetching, layout optimization
- File-based routing: `app/parks/[parkId]/page.tsx`, `app/user/trips/page.tsx`
- ISR strategy: Park pages revalidate every 1 hour, crowd calendar every 6 hours

**What Ports from Prototype**
- UI components: shadcn/Radix primitives (Button, Card, Tabs, Modal, Drawer)
- Type definitions: Extended Park, Attraction, Ride types (added Firestore IDs)
- Styling: Tailwind config, oklch triadic palette, CSS variables
- UX patterns: Mobile nav (bottom drawer), park selector (modal), ride timer (countdown), multi-day trip builder

**What Gets Rewritten**
- Routing: React Router DOM → Next.js file-based
- State management: context → Server Components + cache strategy
- Data fetching: Promise-based client-side → RSC + Firestore Client SDK

### Public vs Private Data Boundary

- **Public (no auth required):** Parks list, attractions, live wait times, crowd calendar predictions, crowd report aggregates
- **Private (auth required):** User profiles, trip plans, ride logs, user-submitted reports
- **Pattern:** Maximize audience for read path, protect user data on write path

### Five-Phase Build Plan

- **Phase 1 (Mouth focus):** Scaffold + component library + static park data layout
- **Phase 2:** Live wait times widgets (requires Chunk's API integration)
- **Phase 3:** User ride logging UI (requires Data's auth + schema)
- **Phase 4:** Crowd calendar views (requires Chunk's data aggregation)
- **Phase 5:** Crowd-source submission flows (requires Stef's validation)

## Learnings

- `create-next-app` refuses non-empty directories. When other agents have already scaffolded files (firebase config, test utils, etc.), manually create package.json/tsconfig/next.config instead.
- Tailwind v4 uses `@theme` blocks in CSS for design tokens instead of `tailwind.config.ts`. oklch color system works great for the palette.
- Existing test-utils with `@firebase/rules-unit-testing` have a peer dep conflict with firebase@11. Exclude them from the Next.js build via tsconfig `exclude` and eslintrc `ignorePatterns`.
- Always use `<Link>` from `next/link` for internal navigation — Next.js ESLint config enforces this strictly.
- Mobile bottom nav needs `pb-[env(safe-area-inset-bottom)]` for iPhone notch/home indicator safe areas and pages need `pb-24 md:pb-0` to avoid content being hidden behind it.

## Phase 1 Completion (2026-04-29)

- **Scaffold:** 14 routes (home, parks, attractions, wait-times, crowd-calendar, user-account, about, pricing, faq, auth pages, settings, etc.)
- **Design:** oklch-based triadic color system integrated. Responsive layout (mobile-first) with safe-area padding.
- **TypeScript:** All routes and layouts type-safe with extracted Park, Attraction, CrowdLevel types.
- **Build:** Next.js build passes. ESLint clean. Ready for feature integration.
- **Brand:** "ParkPulse" working UI name (decision filed for consensus).
- **Deliverables:** All files in `src/app/`, `src/components/`, `src/lib/ui/` organized by feature.
- **Next:** Awaiting Data's Firestore integration and real-time data feeds.

## Phase 2: Live Wait Times UI (2026-04-29)

- **Parks listing** (`src/app/parks/page.tsx`): Client component fetching from Firestore `parks` collection, grouped by `destinationName`, with live shortest-wait indicator per park.
- **Park detail** (`src/app/parks/[parkId]/page.tsx`): Fetches park, attractions (filtered by parkId), and wait times subcollection. Stats bar (operating count, avg wait, longest wait). Sort toggle.
- **Components created:**
  - `src/components/WaitTimeBadge.tsx` — color-coded wait badge (green < 20, yellow 20-45, red > 45)
  - `src/components/StatusIndicator.tsx` — dot + label for ride status
  - `src/components/ParkCard.tsx` — park listing card with shortest wait
  - `src/components/AttractionRow.tsx` — attraction card with wait time and entity type badge
- **Pattern:** Use `getCollection` with `whereConstraint` for filtered queries. Wait times live at `waitTimes/{parkId}/current/{attractionId}`.
- **Refresh:** Both pages have refresh buttons hitting `/api/wait-times?parkId=X` then re-fetching from Firestore.
- **Build:** Clean build, 225kB first-load JS for park detail page.

## Learnings (Phase 2 additions)

- Park detail converted from server component (with `params: Promise`) to client component using `useParams()` hook — needed for interactive state (sort toggle, refresh).
- Firestore subcollection path for wait times: `waitTimes/{parkId}/current` — use as a flat collectionPath in `getCollection`.
- Sort toggle UX: default shortest-first (users want the fastest ride), one-tap to flip.

## Phase 1 Orchestration Complete (2026-04-29 16:38:58Z)

- **Decision Filed:** Client-Side Data Fetching for Parks Pages decision merged into main decisions log.
- **Status:** Live parks dashboard with real wait times complete. 225kB first-load JS. Refresh button functional. Responsive on mobile. Ready for Phase 2 features.

## Phase 3: Ride Logging & Timer UI (2026-04-29)

- **Timer components** (`src/components/queue-timer/`):
  - `TimerDisplay.tsx` — live MM:SS with green/yellow/red color coding
  - `QueueTimerButton.tsx` — start/stop/disabled states per attraction
  - `QueueTimerBanner.tsx` — persistent banner in Providers (visible on all pages when timer active)
  - `TimerCompleteSheet.tsx` — bottom sheet with rating stars, notes, and save/skip actions
- **Ride log components** (`src/components/ride-log/`):
  - `RideLogEntry.tsx` — card with expandable notes, delete, rating stars
  - `RideLogList.tsx` — date-grouped list with loading/empty states
  - `ManualLogForm.tsx` — full form with park/attraction dropdowns from Firestore
- **Crowd estimate components** (`src/components/crowd-estimate/`):
  - `CrowdBadge.tsx` — "👥 ~X min" badge with color coding + confidence checkmark
  - `ConfidenceIndicator.tsx` — dot-based confidence level with tooltip
- **Ride Log page** (`src/app/ride-log/page.tsx`): Stats summary, filter tabs, FAB for manual entry, auth gate
- **Hook** (`src/hooks/useActiveTimer.ts`): Real-time Firestore subscription with 1s tick, abandoned timer detection
- **Services** (`src/lib/services/`): `timer-service.ts` (start/stop/subscribe/abandon), `ride-log-service.ts` (CRUD + crowd report submission)
- **Layout updates**: QueueTimerBanner in Providers, "My Rides" in nav + bottom bar, slide-up animation in globals.css
- **Build:** Clean build, ride-log page 237kB first-load JS. Type-check passes.

## Learnings (Phase 3 additions)

- Data's `ride-log.ts` types use plain `Date` objects (not Firestore Timestamps). Service layer does the conversion with `dateToTimestamp()` and manual `Timestamp.toDate()` calls.
- Active timer lives at `users/{userId}/activeTimer/current` (single doc pattern). `onSnapshot` gives instant real-time updates without polling.
- The `clientStartedAt` (epoch ms) field is critical for offline resilience — elapsed time is always `now - clientStartedAt`, not dependent on server Timestamp resolution.
- `animate-slide-up` CSS keyframe with `cubic-bezier(0.16, 1, 0.3, 1)` gives a satisfying spring-like entrance for bottom sheets.
- Filter chips use two tiers: Tier 1 (entityType) for broad categories, Tier 2 (attractionType) for ride sub-types. Default state hides RESTAURANT and MERCHANDISE by initializing entityTypes to `Set(['ATTRACTION', 'SHOW'])`.
- `scrollbar-hide` utility class in globals.css handles horizontal chip scrolling on mobile without visible scrollbars (webkit + Firefox).
- Records with null/undefined `attractionType` still pass Tier 2 filters — only enriched records get filtered out. This supports gradual enrichment rollout.

## Scribe Batch Update (2026-04-29 10:59:18Z)

**Decision inbox processed:**
- Trip Planner & Ride Type Filters decision filed (with full UI component specs)
- Ride Logging architecture decision integrated
- Inbox cleared

**Status:** AttractionFilterChips component built + tested. 49 new tests written (265 total). Trip filters shipped and ready. Trip Planner pages (TripCard, TripForm, TripTimeline components) next in Phase 2.

## Trip Pages UI Build (2026-04-29)

- **Routes created:**
  - `/trips` — Trip list with Active/Upcoming/Past tabs, empty state, refresh + create buttons
  - `/trips/new` — Create trip with Single Day / Multi-Day tab switcher, day builder (date picker, resort group selector, park checkboxes)
  - `/trips/[tripId]` — Trip detail with stats bar, timeline grouped by day, complete/share buttons
  - `/trips/[tripId]/edit` — Edit trip (modify name, notes, add/remove days)
- **Components:**
  - `src/components/trips/TripCard.tsx` — Trip list card with name, date range, park badges, stats
  - `src/components/trips/TripDayCard.tsx` — Day card showing date + parks with remove button
  - `src/components/trips/ActiveTripBanner.tsx` — Global banner for active trips (added to Providers)
- **Navigation:** Added "Trips" to desktop nav and replaced "My Rides" with "Trips" in mobile bottom bar
- **Homepage:** Added "Log Your Trip" as first feature card (coral CTA) linking to /trips/new
- **Services used:** `trip-service.ts` (createTrip, getTrips, getTrip, updateTrip, completeTrip, generateShareId, getTripRideLogs)
- **Build:** Clean build, /trips 229kB, /trips/new 230kB, /trips/[tripId] 230kB first-load JS

## Learnings

- Trip types use ISO date strings (YYYY-MM-DD) not Date objects for startDate/endDate — simpler for date pickers and form state
- Resort groups derived client-side by grouping parks from Firestore by `destinationId`/`destinationName` — no separate collection needed
- The `getCollection<T>('parks', [])` call with empty constraints returns all parks — useful for dropdowns
- ActiveTripBanner placed above QueueTimerBanner in Providers to give trip context visual priority
- **Auth redirect pattern for protected pages:** Use `useAuth()` hook → `useEffect` that calls `router.replace('/auth/signin')` when `!authLoading && !user` → render spinner while `authLoading || !user`. Applied to all 4 trip routes (`/trips`, `/trips/new`, `/trips/[tripId]`, `/trips/[tripId]/edit`). This prevents content flash and gives a clean redirect.

## UX Refinements (2026-04-29)

- **Default sort busiest-first** on park detail page (`sortAsc: false`). Users care more about "what has the longest wait" when planning — flip to shortest-first when looking for quick rides.
- **Crowd Calendar multi-month view**: Converted to client component with `useState` for month offset navigation. Shows 3 months side-by-side on desktop (flex-row), stacked on mobile (flex-col). Metadata moved to `layout.tsx`.
- **Temperature indicators**: Each calendar day cell shows historical high°/low° (°F) in 9px text with Lucide Thermometer icon. Data generated deterministically from Florida monthly averages (Orlando). Kept subtle with `opacity-70` so crowd level number stays primary visual.
- Pattern: When converting a server component to client (`'use client'`), extract `export const metadata` into a sibling `layout.tsx` to preserve SEO metadata.

## Park Detail Redesign (2026-04-29)

- **Sort bug fix:** Replaced `?? 999` with explicit null checks so n/a rides always sort to bottom regardless of direction.
- **Compact list layout:** Replaced 3-column card grid with single-column `divide-y` list. Each ride is a clickable row with name, type badge, sparkline, and wait badge — dense and scannable like a leaderboard.
- **WaitTimeSparkline** (`src/components/parks/WaitTimeSparkline.tsx`): Inline SVG polyline, 60×18px, color-coded green/yellow/red. Uses placeholder data (7 points trending toward current wait).
- **RideDetailPanel** (`src/components/parks/RideDetailPanel.tsx`): Click-to-open sidebar (desktop) / bottom sheet (mobile) with large wait badge, hourly SVG area chart, and "Best time to ride" suggestion. Uses `animate-slide-up` on mobile.
- **AttractionRow** now accepts `onClick` prop and renders as a `<button>` for accessibility.
- Build clean at 231kB first-load JS for park detail page.

## Learnings

- For sort comparators with nullable values, explicit null guards (`if (a === null) return 1`) are clearer and more correct than fallback values like `?? 999`.
- Inline SVG sparklines (no charting library) keep bundle tiny. A simple `<polyline>` with computed points is all you need for micro-charts.
- Bottom sheet pattern: `animate-slide-up` + `md:animate-none` gives mobile sheet behavior while keeping desktop as a static sidebar panel.

## QA Fixes — Stef's Review (2026-04-29)

- **Seeded PRNG for sparklines and hourly charts:** Replaced `Math.random()` with a deterministic `seededRandom(rideName, index)` function so placeholder data is stable across re-renders for the same ride.
- **WaitTimeSparkline** now requires `rideName` prop as PRNG seed. AttractionRow passes `name`.
- **RideDetailPanel accessibility:** Added `role="dialog" aria-modal="true" aria-labelledby="ride-detail-title"`, auto-focus on mount, `tabIndex={-1}`, and `outline-none` for focus trap pattern.
- **Backdrop click fix:** Moved `onClick={onClose}` directly onto the backdrop overlay div, added `e.stopPropagation()` on panel content to prevent misfire.
- **Sort button label:** Now shows the action (what clicking will do) instead of current state.
- **Stats "0 min" fix:** Shows "—" when no rides have wait data instead of misleading "0 min".
- **Dead code removed:** Unused `areaPath` variable deleted from DayChart.
- **Disclaimer label:** Added "Based on historical averages" below Best Time suggestion.
- Build clean at 232kB first-load JS for park detail page.

## Phase 1: Virtual Queues, Forecast Chart, Park Schedule (2026-04-29)

- **AttractionRow** expanded with inline `QueueBadges` subcomponent:
  - ⚡ LL (amber), 💰 ILL w/price (gold), 🎟️ VQ (purple)
  - Hover/tap tooltip shows return time window or group range
  - Badges hidden on smallest breakpoints (icon-only), labels shown sm+
- **RideDetailPanel** fully rewritten:
  - Removed ALL seeded PRNG logic (seededRandom, generateHourlyData, DayChart)
  - Added `VirtualQueueDetail` section: LL return window, ILL price, boarding group state
  - Replaced DayChart with `ForecastChart` using real API forecast data
- **ForecastChart** (`src/components/parks/ForecastChart.tsx`):
  - SVG area chart with orange gradient fill, 400×200 viewBox, full responsive width
  - X-axis bounded by operatingHours, Y-axis auto-scaled to max wait
  - Vertical dashed "NOW" line (blue), current wait dot (blue circle)
  - Green "best time" dot at forecast minimum
  - Graceful fallback: "No forecast available" message when data is null
- **ParkScheduleBar** (`src/components/parks/ParkScheduleBar.tsx`):
  - Horizontal timeline bar with proportional color segments
  - Blue = OPERATING, Purple = TICKETED_EVENT, Amber = EXTRA_HOURS
  - Text labels with emoji icons (🌙, ☀️, 🎉) and time ranges
  - Shows LL Multi Pass price from purchases array
- **Park page** wiring:
  - Fetches `/api/park-schedule?parkId=X` alongside existing data
  - Passes `queue`, `forecast`, `operatingHours` through merged attractions
  - ParkScheduleBar rendered in header area below park name
- **Types:** `src/types/queue.ts` defines all VQ/forecast/schedule interfaces
- Build clean. TypeScript passes with zero errors.

## Learnings

- The ThemeParks Wiki API returns `forecast` and `operatingHours` per-attraction in liveData — eliminates need for PRNG placeholders entirely.
- `React.ReactElement` replaces `JSX.Element` for type annotations when JSX namespace isn't auto-imported (depends on tsconfig jsx setting).
- SVG gradient fills with `linearGradient` + `stopOpacity` transitioning to near-zero creates a clean area chart look without a separate fill polygon.
- Schedule timeline proportions: use `(segmentDuration / totalDayDuration) * 100%` for CSS width — simple and accurate.
- Non-critical fetches (schedule) should be fire-and-forget in the main data load — wrap in try/catch to avoid blocking the primary wait time display.
- Queue badge tooltips: `onTouchStart` toggle (not just `onMouseEnter`) enables mobile tap-to-reveal without needing a separate modal.

