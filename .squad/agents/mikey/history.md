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
