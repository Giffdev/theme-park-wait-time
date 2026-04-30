# Mikey — History

## Project Context

- **Project:** theme-park-wait-times — A platform for theme park visitors to track ride wait times, log visits, plan trips with crowd calendars, and crowd-source real-time wait data.
- **Stack:** React/Next.js, TypeScript, Firebase (Firestore, Auth, Cloud Functions), Vercel, Tailwind CSS
- **User:** Devin Sinha
- **Origin:** Migrating from GitHub Spark prototype at Giffdev/theme-park-wait-time (used fake data)
- **Reference apps:** Devin's arkham-horror-tracker and unmatched apps (similar Firebase + Vercel pattern)
- **Competitors:** thrill-data.com (useful data, poor UI)

## Learnings

### 2026-04-28 — Architecture Plan Created
- **Key file:** `docs/ARCHITECTURE.md` — the foundational doc for the whole build
- **Decision file:** `.squad/decisions/inbox/mikey-architecture-plan.md`
- Prototype analysis complete: Spark KV-based SPA with fake data, custom auth, ~20 components, 8 pages, 5 services
- Prototype had good type definitions (`src/types/index.ts`) and UX patterns worth porting — bad auth and data layer
- **Schema pattern:** Attractions as subcollection of parks; currentWaitTimes separated from attraction docs for write isolation; historical wait times as one doc per attraction per day; crowd calendar as month-maps
- **Security pattern:** "Read publicly, write privately" — all park/ride/wait data is public read, user data is owner-only, crowd reports are mixed (public aggregates, private attribution)
- **Data pattern:** Server-side only fetching via Vercel Cron → Firestore. No API keys in browser. ThemeParks.wiki as primary source.
- **Auth pattern:** Firebase Auth (email + Google). Never custom auth. Auth state via React context + `onAuthStateChanged`.
- **User preference:** Devin wants accuracy for ride open/closed status based on current day, seasonal attraction logging, strong security, and minimal approval cycles — hence the comprehensive upfront plan
- **Five-phase build plan** assigned across team: Mouth (UI), Chunk (data pipeline), Data (Firebase/backend), Stef (testing), Mikey (architecture/review)

### 2026-04-29 — Ride Logging & Crowdsourced Wait Times Architecture
- **Decision file:** `.squad/decisions/inbox/mikey-ride-logging-architecture.md`
- **Schema pattern:** Ride logs as user subcollection (`users/{uid}/rideLogs/{id}`); active timer as single doc (`users/{uid}/activeTimer`); crowd reports anonymized in separate top-level collection (`crowdsourcedWaitTimes/{parkId}/reports/` + `aggregates/`)
- **Privacy pattern:** "Write privately, aggregate anonymously, read publicly" — userId stripped at API route before crowd report write. No userId ever reaches public collections.
- **Aggregation pattern:** Time-weighted moving average with 30-min half-life, statistical outlier rejection (2σ), confidence tiers (low/med/high based on report count in last 60 min). Computed synchronously in `/api/queue-report` API route — no Cloud Functions needed at current scale.
- **Timer resilience:** Timer is NOT a client-side interval — elapsed = `now - startedAt` from Firestore. Survives app close, page refresh, device switch. Auto-abandoned after 4 hours.
- **Security rules:** Ride logs/timers are owner-only read/write. Crowd reports/aggregates are public read, server-only write (Admin SDK via API route).
- **Build order:** Types → Services → Aggregation logic → API route → UI components → Integration. Data builds Phase 1+3, Chunk builds Phase 2, Mouth builds Phase 4.
- **Valid timer range:** 2–180 minutes. Outside = excluded from crowd aggregates but still logged for user.

### 2026-04-29 — Trip Planner & Ride Type Filters Architecture
- **Decision file:** `.squad/decisions/inbox/mikey-trip-planner-architecture.md`
- **Trip schema pattern:** Trips as user subcollection (`users/{uid}/trips/{tripId}`). Ride logs get optional `tripId` field linking them to a trip — no data duplication, query with composite index.
- **Active trip constraint:** Only one trip can be `status: 'active'` per user at a time. Timer completion and manual logs auto-stamp `tripId` when active trip includes that park.
- **Stats pattern:** Denormalized stats object on Trip doc, recomputed when ride logs change. Avoids expensive reads.
- **Ride type filter data:** `entityType` field already exists on all 533 attractions in Firestore (from ThemeParks.wiki: ATTRACTION, SHOW, RESTAURANT, MERCHANDISE). Phase 1 filters on this. Phase 2 enriches with our own `AttractionType` taxonomy.
- **Key existing types:** `src/types/trip.ts` exists but is a Spark prototype leftover — needs full replacement. `src/types/ride-log.ts` is the real ride log type that gets `tripId` added.
- **Route structure:** `/trips`, `/trips/new`, `/trips/[tripId]`, `/trips/[tripId]/edit`
- **Quick win:** Ride type filter chips on park page can ship immediately with zero backend changes — just client-side filtering on existing `entityType` field.
- **Devin preferences needed:** Trip sharing (public vs private), export format, multi-trip overlap rules, default filter behavior for non-rides.

### 2026-04-29 — Virtual Queue, Enhanced Sidebar & Events Architecture
- **Decision file:** `.squad/decisions/inbox/mikey-virtual-queue-sidebar-events.md`
- **Key discovery:** ThemeParks Wiki API returns WAY more data than we consume. `forecast[]` with hourly predictions, `operatingHours[]` per attraction, `queue.RETURN_TIME`/`PAID_RETURN_TIME`/`BOARDING_GROUP`, and `TICKETED_EVENT` schedules with Lightning Lane pricing.
- **Architecture pattern:** "Widen the pipe" — no new endpoints needed for virtual queues or forecasts. Just expand what we capture from the existing live data response and store in Firestore.
- **Sidebar chart breakthrough:** The PRNG fake data in `DayChart` can be replaced immediately with real API `forecast` data. No historical data collection needed for v1.
- **Schedule endpoint:** One new endpoint `/api/park-schedule` for park hours + events. Caches in Firestore at 1-hour intervals.
- **Data model additions:** `queue` object on `waitTimes/{parkId}/current/{attractionId}`, `forecast` + `operatingHours` fields, new `parkSchedules/{parkId}/daily/{date}` collection.
- **Historical data strategy:** Start archiving snapshots now to `waitTimeHistory/{parkId}/daily/{date}/attractions/{attractionId}` — don't block features on it, use for "typical day" overlays after 30 days.
- **Lightning Lane pricing:** Available in schedule `purchases[]` array — real-time pricing with availability flags. Major differentiator vs competitors.
- **Implementation estimate:** 7 person-days for Phase 1, all using existing API data. No new infrastructure or third-party services.

## Scribe Orchestration Log (2026-04-29 18:47:57Z)

**Phase 1 Team Delivery:**
- Architecture spec for virtual queues, enhanced sidebar, special events finalized
- All three features use existing API data — zero new infrastructure
- Decision #15 merged into decisions.md with full phased implementation plan (Phase 1: 7 days, Phase 2: background, Phase 3: enrichment)
- Chunk widened wait-times API to capture queue types, forecast, operatingHours
- Data built `/api/park-schedule` endpoint with 1-hour caching
- Mouth built ForecastChart, ParkScheduleBar, virtual queue badges components
- Stef wrote 44 comprehensive tests covering Phase 1 deliverables
- Team ready for Devin review of Phase 1 + architecture directives

### 2026-04-29 — Blended Forecast System Architecture
- **Decision file:** `.squad/decisions/inbox/mikey-blended-forecast.md`
- **Core pattern:** Pre-computed aggregates at `forecastAggregates/{parkId}/byDayOfWeek/{dayOfWeek}/attractions/{attractionId}` — avoids expensive multi-doc reads at query time.
- **Blending rule:** Live API forecast always wins. Historical fallback only when `totalSamples >= 15` (confidence threshold). Below threshold = "not available" (never serve bad data).
- **Decay strategy:** Exponential decay with 30-day half-life — recent Saturdays matter more than old Saturdays.
- **Aggregation trigger:** Post-write in existing `/api/wait-times` route (no Cloud Functions needed). Incremental averaging keeps cost to 1 read + 1 write per attraction.
- **Non-breaking API change:** `forecast` field stays as `ForecastEntry[]` for backward compat. New `forecastMeta` sibling field carries source/confidence/dataRange.
- **Cold-start reality:** Need ~3 same-weekday visits with 5+ snapshots each before historical becomes useful. Popular parks: 3-4 weeks. Unpopular parks: may never reach threshold. Phased rollout handles this gracefully.
- **Key files:** `src/lib/forecast/aggregation.ts` (Chunk), `src/lib/forecast/blender.ts` (Data), `ForecastChart.tsx` (Mouth adds source badge)
- **Build order:** Chunk (aggregation pipeline) → Data (API blending logic + forecastMeta) → Mouth (source badge UI)

### 2026-04-30 — Park Card Wait Time Metrics Redesign
- **Decision file:** `.squad/decisions/inbox/mikey-park-card-metrics.md`
- **Problem:** "Shortest wait" on park cards was useless — every park has a 0-wait show or walk-through, making all parks look identical.
- **Solution:** Replace `shortestWait` with `averageWait` across rides where `waitMinutes > 0`. Filtering out zero-wait entries eliminates shows/walk-throughs that skew the signal. Compute a rounded mean in `parks/page.tsx`.
- **Crowd level badge:** Added `crowdLevel(avg)` helper in `ParkCard.tsx` mapping avg to Quiet/Moderate/Busy/Packed. Thresholds: < 20 min = Quiet (green), 20–34 = Moderate (amber), 35–54 = Busy (orange), ≥ 55 = Packed (indigo). No red used per project accent directive.
- **State shape change:** `shortestWaits: Record<string, number | null>` → `waitMetrics: Record<string, { average: number | null; activeRideCount: number }>`. Passes `activeRideCount` so card shows "12 rides" context.
- **No-data handling:** Null average falls through to existing "Live data unavailable" branches — no zero-minute display.
- **Key rule:** Always filter `waitMinutes > 0` (not just `!== null`) before computing park-level averages. Zero-wait attractions are valid Firestore entries but meaningless for crowd-level inference.

### 2026-04-30 — Trip Logging UX Redesign Proposal
- **Decision file:** `.squad/decisions/inbox/mikey-trip-logging-redesign.md`
- **Core philosophy shift:** "Log First, Organize Later" — trips become containers you fill, not itineraries you execute. Inspired by Untappd check-in model.
- **New entity:** `TripDay` subcollection (`users/{uid}/trips/{tripId}/days/{date}`) — explicit day entity replaces implicit grouping. Doc ID = date string.
- **Trip model simplification:** Remove `parkIds[]`/`parkNames{}` from Trip (moved to TripDay). Remove `'planning'` status. Trips are either active or completed.
- **Primary UX change:** Global FAB → QuickLogSheet (bottom sheet) replaces buried `/trips/[id]/log` route. One tap from anywhere to log a ride.
- **Organic trip creation:** First log with no active trip prompts "add to trip?" — no upfront day/park planning required. Manual creation simplified to name-only.
- **Park hopping:** Implicit via parkId on each ride log. TripDay.parkIds[] built from logs. No explicit "switch park" action.
- **Temporal modes:** Single QuickLogSheet handles real-time, end-of-day recap, and historical logging via [Now | Earlier | Past Date] selector.
- **Trip detail redesign:** Timeline grouped by day → by park within day → by ride chronologically.
- **Key architectural decision:** RideLog schema unchanged. TripDay is additive. Migration needed for existing trips (derive TripDay docs from ride log dates).
- **Open questions for Devin:** Auto-naming strategy, standalone log visibility, FAB placement, day-level notes value.
