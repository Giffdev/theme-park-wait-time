# Decisions Log

## 2026-04-28

### Decision: Architecture Plan for Theme Park Wait Times

- **Author:** Mikey
- **Date:** 2026-04-28
- **Status:** Proposed
- **Scope:** Full system architecture

#### Summary

Comprehensive architecture plan established for porting the GitHub Spark prototype (Giffdev/theme-park-wait-time) to a production Next.js + Firebase + Vercel stack. Full plan written to `docs/ARCHITECTURE.md`.

#### Key Decisions

**1. Next.js App Router + Vercel**
- App Router (not Pages Router) for server components and modern patterns
- Vercel for deployment with Cron jobs for scheduled data refresh
- ISR for park pages (1hr), crowd calendar (6hr)

**2. Firebase as sole backend**
- Firestore for all data persistence
- Firebase Auth for authentication (email/password + Google sign-in)
- No custom auth — prototype's SHA-256 KV approach is replaced entirely
- Firebase Admin SDK for server-side writes only

**3. Firestore Schema — Key Structural Choices**
- **Attractions as subcollection of Parks** — always queried per-park, natural data locality
- **currentWaitTimes separated from attraction docs** — high-frequency writes (every 5 min) isolated from static metadata
- **Historical wait times: one doc per attraction per day** — manageable doc sizes (~5KB), efficient date-range queries
- **Crowd calendar: month-maps** — single Firestore read per month, instant calendar rendering
- **Trips/rideLogs as user subcollections** — private by structure, security rules enforce owner-only access

**4. Public vs Private Data Boundary**
- **Public (no auth):** Parks, attractions, wait times, crowd calendar, crowd report aggregates
- **Private (auth required):** User profiles, trips, ride logs, report/verification authorship
- **Principle:** "Read publicly, write privately" — maximize audience, protect user data

**5. Data Strategy**
- **Server-side only data fetching** — no API keys in browser, no scraping from client
- **ThemeParks.wiki API as primary source** (Chunk to evaluate)
- **Vercel Cron (5-min interval)** for wait time refresh
- **Crowd-sourced reports supplement, never replace, API data**
- **Trust-weighted consensus algorithm** for crowd reports (ported from prototype)

**6. Five-Phase Build Plan**
- Phase 1: Scaffold + Auth + Static Data (Mouth + Data + Chunk)
- Phase 2: Live Wait Times + Ride Status (Chunk + Mouth + Data)
- Phase 3: User Ride Logging (Mouth + Data + Stef)
- Phase 4: Crowd Calendar + Analytics (Mouth + Data + Chunk)
- Phase 5: Crowd-Sourced Reporting (Mouth + Data + Stef)

**7. What Ports From Prototype**
- UI components (shadcn/Radix primitives, custom components adapted)
- Type definitions (extended for Firestore)
- Styling system (Tailwind config, color scheme, CSS variables)
- UX patterns (mobile nav, park selector, ride timer, multi-day trips)
- Business logic (busy level calculation, consensus algorithm, time formatting)

**8. What Gets Rewritten**
- Routing (React Router DOM → Next.js file-based)
- Data layer (Spark KV → Firestore SDK)
- Authentication (custom SHA-256 → Firebase Auth)
- Data initialization (fake sampleData.ts → real API-sourced Firestore data)

#### Impact

This plan is the foundational document for the entire team. All subsequent work references it. Key file: `docs/ARCHITECTURE.md`.

---

### Decision: Data Strategy for Theme Park Wait Times

**Author:** Chunk (Data Engineer)  
**Date:** 2026-04-28  
**Status:** Proposed  
**Impact:** High — defines the entire data backbone of the product

#### Context

We need accurate, real-time ride data (wait times, open/closed status, seasonal attractions) and crowd predictions. The user specifically wants better data presentation than thrill-data.com.

#### Decisions

**1. Primary Data Source: ThemeParks.wiki API**

**Choice:** Use ThemeParks.wiki as the primary API for live wait times and ride status.

**Rationale:**
- 75+ parks covered including all our target parks
- 300 req/min rate limit (generous for our needs)
- Free, open-source, well-maintained
- Structured entity data (rides, shows, restaurants, schedules)
- No auth required for public endpoints

**Alternative considered:** Queue-Times.com — slightly more parks (80+) but less structured data and no numeric rate limit (risky for automation).

**2. Multi-Source Cross-Reference**

**Choice:** Use Queue-Times as secondary source for validation and gap-filling.

**Rationale:** No single API is 100% reliable. Cross-referencing catches stale data and provides redundancy.

**3. Launch Parks: Orlando Cluster (6 parks)**

**Choice:** Start with WDW (4 parks) + Universal Orlando (2 parks).

**Rationale:**
- All fully covered by both APIs
- Geographic cluster enables in-person validation
- Highest demand destination globally
- Two operators tests multi-source approach
- Rich seasonal events for testing that feature

**4. Polling Interval: 5 Minutes**

**Choice:** Poll APIs every 5 minutes per park.

**Rationale:** Matches Queue-Times refresh cycle; ThemeParks.wiki rate limit easily accommodates this. User-facing staleness stays under 10 minutes.

**5. Crowd Calendar: Rule-Based First, ML Later**

**Choice:** Start with a weighted rule-based algorithm (day of week + holidays + events), evolve to ML after 6 months of data collection.

**Rationale:** ML needs training data we don't have yet. Rule-based is good enough to launch and validates the UX concept.

**6. Crowd-Sourcing as Supplement Only**

**Choice:** User-submitted wait times supplement API data but never replace it.

**Rationale:** API data is more reliable and consistent. Crowd-sourced fills gaps (API outages, uncovered rides, seasonal attractions).

**7. No Scraping**

**Choice:** Avoid web scraping entirely for launch.

**Rationale:** APIs cover 95%+ of needs. Scraping adds legal risk, maintenance burden, and reliability issues. Manual curation fills remaining gaps.

#### Risks Accepted

- Dependency on third-party free APIs (mitigated by multi-source + self-hosted parksapi option)
- Cold-start crowd calendar won't be ML-quality (acceptable for MVP)
- Some ride metadata (height requirements, thrill level) requires manual curation

#### Next Steps

- [ ] Wire up ThemeParks.wiki API integration
- [ ] Seed Firestore with ride data for 6 launch parks
- [ ] Build Cloud Function polling pipeline
- [ ] Design crowd-sourced submission validation

---

## 2026-04-29

### Decision: Park Schedule API Design

**Author:** Data  
**Date:** 2026-04-29T15:23:30-07:00  
**Status:** Implemented

#### Context

The park detail page needs real operating hours, and the parks listing page needs a lightweight way to show open/closed status for all parks at once.

#### Decisions

1. **Single-park schedule** (`/api/parks/[slug]/schedule`): Resolves slug → UUID via Firestore, then calls ThemeParks Wiki `/v1/entity/{id}/schedule`. Returns today's full schedule entries + computed OPEN/CLOSED status.

2. **Batch hours** (`/api/park-hours`): New endpoint fetches schedule for ALL parks in parallel. Returns minimal payload: slug, name, timezone, status, openingTime, closingTime. Designed for Mouth's parks listing page.

3. **Slug-based routing**: The `[parkId]` param is a slug (human-readable URL). Firestore lookup resolves to UUID for external API calls.

4. **Error handling**: Individual park failures in batch don't break the whole response (status: 'ERROR'). Wiki 404 returns status: 'NO_DATA'. Wiki 5xx returns 502 to client.

5. **Caching**: 5-minute `revalidate` on wiki schedule calls (schedules don't change often).

#### Implications

- Mouth can call `/api/park-hours` once on the listing page for all park statuses.
- ParkScheduleBar component should consume `/api/parks/{slug}/schedule` on park detail pages.
- If we add many more parks, the batch endpoint may need pagination or caching layer.

---

### Decision: Seed Script Generalized to Multi-Destination

**Author:** Data  
**Date:** 2026-04-29T15:16:06-07:00  
**Status:** Implemented

#### Context

The `scripts/seed-parks.ts` script was hardcoded to only seed Orlando-area parks. Adding Worlds of Fun required generalizing the approach.

#### Decision

Refactored the seed script to use a `SEED_DESTINATIONS` configuration map. Each entry specifies:
- `keywords`: strings to match against ThemeParks Wiki API destination names
- `parkFilter` (optional): UUID allowlist — only these park IDs get seeded from the destination
- `timezoneOverride` (optional): override the API-reported timezone

#### Rationale

- Adding new parks now requires only a config entry, no structural code changes
- `parkFilter` solves the "destination has parks not in the API" problem (e.g., Oceans of Fun)
- Graceful error handling: 404s from the API skip with a warning instead of crashing
- Timezone override needed because Kansas City parks should use `America/Chicago`

#### Impact

- **All agents**: To add a new park to the `/parks` page, add it to `SEED_DESTINATIONS` in `scripts/seed-parks.ts` and run `npx tsx scripts/seed-parks.ts`
- **Existing behavior preserved**: Orlando parks still seed identically
- **Worlds of Fun**: Now seeded with 94 attractions, timezone `America/Chicago`

---

### Decision: Separate Trip and Ride Log Fetches

**Author:** Data (Backend Dev)  
**Date:** 2026-04-29T15:23:30-07:00  
**Status:** Implemented

#### Context

The trip detail page used `Promise.all` to fetch both the trip document and its ride logs simultaneously. The `getTripRideLogs` query requires a Firestore composite index on `tripId` + `rodeAt`. If that index doesn't exist (or any other error occurs in ride logs), the entire Promise.all rejects, `setTrip` never runs, and the user sees "Trip Not Found" — even though the trip exists.

#### Decision

1. **Separate the fetches** in `src/app/trips/[tripId]/page.tsx` so trip and ride logs are independent try/catch blocks. A ride logs failure no longer prevents displaying the trip.
2. **Add composite index** for `rideLogs` collection (`tripId` ASC + `rodeAt` DESC) to `firestore.indexes.json` so the query works after deployment.

#### Rationale

- The trip document is the primary data; ride logs are supplementary. Showing a trip without logs is acceptable; showing nothing is not.
- This is a general principle: never let optional/secondary data fetches block primary data display.

#### Impact

- `src/app/trips/[tripId]/page.tsx` — fetch logic refactored
- `firestore.indexes.json` — new composite index added
- No breaking changes to other components

---

### Decision: Friendly URL Slugs for Parks and Attractions

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Implemented

#### Context

Park and attraction pages previously used ThemeParks Wiki UUIDs in URLs (e.g., `/parks/75ea578a-adc8-4116-a54d-dccb60765ef9`). This is bad for UX, SEO, and shareability.

#### Decision

All park and attraction URLs now use the `slug` field already present in Firestore documents. URLs are now human-readable: `/parks/magic-kingdom`, `/parks/magic-kingdom/attractions/seven-dwarfs-mine-train`.

#### Implementation Details

- Park detail page queries `parks` collection with `where('slug', '==', slug)` to resolve the park, then uses the park's UUID for subsequent queries (attractions, wait times, schedule API).
- Attraction detail page similarly resolves both park slug and attraction slug to UUIDs for data operations.
- `ActiveTimer` interface gained an optional `parkSlug` field for navigation links in QueueTimerBanner (backward-compatible with existing timer documents that lack this field).
- Next.js route folder structure unchanged (`[parkId]`/`[attractionId]` params) — values are slugs now.

#### Impact

- All links throughout the app now produce friendly URLs
- Firestore queries use slug field (ensure index exists on `parks.slug` and `attractions.slug`)
- Old UUID-based URLs will 404 unless a redirect is set up (not implemented — would need middleware)
- Timer documents created going forward will include `parkSlug`; old ones fall back to slugified `parkName`

---

### Decision: Park Status UX Pattern

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Proposed

#### Context

Added park operating status (open/closed) to the park listing cards and detail page. Several UX decisions were made.

#### Decisions

1. **Graceful degradation over hard dependency** — ParkCard renders normally without status data. The `/api/park-hours` fetch is non-blocking; if it fails, cards just show wait times as before. No loading state for hours — it overlays when available.

2. **Closed parks muted but not hidden** — Closed parks get a subtle `bg-primary-50/60` tint and muted text, but remain fully visible and clickable. Users may want to see the park page even when closed (planning, history). We don't sort closed parks to the bottom.

3. **Timezone as abbreviation, not full IANA** — Users see "ET", "CT", "PT" instead of "America/New_York". Hardcoded lookup table for US parks; international falls back to city name from IANA string. Keeps cards compact.

4. **Open/Closed derived from schedule segments on detail page** — Rather than making a separate API call for the detail page's open/closed state, we reuse the existing `schedule.segments` data (already fetched for `ParkScheduleBar`) and compute operating status client-side.

#### Impact

- ParkCard interface is backward-compatible (all new props optional)
- No new API dependencies for detail page
- Data team's `/api/park-hours` endpoint shape is documented in the component interface

---

### Decision: ParkFlow Rename + Parks Page Redesign

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Implemented

#### Context

The app was originally named "ParkPulse" and has been renamed to "ParkFlow" across all UI surfaces, metadata, constants, and tests.

The parks listing page was redesigned from a dense 5-column grid to a spacious 3-column layout inspired by the original app's more navigable design.

#### Decisions Made

1. **Brand name "ParkFlow"** replaces "ParkPulse" everywhere — layout, footer, metadata, auth pages, about page, shared trips, and `APP_NAME` constant.

2. **Parks page max 3 columns** — `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` with `max-w-6xl` container. Larger cards are easier to tap on mobile and scan on desktop.

3. **Destination headers include location** — Each family group shows city/state under the destination name with a border separator for visual hierarchy.

4. **ParkCard has "View Park →" CTA** — Bottom action indicator with hover animation. Makes the card feel clickable without requiring a separate button element.

5. **Coverage Summary at page bottom** — Shows total resort groups, parks, theme parks, and water parks. Uses name-based heuristic for park type classification.

#### Impact on Other Agents

- **Data team:** No API changes needed. All data contracts unchanged.
- **Testing:** Auth tests updated for new brand name. Park component tests pass without modification (card structure is additive).
- **SEO/Marketing:** Title template is now `%s | ParkFlow`. Update any external references.

---

### Decision: Parks Page Layout & Location Data

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Proposed

#### Context

The parks listing page had a fixed `max-w-7xl` container and `sm:grid-cols-2 lg:grid-cols-4` grid that left significant whitespace on wide monitors (1440px+). The park cards also only showed name + destination with no geographic context.

#### Decisions

1. **Container widened to 1600px** — `max-w-[1600px]` fills ultrawide monitors better while maintaining comfortable line density.
2. **Progressive grid: 1→2→3→4→5 columns** — `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`. The `lg` breakpoint drops from 4 to 3 cols (better for typical 1280px laptops where 4 cols was too cramped).
3. **Location metadata as separate enrichment layer** — `src/lib/parks/park-locations.ts` maps destination IDs to city/state/country. Kept separate from `park-registry.ts` because the registry reflects the upstream ThemeParks Wiki API structure, while locations are our own curated data.
4. **Search includes location** — Users can type "Orlando" or "Japan" to find parks by geography. Zero-cost (reuses existing filter logic with one extra field check).
5. **Local time moved to meta row** — Grouped with location (geographic context) instead of isolated in the card footer. Reduces visual noise in the bottom row which focuses on wait time data.

#### Impact

- Wide-screen users see 25-40% more parks per screen
- Location data adds useful at-a-glance context for enthusiasts planning trips
- Search becomes significantly more useful for geography-based discovery
- No breaking changes to existing ParkCard consumers (all new props are optional)

#### Data Gap (for Data team)

The park-registry has no native location fields. The `park-locations.ts` file is a hand-curated mapping that covers all current destinations. If new destinations are added to the registry, they'll need a corresponding entry in `park-locations.ts` (graceful degradation — cards without a mapping simply don't show a location line).

---

### Decision: Mobile Nav Item Priority (Logged-In Users)

**Author:** Data (Backend Dev)  
**Date:** 2026-04-29T22:00:33-07:00  
**Status:** Implemented

#### Context

Mobile bottom nav has space for ~5 items max. Needed to add "My Rides" (`/ride-log`) for logged-in users who are actively at the park.

#### Decision

**Logged-in mobile nav (5 items):** Home, Parks, My Rides, Trips, Dashboard

**Non-logged-in mobile nav (4 items):** Home, Parks, Calendar, Sign In

Calendar was dropped from the logged-in nav because:
1. It's accessible from the home page and parks pages
2. At-the-park users need ride logging and trip management more than calendar
3. Keeps the nav to exactly 5 items (good mobile UX)

#### Impact

- `src/components/AuthNav.tsx` — `AuthNavMobile` component restructured with conditional rendering
- My Rides uses a ticket icon SVG for visual distinction from Trips (calendar icon)

---

### Note: User Directive — Park Hours and Timezone Display

**Date:** 2026-04-29T22:23:30Z  
**From:** Devin Sinha (via Copilot)  
**Category:** Feature Request

When parks are closed, show that status throughout the app where it makes sense. On park tiles (ParkCard), show park hours or their local time including timezone, since parks are in different locales. (Captured for team memory; related implementation decisions documented above.)

---

### ParkPulse Holistic Site Consistency Audit

**Auditor:** Mikey (Lead)  
**Date:** 2026-04-29  
**Scope:** Full user journey across all major features

---

#### P1 Critical — Feature broken or fundamentally disconnected

##### 1. Park detail page has NO cross-link to Trips or Ride Logging
**Where:** `src/app/parks/[parkId]/page.tsx` (lines 273–426)  
**What's wrong:** A user viewing live wait times for a park has no way to start a trip, log a ride, or even see if they're on an active trip. The park detail page is a dead end for engagement — users see wait times but can't act on them.  
**Fix:** Add a floating "Log Ride" button (similar to ride-log page's FAB) and/or a banner showing active trip status with a quick-log CTA when user is authenticated and has an active trip at this park.

##### 2. Crowd Calendar park IDs don't match park-registry IDs
**Where:** `src/lib/constants.ts` (lines 18–74) vs `src/lib/parks/park-registry.ts`  
**What's wrong:** The calendar uses short slugs as park IDs (e.g., `magic-kingdom`, `epcot`) while the park registry uses ThemeParks Wiki UUIDs (e.g., `75ea578a-adc8-4116-a54d-dccb60765ef9`). The calendar page cannot link to a specific park detail page because there's no mapping between these ID systems.  
**Fix:** Add a `slug` field to `PARK_FAMILIES` entries in constants.ts that matches the park-registry slugs, or add a lookup utility that resolves calendar park IDs to park-registry slugs for linking.

##### 3. Crowd Calendar has no links to park pages
**Where:** `src/app/calendar/page.tsx` — entire component  
**What's wrong:** When a user identifies a good day to visit a specific park, they cannot click through to see that park's current wait times or start planning a trip. The calendar is informational but doesn't drive action.  
**Fix:** Make park names in the calendar clickable (link to `/parks/{slug}`) and add a "Plan a Trip" CTA that pre-fills the trip creation form with the selected dates and park.

---

#### P2 Important — User would be confused or hit a dead end

##### 4. Naming inconsistency: "Hollywood Studios" vs "Disney's Hollywood Studios"
**Where:**  
- `src/lib/constants.ts` line 25: `"Hollywood Studios"`  
- `src/lib/parks/park-registry.ts` line 46: `"Disney's Hollywood Studios"`  
**What's wrong:** Same park called different names across features. Users might not recognize them as the same park.  
**Fix:** Use the full official name consistently, or at minimum ensure the calendar park name matches what users see on the parks page.

##### 5. Naming inconsistency: "Animal Kingdom" vs "Disney's Animal Kingdom"
**Where:**  
- `src/lib/constants.ts` line 26: `"Animal Kingdom"`  
- `src/lib/parks/park-registry.ts` line 47: `"Disney's Animal Kingdom"`  
**Fix:** Same as above — standardize names.

##### 6. Mobile nav inconsistency: "My Rides" link missing from bottom nav
**Where:** `src/components/AuthNav.tsx`  
**What's wrong:** Desktop nav (line 24) shows "My Rides" linking to `/ride-log`. Mobile nav (lines 76–89) shows "Trips" but NOT "My Rides" — users on mobile can only access ride logging via the Dashboard or direct URL. The mobile nav also labels Dashboard as "Profile" (line 88) while desktop calls it "Dashboard" (line 25).  
**Fix:** Either add a "My Rides" mobile nav item, or combine Trips + Rides into a single section. Also standardize the Dashboard/Profile label. *(Note: This has since been implemented per Decision: Mobile Nav Item Priority above.)*

##### 7. Dashboard is a dead end — no links to features
**Where:** `src/app/dashboard/page.tsx` (lines 89–105)  
**What's wrong:** Dashboard shows stats (total rides, parks visited, trips logged) but none of these are clickable. Users see "3 Trips Logged" but can't click to view their trips. No links to Crowd Calendar for planning the next trip, no quick-log CTA.  
**Fix:** Make stat cards link to their respective pages (rides → /ride-log, trips → /trips). Add a "Plan Your Next Trip" CTA linking to the crowd calendar or trip creation.

##### 8. Empty state on Trips page doesn't mention Crowd Calendar
**Where:** `src/app/trips/page.tsx` (lines 122–134)  
**What's wrong:** When user has no trips, they see "Start Logging Trips" but no mention of the Crowd Calendar for planning. A user who came here to plan wouldn't know the calendar exists.  
**Fix:** Add secondary text like "Use the Crowd Calendar to pick the best days" with a link to `/calendar`.

##### 9. Homepage FeatureCards don't mention Ride Logging or Dashboard
**Where:** `src/components/FeatureCards.tsx` (lines 20–38)  
**What's wrong:** Only 3 feature cards exist (Trip Logging, Live Wait Times, Crowd Calendar). The Ride Log and Dashboard features are undiscoverable from the homepage for new users. Also "Log Your Trip" card goes to `/trips/new` which is trip creation, not ride logging — the terminology conflates trips and rides.  
**Fix:** Add a 4th card for ride logging/stats, or rename the trip card to clarify it's about multi-day trips (not individual ride logs).

##### 10. Two separate crowd level scales in constants.ts
**Where:** `src/lib/constants.ts` — `CROWD_LEVELS` (1–10 scale, lines 5–16) vs `CROWD_LEVEL_COLORS` (1–4 scale, lines 79–84)  
**What's wrong:** Two different crowd level systems coexist. The 10-tier scale labels "1" and "2" both as "Very Low" and uses color names. The 4-tier scale uses different labels (Low/Moderate/High/Extreme). It's unclear which is canonical and could cause confusion if both are used in UI.  
**Fix:** Deprecate one scale or clearly document when each is used. Currently only the 4-tier scale is used in the calendar.

---

#### P3 Nice-to-have — Opportunity for better cross-linking

##### 11. Park detail page could link to Crowd Calendar for that park
**Suggested location:** `src/app/parks/[parkId]/page.tsx`, near the header  
**What's missing:** A "See crowd predictions" link that takes users to the calendar pre-filtered to that park's family.

##### 12. Trip detail page doesn't link to park detail pages
**Where:** `src/app/trips/[tripId]/page.tsx` (lines 222–229)  
**What's wrong:** Park names are shown as badges but aren't clickable links to the park pages.  
**Fix:** Wrap park name badges in `<Link href="/parks/{slug}">`.

##### 13. Ride Log page has no link to create a Trip
**Where:** `src/app/ride-log/page.tsx`  
**What's wrong:** Users logging rides outside of a trip context have no prompt to organize rides into a trip.  
**Fix:** Add a subtle banner: "Organize your rides into a Trip for stats and sharing" → `/trips/new`.

##### 14. No "breadcrumb back" from Calendar to Homepage
**Where:** `src/app/calendar/page.tsx`  
**What's wrong:** Parks page has breadcrumbs but Calendar does not. Minor but inconsistent navigation pattern.  
**Fix:** Add breadcrumb or back-navigation consistent with park detail pages.

##### 15. Homepage stats ("10+ Theme Parks", "500+ Attractions") are hardcoded
**Where:** `src/app/page.tsx` (lines 62–74)  
**What's wrong:** These stats could go stale. The park registry actually contains many more parks. Not a UX flow issue but contributes to inconsistency if the real data tells a different story.  
**Fix:** Consider deriving from park-registry length, or make them more vague ("Dozens of parks").

##### 16. Trip creation flow doesn't suggest dates from Crowd Calendar
**Where:** `src/app/trips/new/page.tsx` (exists but not linked from calendar)  
**What's wrong:** The calendar identifies best days to visit but doesn't offer a "Create trip for these dates" action. These features exist in parallel but aren't stitched together.  
**Fix:** Add a "Plan a trip" button on the calendar that navigates to `/trips/new?startDate=X&parkFamily=Y`.

---

#### Summary of Priority Actions

| Priority | Count | Theme |
|----------|-------|-------|
| P1 | 3 | Features exist in silos — calendar and parks can't reach trips/logging |
| P2 | 7 | Naming confusion, dead ends, and missing cross-navigation |
| P3 | 6 | Missed opportunities to connect related features |

##### Recommended Implementation Order:
1. **Add park-to-trip/ride-log cross-links** (P1 #1) — highest user impact
2. **Fix calendar → park linking** (P1 #2, #3) — makes calendar actionable
3. **Standardize park names** (P2 #4, #5) — quick wins
4. **Fix mobile nav gaps** (P2 #6) — affects all mobile users
5. **Make Dashboard actionable** (P2 #7) — retention driver
6. **Connect trip planning to calendar** (P3 #16) — completes the loop


---

### Decision: 2026-04-30T1001

### 2026-04-30T10:01:55: User directive
**By:** Devin Sinha (via Copilot)
**What:** Rename "Resort Group" to "Park Group" across the entire app. On the trip logging page, the park group dropdown should also match searches by individual park name (e.g., typing "Epcot" finds "Walt Disney World") but should NOT display individual park names in the dropdown — only park group names are visible options.
**Why:** User request — captured for team memory

---

### Decision: 2026-04-30T1011

### 2026-04-30T10:11: User directive
**By:** devsin (via Copilot)
**What:** The trip detail page should have a single log button labeled "Log a Ride or Experience" (not separate ride/dining buttons). "Experience" is more generic and covers dining, shows, etc.
**Why:** User request — captured for team memory


---

### Decision: 20260429T225746

### 2026-04-29T22:57:46Z: User directive
**By:** devsin (via Copilot)
**What:** No red anywhere in the UI theming — not in hover states, selected states, or buttons. The main palette should be light and dark blues. Pick a complementary accent color (not red) for interactive states.
**Why:** User request — red looks alarmist and doesn't fit the desired theme

---

### Decision: 20260430T112233

### 2026-04-30T11:22:33-07:00: User directive
**By:** Devin Sinha (via Copilot)
**What:** Trips page should show upcoming, active, and past trips together on the same scrollable page instead of hidden behind tabs/pivots. Active trips at top, recently completed below — like TripIt does. The current tab UI makes it too easy to miss trips in other states.
**Why:** User request — captured for team memory


---

### Decision: 20260430T112412

### 2026-04-30T11:24:12-07:00: User directive
**By:** Devin Sinha (via Copilot)
**What:** Default wait time when logging a ride should be "unknown" — not 0. If the user wants to indicate zero wait, they should click a button that says "There was no wait." Users should also be able to indicate "The attraction is closed." The wait time field should not default to any numeric value.
**Why:** User request — captured for team memory


---

### Decision: dining-log-ux

# Decision: Dining Log UX — Separate Experience from Rides

**Date:** 2026-04-30
**Author:** Mikey (Lead)
**Status:** Implemented

## Context

Restaurants were previously excluded from the trip log page entirely (filtered out via `LOGGABLE_ENTITY_TYPES`). The user wants restaurants to remain loggable during a trip, but NOT treated the same as ride logging — because you don't "ride" a restaurant.

## Decision

Dining gets its own first-class logging experience, completely separate from rides:

### Architecture
- **New type:** `src/types/dining-log.ts` — `DiningLog` with `mealType`, `restaurantName`, `rating`, `notes`. No `waitTimeMinutes`, no `source` (timer/manual), no ride-specific fields.
- **New collection:** `users/{userId}/diningLogs/{logId}` — separate from rideLogs. Clean data model, no overloaded fields.
- **New service:** `src/lib/services/dining-log-service.ts` — full CRUD with trip association.

### UX
- **Tab toggle** on the log page: "🎢 Rides & Shows" | "🍽️ Dining" — users switch context cleanly.
- **Dining form panel** is warm amber-themed (vs coral for rides). Fields:
  - Meal type grid (Breakfast 🌅, Lunch ☀️, Dinner 🌙, Snack 🍿)
  - Star rating (optional, amber-colored)
  - "What did you have?" notes field (optional)
  - NO wait time, NO timer — irrelevant for dining
- **Trip detail page** shows a dedicated "🍽️ Dining" section below the ride timeline with meal-type icons and distinct amber borders.

### What We Did NOT Do
- Did NOT shove dining into the `rideLogs` collection with a `type` discriminator. That would pollute ride stats and make queries messy.
- Did NOT add dining to `TripStats` yet — can add `totalMeals` later if desired.
- Did NOT add a "Dining" filter pill to the rides list (it's a full tab now — cleaner).

## Impact
- Trip log page now has clear separation of concerns
- Restaurants are surfaced in a dedicated tab (not hidden)
- Dining entries display with 🍽️ and meal-type icons in trip history
- Build passes, no breaking changes to ride logging flow


---

### Decision: park-card-metrics

# Decision: Park Card Wait Time Metrics Redesign

**Author:** Mikey (Lead/Architect)  
**Date:** 2026-04-30  
**Status:** Implemented  
**Requested by:** Devin Sinha

---

## Problem

The parks list page displayed "Shortest wait" on each park card. This metric is meaningless because every park has at least one show or walk-through with a near-zero wait — making all parks appear equally uncrowded and providing no useful signal to a visitor deciding whether to go.

---

## Decision

Replace "Shortest wait" with **average wait across rides reporting a non-zero wait time**, paired with a **crowd level badge** (Quiet / Moderate / Busy / Packed).

### Metric: Average Wait (rides with `waitMinutes > 0`)

- Filter: `status === 'OPERATING' && waitMinutes !== null && waitMinutes > 0`
- Compute: `Math.round(sum / count)` — rounded mean, whole minutes
- Rationale: Excludes shows and walk-throughs (which report 0 or near-0 wait) so the average reflects the true ride-queue load of the park. This differentiates parks from each other and answers "how busy is this park right now?"

### Crowd Level Badge

Derived from the average wait. Displayed on the card's bottom-right, alongside a "N rides" count.

| Avg Wait       | Label    | Color                            |
|----------------|----------|----------------------------------|
| < 20 min       | Quiet    | green-100 / green-700            |
| 20–34 min      | Moderate | amber-100 / amber-700            |
| 35–54 min      | Busy     | orange-100 / orange-700          |
| ≥ 55 min       | Packed   | indigo-100 / indigo-700          |

No red used — accent color is indigo per project UI directive.

### No-Data Handling

When `averageWait === null` (no reporting rides, or data fetch failed), the card falls through to the existing "Live data unavailable" branch. This is correct — we never show "0 min" for a closed or unresponsive park.

---

## Alternatives Considered

| Option | Rejected Because |
|---|---|
| Median wait | Slightly more outlier-resistant but harder to mentally parse; avg is simpler and good enough |
| Shortest wait | Useless — 0 or 1 min always wins via shows/walk-throughs |
| Longest wait (peak) | Good supplemental signal but alone doesn't capture overall crowd feel |
| Avg + Peak dual display | Useful but too verbose for a card; crowd badge does the same communication job more concisely |
| Number of rides under X min | Requires choosing a threshold; average generalizes better |

---

## Files Changed

- `src/components/ParkCard.tsx` — prop `shortestWait` → `averageWait` + `activeRideCount`; added `crowdLevel()` helper; updated label and right-side badge
- `src/app/parks/page.tsx` — state `shortestWaits` → `waitMetrics`; updated computation to filter `> 0` and compute rounded mean; passes `averageWait` + `activeRideCount` to `ParkCard`

---

## Impact

- All park cards now differentiate meaningfully. A Magic Kingdom at 45 min avg vs an Epcot at 28 min avg gives the visitor real information.
- Crowd level badge provides instant, no-math read at a glance.
- Zero behavior change for closed parks (shows "Opens X AM") or parks with no data (shows "Live data unavailable").


---

### Decision: trip-logging-redesign

# Decision: Trip Logging UX Redesign

**Author:** Mikey (Lead/Architect)  
**Date:** 2026-04-30  
**Status:** Proposed  

---

## Problem Statement

The current trip logging flow has three structural issues:

1. **Trip creation is a prerequisite to logging.** Users must plan days/parks upfront before they can log a single ride. This blocks the most common use case: "I'm at Magic Kingdom right now, let me log this ride."
2. **Day structure is implicit but park selection is explicit.** The Trip model stores `parkIds[]` as a flat list with `startDate`/`endDate` range, but the log page forces park selection from that pre-configured list. There's no concept of "what park am I at *right now* on *this day*."
3. **Modes are conflated.** Real-time logging (timer in line), end-of-day recap, and historical trip entry all use the same flow, creating friction for each.

---

## A. Data Model

### Current → Proposed Changes

```
CURRENT:
  Trip { id, name, startDate, endDate, parkIds[], parkNames{}, status, stats, notes }
  RideLog { id, parkId, attractionId, rodeAt, waitTimeMinutes, source, rating, notes, tripId? }

PROPOSED:
  Trip { id, name, startDate, endDate, status, stats, notes, shareId }
  TripDay { tripId, date, parkIds[], parkOrder[], notes? }  ← NEW explicit entity
  RideLog { id, parkId, attractionId, rodeAt, waitTimeMinutes, source, rating, notes, tripId? }  ← unchanged
```

### Key Model Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| Should "day" be explicit? | **Yes — `TripDay` subcollection** (`users/{uid}/trips/{tripId}/days/{date}`) | Enables per-day park assignment, day-level notes, and "which park when" without scanning all ride logs. The date string IS the doc ID. |
| Park selection: per-day or per-log? | **Per-day (TripDay), not per-log** | Park is already on RideLog. TripDay answers "what parks did I visit today?" for UI rendering and trip planning. Ride logs reference parkId independently. |
| Remove flat `parkIds[]` from Trip? | **Yes.** Derive from TripDay docs. | Single source of truth. Trip-level `stats.parksVisited` remains as a denormalized count. |
| Keep `tripId` on RideLog optional? | **Yes.** | Supports standalone logging without a trip context. "Tripless" logs are valid and can be retroactively assigned. |

### TripDay Schema

```typescript
/** A single day within a trip. Doc ID = date string (YYYY-MM-DD). */
export interface TripDay {
  date: string;           // YYYY-MM-DD (also the doc ID)
  parkIds: string[];      // Parks visited this day, in visit order
  parkNames: Record<string, string>;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Trip Schema (Simplified)

```typescript
export interface Trip {
  id: string;
  name: string;
  startDate: string;      // Derived from earliest TripDay
  endDate: string;        // Derived from latest TripDay
  status: TripStatus;     // 'active' | 'completed'
  shareId: string | null;
  stats: TripStats;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Removed:** `parkIds[]`, `parkNames{}` (now on TripDay), `'planning'` status (see below).

**Status change:** Remove `'planning'`. A trip either exists (active, you're logging to it) or is done (completed). "Planning" added cognitive overhead with no user value — you don't plan in this app, you log.

---

## B. User Flows

### Philosophy: "Log First, Organize Later"

Inspired by Untappd (tap to check in, trip/badge structure is secondary) and Strava (press record, categorize after). The atomic action is **logging a ride**. Trips are an *organizational wrapper* around logs, not a prerequisite.

---

### Flow 1: Single-Day, Single-Park Trip

**Scenario:** User goes to Magic Kingdom for one day.

1. **Home/Parks page** → User taps "Log Ride" FAB (floating action button, always visible when signed in)
2. **Quick Log Sheet** → Bottom sheet slides up. Shows:
   - Auto-detected park (if they have an active trip with today's date) OR park picker
   - Attraction search (type-ahead, filtered by selected park)
   - Quick fields: wait time, rating (1-5 stars), optional notes
   - "Start Timer" toggle (switches to timer mode)
3. **After first log** → System auto-creates a trip if none active, OR prompts: "Add to [Spring Break Trip]?" / "Start new trip" / "Log without trip"
4. **End of day** → Trip detail shows timeline of rides at Magic Kingdom

**Screens touched:** 1 (Quick Log Sheet overlay on any page)

---

### Flow 2: Single-Day, Multi-Park (Park Hopping)

**Scenario:** Magic Kingdom morning → Epcot evening.

1. Same as Flow 1 — logs rides at Magic Kingdom via Quick Log
2. **When user switches parks:** They simply select a different park in the Quick Log sheet. The TripDay for today accumulates both parkIds automatically.
3. **No explicit "switch park" action needed.** The park is selected per-log-entry in the Quick Log. The TripDay.parkIds[] builds itself from the logs.
4. **Trip detail** shows the day grouped as: `Day 1: Magic Kingdom (5 rides) → Epcot (3 rides)` based on chronological rodeAt timestamps.

---

### Flow 3: Multi-Day Trip (5-Day WDW Vacation)

**Scenario:** 5-day Walt Disney World vacation.

**Option A — Organic (recommended default):**
1. User arrives Day 1, logs first ride → trip auto-created: "Walt Disney World – Apr 2026"
2. Each subsequent day, logging rides extends the trip. New TripDay docs created as needed.
3. User can rename trip anytime from trip detail page.

**Option B — Planned upfront:**
1. User goes to `/trips/new` → simplified creation: just name + optional start date
2. No day/park pre-planning required. Days materialize as logs are added.
3. If user WANTS to pre-plan (itinerary mode), they can add days from trip detail page.

**Key insight:** Multi-day trips don't need to be "planned" before they happen. They emerge from consecutive days of logging.

---

### Flow 4: Real-Time Logger (In Line)

1. **Quick Log FAB** → Select park + attraction
2. **Tap "Start Timer"** → Timer mode activates. Screen shows elapsed time, attraction name, park name.
3. **User rides** → When done, tap "Rode It!" → Timer stops, wait time auto-calculated, prompt for rating.
4. **Log saved** → Success toast, return to previous screen. Timer data persists in `activeTimer` doc (survives app close).

**Same as today's timer but accessible without navigating into a trip first.**

---

### Flow 5: End-of-Day Recap

1. **Trip detail page** → "Add Past Rides" button (or Quick Log with date picker)
2. **Recap Mode:** Quick Log sheet gets a date/time picker at top. User sets "today at 2:30 PM" → selects park → selects ride → logs with optional wait time from memory.
3. **Batch-friendly:** After saving one, sheet stays open for next entry. "Add Another" is default action. "Done" closes.
4. **Smart suggestions:** Show attractions from selected park, prioritized by popularity. "Did you ride these today?" checklist for power users (Phase 2).

---

### Flow 6: Historical/Past Trip

1. **`/trips/new`** → Create trip with name + past start date
2. **Trip detail** → "Add Day" → pick date, pick park(s)
3. **For each day** → "Add Rides" → Recap Mode (date pre-filled to that day)
4. **Bulk-friendly:** Allow adding multiple rides in sequence without re-selecting park.

---

## C. Key UX Decisions

### C1. Trip Creation: Organic vs. Upfront

**Decision: Default organic, optional upfront.**

- **New default:** First ride log of a day with no active trip → prompt to create trip (name auto-suggested from park + date) or log standalone.
- **Explicit creation** still available at `/trips/new` but radically simplified: just a name field + "Start Trip" button. No day/park pre-planning.
- **Why:** Untappd doesn't make you create a "pub crawl" before your first check-in. Strava doesn't make you plan a route before recording. The trip is a *container you fill*, not a *plan you execute*.

### C2. Park Switching Within a Day

**Decision: Implicit via log entry, no explicit "switch" action.**

- Each ride log already carries `parkId`. When you log at Epcot after logging at MK, the system knows you hopped.
- The Quick Log sheet remembers your last-selected park (localStorage) for convenience, but you can change it anytime.
- TripDay.parkIds[] is recomputed from that day's ride logs on each save (or stored and appended on log creation for perf).

### C3. Trip Detail Presentation

**Decision: Timeline view grouped by day, with park sections within each day.**

```
┌─────────────────────────────────────────┐
│ Spring Break 2026                    ✏️  │
│ Apr 14–18 · Walt Disney World · 23 rides │
├─────────────────────────────────────────┤
│ 📅 Monday, Apr 14                       │
│ ┌─ 🏰 Magic Kingdom (5 rides) ────────┐│
│ │ 9:15 AM  Space Mountain    ⏱️ 35min ★★★★☆ │
│ │ 10:02 AM Big Thunder       ⏱️ 20min ★★★★★ │
│ │ ...                                    │
│ └────────────────────────────────────────┘│
│ ┌─ 🌐 Epcot (3 rides) ────────────────┐│
│ │ 4:30 PM  Test Track        ⏱️ 45min ★★★★☆ │
│ │ ...                                    │
│ └────────────────────────────────────────┘│
├─────────────────────────────────────────┤
│ 📅 Tuesday, Apr 15                      │
│ ...                                      │
└─────────────────────────────────────────┘
```

- **Primary grouping:** By day (chronological)
- **Secondary grouping:** By park within day (in visit order, determined by earliest rodeAt)
- **Each ride entry shows:** Time, attraction name, wait time (if logged), rating stars
- **Expandable:** Tap a ride for notes/details. Default is compact single-line.

### C4. Where Does "Log" Live?

**Decision: Global FAB + contextual entry points.**

| Entry Point | Context | Behavior |
|-------------|---------|----------|
| **FAB (floating action button)** | Any screen, signed in | Opens Quick Log sheet. Always accessible. Primary action. |
| **Trip detail → "+" button** | Viewing a specific trip | Opens Quick Log pre-filled with trip context (active trip auto-stamped) |
| **Park page → "Log a Ride" per attraction** | Browsing a park's wait times | Opens Quick Log pre-filled with that park + attraction |
| **Timer completion** | Timer finishes | Transitions to Quick Log save state (wait time pre-filled from timer) |

**The FAB is the #1 way to log.** It should feel like Untappd's "+" button — always one tap away.

### C5. Real-Time vs. Recap Coexistence

**Decision: Same Quick Log sheet, different "when" selector.**

- **Default:** "Now" (real-time logging / timer mode)
- **Toggle:** "Earlier today" → shows time picker (hour:minute, defaults to 30 min ago)
- **Toggle:** "Different date" → shows full date+time picker (for historical)
- **UI:** Small segmented control at top of Quick Log: `[Now] [Earlier] [Past Date]`

This means ONE logging interface handles all temporal modes. No separate "recap" screen.

---

## D. What to Keep vs. Change

### Keep ✅

| What | Why |
|------|-----|
| `RideLog` schema | Solid, well-designed, no changes needed |
| `ActiveTimer` pattern | Server-timestamp resilience is excellent |
| `tripId` as optional on RideLog | Allows standalone logging |
| Trip stats denormalization | Avoids expensive reads |
| Park → Attraction hierarchy for search | Natural mental model |
| Type filters on attraction list | Genuinely useful for finding rides |
| Timer mode UX | Core timer flow works well |
| Trip sharing (shareId) | Good feature, keep as-is |
| Dining log support | Keep, integrate into Quick Log |

### Change 🔄

| What | From | To |
|------|------|-----|
| Trip creation flow | Heavyweight day-by-day planner | Lightweight: name + start → days emerge |
| "Day" concept | Implicit (grouped from rodeAt) | Explicit TripDay subcollection |
| Park selection model | Pre-configured on Trip | Per-day, built from logs |
| Log entry point | Buried at `/trips/[id]/log` | Global FAB → Quick Log sheet |
| Trip status | planning / active / completed | active / completed only |
| Trip `parkIds[]` | Stored on Trip doc | Derived from TripDays |
| Navigation to log | Trip → Log (2+ taps) | FAB → Log (1 tap anywhere) |
| Mode tabs (single/multi) | On creation page | Eliminated — all trips work the same |

### Remove ❌

| What | Why |
|------|-----|
| Single vs. Multi-Day mode toggle | Unnecessary distinction. A 1-day trip is just a multi-day trip with 1 day. |
| `'planning'` trip status | Creates a liminal state with no value. You're either logging or done. |
| Park group selection on trip creation | Moved to Quick Log. Trips don't need park pre-configuration. |
| "Add Day" flow on trip creation | Days auto-materialize. Manual add available on trip detail for historical. |

---

## E. Proposed Screen Inventory

### Primary Screens (Routes)

| Route | Purpose | Key Elements |
|-------|---------|------|
| `/trips` | Trip list | Cards for each trip (active on top), "New Trip" button, trip stats summary |
| `/trips/new` | Create trip | Name field, optional start date, "Start Trip" button. That's it. |
| `/trips/[tripId]` | Trip detail/timeline | Day-by-park timeline, stats header, actions (complete, share, edit, delete) |
| `/trips/[tripId]/day/[date]` | Day detail (optional) | Deep view of a single day — all rides, dining, notes. Useful for sharing. |

### Overlay/Sheet Components (Not Routes)

| Component | Trigger | Purpose |
|-----------|---------|---------|
| **QuickLogSheet** | FAB tap, "+" on trip, attraction tap on park page | The primary logging interface. Bottom sheet. |
| **TimerOverlay** | "Start Timer" in QuickLogSheet | Persistent timer display. Minimal chrome. Tap to stop & save. |
| **TripPickerSheet** | After first log when no active trip | "Add to trip" / "New trip" / "No trip" choice |
| **AddDaySheet** | "Add Day" on trip detail (historical trips) | Date picker + park multi-select for manual day creation |

### QuickLogSheet Internal States

```
┌─────────────────────────────────┐
│ Log a Ride          [Now ▾]     │  ← temporal mode selector
├─────────────────────────────────┤
│ 🏰 Magic Kingdom        [▾]    │  ← park selector (remembers last)
├─────────────────────────────────┤
│ 🔍 Search attractions...        │  ← type-ahead search
│ [🎢 Thrill] [👨‍👩‍👧 Family] [🎭 Show] │  ← filter chips
├─────────────────────────────────┤
│ Space Mountain              →   │  ← attraction list
│ Big Thunder Mountain        →   │
│ Haunted Mansion             →   │
├─────────────────────────────────┤
│         ↓ (after selection)     │
├─────────────────────────────────┤
│ Space Mountain                  │
│ Wait: [___] min  ☐ Unknown      │
│ Rating: ★★★★☆                   │
│ Notes: [________________]       │
│                                 │
│ [Start Timer]    [Log Ride ✓]   │
└─────────────────────────────────┘
```

### Navigation Architecture

```
Tab Bar:
  [Parks]  [Trips]  [Profile]
                        
Global FAB: [+] → QuickLogSheet (on all tabs when signed in)

/trips (list) → /trips/new (create)
             → /trips/[tripId] (detail/timeline)
                  → /trips/[tripId]/day/[date] (day detail, optional)
```

---

## F. Implementation Priority

### Phase 1: Quick Log + Organic Trips (Ship This First)
1. Build `QuickLogSheet` component (bottom sheet, park picker, attraction search, save)
2. Add global FAB to layout (visible on all pages when authenticated)
3. Implement `TripDay` subcollection + service layer
4. Auto-trip creation flow (first log → "add to trip?" prompt)
5. Simplify `/trips/new` to name-only creation
6. Update trip detail to use TripDay-based timeline grouping

### Phase 2: Polish + Historical
7. Temporal mode selector (Now / Earlier / Past Date) in QuickLogSheet
8. Historical trip creation flow (add days manually from trip detail)
9. `AddDaySheet` for retroactive day/park assignment
10. Migrate existing trip data (flatten parkIds into TripDay docs)

### Phase 3: Delight
11. "Did you ride these?" suggestions based on park popularity
12. Trip completion summary (infographic-style stats card)
13. Streak/stats on profile (total rides logged, parks visited, etc.)
14. Export trip to shareable image

---

## G. Migration Strategy

Existing trips have `parkIds[]` and `parkNames{}` on the Trip doc. Migration:

1. For each existing trip, scan its ride logs grouped by date
2. For each date with logs, create a TripDay doc with parkIds derived from those logs
3. For dates within the trip range with no logs, use the Trip's parkIds as a fallback (assume all parks were available that day)
4. Remove `parkIds`/`parkNames` from Trip doc after migration
5. Migration runs as a one-time Cloud Function or client-side on first trip load (lazy migration)

---

## H. Open Questions for Devin

1. **Auto-trip naming:** Should auto-created trips use park name + date (e.g., "Magic Kingdom · Apr 14") or destination + month (e.g., "Walt Disney World · April 2026")? I recommend destination + month for multi-day, park + date for single-day.
2. **Standalone logs:** Should rides logged without a trip be visible somewhere (e.g., "Unassigned Rides" section)? Or must every ride eventually belong to a trip?
3. **FAB visibility:** Should the FAB appear on the park detail page (where you already see attractions) or would that feel redundant with per-attraction "log" buttons?
4. **Day notes:** Is "day notes" (e.g., "rainy morning, crowds cleared by 2 PM") worth the UI space, or is this over-engineering?

---

*This proposal eliminates the "plan first, log second" anti-pattern and replaces it with "log anywhere, organize effortlessly." The trip becomes a scrapbook you fill in real-time, not an itinerary you execute.*


---

### Decision: dining-consolidation

# Decision: Unified Filter Pill for Dining (No Separate Tab)

**Date:** 2026-04-30  
**Agent:** Mouth (Frontend Dev)  
**File:** `src/app/trips/[tripId]/log/page.tsx`

## Context

The trip log page previously had a separate tab toggle ("Rides & Shows" / "Dining") to switch between logging rides and dining experiences. User feedback: this is redundant — the "Dining" filter pill should be the way to pivot, not a separate section.

## Decision

Removed the tab toggle. Added "🍽️ Dining" as a filter pill in the same row as Thrill, Family, Show, etc. When selected:
- The list shows restaurants (filtered by `RESTAURANT_ENTITY_TYPES`)
- Tapping a restaurant opens the dining-specific modal (reservation toggle, table wait, experience rating, notes)
- The search placeholder adapts ("Search restaurants..." vs "Search rides & shows...")
- The page header updates dynamically

## Rationale

Filter pills ARE the navigation pattern. One list, filter pills at top to pivot content, appropriate modal opens based on entity type. Simpler mental model, less UI clutter, no context-switching between tabs.

## Impact

- Removed `PageTab` type, `activeTab` state, tab toggle UI
- `TYPE_FILTERS` now includes `{ value: 'dining', label: '🍽️ Dining' }`
- `filteredAttractions` handles `typeFilter === 'dining'` to show restaurants
- `handleSelectAttraction` detects restaurant entities and opens dining modal
- All existing dining modal UX preserved (reservation, table wait, meal type, rating, notes)


---

### Decision: dining-ux

# Dining Logging UX — Separate from Rides

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-30  
**Status:** Implemented

## Context

Users want to log restaurants visited during park trips, but the experience should NOT mirror ride logging. Rides focus on queue wait times and timers; dining focuses on the meal experience, reservation status, and food notes.

## Decisions

1. **Separate tab-based UX** — Dining has its own tab ("🍽️ Dining") on the trip log page, distinct from "🎢 Rides & Shows". The dining modal has no timer mode, no queue countdown — just meal type, reservation question, optional table wait, rating, and notes.

2. **"Dining" filter pill bridges discoverability** — A "🍽️ Dining" pill in the rides tab's filter chips auto-switches to the dining tab. Users don't have to know the tab exists to find restaurant logging.

3. **DiningLog type extended** — Added `hadReservation: boolean | null` and `tableWaitMinutes: number | null` to the `DiningLog` interface. These are optional (null = unanswered/unknown) for backward compatibility with existing logs.

4. **Lucide Utensils icon for restaurants** — Restaurants use the `Utensils` icon component from lucide-react rather than emoji, giving a cleaner, more intentional feel that distinguishes dining from rides visually.

5. **Indigo accent on filter pills** — Active filter pill uses `bg-indigo-500` (brand accent), not coral/red which is reserved for errors and destructive actions.

## Impact

- `src/types/dining-log.ts` — 2 new optional fields
- `src/app/trips/[tripId]/log/page.tsx` — Enhanced dining panel, Dining filter pill, Utensils icon
- Firestore: existing `diningLogs` docs unaffected (new fields are nullable)

## Notes

- The `pages-manifest.json` build error is pre-existing infrastructure issue, unrelated to these changes. TypeScript compiles cleanly.
- Old dining log documents without `hadReservation`/`tableWaitMinutes` will read as `undefined` which is handled gracefully (treated as null).


---

### Decision: favorites

# Decision: Favorite Park Families — localStorage Pattern

**Date:** 2026-04-29T22:15:09-07:00  
**Author:** Mouth (Frontend Dev)  
**Status:** Implemented

## Context

Users want to pin their preferred park families to the top of the Parks page for quick access.

## Decision

- **Storage:** `localStorage` key `parkflow-favorite-families` stores an array of `familyId` strings (UUIDs from park-registry).
- **Why familyId, not name:** Family names could change; UUIDs are stable identifiers.
- **Sort order:** Favorited families appear first (alphabetical within favorites), then non-favorites (alphabetical).
- **No auth required:** Works for anonymous users. If we later add authenticated favorites (synced to Firestore), we can merge local + remote.

## Implications

- Any future feature reading park preferences should check `parkflow-favorite-families` in localStorage.
- If park-registry `familyId` values ever change, a migration of stored favorites would be needed.
- The `parkflow-` prefix is now the convention for localStorage keys in this app.


---

### Decision: forecast-labels

# Decision: Forecast Label UX Pattern

**Date:** 2026-04-30  
**Author:** Mouth (Frontend)  
**Status:** Implemented

## Context

The ForecastChart displayed "Based on past visits · N% confidence" for historical forecasts. Users found "47% confidence" confusing and "past visits" misleading (implies the user's own visits).

## Decision

- **Historical forecasts:** Show "Estimated · Based on {sampleCount} reports" when sampleCount is available, otherwise "Estimated from historical data"
- **Live forecasts:** Keep existing "Live forecast" badge (no change)
- **Confidence percentage:** Dropped entirely from user-facing UI — raw model confidence isn't meaningful to end users

## Rationale

- "Reports" is clearer than "visits" — it implies community-sourced data
- Sample count gives users a tangible sense of data quality without a confusing percentage
- Keeps the badge concise and scannable

## Impact

- `ForecastChart.tsx` — label rendering logic
- No API or type changes needed (uses existing `forecastMeta.dataRange.sampleCount`)


---

### Decision: homepage-redirect

# Decision: Authenticated Users Redirect Past Homepage

**Date:** 2026-04-29T22:16:58.419-07:00  
**Author:** Mouth (Frontend Dev)  
**Status:** Implemented

## Context

The marketing/landing homepage is not useful for logged-in users — they've already converted. Showing them hero text and feature cards wastes their time.

## Decision

- Authenticated users hitting `/` are immediately redirected to `/parks` via `router.replace()`.
- The homepage (`src/app/page.tsx`) is now a client component to access `useAuth()`.
- Returns `null` during auth loading to prevent marketing content flash.
- Unauthenticated users still see the full landing page unchanged.

## Trade-offs

- Homepage is no longer a server component (minor SEO impact, but landing pages for logged-in users don't need SEO).
- If `/parks` ever becomes unavailable, logged-in users would redirect there anyway — acceptable since it's the core page.
- Could later be extended to redirect to a personalized dashboard instead.

## Affected Files

- `src/app/page.tsx`
- `src/components/FeatureCards.tsx`


---

### Decision: location-display

# Decision: Location Display Strategy

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Implemented

## Context

Location info (city, state/country) was displayed both on the family group header AND on each individual park card within that group on the parks listing page. Since all parks under a family share the same location, this was redundant visual noise.

Meanwhile, the park detail/deep-dive page had no location or family context — users couldn't tell where a park was or what resort group it belonged to without going back.

## Decision

1. **Parks listing page:** Location appears ONLY on the family/group header, not on individual park cards.
2. **Park detail page:** Shows location (MapPin icon + city/state) and family membership ("Part of [destination] · [family name]") directly below the park name.

## Implementation

- Removed `location={resolveLocation(park)}` prop from `<ParkCard>` on parks listing page
- Added `MapPin` icon import + `DESTINATION_FAMILIES`/location helpers to park detail page
- Family lookup uses `DESTINATION_FAMILIES.find()` to resolve park ID → family name
- Shows "Part of {destinationName}" always; appends "· {familyName}" when family differs from destination

## Impact

- Cleaner parks listing (less repetition per card)
- Better wayfinding on detail pages (users immediately know location + resort context)
- No new dependencies — reuses existing `park-locations.ts` and `park-registry.ts`


---

### Decision: park-filter

# Decision: Searchable Park Family Dropdown Filter

**Date:** 2026-04-29  
**Author:** Mouth (Frontend Dev)  
**Status:** Implemented

## Context

The Parks page had only a text search input. Users needed a way to quickly filter by park family/destination (e.g., "Walt Disney World", "Universal Orlando") without typing.

## Decision

Added a custom searchable dropdown (no external UI library) next to the existing text search input. Implementation details:

- **Custom component inline** — a focused input reveals a filtered dropdown list; clicking an option selects it and closes the list. No shadcn/radix dependency needed.
- **Both filters compose** — text search and family dropdown filter together (AND logic).
- **"All Parks" default** — dropdown shows all parks when no family is selected; clear button (X) resets.
- **Responsive** — full-width stacked on mobile (`flex-col`), side-by-side on sm+ (`sm:flex-row`).
- **Styled consistently** — same border, rounded-lg, ring focus states as existing search input.
- **Outside click closes** — mousedown listener on document closes dropdown when clicking away.

## Alternatives Considered

1. **Native `<select>`** — not searchable, poor UX for 10+ options.
2. **Install headless UI library (Radix, Headless UI)** — adds dependency for one component; overkill.
3. **Combobox from shadcn** — project doesn't use shadcn; would require setup.

## Impact

- No new dependencies added
- All 403 tests passing
- Mobile-friendly layout preserved


---

### Decision: park-group-rename

# Decision: Rename "Resort Group" → "Park Group" + Keyword Search

**Date:** 2026-04-30  
**Author:** Mouth (Frontend Dev)  
**Status:** Implemented

## Summary

Renamed all user-facing instances of "Resort Group" to "Park Group" across the app. Added keyword-based search to `SearchableSelect` so users can type individual park names (e.g., "Epcot") and the dropdown filters to show the parent group ("Walt Disney World").

## Changes

1. **Label/placeholder rename** — All UI text updated: labels, placeholders, aria-labels, comments, HTML IDs, variable names (`resortGroups` → `parkGroups`, `resortGroupOptions` → `parkGroupOptions`).

2. **SearchableSelect `keywords` prop** — New optional `keywords: string[]` field on `SearchableSelectOption`. Filter logic matches against both `label` and `keywords`. Only the label is displayed in the dropdown.

3. **Trip pages pass park names as keywords** — `parkGroupOptions` in `/trips/new` and `/trips/[tripId]/edit` now include `keywords: group.parks.map(p => p.name)`.

## Files Modified

- `src/components/ui/SearchableSelect.tsx` — Interface + filter logic
- `src/app/trips/new/page.tsx` — Rename + keywords
- `src/app/trips/[tripId]/edit/page.tsx` — Rename + keywords
- `src/app/parks/page.tsx` — Stats label rename

## Rationale

- "Park Group" is more intuitive than "Resort Group" — not all destinations are resorts
- Keyword search improves discoverability — users think in terms of individual parks, not corporate destination names


---

### Decision: remove-restaurants-from-log

# Decision: Filter non-loggable entity types from ride log

**Date:** 2026-04-30  
**Author:** Mouth (Frontend Dev)  
**Status:** Implemented

## Context

Restaurants (and other non-ride entities like shops and hotels) were appearing in the "Log a Ride" page's attraction list because the query fetches all entities associated with a park without filtering by type.

## Decision

Only entities with `entityType` in `['ATTRACTION', 'RIDE', 'SHOW', 'MEET_AND_GREET']` are loggable. All other types (RESTAURANT, SHOP, MERCHANDISE, HOTEL, etc.) are filtered out at the data level before rendering.

## Scope of Changes

1. **Trip ride log page** (`src/app/trips/[tripId]/log/page.tsx`) — Added `LOGGABLE_ENTITY_TYPES` allowlist filter in the `filteredAttractions` memo. Entities without an `entityType` are still shown (graceful fallback for legacy data).
2. **Manual log form** (`src/components/ride-log/ManualLogForm.tsx`) — Same filter applied at fetch time so the searchable dropdown never includes restaurants/shops/hotels.

## Notes

- Filter uses an allowlist (not a blocklist) so any new non-ride entity types added upstream are excluded by default.
- Entities with `entityType === undefined` pass through to avoid hiding legacy data that hasn't been categorized yet.


---

### Decision: theme-accent

# Decision: Accent Color Policy — No Red for Interactive Chrome

**Date:** 2026-04-29  
**Author:** Mouth (Frontend)  
**Status:** Implemented

## Context

User reported that red in hover/active button states looks alarmist. The existing blue palette (primary) pairs well with indigo for interactive accents and amber for warm data emphasis.

## Decision

**Red is reserved exclusively for:**
- Error messages and validation feedback
- Destructive/irreversible actions (delete buttons, ConfirmDialog)
- Status indicators (closed, down, offline)
- Semantic data thresholds (extreme crowd level, very long waits in badges)

**Interactive chrome (hover, active, selected, focus) uses:**
- `indigo` for primary interactive accents (buttons, active states)
- `amber` for warm data emphasis (stats, highlights that aren't errors)

**Changes made:**
- Stop Timer button: `bg-red-500/hover:bg-red-600` → `bg-indigo-500/hover:bg-indigo-600`
- Longest Wait stat: `text-red-600` → `text-amber-600`

## Impact

- All agents: when adding new interactive UI elements, use indigo/violet for accent states, NOT red
- Red should trigger a mental check: "Is this communicating error or destruction?"
- Data indicators that show "bad" values (long waits, high crowds) may keep red in badges/pills where it's clearly semantic


---

### Decision: trip-day-default

# Decision: Park Group Carries Forward on Multi-Day Trips

**Date:** 2026-04-30  
**Author:** Mouth (Frontend Dev)  
**Status:** Implemented  

## Context

When users add multiple days to a trip, they typically visit parks in the same destination group (e.g., Walt Disney World) across all days. Previously, the Park Group dropdown reset to empty after each day was added, forcing users to re-select it every time.

## Decision

After adding a day to a multi-day trip, the Park Group selection persists for the next day's builder. Only the park checkboxes reset. The user can still change the group at any time.

## Rationale

- Most multi-day trips are at a single destination (e.g., a week at Disney World)
- Saves 1-2 taps per day added — meaningful friction reduction over a 5-7 day trip
- No downside: if user switches destinations mid-trip, they just pick a new group
- First day still has no pre-selected default (no behavior change for single-day trips)

## Scope

- `src/app/trips/new/page.tsx` — create flow
- `src/app/trips/[tripId]/edit/page.tsx` — edit flow


---

### Decision: unified-search

# Decision: Unified Search Control on Parks Page

**Date:** 2026-04-29  
**Author:** Mouth (Frontend Dev)  
**Status:** Implemented  

## Context

The Parks page had two separate filter controls — a text search input and a searchable family dropdown. User requested combining them into a single intuitive control.

## Decision

Replaced both controls with a single command-palette-style unified search input:

- One input field with sectioned dropdown (Park Families / Parks)
- Family selection renders as a removable chip/tag inside the input
- Typing after family selection further filters parks within that family
- Favorites (star) preserved — favorited families sort to top in dropdown
- Keyboard support: Escape closes, Backspace removes chip when empty
- Dropdown limited to 8 park suggestions for performance
- Responsive — works on mobile and desktop with same layout

## Impact

- Removed `ChevronDown` icon import (no longer needed)
- Removed `familySearchQuery` and `familyDropdownOpen` state — replaced with single `dropdownOpen`
- Added `inputRef` for focus management after chip interactions
- Added `matchingFamilies` and `matchingParksForDropdown` memos
- No breaking changes to data layer or other components

## Files Changed

- `src/app/parks/page.tsx` — complete search/filter UI rewrite


---

### Decision: unknown-wait-time

# Decision: Unknown Wait Time UX Pattern

**Date:** 2026-04-30  
**Author:** Mouth (Frontend Dev)  
**Status:** Implemented

## Context

Users logging rides from past trips often don't remember exact wait times. Previously, leaving the field blank resulted in `null` being stored (good), but there was no explicit UX affordance communicating this was intentional. Users might feel uncertain whether leaving it blank means "0 minutes" or "unknown."

## Decision

Added an explicit "I don't remember" checkbox below the wait time input in both:
- Trip log page (`/trips/[tripId]/log`) ride panel
- Manual log form (`ManualLogForm` component)

### Behavior

- **Checkbox unchecked (default):** Normal number input shown. Empty field = null.
- **Checkbox checked:** Number input hidden, replaced with a subtle "Unknown" badge. Wait time stored as `null`.
- **Display:** All views (trip detail, shared trips, ride log entries) now show "—" for null wait times instead of hiding the badge entirely.
- **Crowdsourcing:** Null wait times are NOT submitted to the crowd data pool — only timer-based reports (which always have real values) go through `submitCrowdReport`.

## Rationale

- Explicit > implicit: A checkbox makes it clear the user *chose* not to record wait time
- Storing as `null` (not 0) preserves data integrity for aggregation
- The "—" display distinguishes "unknown" from "no wait" (which would be 0)
- No backend changes needed — `waitTimeMinutes: number | null` was already the type

## Affected Files

- `src/app/trips/[tripId]/log/page.tsx` — Added `waitTimeUnknown` state + checkbox UI
- `src/components/ride-log/ManualLogForm.tsx` — Same pattern
- `src/components/ride-log/RideLogEntry.tsx` — Shows "—" badge for null
- `src/app/trips/[tripId]/page.tsx` — Shows "—" for null in trip detail
- `src/app/trips/shared/[shareId]/page.tsx` — Shows "—" for null in shared view

