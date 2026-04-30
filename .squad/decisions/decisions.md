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
