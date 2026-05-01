# Squad Decisions

## Active Decisions

### 1. Firebase Infrastructure Patterns

**Author:** Data  
**Date:** 2026-04-28  
**Status:** Proposed

#### Context
Setting up the Firebase client-side infrastructure for the project. Needed to make several small design calls.

#### Decisions
1. **Single-instance guard** — `getApps().length > 0 ? getApp() : initializeApp(config)` in `config.ts`. Next.js hot-reload re-evaluates modules; this prevents `FirebaseError: Firebase App already exists`.
2. **Auth context as 'use client' component** — `auth-context.tsx` is a React client component. Server components that need auth should use the Admin SDK (`admin.ts`, to be built later) or pass the user down.
3. **Generic Firestore helpers** — `firestore.ts` exports generic CRUD functions (`getDocument<T>`, `addDocument`, etc.) rather than collection-specific functions. The `services/` layer will compose these for domain logic. Keeps the firebase layer thin and reusable.
4. **Vercel region `iad1`** — US East (Virginia), same AWS region as Firebase's default `us-east1`. Minimizes latency between Vercel edge and Firestore.
5. **Security rules: `allow write: if false` for public collections** — All public data (parks, attractions, wait times, crowd calendar) is write-protected from clients. Only the Admin SDK (Cloud Functions + seeding scripts) can write. This is the strongest default; we relax per-collection as needed.

#### Required Dependencies
- `firebase` (v9+ — modular SDK)
- `react`, `react-dom` (peer deps for auth-context)

---

### 2. App Name "ParkPulse" as Working Title

**Date:** 2026-04-28
**Author:** Mouth (Frontend Dev)
**Status:** Proposed

#### Context
The architecture doc refers to the project as "Theme Park Wait Times" throughout. During scaffold, used **ParkPulse** as the user-facing brand name in the UI (header, footer, metadata, auth pages) because it's shorter, more memorable, and works well as a logo lockup with the 🎢 emoji.

#### Decision
Use "ParkPulse" as the working app name in all UI surfaces. The repo stays `theme-park-wait-times`.

#### Impact
- All page titles use `ParkPulse` via the root layout metadata template
- Header/footer show "ParkPulse" branding
- Easy to change later since it's all in layout.tsx and metadata

#### Notes
Team consensus needed — Devin may want a different name.

---

### 3. Vitest over Jest for test runner

**Author:** Stef (Tester)  
**Date:** 2026-04-28  
**Status:** Proposed

#### Context
Need to choose a test runner for the Next.js 14+ / TypeScript project.

#### Decision
Use **Vitest** (v3.x) instead of Jest.

#### Rationale
1. **Native TypeScript** — no separate ts-jest config or babel transforms needed
2. **ESM-first** — aligns with Next.js App Router's ESM module system
3. **Speed** — Vitest is significantly faster than Jest for TypeScript projects (no transform overhead)
4. **Compatible API** — `describe/it/expect` work identically; migration to/from Jest is trivial
5. **Vite ecosystem** — `@vitejs/plugin-react` gives us JSX support with zero config
6. **Coverage** — `@vitest/coverage-v8` is built-in and works out of the box

#### Alternatives considered
- **Jest** — industry standard but requires extra config for TS + ESM; slower feedback loop
- **Bun test** — too new, limited ecosystem support for Firebase testing libraries

#### Impact
- All `*.test.ts` files use Vitest globals (`describe`, `it`, `expect`, `vi`)
- Two Vitest configs: `vitest.config.ts` (unit, jsdom) and `vitest.integration.config.ts` (integration, node)
- Coverage thresholds enforced at 80% lines/functions, 75% branches

### 4. Client-Side Data Fetching for Parks Pages

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Proposed

#### Context
Parks listing and park detail pages need to show live wait times from Firestore. Had to choose between server components (SSR/ISR) vs client components.

#### Decision
Both parks pages are `'use client'` components that fetch directly from Firestore using the client SDK.

#### Rationale
1. Wait times are inherently real-time — stale SSR data defeats the purpose
2. Refresh button requires client-side state (loading, refetching)
3. Sort toggle on park detail needs interactive state
4. Client SDK reads are allowed by Firestore security rules (public collections)
5. ISR revalidation (from Phase 1 plan) can be revisited if we add a server-rendered shell later

#### Tradeoff
- No SEO benefit from server-rendered wait times (acceptable — these are logged-in/app-like pages)
- First paint shows skeleton instead of data (but loads fast due to small payloads)

#### Impact
- `src/app/parks/page.tsx` — client component
- `src/app/parks/[parkId]/page.tsx` — client component
- Pattern for future real-time pages: client component + Firestore client SDK + refresh button

---

### 5. Trip Sharing via Index Collection

**Author:** Data  
**Date:** 2026-04-29  
**Status:** Proposed

#### Context
Trips live at `users/{userId}/trips/{tripId}` (private). Sharing requires public-read access without exposing the full user path.

#### Decision
Use a `sharedTrips/{shareId}` collection as a public-read lookup index. Each doc contains `{ userId, tripId }`. The share endpoint reads the index, then reads the trip from the user's private subcollection using Admin SDK (or relaxed security rules for that path).

#### Rationale
1. **Minimal schema change** — trips stay private by default; sharing is opt-in via a pointer doc.
2. **URL-safe IDs** — 128-bit crypto-random, base64url-encoded (22 chars). Unguessable.
3. **One active trip rule** — `activateTrip()` auto-completes any currently active trip. Enforced at service layer, not rules (simpler).
4. **Stats recomputation** — `updateTripStats()` queries all ride logs with matching tripId and recomputes. Called on `completeTrip()` and available on-demand.

#### Security Note
The `getSharedTrip()` function needs either:
- A relaxed Firestore rule for `sharedTrips` (public read) + Admin SDK for the trip read, OR
- An API route that uses Admin SDK for both reads

Recommend: API route at `/api/trips/shared/[shareId]` using Admin SDK. Keeps security rules tight.

#### Impact
- New Firestore collection: `sharedTrips`
- New composite index needed: `rideLogs` where `tripId == X` ordered by `rodeAt desc`
- Frontend needs: share toggle UI, copy-link button, public trip view page

---

### 6. Vercel Deployment Configuration

**Author:** Data  
**Date:** 2026-04-29  
**Status:** Implemented

#### Context

ParkPulse needs to deploy to Vercel with Firebase backend in `us-east1`.

#### Decision

- **Region:** `iad1` (US East Virginia) — matches Firebase `us-east1` for minimal latency
- **Framework:** Next.js (auto-detected, explicitly set in vercel.json)
- **API caching:** Disabled (`s-maxage=0, stale-while-revalidate`) for real-time wait-time endpoints
- **Service account:** Passed as `FIREBASE_SERVICE_ACCOUNT` env var (JSON string), never committed to repo

#### Environment Variables Required in Vercel Dashboard

##### Client-side (NEXT_PUBLIC_ prefix)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `theme-park-log-and-wait-time.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `theme-park-log-and-wait-time` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `theme-park-log-and-wait-time.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase App ID |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | `G-774BVGWH68` |

##### Server-side (secret)
| Variable | Description |
|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | Full service-account.json contents as a single-line JSON string |

#### Deployment Steps

```bash
# 1. Install Vercel CLI (if needed)
npm i -g vercel

# 2. Login
vercel login

# 3. Link project (first time)
vercel link

# 4. Set environment variables
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID
vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
vercel env add NEXT_PUBLIC_FIREBASE_APP_ID
vercel env add NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
vercel env add FIREBASE_SERVICE_ACCOUNT  # paste minified JSON

# 5. Deploy
vercel --prod
```

#### Impact

- All API routes (queue-report, wait-times, crowd-reports) use firebase-admin via `FIREBASE_SERVICE_ACCOUNT`
- Client-side Firebase SDK reads public collections directly
- No service-account.json file needed on Vercel (env var only)

---

### 7. Ride Logging & Crowdsourced Wait Times Architecture

**Author:** Mikey (Lead/Architect)  
**Date:** 2026-04-29  
**Status:** Proposed  
**Priority:** High — this is ParkPulse's differentiator

#### Overview

Three interlocking features:
1. **Ride Log** — personal ride history per user
2. **Queue Timer** — stopwatch for actual wait time measurement  
3. **Crowdsourced Wait Times** — aggregated timer data producing community estimates

Design principle: **Write privately, aggregate anonymously, read publicly.**

#### Firestore Schema

##### RideLog: `users/{userId}/rideLogs/{logId}` (subcollection)

Personal ride history. Private to the user.

```typescript
interface RideLog {
  id: string;
  parkId: string;
  attractionId: string;
  parkName: string;
  attractionName: string;
  rodeAt: Timestamp;
  waitTimeMinutes: number | null;
  source: 'timer' | 'manual';
  rating: number | null;
  notes: string;
  tripId: string | null;  // link to trip (added in decision 8)
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

##### Active Timer: `users/{userId}/activeTimer`

One active timer per user, max. Ephemeral — deleted when timer completes or is abandoned.

```typescript
interface ActiveTimer {
  parkId: string;
  attractionId: string;
  parkName: string;
  attractionName: string;
  startedAt: Timestamp;
  clientStartedAt: number;
  status: 'active' | 'completed' | 'abandoned';
  updatedAt: Timestamp;
}
```

##### Crowd Reports: `crowdsourcedWaitTimes/{parkId}/reports/{reportId}`

Individual anonymized timer reports. Source of truth for aggregation.

```typescript
interface CrowdReport {
  id: string;
  attractionId: string;
  waitTimeMinutes: number;
  reportedAt: Timestamp;
  dayOfWeek: number;
  hourOfDay: number;
  createdAt: Timestamp;
}
```

##### Crowd Aggregates: `crowdsourcedWaitTimes/{parkId}/aggregates/{attractionId}`

Pre-computed aggregates. Updated by API route on each new report.

```typescript
interface CrowdAggregate {
  attractionId: string;
  parkId: string;
  currentEstimateMinutes: number | null;
  reportCount: number;
  lastReportedAt: Timestamp | null;
  confidence: 'low' | 'medium' | 'high';
  updatedAt: Timestamp;
}
```

#### Security Rules

- Ride logs: read/write private to user
- Active timer: read/write private to user
- Crowd reports: write via API only (Admin SDK)
- Crowd aggregates: write via API only (Admin SDK)

#### Aggregation Strategy

- **Time-Weighted Moving Average:** Recent reports weighted more heavily
- **Outlier Detection:** Statistical filtering + velocity checks
- **Confidence Levels:** Based on report count in last 60 minutes
- **Minimum valid duration:** 2–180 minutes

#### Build Order

1. Types + Services (Data)
2. Aggregation Logic (Chunk)
3. API Route (Data + Chunk)
4. UI Components (Mouth)
5. Integration (All)

---

### 8. Trip Planner & Ride Type Filters Architecture

**Author:** Mikey (Lead / Architect)  
**Date:** 2026-04-29  
**Status:** Proposed  
**Requested by:** Devin Sinha

#### Overview

Two features:
1. **Trip Planner & Trip Logs** — Users create multi-day trips, associate ride logs with them, and review stats after.
2. **Ride Type Filters** — Filter park attractions by type (thrill, family, show, etc.) on the park detail page.

#### Feature 1: Trip Planner & Trip Logs

##### Trip Schema

```typescript
interface Trip {
  id: string;
  name: string;
  startDate: string;              // ISO date
  endDate: string;                // ISO date
  parkIds: string[];
  parkNames: Record<string, string>;
  status: 'planning' | 'active' | 'completed';
  stats: {
    totalRides: number;
    totalWaitMinutes: number;
    parksVisited: number;
    uniqueAttractions: number;
    favoriteAttraction: string | null;
  };
  notes: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

##### Changes to RideLog

```typescript
// In ride-log type — add:
tripId: string | null;  // null = not associated with any trip
```

##### Key Design Decisions

1. Trips are a user subcollection (owner-only read/write)
2. Ride logs get optional `tripId` field
3. Stats are denormalized on Trip doc
4. Only ONE trip can be active at a time
5. When trip's date range includes today, new logs auto-associate

##### Routes

```
/trips                    → Trip list
/trips/new                → Create trip form
/trips/[tripId]           → Trip detail / log view
/trips/[tripId]/edit      → Edit trip
```

##### UI Components

```
TripCard.tsx              — Card for trip list
TripForm.tsx             — Create/edit form
TripStats.tsx            — Stats banner
TripTimeline.tsx         — Day-by-day timeline
TripStatusBadge.tsx      — planning/active/completed
ActiveTripBanner.tsx     — Shown when trip is active
```

#### Feature 2: Ride Type Filters

##### Available Data

From Firestore `attractions`: `entityType` (ATTRACTION, SHOW, RESTAURANT, MERCHANDISE)

From our taxonomy: `AttractionType` (thrill, family, show, experience, parade, character-meet, dining-experience)

##### Two-Tier Filtering Approach

**Tier 1 (immediate):** Filter by `entityType` (ATTRACTION vs SHOW vs other)

**Tier 2 (enrichment):** Assign `AttractionType` via script + manual overrides

##### Filter UI

Horizontal scrollable chip bar on park page. "All" selected by default. Multiple selection allowed.

```
[All] [Rides] [Shows] [Thrill] [Family] [Other]
```

##### Components

```
AttractionFilterChips.tsx    — Chip bar
AttractionFilterChip.tsx     — Individual chip
```

#### Integration Points

1. Timer completion → check for active trip → stamp `tripId` on ride log
2. Manual log → check for active trip → stamp `tripId`
3. Dashboard → show `ActiveTripBanner` if user has active trip
4. Park detail page → show filter chips + active trip indicator

#### Build Order

| Priority | Feature | Depends On |
|---|---|---|
| 1 | Ride type filter chips | Nothing — ship immediately |
| 2 | Trip types + service | Nothing |
| 3 | Trip pages + UI | Trip service |
| 4 | Timer/log → trip integration | Trip service |
| 5 | Trip stats computation | Integration |
| 6 | AttractionType enrichment | Can run anytime |

#### Decisions Needing Devin's Input

1. **Trip sharing** — Shareable via link (public read), or strictly private?
2. **Trip export** — PDF/image for social sharing, or just in-app view?
3. **Multi-trip overlap** — If two trips overlap, what happens? (Recommend: one active trip at a time)
4. **Park page filter default** — Hide non-rides by default on wait times view?
5. **Ride type enrichment priority** — Basic ATTRACTION/SHOW split sufficient for v1, or thrill/family from day one?

---

### 9. Trip Auto-Association + Shared Trips Security Model

**Author:** Data  
**Date:** 2026-04-29  
**Status:** Proposed

#### Context

Wiring trip integration into ride logging required deciding how ride logs find their trip, and how the `sharedTrips` collection handles security.

#### Decisions

##### 1. Ride Log → Trip Auto-Association (Opt-In)

When `addRideLog` is called without an explicit `tripId`, it automatically queries for the user's active trip and associates the log. This is **opt-in by default** — if no trip is active, `tripId` stays null. Explicit `tripId` parameter always wins.

After every log added to a trip, `updateTripStats()` recomputes denormalized stats. This adds one extra read + one write per ride log but keeps trip stats always current.

##### 2. sharedTrips Security: Client Write (Authenticated)

The `sharedTrips` collection allows:
- **Read:** Anyone (public, for share link viewing)
- **Create:** Any authenticated user
- **Update/Delete:** Only the document owner (`resource.data.userId == request.auth.uid`)

This avoids requiring admin SDK for share link generation (trip-service runs client-side). Trade-off: a malicious authenticated user could write junk share docs, but they can't read other users' private data through them.

##### 3. Sharing API Rate Limiting (In-Memory, v1)

The `/api/trips/[shareId]` route uses simple in-memory rate limiting (60 req/min per IP). Resets on Vercel cold start. Acceptable for v1 — upgrade to edge KV or Redis if abuse is detected.

#### Impact

- All ride logging (timer complete + manual) now checks for active trip — no UI changes needed
- Frontend can call `generateShareLink(userId, tripId)` to get a shareable URL
- Public API at `/api/trips/{shareId}` returns trip + ride logs as JSON

---

#### Decisions Needing Devin's Input (prev)

1. **Trip sharing** — Shareable via link (public read), or strictly private?
2. **Trip export** — PDF/image for social sharing, or just in-app view?
3. **Multi-trip overlap** — If two trips overlap, what happens? (Recommend: one active trip at a time)
4. **Park page filter default** — Hide non-rides by default on wait times view?
5. **Ride type enrichment priority** — Basic ATTRACTION/SHOW split sufficient for v1, or thrill/family from day one?

---

### 10. Full ThemeParks Wiki API Data Capture

**Author:** Chunk (Data Engineer)  
**Date:** 2026-04-29  
**Status:** Implemented  
**Requested by:** Devin Sinha

#### Context

The ThemeParks Wiki `/entity/{id}/live` endpoint returns rich data per attraction that we were discarding — virtual queue states, hourly forecasts, and operating hours. We only captured `queue.STANDBY.waitTime`.

#### Decision

Widen the wait-times API route to capture and store ALL queue types, forecast data, and operating hours in a single pass. Add stale-cache resilience and begin historical archiving.

#### Changes Made

**`src/app/api/wait-times/route.ts`:**

1. **Expanded `LiveEntry` interface** — full typed interfaces for `RETURN_TIME`, `PAID_RETURN_TIME`, `BOARDING_GROUP`, `ForecastEntry`, `OperatingHoursEntry`
2. **Updated `formatWaitTimeEntry()`** — passes through all queue types, forecast, and operatingHours to Firestore. Null-safe throughout.
3. **API resilience** — In-memory `parkDataCache` serves stale data on 429/5xx/network errors. Response includes `stale: boolean` indicator.
4. **Historical archiving** — Each poll appends `{time, waitMinutes}` to `waitTimeHistory/{parkId}/daily/{YYYY-MM-DD}/attractions/{attractionId}` via `FieldValue.arrayUnion`.

#### Implications for Team

- **Mouth (Frontend):** Firestore documents now include `queue`, `forecast`, and `operatingHours` fields. You can build virtual queue badges and the ForecastChart against real data immediately.
- **Mikey (Architect):** The response shape has a new top-level `stale` boolean. Clients should handle this (e.g., show a "data may be outdated" indicator).
- **All:** Historical data starts accumulating now. After 30 days we'll have enough for "typical day" patterns.

#### Trade-offs

- **In-memory cache** — Lost on cold start / deploy. Acceptable since it's only a resilience fallback, not primary storage. Firestore has the persistent copy.
- **Array append pattern** — Firestore docs have a 1MB limit. At 5-min polling, one attraction generates ~288 entries/day × ~50 bytes = ~14KB/day. Well within limits.
- **Null over empty arrays** — Chose `null` for missing forecast/operatingHours rather than `[]`. Makes client-side "does this attraction have forecasts?" checks simpler (`if (forecast)` vs checking `.length`).

---

### 11. User Directives — Park UX & Crowd Calendar

**Date:** 2026-04-29  
**By:** Devin Sinha (via Copilot)

#### Directives

1. **Sort rides by wait time (longest first)** — Operating rides on park pages should default to busiest-first (longest wait at top)
2. **Crowd calendar multi-month view** — Show 2-3 months at once for easier planning
3. **Historical temperature on calendar** — Show a small icon with historical temperature range per day

#### Rationale

User request — UX improvements for park browsing and trip planning.

---

### 12. No Merchandise/Shops

**Date:** 2026-04-29  
**By:** Devin Sinha (via Copilot)

#### Decision

Do not show MERCHANDISE/shops anywhere on the website. Remove from filters and hide from park listings.

#### Rationale

User request — shops aren't relevant to the app's purpose (wait times & ride planning).

---

### 13. Park Detail Page Redesign

**Date:** 2026-04-29  
**By:** Devin Sinha (via Copilot)

#### Decision

Modernize park detail page layout and sort behavior:

1. **N/A wait times** — Must NOT be labeled as the longest wait. Sort to the bottom regardless of sort direction.
2. **Single-column compact list** — Replace the 3-column grid layout with a single-column compact list. Each ride on its own line with useful data.
3. **Trend sparklines** — Add wait time trend lines (sparklines) to each ride row.
4. **Expanded ride view** — Selecting a ride opens a sidebar or expanded view showing its wait time history throughout the day.

#### Rationale

User feedback — current 3-column grid is harder to scan; users want denser, more data-rich ride information at a glance.

---

### 14. QA Process: Review UI Changes Before Presenting

**Date:** 2026-04-29  
**By:** Devin Sinha (via Copilot)

#### Decision

Always run Stef (QA) to review UI changes BEFORE presenting work to the user. Catch sort logic bugs, UX issues, and visual inconsistencies proactively.

#### Rationale

User had to find N/A sort bug and color mismatch themselves — QA should catch these first. Improves team accountability for quality.

---

### 15. Virtual Queues, Enhanced Sidebar, & Special Events Architecture

**Author:** Mikey (Lead / Architect)  
**Date:** 2026-04-29  
**Status:** Proposed  
**Requested by:** Devin Sinha

#### Executive Summary

Three features, one API upgrade. The ThemeParks Wiki API already provides **far more data than we're consuming**. Our current `route.ts` only reads `queue.STANDBY.waitTime` — but the API returns virtual queue states, hourly forecasts, per-attraction operating hours, park schedules with ticketed events, and Lightning Lane pricing. This proposal surfaces that data with minimal backend work.

#### Feature 1: Virtual Queue Indicators

- ⚡ Lightning Lane badge (yellow) when `queue.RETURN_TIME` exists
- 💰 Paid LL badge (gold) when `queue.PAID_RETURN_TIME` exists  
- 🎟️ Boarding Group badge (purple) when `queue.BOARDING_GROUP` exists

Modify `AttractionRow.tsx` to render badges. Requires: Expanded `LiveEntry` interface + `formatWaitTimeEntry()` updates in `route.ts`.

#### Feature 2: Enhanced Ride Detail Sidebar

- Replace PRNG `DayChart` with real `ForecastChart` using API forecast data
- Display park operating hours overlay
- Mark "now" on the timeline with current actual wait

The API forecast field already provides hourly predictions. No need for historical data collection in v1.

#### Feature 3: Special Event Reopenings

- New `/api/park-schedule` endpoint → fetches park schedule from ThemeParks Wiki
- Cache in Firestore for 1 hour
- Show schedule bar on park page: operating hours + special events (Early Entry, Extended Evening, etc.)
- Show Lightning Lane daily pricing

#### Phased Implementation

| Phase | Features | Timeline |
|---|---|---|
| 1 | Virtual queue badges, ForecastChart, park schedule bar | Week 1 — ~7 person-days |
| 2 | Historical data archiving, typical day patterns | Week 1 start, use Week 4+ |
| 3 | LL pricing display, event notifications | Week 3+ |

#### Impact

All three features use **data that's already flowing through the pipeline**. Only new endpoint: `/api/park-schedule`. Everything else is widening existing data capture + new UI components.

---

### 16. Auth Guard Pattern for Trip Pages

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Implemented

#### Decision

All trip routes (`/trips`, `/trips/new`, `/trips/[tripId]`, `/trips/[tripId]/edit`) now use a consistent auth redirect pattern:

```tsx
const { user, loading: authLoading } = useAuth();
const router = useRouter();

useEffect(() => {
  if (!authLoading && !user) {
    router.replace('/auth/signin');
  }
}, [authLoading, user, router]);

if (authLoading || !user) {
  return <LoadingSpinner />;
}
```

#### Impact

- 4 trip routes hard-redirect unauthenticated users
- No page content flashes before redirect
- Consistent with the auth boundary (private: trip plans, ride logs)

---

### 17. Trip Pages Navigation Structure

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Proposed

#### Decision

- "Trips" added as a top-level nav item in both desktop header and mobile bottom bar
- Mobile bottom bar: Home | Parks | Trips | Profile (replaced "My Rides" with "Trips")
- Desktop keeps: Parks, Crowd Calendar, Trips, My Rides, Dashboard

#### Rationale

1. Trips is the marquee feature — deserves top-level nav presence
2. Mobile has 4 slots max; "My Rides" accessible from trip detail
3. Trips subsumes ride logging conceptually

#### Impact

- `src/app/layout.tsx` nav updated
- Mobile users navigate to rides via Trips → Trip Detail → "Log Ride"

---

## Directives (Unprocessed Decisions)

### D1: Distinguish Rides with Virtual Queues

**Date:** 2026-04-29  
**By:** Devin Sinha

Show virtual queue availability/status (Lightning Lane, boarding groups, return times) alongside standby wait times on ride cards. **Action:** See decision 15 (Feature 1).

### D2: Wait Time Map — Geographical Visualization

**Date:** 2026-04-29  
**By:** Devin Sinha

Add a visual map of the park showing rides with their current wait times overlaid geographically. Could live on the ride detail flyout or parks page. **Action:** Future phase — requires park map geometry.

### D3: API Resilience & Rate Limiting

**Date:** 2026-04-29  
**By:** Devin Sinha

Always handle ThemeParks Wiki API data refresh rates and errors gracefully. Respect rate limits, implement proper error handling, caching strategies, and fallback behavior when the API is slow or unavailable. **Action:** See decision 10 (in-memory cache + stale indicator). Verify Chunk's implementation.

### D4: Crowdsourced Wait Times Validation

**Date:** 2026-04-29  
**By:** Devin Sinha

When a user starts a timer while standing in line and stops it (or manually enters wait duration), store that crowdsourced data alongside live API data to form a more accurate picture of actual wait times. Investigate whether we can contribute data back to ThemeParks Wiki (lower priority). **Action:** Awaits decision 7 (Ride Logging & Crowdsourced Wait Times) implementation.

---

### 18. Blended Forecast System — Architecture Decision

**Author:** Mikey (Lead / Architect)  
**Date:** 2026-04-29  
**Status:** Proposed  
**Requested by:** Devin

#### Context

~50% of attractions get live hourly forecasts from ThemeParks Wiki API. The other ~50% show "Wait time forecast not available." We want to fill that gap using our own historical data.

Historical snapshots are already being archived at:
```
waitTimeHistory/{parkId}/daily/{date}/attractions/{attractionId}
  → { snapshots: [{time, waitMinutes}, ...] }
```

This data accumulates every time a user visits a park page (triggers the `/api/wait-times` route).

#### Architecture Design

##### 1. Schema: Pre-Computed Aggregates

```
forecastAggregates/{parkId}/byDayOfWeek/{dayOfWeek}/attractions/{attractionId}
```

Document shape:
```typescript
interface ForecastAggregate {
  attractionId: string;
  attractionName: string;
  dayOfWeek: number;           // 0=Sunday, 6=Saturday
  hourlyAverages: {
    [hour: string]: {          // "09", "10", ..., "22"
      avgWait: number;         // weighted average wait minutes
      sampleCount: number;     // how many data points contributed
      stdDev: number;          // standard deviation (confidence signal)
    };
  };
  totalSamples: number;        // total snapshots across all hours
  lastUpdated: string;         // ISO timestamp
  oldestDataDate: string;      // earliest contributing date
  newestDataDate: string;      // latest contributing date
}
```

##### 2. Aggregation Pipeline (Chunk)

After `archiveHistoricalSnapshot` completes in the wait-times API route:
1. Read today's snapshot doc for each attraction
2. For each attraction with ≥3 snapshots today: group by hour and merge into aggregate
3. Weight recent data higher using 30-day decay half-life

##### 3. Blended Decision Logic (Data)

```typescript
function resolveForecast(liveForecast: ForecastEntry[] | null, aggregate: ForecastAggregate | null): BlendedForecast {
  if (liveForecast && liveForecast.length > 0) {
    return { entries: liveForecast, source: 'live' };
  }
  if (aggregate && aggregate.totalSamples >= 15) {
    return { entries, source: 'historical' };
  }
  return { entries: null, source: 'none' };
}
```

**Confidence threshold:** `totalSamples >= 15` (3 same-weekday visits with ~5 snapshots each).

##### 4. API Response: Blended Metadata

Keep `forecast` unchanged for backward compat. Add `forecastMeta`:

```typescript
{
  forecast: ForecastEntry[] | null,
  forecastMeta: {
    source: 'live' | 'historical' | 'none',
    confidence?: number,
    dataRange?: { oldest, newest, sampleCount }
  }
}
```

##### 5. Frontend Display (Mouth)

- **Source badge:** Blue pill "Live forecast" or amber "Based on historical data"
- **Confidence indicator:** "Based on N visits" for historical
- No chart rendering changes — both sources produce `ForecastEntry[]`

#### Build Plan

| Owner | Task |
|-------|------|
| **Chunk** | Add aggregation logic after archive write. Compute/update `forecastAggregates` docs. |
| **Data** | Add `forecastMeta` to API response. Implement `resolveForecast` blending. Read aggregates when live is null. |
| **Mouth** | Add source badge to ForecastChart. |

#### Firestore Security Rules

```
match /forecastAggregates/{parkId}/{document=**} {
  allow read: if true;          // public data
  allow write: if false;        // server-only (Admin SDK)
}
```

---

### 19. Crowd Calendar Uses Aggregate Data (Not Live-Only)

**Author:** Data  
**Date:** 2026-04-29  
**Status:** Implemented

#### Decision

Rewrote `computeFamilyCrowdDays` to source from `forecastAggregates/{parkId}/byDayOfWeek/{dow}/attractions/` (historical aggregates from blended forecast system). For today specifically, live forecast data takes priority.

#### Key Thresholds

- Aggregates require `totalSamples >= 15` (same as blender confidence threshold)
- Individual hourly entries require `sampleCount >= 3` (skip threshold)
- `hasRealData = true` when ≥50% of days in month have non-zero wait data
- Falls back to deterministic placeholder on cold start

#### Impact

- Crowd calendar shows meaningful data for ALL days in a month (not just today)
- 6-hour cache TTL remains unchanged
- No new Firestore rules needed

---

### 20. Park Family Crowd Calendar — UX & Architecture

**Author:** Mikey (Lead/Architect)  
**Date:** 2026-04-29  
**Status:** Proposed  
**Requested by:** Devin Sinha

#### Problem Statement

Current crowd calendar shows single park with flat dropdown selector. Users planning multi-day resort trips (Universal Orlando, Walt Disney World) need to **compare busyness across all parks simultaneously**.

#### UX Proposal

**Layout:** One large interactive month + 2 compact future months below

**Cell Design:** Stacked horizontal bars (one per park), colored by severity (green→yellow→red), lowest gets ★ indicator

**Mobile:** Bars collapse to colored dots. Tap cell to expand detail in bottom sheet.

**Recommendation Banner:** "Best 3-day plan: Mon 5/5 Animal Kingdom (2) · Wed 5/7 MK (3) · Fri 5/9 Epic Universe (2)"

#### Data Model

**Firestore:**
```
crowdCalendar/{familyId}/months/{YYYY-MM}
```

Document size: 4 parks × 31 days × ~100 bytes ≈ 12KB/month

#### Component Architecture

```
FamilyCalendarView (orchestrator)
├── FamilySelector (searchable dropdown for park families)
├── ParkToggleChips (on/off per park in family)
├── TripRecommendation (smart banner)
├── MonthCalendar (main interactive calendar)
│   └── CalendarCell (bars/dots + temp)
├── DayDetailSheet (mobile bottom sheet)
└── MiniMonthRow (2 future months)
```

#### API Changes

**New route:** `/api/crowd-calendar/[familyId]?months=2026-05,2026-06,2026-07`

**New cron job:** `/api/cron/crowd-forecast` — runs daily, computes crowd levels for next 90 days

#### Open Questions for Devin

1. Trip recommendation: Ask "how many days?" or default to family's park count?
2. Park abbreviations clear enough (MK/EP/HS/AK) or use icons/logos?
3. Temperature per cell or move to detail sheet to save space?
4. Show data confidence ("forecast" vs "historical pattern") or keep simple?

---

### 21. Crowd Calendar — 4-Tier Crowd Levels & Aggregation Algorithm

**By:** Chunk (Data Engineer)  
**Date:** 2026-04-29

#### What

1. **4-tier crowd scale:** Low (<20min avg), Moderate (20-35min), High (35-50min), Extreme (50+min)
2. **Best Plan algorithm:** Greedy assignment sorting all (day, park) combos by crowd level, unique parks preferred
3. **Firestore cache path:** `crowdCalendar/{familyId}/monthly/{YYYY-MM}` with 6-hour TTL
4. **Park family registry:** Uses ThemeParks Wiki entity UUIDs as park IDs
5. **Stale fallback:** Never return 500 if expired data exists

#### Rationale

These thresholds map to natural user expectations. Greedy algorithm avoids O(n!) combinatorics while producing near-optimal results for typical family sizes (2–4 parks). 6-hour TTL balances freshness vs Firestore read costs.

---

### 22. Park Family Calendar Design Decisions

**By:** Devin Sinha (via Copilot)  
**Date:** 2026-04-29

#### Decisions

1. **Trip length default:** 3 days
2. **Park names in calendar:** Use full names (not abbreviations)
3. **Weather/temperature:** Yes, if it fits well visually
4. **Confidence labels:** Skip for low forecast coverage

---

### 23. FamilySelector converted from pills to searchable combobox

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Implemented

#### Decision

Replaced pill-button layout with searchable combobox (dropdown with type-to-filter). Built with native HTML + React state + ARIA attributes.

#### Key Details

- **Props unchanged:** `selectedFamilyId` + `onFamilyChange`
- **Accessibility:** Full `role="combobox"` + `role="listbox"` + `role="option"`, keyboard navigation (arrows, enter, escape, home, end)
- **Search:** Client-side filter by family name (case-insensitive substring)
- **Park count:** Right-aligned secondary text "{N} parks"
- **Styling:** Tailwind `primary-*` scale, rounded-lg, shadow-lg dropdown, z-50 layering

#### Impact

- All 25 crowd calendar tests pass
- TypeScript clean (zero errors)

---

### 24. Temperature Display: Dual Fahrenheit + Celsius

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Implemented

#### Decision

- **Desktop cells** (tight space): `92°/72°F (33°/22°C)` — compact with unit labels at end
- **Mobile expanded** (more room): `High 92°F (33°C) / Low 72°F (22°C)` — fully spelled out

#### Rationale

Desktop cells use 8px font and ~100px width. Inline slash-separated format keeps it to one line. Mobile has space for verbose format.

---

### 25. Data Freshness: Relative Time Indicator

**Author:** Mouth (Frontend Developer)  
**Date:** 2026-04-29  
**Status:** Implemented

#### Decision

Used relative time ("Updated 2 min ago") for recent data, switching to absolute time ("Updated as of 12:38 PM") only when ≥60 minutes old.

#### Staleness Threshold

Data older than 10 minutes renders in amber (`text-amber-600`) to signal potential API lag. Under 10 min uses muted gray.

#### Implementation

- Derived from `max(fetchedAt)` across all wait time entries
- 30-second interval re-evaluates the age
- No new components/dependencies — inline in park detail page

---

### 26. Home Page Feature Cards Auth-Aware Pattern

**Date:** 2026-04-29T13:57:55-07:00  
**Author:** Mouth (Frontend Dev)  
**Status:** Implemented

#### Decision

Extract feature cards section into client component (`src/components/FeatureCards.tsx`) that uses `useAuth()` to:
1. Route unauthenticated users to `/auth/signin` instead of `/trips/new`
2. Adjust card description to indicate sign-in is needed
3. Show "Sign in →" hover CTA for unauthenticated state

#### Pattern

For any public page linking to protected route: extract the link section into client component using `useAuth()`, redirect to `/auth/signin` when `!user`.

#### Audit Result

No other public pages link to protected routes without auth gating.

---

### D5: Park Family Selector UI Scaling

**Date:** 2026-04-29  
**By:** Devin Sinha

Park family list will grow significantly. Pills don't scale past ~6–8 items without wrapping. Use searchable dropdown instead. **Action:** See decision 23 (implemented).

---

### D6: Celsius Temperature Display

**Date:** 2026-04-29  
**By:** Devin Sinha

Show temperatures in both Fahrenheit and Celsius (e.g. "92°F (33°C)"). **Action:** See decision 24 (implemented).

---

### D7: Only Include ThemeParks Wiki Supported Parks

**Date:** 2026-04-29T15:06:01-07:00  
**By:** Devin Sinha

Only include parks that exist in the ThemeParks Wiki API. If a park (like Oceans of Fun) isn't in the API, omit it entirely — don't use placeholder IDs. Add error handling for when the wiki removes a park from our registry.

---

### 27. Automatic Data Refresh on Return

**Author:** Mikey (Lead/Architect)  
**Date:** 2026-05-01  
**Status:** Proposed  
**Scope:** Client-side data freshness strategy

#### Context

Users leave the app open in a tab while at theme parks. When they switch back, data may be minutes or hours stale. Currently, the only way to get fresh data is clicking the refresh button on the park detail page. This is a bad UX for people checking wait times every 15 minutes while walking between rides.

#### Decision: Custom Lightweight Hook (No Library)

**We will NOT add SWR, React Query, or TanStack Query.**

Rationale:
1. Our data layer is Firestore-first (one-time reads via `getCollection`, real-time via `onSnapshot` for timer). These libraries are designed for REST/GraphQL endpoints.
2. We already have zero shared state for fetched data — each page owns its own state. Adding a global cache library introduces complexity disproportionate to our needs.
3. Our app is a Next.js App Router project. Server components handle static data. The volatile data (wait times) lives in a single page component.
4. The entire refresh logic is ~80 lines. A library adds 15KB+ of JS for a problem we can solve in one hook.

**Approach: `useAutoRefresh` hook + Page Visibility API + staleness-aware fetch wrapper.**

#### Staleness Thresholds by Data Type

| Data Type | Threshold | Rationale |
|-----------|-----------|-----------|
| Wait times | **2 minutes** | Core value prop. Ride waits change fast. |
| Park schedule/hours | **30 minutes** | Changes at most twice per day (park opens/closes). |
| Crowd calendar | **1 hour** | Predictions update daily, stale by definition. |
| User trips | **5 minutes** | Only stale if user modified on another device. |
| Park list (index) | **10 minutes** | Rarely changes. Hours summary is the volatile part. |
| Attractions list | **Never auto-refresh** | Static data. Only changes on admin seed. |

#### Assignments

| Who | What | Effort |
|-----|------|--------|
| **Data** | Build `useAutoRefresh.ts` + `useVisibility.ts` hooks | 2-3 hours |
| **Mouth** | Wire hooks into park pages, add subtle refresh indicator | 1-2 hours |
| **Stef** | Unit tests for hook logic (threshold math, debounce, visibility events) | 1-2 hours |
| **Mikey** | Review PR, validate mobile browser behavior | 30 min |

---

### 28. Force-Dynamic Wait Times API + Cache-Busting Client Fetches

**Author:** Data (Backend Dev)  
**Date:** 2026-05-01  
**Status:** Implemented  
**Scope:** Data freshness / API caching

#### Context

Devin reported that clicking the refresh button on the park detail page showed stale data — timestamp stuck at "3:16 PM" even after refresh. Root cause: the `/api/wait-times` GET route was being cached at the Vercel edge (due to internal `{ next: { revalidate: 60 } }` fetch hint) and in the browser (no `Cache-Control` header, no `cache: 'no-store'` on client fetch).

#### Decision

1. **`export const dynamic = 'force-dynamic'`** on `/api/wait-times` route — ensures Vercel never caches the route handler response.
2. **`Cache-Control: no-store, max-age=0`** response header — ensures browsers and CDNs don't cache.
3. **`cache: 'no-store'`** on all client-side fetches to our own API routes that return volatile data.

#### Impact

- Refresh button now always triggers a real server-side scrape → Firestore write → fresh client read
- Slightly more serverless invocations on Vercel (no edge caching), but this is correct behavior for real-time data
- Pattern to follow: any API route returning volatile data should use `dynamic = 'force-dynamic'` + `no-store`

---

### 29. Wait Time Data Model — attractionClosed field

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-30  
**Status:** Implemented

#### Context

Redesigning wait time input UX required distinguishing between: unknown wait (null), no wait/walk-on (0), actual timed wait (N minutes), and attraction closed.

#### Decision

Added `attractionClosed: boolean` field to `RideLog` type rather than using a sentinel value (like -1) for `waitTimeMinutes`.

**Rationale:**
- Clean semantic separation — `waitTimeMinutes` stays numeric/null as before
- No risk of sentinel values leaking into calculations/aggregations
- `attractionClosed: true` + `waitTimeMinutes: null` = closed
- `waitTimeMinutes: 0` = walk-on (no wait)
- `waitTimeMinutes: null` + `attractionClosed: false` = unknown
- Backward compatible — existing logs without field default to `false`

#### Impact

- `RideLog` type in `src/types/ride-log.ts` — new required field
- `RideLogUpdateData` includes `attractionClosed`
- All log creation call sites updated
- Display logic in `RideLogEntry` handles new states
- Firestore docs without the field are treated as `attractionClosed: false`

---

### 30. Progressive Loading for Park Detail Page

**Date:** 2026-04-30T13:53:38.718-07:00  
**Author:** Mouth (Frontend Dev)  
**Status:** Implemented

#### Context

The park drill-down page (`/parks/[parkId]`) blocked ALL rendering until park info, attractions, wait times, schedule, AND a potential 30s forecast refresh all completed serially. Users saw a blank screen for 3-10+ seconds.

#### Decision

Implemented 3-phase progressive loading:

1. **Phase 1 (instant):** `fetchCore` loads park + attractions → sets `loading=false` immediately. User sees the attraction list.
2. **Phase 2 (overlay):** `fetchWaitTimes` loads wait times + schedule in parallel → merges into already-visible list. Stats cards show shimmer skeletons until ready.
3. **Phase 3 (silent):** Forecast refresh is fire-and-forget. No await, no full data reload. On success, only re-fetches wait times.

#### Impact

- Perceived load time drops from 3-10s to <500ms (Phase 1 is a single Firestore query)
- No more double `fetchData()` calls on initial load
- Forecast refresh never blocks UI

---

### 31. Progressive Loading Status Fallback

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-30T14:02:12-07:00  
**Status:** Implemented

#### Context

The progressive loading change split data fetching into Phase 1 (park + attractions) and Phase 2 (wait times + schedule). During Phase 2, all attractions had `status: undefined` which defaulted to `'CLOSED'`, causing a false "park is currently closed" banner on every initial page load.

#### Decision

- When `waitTimesLoading` is true, default attraction status to `'UNKNOWN'` instead of `'CLOSED'`
- Guard the closed-park banner with `!waitTimesLoading` — only show it once we know for sure
- Show shimmer placeholders for schedule bar and operating status badge during Phase 2

#### Impact

- Park detail page no longer flashes "closed" banner on load
- Schedule area shows a shimmer bar instead of blank space while loading
- No change to final rendered state once data arrives

---

### 32. Playwright E2E — Chromium-Only + Mocked Backend

**Author:** Stef (Tester)  
**Date:** 2026-04-30  
**Status:** Proposed

#### Context

Production keeps shipping UI regressions (duplicate elements, broken filters, overlapping modals) because there was no functional E2E testing of the actual rendered UI.

#### Decisions

1. **Chromium-only for speed** — dropped Firefox/WebKit/mobile-chrome from `playwright.config.ts`. These can be added back for pre-release cross-browser validation, but daily dev runs should be fast.

2. **Mock all backends via `page.route()`** — E2E tests intercept Firestore REST, Firebase Auth, and `/api/*` routes. This means tests are deterministic, fast, and don't need Firebase emulators running. The emulator-based tests (integration layer) remain separate.

3. **Fixture-driven** — All mock data lives in `e2e/fixtures/park-data.ts`. Tests import fixtures directly rather than inlining data. This makes it easy to add parks/attractions for new test scenarios.

4. **Tests target known production bugs** — Every test maps to a bug that actually shipped. If the test would have caught it, it belongs here.

#### Impact

- `npm run test:e2e` runs 13 critical flow tests in ~10-15 seconds (chromium only, mocked backend)
- `npm run test:e2e:ui` opens the interactive Playwright UI for debugging
- No new infrastructure dependencies (no emulators, no test databases)

---

### 33. PRD Created — Current State Documented

**Author:** Mikey (Lead / Architect)  
**Date:** 2026-04-30  
**Status:** Accepted  
**Scope:** Documentation / squad knowledge base

#### Summary

A comprehensive Product Requirements Document (PRD) has been authored and saved to `docs/PRD.md`. This document now serves as the squad's canonical source of truth for what ParkFlow is, what it does, and how it is built.

#### What Was Documented

The PRD captures the full current state of the application as of 2026-04-30, including:

- **Product overview and design principles**
- **User personas** (Day-Tripper, Annual Pass Holder, Vacation Planner)
- **Complete feature inventory** across 15 feature domains with build status per feature
- **Firestore data model** with full document shapes for RideLog, DiningLog, Trip, ActiveTimer, and CrowdReport
- **API surface** — all 8 API routes with auth requirements
- **Full tech stack** — Next.js 15, React 19, TypeScript 5.8, Firebase 11.6, Tailwind CSS 4, Vercel (iad1)
- **Component reference** — all major components grouped by domain
- **Current limitations** — Cron not wired, no Google sign-in, no ISR, offline gaps, synthetic crowd data
- **Future opportunities** — architectural affordances the codebase is positioned to support

#### Impact

- All squad agents should treat `docs/PRD.md` as the authoritative feature reference going forward
- `.squad/identity/now.md` updated to reflect sprint completion and PRD creation
- Future sessions should update the PRD when features are added, changed, or removed

---

### D8: User directive — 2026-04-30T13:35:55Z

**By:** Devin Sinha (via Copilot)

When refreshing wait times, the card/ride wait times are the important things to refresh. If someone is on a drill down for a particular park, the refresh should prioritize that particular park's data. Don't block the response on non-critical work (archival, aggregation).

### D9: User directive — 2026-04-30T13:49:46Z

**By:** devsin (via Copilot)

Every UI change MUST have functional testing before deploy. Two gates required: (1) Playwright E2E tests that click through the actual flows, and (2) Stef (Tester) must verify by walking through the UI as a real user would before any deploy is approved. No more "it builds so ship it."

### D10: User directive — 2026-04-30T14:15:06Z

**By:** devsin (via Copilot)

When logging a ride from a trip drill-down page where a park is already indicated for today's date, the park picker should default to that park. The user shouldn't have to search the list each time — smart default based on context, but still changeable.

### D11: User directive — 2026-04-30T14:21:49Z

**By:** devsin (via Copilot)

When a trip is deleted, all logged rides/attractions associated with that trip should also be deleted (cascade delete).

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
