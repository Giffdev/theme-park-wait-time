# ParkFlow — Product Requirements Document

> **Status:** Living document — source of truth for the squad.
> **App name:** ParkFlow (working title "ParkPulse" in some legacy references)
> **Last updated:** 2026-04-30
> **Author:** Mikey (Lead / Architect)

---

## 1. Product Overview & Vision

### What Is ParkFlow?

ParkFlow is a theme park visit tracker and planning tool for enthusiasts who want to maximize their time in the park. It surfaces live wait times, crowd predictions, and personal ride-logging in a single mobile-first web application.

### Core Value Proposition

> "Skip the guesswork. Ride more."

Theme park guests waste significant time in queues because they lack real-time information about which attractions are busy and when. ParkFlow solves this by combining live third-party wait time data with crowdsourced reports, historical crowd patterns, and personal trip history — all in a unified interface that works on any device.

### Design Principles

1. **Read publicly, write privately** — live park data is available without sign-in; personal data (logs, trips) requires authentication.
2. **Mobile first** — primary use case is on a phone inside a theme park.
3. **Low friction logging** — adding a ride to your log should take seconds, not a form with ten fields.
4. **Data honesty** — never surface crowd predictions with more confidence than the data warrants.

---

## 2. User Personas

### Persona A — The Day-Tripper ("Dana")
- Visits 1–2 parks per year, typically planned months in advance
- Wants to know the best days to visit and which rides to prioritize
- Cares about: crowd calendar, live wait times on the day, operating hours
- Auth: likely creates an account to log a single trip

### Persona B — The Annual Pass Holder ("Alex")
- Visits 10–30+ times per year to a single resort
- Tracks every ride, builds a personal history, cares about stats
- Cares about: ride log, queue timer, trip history, personal dashboard
- Auth: always signed in; heavy Firestore usage

### Persona C — The Vacation Planner ("Pat")
- Planning a multi-day trip for family
- Needs crowd calendar to pick arrival dates; wants a trip itinerary
- Cares about: crowd calendar, trip creation, dining log, shared trip view
- Auth: creates account for the planning experience; may share with family

---

## 3. Feature Inventory

### 3.1 Authentication

| Feature | Status |
|---------|--------|
| Email/password sign-up | ✅ Built |
| Email/password sign-in | ✅ Built |
| Session persistence (Firebase Auth) | ✅ Built |
| Landing page redirect for authed users | ✅ Built |
| Protected routes (client-side auth guard) | ✅ Built |

**Routes:** `/auth/signin`, `/auth/signup`

The root route (`/`) renders a marketing landing page for unauthenticated visitors. Authenticated users are immediately redirected to `/parks`. Navigation adapts between desktop header (AuthNavDesktop) and mobile bottom bar (AuthNavMobile).

---

### 3.2 Park Browser

**Route:** `/parks`

Displays park destinations organized by family (Disney, Universal, SeaWorld, Cedar Fair, Six Flags, Merlin, etc.) sourced entirely from the static park registry. Cards link to individual park pages.

| Feature | Status |
|---------|--------|
| Park family browser grid | ✅ Built |
| ParkCard component | ✅ Built |
| Static park registry (130+ parks, 7900+ attractions) | ✅ Built |

---

### 3.3 Park Detail Page

**Route:** `/parks/[parkId]`

The central live-data page. Fetches current wait times from the ThemeParks Wiki API proxy and displays all attractions for a park.

| Feature | Status |
|---------|--------|
| Live wait time fetch (via `/api/wait-times`) | ✅ Built |
| Attraction list with WaitTimeBadge | ✅ Built |
| Sort by wait time (alphabetical fallback when unavailable) | ✅ Built |
| AttractionFilterChips (type, entity, operating status) | ✅ Built |
| ParkScheduleBar — visual operating hours display | ✅ Built |
| ParkOperatingStatus badge | ✅ Built |
| RideDetailPanel — slide-out panel with attraction details | ✅ Built |
| QueueTimerButton — start timer directly from attraction row | ✅ Built |
| UnifiedLogSheet — bottom sheet for quick ride logging | ✅ Built |
| ReportWaitTimeModal — crowdsourced report submission | ✅ Built |
| RecentReports — display of recent crowd reports | ✅ Built |
| WaitTimeSparkline — mini trend chart per attraction | ✅ Built |

**Filtering dimensions (AttractionFilterChips):**
- Type: `thrill`, `family`, `show`, `experience`, `character-meet`
- Entity type
- Operating status: `operating`, `closed`, `delayed`, `refurbishment`, `seasonal-closed`

---

### 3.4 Attraction Detail Page

**Route:** `/parks/[parkId]/attractions/[attractionId]`

Deep-dive on a single attraction.

| Feature | Status |
|---------|--------|
| Attraction metadata display | ✅ Built |
| ForecastChart — wait time prediction curve by hour | ✅ Built |
| WaitTimeSparkline | ✅ Built |
| Crowdsourced reports display | ✅ Built |
| Report wait time form | ✅ Built |

---

### 3.5 Queue Timer

A persistent timer flow for tracking how long a user actually waits in line.

| Feature | Status |
|---------|--------|
| QueueTimerButton — start timer from park page | ✅ Built |
| QueueTimerBanner — persists across all pages while timer is active | ✅ Built |
| TimerDisplay — live elapsed time counter | ✅ Built |
| TimerCompleteSheet — bottom sheet to log wait on completion | ✅ Built |
| ActiveTimer state persisted in Firestore (`users/{uid}/activeTimer`) | ✅ Built |
| Auto-log wait time on completion | ✅ Built |
| `clientStartedAt` epoch fallback for offline resilience | ✅ Built |
| `useActiveTimer` hook for timer state subscription | ✅ Built |

**Timer lifecycle:** `active` → `completed` / `abandoned`

---

### 3.6 Ride Logging

Users can record every ride they take.

| Feature | Status |
|---------|--------|
| Manual log form (ManualLogForm) | ✅ Built |
| Timer-based auto-log | ✅ Built |
| Fields: park, attraction, wait time (nullable), rating 1–5, notes | ✅ Built |
| `attractionClosed` flag (walk-on with closed status) | ✅ Built |
| Trip association (`tripId` link) | ✅ Built |
| Source tracking (`timer` vs `manual`) | ✅ Built |
| RideLogEntry display component | ✅ Built |
| RideLogList component | ✅ Built |
| WaitTimeInput component | ✅ Built |
| Edit / Delete ride log entries | ✅ Built |

**Routes:** `/ride-log`, `/log`, `/log/history`

---

### 3.7 Dining Logging

Users can record restaurant visits during trips.

| Feature | Status |
|---------|--------|
| Dining log entry creation | ✅ Built |
| Fields: park, restaurant, meal type, rating 1–5, notes, hadReservation, tableWaitMinutes | ✅ Built |
| Meal types: `breakfast`, `lunch`, `dinner`, `snack` | ✅ Built |
| Trip association | ✅ Built |
| Firestore path: `users/{uid}/diningLogs/{logId}` | ✅ Built |

---

### 3.8 Trip Management

Multi-day trip creation and tracking.

| Feature | Status |
|---------|--------|
| Trip list page with active/upcoming/completed sections | ✅ Built |
| Create trip form (`/trips/new`) | ✅ Built |
| Edit trip form (`/trips/[tripId]/edit`) | ✅ Built |
| Trip status lifecycle: `planning` → `active` → `completed` | ✅ Built |
| TripCard component with park name pills | ✅ Built |
| ActiveTripBanner — shows current active trip across all pages | ✅ Built |
| Computed TripStats (totalRides, totalWaitMinutes, parksVisited, uniqueAttractions, favoriteAttraction) | ✅ Built |

**Routes:** `/trips`, `/trips/new`, `/trips/[tripId]`, `/trips/[tripId]/edit`

---

### 3.9 Trip Detail & Timeline

**Route:** `/trips/[tripId]`

| Feature | Status |
|---------|--------|
| Timeline grouped by date → park → chronological entries | ✅ Built |
| TripDayCard component | ✅ Built |
| Time labels on ride entries | ✅ Built |
| Trip-level aggregate stats display | ✅ Built |
| Share link generation (creates `shareId`) | ✅ Built |
| Park names resolved via `getParkById` registry fallback | ✅ Built |

---

### 3.10 Trip Logging (Log to Trip)

**Route:** `/trips/[tripId]/log`

Quick in-trip logging interface.

| Feature | Status |
|---------|--------|
| Park selector | ✅ Built |
| Attraction search (SearchableSelect) | ✅ Built |
| Wait time input | ✅ Built |
| Dining log entry from trip context | ✅ Built |

---

### 3.11 Trip Sharing

**Route:** `/trips/shared/[shareId]`

| Feature | Status |
|---------|--------|
| Generate unique `shareId` for a trip | ✅ Built |
| Public read-only view (no auth required) | ✅ Built |
| `sharedTrips/{shareId}` index in Firestore | ✅ Built |
| `/api/trips/[shareId]` route serving public trip data | ✅ Built |
| Stats display on shared view | ✅ Built |

---

### 3.12 Crowd Calendar

**Route:** `/calendar`

Monthly heat-map view of predicted crowd levels.

| Feature | Status |
|---------|--------|
| MiniMonth grid calendar | ✅ Built |
| CalendarDayCell with color coding (4-level: Low/Moderate/High/Extreme) | ✅ Built |
| FamilySelector — choose which park family to view | ✅ Built |
| BestPlanBanner — "best plan" park-routing recommendation for a month | ✅ Built |
| Per-park per-day crowd breakdown | ✅ Built |
| `/api/crowd-calendar` backend route | ✅ Built |
| PARK_FAMILIES derived from canonical park registry | ✅ Built |

**Crowd level scale (4-tier):**
- 1 = Low (green)
- 2 = Moderate (yellow)
- 3 = High (orange)
- 4 = Extreme (red)

---

### 3.13 Crowdsourced Wait Reports

| Feature | Status |
|---------|--------|
| Submit wait time report (ReportWaitTimeModal) | ✅ Built |
| `/api/queue-report` POST endpoint | ✅ Built |
| Anonymous report storage (`crowdsourcedWaitTimes/{parkId}/reports/{reportId}`) | ✅ Built |
| CrowdAggregate pre-computed (confidence: low/medium/high/none) | ✅ Built |
| `/api/crowd-reports` GET endpoint | ✅ Built |
| RecentReports display component | ✅ Built |

---

### 3.14 User Dashboard

**Route:** `/dashboard`

| Feature | Status |
|---------|--------|
| Total rides logged | ✅ Built |
| Parks visited count | ✅ Built |
| Total trips | ✅ Built |
| Total wait time logged | ✅ Built |

---

### 3.15 About Page

**Route:** `/about`

Static informational page about the application.

---

## 4. Data Architecture

### Firestore Collections

```
users/{userId}/
  ├── rideLogs/{logId}           — RideLog documents
  ├── diningLogs/{logId}         — DiningLog documents
  ├── trips/{tripId}             — Trip documents
  └── activeTimer                — Single doc; queue timer state

sharedTrips/{shareId}            — Index for public trip sharing

crowdsourcedWaitTimes/{parkId}/
  └── reports/{reportId}         — Individual CrowdReport documents
```

### Key Document Shapes

#### RideLog (`users/{uid}/rideLogs/{id}`)
```typescript
{
  parkId: string
  attractionId: string
  parkName: string
  attractionName: string
  rodeAt: Timestamp
  waitTimeMinutes: number | null   // null = unknown; 0 = walk-on
  attractionClosed: boolean
  source: 'timer' | 'manual'
  rating: number | null            // 1–5
  notes: string
  tripId: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

#### DiningLog (`users/{uid}/diningLogs/{id}`)
```typescript
{
  parkId: string
  restaurantId: string
  parkName: string
  restaurantName: string
  diningAt: Timestamp
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  rating: number | null
  notes: string
  hadReservation: boolean | null
  tableWaitMinutes: number | null
  tripId: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

#### Trip (`users/{uid}/trips/{id}`)
```typescript
{
  name: string
  startDate: string          // YYYY-MM-DD
  endDate: string            // YYYY-MM-DD
  status: 'planning' | 'active' | 'completed'
  shareId: string | null
  stats: {
    totalRides: number
    totalWaitMinutes: number
    parksVisited: number
    uniqueAttractions: number
    favoriteAttraction: string | null
  }
  notes: string
  parkIds?: string[]         // @deprecated — backward compat only
  parkNames?: Record<string, string>  // @deprecated — backward compat only
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

#### ActiveTimer (`users/{uid}/activeTimer`)
```typescript
{
  parkId: string
  attractionId: string
  parkName: string
  parkSlug?: string
  attractionName: string
  startedAt: Timestamp
  clientStartedAt: number    // epoch ms — offline resilience
  status: 'active' | 'completed' | 'abandoned'
  updatedAt: Timestamp
}
```

#### CrowdReport (`crowdsourcedWaitTimes/{parkId}/reports/{id}`)
```typescript
{
  attractionId: string
  waitTimeMinutes: number
  reportedAt: Timestamp
  dayOfWeek: number          // 0–6
  hourOfDay: number          // 0–23
  createdAt: Timestamp
}
```

### Static Park Registry

The park registry (`src/lib/parks/park-registry.ts`) is a comprehensive **static** list of all supported parks and destinations. It uses ThemeParks Wiki entity UUIDs as primary identifiers. Families covered include:

- **Disney:** Walt Disney World, Disneyland Resort, Disneyland Paris, Tokyo Disney Resort, Shanghai Disneyland, Hong Kong Disneyland
- **Universal:** Universal Orlando, Universal Studios Hollywood, Universal Studios Japan, Universal Beijing
- **SeaWorld Entertainment:** SeaWorld Orlando, Busch Gardens Tampa, SeaWorld San Diego, Busch Gardens Williamsburg, Adventure Island
- **Cedar Fair / Six Flags (merged):** 40+ parks including Cedar Point, Knott's Berry Farm, Six Flags Magic Mountain, Six Flags Great Adventure, etc.
- **Merlin Entertainments:** Alton Towers, Thorpe Park, Chessington, Legoland parks worldwide
- **Other:** Dollywood, Hersheypark, Holiday World, Efteling, Phantasialand, Europa-Park, and more

Park IDs are ThemeParks Wiki UUIDs; slugs are URL-safe for routing.

### Attraction Types

```typescript
type AttractionType = 'thrill' | 'family' | 'show' | 'experience' | 'parade' | 'character-meet' | 'dining-experience'
type AttractionStatus = 'operating' | 'closed' | 'delayed' | 'refurbishment' | 'seasonal-closed'
type AttractionAvailability = 'year-round' | 'seasonal' | 'retired'
```

---

## 5. API Surface

All routes live under `/api`. Routes that proxy external services run server-side to keep API keys out of the browser.

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/wait-times` | GET | None | Proxy to ThemeParks Wiki for live wait times |
| `/api/park-schedule` | GET | None | Park schedule / hours |
| `/api/parks/[parkId]/schedule` | GET | None | Per-park schedule |
| `/api/park-hours` | GET | None | Operating hours |
| `/api/crowd-calendar` | GET | None | Crowd level data (monthly) |
| `/api/crowd-reports` | GET | None | Pre-computed crowd report aggregates |
| `/api/queue-report` | POST | None (anonymous) | Submit a wait time report |
| `/api/trips/[shareId]` | GET | None | Public trip data for sharing |

### External Dependency: ThemeParks Wiki API

- Primary data source for live wait times, park schedules, and attraction metadata
- Accessed server-side only (Next.js API routes / server components)
- No SLA guarantee — app degrades gracefully when unavailable

---

## 6. Tech Stack & Infrastructure

### Application

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.x |
| Runtime | React | 19.x |
| Language | TypeScript | 5.8 |
| Styling | Tailwind CSS | 4.x |
| Icons | Lucide React | 0.487 |
| Charts | Recharts | 2.x |
| Date utilities | date-fns | 4.x |
| CSS utilities | clsx, tailwind-merge | latest |

### Backend / Data

| Layer | Technology | Version |
|-------|-----------|---------|
| Auth | Firebase Auth | 11.6 |
| Database | Firestore | 11.6 |
| Admin SDK | firebase-admin | 13.x |

### Infrastructure

| Layer | Technology |
|-------|-----------|
| Hosting | Vercel (region: iad1) |
| Live data | ThemeParks Wiki API |

### Testing

| Tool | Purpose |
|------|---------|
| Vitest | Unit and integration tests |
| Playwright | End-to-end tests |
| @testing-library/react | Component tests |

**Test scripts:**
- `npm test` — Vitest unit tests
- `npm run test:integration` — Vitest integration tests
- `npm run test:e2e` — Playwright E2E

### Repository Scripts

| Script | Purpose |
|--------|---------|
| `seed:parks` | Seed park data to Firestore |
| `fetch:wait-times` | Manual wait time fetch |
| `enrich-types` | Enrich attraction type metadata |
| `sync:all-parks` | Full park sync |

---

## 7. Key Components Reference

### Layout Components
- **AuthNavDesktop** — top-right nav for signed-in state (desktop)
- **AuthNavMobile** — bottom navigation bar (mobile)

### Park / Attraction Components
- **ParkCard** — park destination card on the browser page
- **AttractionRow** — single row in the attraction list
- **AttractionFilterChips / AttractionFilterChip** — type/entity/status filter pills
- **ParkScheduleBar** — visual horizontal schedule segments
- **ParkOperatingStatus** — open/closed badge
- **RideDetailPanel** — slide-out panel with full attraction info
- **WaitTimeBadge** — colored badge showing current wait
- **StatusIndicator** — operating status dot

### Data Visualization
- **ForecastChart** — Recharts-based hourly wait prediction curve
- **WaitTimeSparkline** — mini trend line per attraction

### Crowd
- **ReportWaitTimeModal** — submit a crowd report
- **RecentReports** — display recent crowd submissions

### Queue Timer
- **QueueTimerButton** — trigger to start timing
- **QueueTimerBanner** — persistent across-page banner
- **TimerDisplay** — live elapsed counter
- **TimerCompleteSheet** — completion bottom sheet

### Logging
- **UnifiedLogSheet** — bottom sheet for quick ride logging from any park page
- **ManualLogForm** — full manual ride log entry form
- **RideLogEntry** — single log entry display
- **RideLogList** — list of log entries
- **WaitTimeInput** — specialized input for wait duration

### Trips
- **TripCard** — trip list item with park name pills
- **TripDayCard** — single day in trip timeline
- **ActiveTripBanner** — shows active trip with quick-log CTA

### Crowd Calendar
- **MiniMonth** — monthly grid
- **CalendarDayCell** — single day cell with crowd indicator
- **FamilySelector** — park family picker
- **BestPlanBanner** — optimal park routing recommendation

### UI Primitives
- **ConfirmDialog** — reusable confirmation modal
- **SearchableSelect** — searchable dropdown

---

## 8. Current Limitations / Known Issues

### Architecture
- **No Vercel Cron** — wait time data is fetched on-demand (per page load) rather than on a scheduled refresh interval. The originally planned 5-minute Cron jobs have not been wired up.
- **`parkNames` / `parkIds` on Trip are deprecated** — these fields on the Trip document were superseded. Park names in the trip timeline now fall back to the static `getParkById` registry lookup. Legacy documents may have stale or empty values.
- **No Google sign-in** — only email/password auth is implemented despite the architecture document noting Google sign-in as planned.
- **No ISR** — park pages load data client-side; Incremental Static Regeneration planned in architecture has not been implemented.

### UX
- **No push notifications** — no mechanism to alert users when a favorite ride's wait drops.
- **No offline mode** — app requires network connectivity; the `clientStartedAt` field on the timer is the only offline-resilience pattern in place.
- **Crowd calendar data is synthetic/estimated** — confidence varies by park; not all parks have robust historical data.

### Data
- **Restaurant data is unstructured** — dining logs accept free-text restaurant names; there is no static restaurant registry comparable to the attraction/park registries.
- **Attraction metadata completeness varies** — not all parks have fully enriched attraction records (height requirements, descriptions, images).

---

## 9. Future Opportunities

> These are architectural affordances — things the current codebase is positioned to support — not committed features.

1. **Vercel Cron for wait time refresh** — the API route and data model are already in place; wiring a 5-minute cron would make wait times proactive rather than reactive.
2. **Google / Apple sign-in** — Firebase Auth supports it; just needs the OAuth configuration.
3. **Push notifications** — notify when a ride drops below a target wait threshold (Firebase Cloud Messaging is compatible with the existing Firebase setup).
4. **Attraction favoriting / watchlist** — a `users/{uid}/favorites` subcollection would enable personalized dashboards.
5. **Lightning Lane / Virtual Queue tracking** — the `QueueData` type already includes `RETURN_TIME`, `PAID_RETURN_TIME`, and `BOARDING_GROUP` shapes from ThemeParks Wiki.
6. **ISR / server-side rendering for park pages** — the API proxy pattern supports it; would improve cold-load performance and SEO.
7. **Restaurant registry** — a static registry similar to the park/attraction registry would enable structured dining searches in trip logging.
8. **Trip collaboration** — currently sharing is read-only; real-time collaborative trip editing is architecturally possible via Firestore listeners.
9. **Historical wait time charts** — the `ForecastAggregate` type and forecast chart infrastructure are in place; richer historical data would improve predictions.
10. **Crowd-report trust weighting** — the architecture doc references a trust-weighted consensus algorithm from the prototype; a simplified version is live but the full algorithm is not yet ported.

---

*This document reflects the state of the codebase as of 2026-04-30. It is the squad's source of truth. Update it whenever significant features are added, changed, or removed.*
