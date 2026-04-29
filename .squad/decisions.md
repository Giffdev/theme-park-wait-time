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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
