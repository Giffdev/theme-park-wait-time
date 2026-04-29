# Architecture Plan — Theme Park Wait Times

> **Author:** Mikey (Lead/Architect)  
> **Date:** 2026-04-28  
> **Status:** Active — foundational document for the entire build  
> **Source prototype:** [Giffdev/theme-park-wait-time](https://github.com/Giffdev/theme-park-wait-time) (GitHub Spark + Vite + React)

---

## Table of Contents

1. [Migration Strategy](#1-migration-strategy)
2. [Project Structure](#2-project-structure)
3. [Firebase Schema Design](#3-firebase-schema-design)
4. [Public vs Private Data Separation](#4-public-vs-private-data-separation)
5. [Authentication Flow](#5-authentication-flow)
6. [Vercel Deployment](#6-vercel-deployment)
7. [Phased Build Plan](#7-phased-build-plan)
8. [Data Strategy Overview](#8-data-strategy-overview)

---

## 1. Migration Strategy

### What exists in the Spark prototype

The prototype is a **Vite + React 19 SPA** using GitHub Spark's KV store for all persistence. Key findings:

| Layer | Prototype | Production Target |
|-------|-----------|-------------------|
| Framework | Vite + React Router DOM | Next.js 14+ App Router |
| State/DB | `@github/spark` KV store (flat key-value) | Firebase Firestore (document DB) |
| Auth | Custom SHA-256 hash in KV (insecure for prod) | Firebase Auth (email/password + Google) |
| Data | 105KB hardcoded `sampleData.ts` (all fake) | Real APIs + Firestore + crowd-sourced |
| Styling | Tailwind v4 + Radix UI + shadcn | Tailwind v4 + Radix UI + shadcn (keep) |
| Charts | Recharts | Recharts (keep) |
| Deployment | GitHub Spark hosting | Vercel |

### What to keep

- **UI Components** — All Radix/shadcn primitives (`src/components/ui/`) port directly. Custom components (LiveWaitTimes, CrowdCalendar, WaitTimeChart, RideTimer, ReportWaitTimeModal) have solid UI logic worth adapting.
- **Type definitions** — `ExtendedAttraction`, `WaitTimeReport`, `Verification`, `UserContribution`, `Trip`, `RideLog`, `TripDay` types are well-designed. Port to `src/types/` and extend for Firestore.
- **Styling** — Tailwind config, CSS variables, color system, animation patterns. The PRD color scheme (Deep Ocean Blue, Warm Coral, Sage Green, Vibrant Orange) carries over.
- **Utility logic** — `busyLevel.ts` crowd level calculations, `timeFormat.ts`, `cn()` merge utility.
- **UX patterns** — Mobile bottom nav, park selector flow, ride log multi-day trip concept, wait time reporting with verification/consensus.

### What to rewrite

- **Routing** — React Router DOM → Next.js App Router (file-based routing)
- **Data layer** — Spark KV (`useKV`, `window.spark.kv`) → Firestore SDK + React hooks
- **Authentication** — Custom SHA-256 hashing → Firebase Auth (never roll your own auth)
- **Data initialization** — `ParkDataService.initializeAllParks()` loading fake data → real Firestore collections seeded by Chunk's data pipeline
- **Server logic** — No server in Spark → Next.js API routes + Firebase Cloud Functions for scheduled jobs (data refresh, crowd calendar computation)

### Phased approach

Port in this order to always have a working app:

1. **Scaffold** — Next.js project, Firebase config, Tailwind, shadcn, base layout
2. **Static data** — Seed Firestore with real park/ride data, build read-only pages
3. **Auth** — Firebase Auth integration, user profiles
4. **Dynamic features** — Wait times, crowd reporting, ride logging
5. **Analytics** — Historical data, crowd calendar, charts

---

## 2. Project Structure

```
theme-park-wait-times/
├── .github/                    # CI/CD workflows
├── .squad/                     # Squad agent config (existing)
├── docs/                       # Architecture docs (this file)
├── public/                     # Static assets (icons, images)
│
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout (providers, nav, footer)
│   │   ├── page.tsx            # Home page (/)
│   │   ├── globals.css         # Global styles + Tailwind
│   │   │
│   │   ├── parks/
│   │   │   ├── page.tsx                        # Park selector (/parks)
│   │   │   └── [parkId]/
│   │   │       ├── page.tsx                    # Park details (/parks/magic-kingdom)
│   │   │       └── attractions/
│   │   │           └── [attractionId]/
│   │   │               └── page.tsx            # Attraction detail
│   │   │
│   │   ├── calendar/
│   │   │   └── page.tsx                        # Crowd calendar (/calendar)
│   │   │
│   │   ├── dashboard/
│   │   │   └── page.tsx                        # User dashboard (auth required)
│   │   │
│   │   ├── log/
│   │   │   ├── page.tsx                        # Ride log entry (/log)
│   │   │   └── history/
│   │   │       └── page.tsx                    # My ride logs (/log/history)
│   │   │
│   │   ├── auth/
│   │   │   ├── signin/page.tsx                 # Sign in
│   │   │   └── signup/page.tsx                 # Sign up
│   │   │
│   │   ├── about/
│   │   │   └── page.tsx                        # About page
│   │   │
│   │   └── api/                                # API routes
│   │       ├── wait-times/
│   │       │   └── route.ts                    # GET current wait times
│   │       ├── crowd-reports/
│   │       │   └── route.ts                    # POST crowd report
│   │       └── parks/
│   │           └── [parkId]/
│   │               └── schedule/
│   │                   └── route.ts            # GET park schedule for date
│   │
│   ├── components/
│   │   ├── ui/                 # shadcn/Radix primitives (ported from prototype)
│   │   ├── layout/             # Header, Footer, MobileBottomNav, Sidebar
│   │   ├── parks/              # ParkCard, ParkOverview, ParkSelector
│   │   ├── attractions/        # AttractionCard, LiveWaitTimes, WaitTimeBadge
│   │   ├── calendar/           # CrowdCalendar, FamilyCrowdCalendar
│   │   ├── reporting/          # ReportWaitTimeModal, QuickWaitTimeModal, VerificationCard
│   │   ├── charts/             # WaitTimeChart, HistoricalTrendsChart
│   │   ├── auth/               # AuthModal, UserProfile, UserStats
│   │   └── ride-log/           # RideLogEntry, TripManager, RideTimer
│   │
│   ├── lib/
│   │   ├── firebase/
│   │   │   ├── config.ts       # Firebase app initialization
│   │   │   ├── auth.ts         # Firebase Auth helpers
│   │   │   ├── firestore.ts    # Firestore client helpers
│   │   │   └── admin.ts        # Firebase Admin SDK (server-side only)
│   │   ├── utils.ts            # cn(), formatTime(), etc.
│   │   └── constants.ts        # App-wide constants
│   │
│   ├── hooks/
│   │   ├── use-auth.ts         # Auth state hook (wraps Firebase Auth)
│   │   ├── use-park.ts         # Park data fetching
│   │   ├── use-wait-times.ts   # Real-time wait time subscription
│   │   ├── use-crowd-reports.ts # Crowd report submission + consensus
│   │   ├── use-ride-log.ts     # Trip/ride logging
│   │   ├── use-mobile.ts       # Responsive breakpoint hook
│   │   └── use-global-timer.ts # Ride timer state
│   │
│   ├── types/
│   │   ├── park.ts             # Park, ParkFamily, OperatingHours
│   │   ├── attraction.ts       # Attraction, SeasonalAttraction, AttractionStatus
│   │   ├── wait-time.ts        # WaitTimeRecord, WaitTimeReport, Verification
│   │   ├── user.ts             # UserProfile, UserContribution
│   │   ├── trip.ts             # Trip, TripDay, RideLog
│   │   ├── crowd.ts            # CrowdLevel, CrowdCalendarEntry
│   │   └── index.ts            # Re-exports
│   │
│   ├── services/
│   │   ├── park-data.ts        # Firestore park/attraction CRUD
│   │   ├── wait-time.ts        # Wait time reads + writes
│   │   ├── crowd-calendar.ts   # Crowd calendar computation
│   │   ├── trip.ts             # Trip/ride log persistence
│   │   └── reporting.ts        # Crowd report submission + validation
│   │
│   └── utils/
│       ├── busy-level.ts       # Crowd level calculation (ported)
│       ├── time-format.ts      # Time formatting helpers (ported)
│       └── validation.ts       # Input validation utilities
│
├── functions/                  # Firebase Cloud Functions (if needed)
│   ├── src/
│   │   ├── scheduled/
│   │   │   ├── refresh-wait-times.ts   # Cron: pull latest wait times from APIs
│   │   │   └── compute-crowd-calendar.ts # Cron: recompute crowd predictions
│   │   └── triggers/
│   │       └── on-crowd-report.ts      # Firestore trigger: validate + aggregate reports
│   └── package.json
│
├── scripts/                    # Data seeding and maintenance
│   ├── seed-parks.ts           # Seed Firestore with park data
│   └── seed-attractions.ts     # Seed Firestore with ride data
│
├── firestore.rules             # Firestore security rules
├── firestore.indexes.json      # Composite index definitions
├── firebase.json               # Firebase project config
├── next.config.js              # Next.js configuration
├── tailwind.config.ts          # Tailwind configuration
├── tsconfig.json
├── package.json
└── .env.local                  # Environment variables (gitignored)
```

---

## 3. Firebase Schema Design

### 3.1 Parks Collection (Public)

```
/parks/{parkId}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique slug: `"magic-kingdom"`, `"epcot"` |
| `name` | `string` | Display name: `"Magic Kingdom"` |
| `slug` | `string` | URL slug (same as id) |
| `family` | `string` | Parent resort: `"walt-disney-world"`, `"universal-orlando"` |
| `location` | `map` | `{ city, state, country, lat, lng }` |
| `timezone` | `string` | IANA timezone: `"America/New_York"` |
| `imageUrl` | `string` | Park hero image |
| `description` | `string` | Short description |
| `isActive` | `boolean` | Whether park is currently operating |
| `createdAt` | `timestamp` | |
| `updatedAt` | `timestamp` | |

**Subcollection: Operating Hours**

```
/parks/{parkId}/operatingHours/{dateString}
```

| Field | Type | Description |
|-------|------|-------------|
| `date` | `string` | ISO date: `"2026-04-28"` |
| `openTime` | `string` | `"09:00"` |
| `closeTime` | `string` | `"22:00"` |
| `earlyEntry` | `string?` | `"08:30"` (for early admission) |
| `extendedHours` | `string?` | `"23:00"` (special event close) |
| `specialEvent` | `string?` | `"Mickey's Not-So-Scary Halloween Party"` |
| `isClosed` | `boolean` | Full-day closure |

**Subcollection: Seasonal Schedules**

```
/parks/{parkId}/seasonalSchedules/{seasonId}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | `"Halloween Season"`, `"Holiday Season"` |
| `startDate` | `string` | `"2026-09-01"` |
| `endDate` | `string` | `"2026-11-01"` |
| `specialAttractions` | `string[]` | IDs of seasonal attractions active |
| `closedAttractions` | `string[]` | IDs of attractions closed for season |
| `modifiedHours` | `boolean` | Whether park hours differ |

### 3.2 Attractions Collection (Public)

```
/parks/{parkId}/attractions/{attractionId}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique slug: `"space-mountain"` |
| `name` | `string` | `"Space Mountain"` |
| `type` | `string` | `"thrill"` \| `"family"` \| `"show"` \| `"experience"` \| `"parade"` \| `"character-meet"` \| `"dining-experience"` |
| `area` | `string` | Land/area within park: `"Tomorrowland"` |
| `description` | `string` | Attraction description |
| `imageUrl` | `string?` | Attraction photo |
| `hasWaitTime` | `boolean` | `true` for rides, `false` for shows |
| `heightRequirement` | `number?` | Min height in inches (e.g., `44`) |
| `thrillLevel` | `number` | 1–5 scale |
| `rideVehicle` | `string?` | `"coaster"`, `"boat"`, `"dark-ride"` |
| `duration` | `number?` | Ride duration in minutes |
| `capacity` | `string?` | `"high"`, `"medium"`, `"low"` |
| `accessibility` | `string[]` | `["wheelchair-transfer", "audio-description"]` |
| `tags` | `string[]` | `["indoor", "dark", "fast-pass-eligible"]` |
| `openingYear` | `number?` | Year opened |
| `closingYear` | `number?` | Year closed (for defunct) |
| `availability` | `string` | `"year-round"` \| `"seasonal"` \| `"retired"` |
| `seasonalPeriod` | `string?` | `"Halloween"`, `"Christmas"` |
| `seasonalStartDate` | `string?` | `"09-01"` (month-day, recurring yearly) |
| `seasonalEndDate` | `string?` | `"11-15"` |
| `variants` | `array?` | `[{ id, name, description }]` for multi-track rides |
| `currentStatus` | `string` | `"operating"` \| `"closed"` \| `"delayed"` \| `"refurbishment"` \| `"seasonal-closed"` |
| `statusUpdatedAt` | `timestamp` | Last status change |
| `sortOrder` | `number` | Display sort order |
| `isActive` | `boolean` | Whether it should appear in the app |
| `createdAt` | `timestamp` | |
| `updatedAt` | `timestamp` | |

**Key design decisions:**

- Attractions are a **subcollection of parks** (not top-level) because they're always queried in park context. This gives us natural data locality.
- `availability` + `seasonalStartDate`/`seasonalEndDate` lets us compute "is this ride open today" on the client using the current date and park's seasonal schedule.
- `currentStatus` is the live operational status — updated by the data pipeline (Chunk's domain).

### 3.3 Wait Times Collection (Public)

**Current wait times (real-time, one doc per attraction):**

```
/parks/{parkId}/currentWaitTimes/{attractionId}
```

| Field | Type | Description |
|-------|------|-------------|
| `waitMinutes` | `number` | Current posted wait in minutes (-1 = closed) |
| `status` | `string` | `"operating"` \| `"closed"` \| `"delayed"` |
| `source` | `string` | `"api"` \| `"crowd-report"` \| `"estimated"` |
| `lastUpdated` | `timestamp` | When this was last refreshed |
| `trend` | `string?` | `"rising"` \| `"falling"` \| `"stable"` |

**Historical wait times (append-only log):**

```
/waitTimeHistory/{compositeId}
```

The `compositeId` is `{parkId}_{attractionId}_{YYYY-MM-DD}` for efficient date-range queries.

| Field | Type | Description |
|-------|------|-------------|
| `parkId` | `string` | |
| `attractionId` | `string` | |
| `date` | `string` | ISO date |
| `readings` | `array` | `[{ time: "09:15", waitMinutes: 25, source: "api" }, ...]` |

**Why this structure:**

- Current wait times are shallow documents for **fast real-time reads** — clients can subscribe to `currentWaitTimes` collection for live updates via `onSnapshot()`.
- Historical data is **one document per attraction per day** — keeps document sizes manageable (~100 readings/day × ~50 bytes = ~5KB per doc) while enabling efficient "what were wait times on April 15?" queries.
- Separated from the attractions collection so write-heavy wait time updates don't trigger re-reads of static attraction metadata.

### 3.4 Crowd Calendar Collection (Public)

```
/crowdCalendar/{parkId}_{YYYY-MM}
```

| Field | Type | Description |
|-------|------|-------------|
| `parkId` | `string` | |
| `month` | `string` | `"2026-04"` |
| `days` | `map` | `{ "01": { level: 3, label: "Low", ... }, "02": { ... } }` |

Each day entry:

| Field | Type | Description |
|-------|------|-------------|
| `level` | `number` | 1–10 crowd level |
| `label` | `string` | `"Very Low"` \| `"Low"` \| `"Moderate"` \| `"High"` \| `"Very High"` |
| `source` | `string` | `"historical"` \| `"predicted"` \| `"actual"` |
| `avgWait` | `number?` | Average wait across all rides (if historical) |
| `peakWait` | `number?` | Max average wait seen |
| `specialEvent` | `string?` | `"Spring Break"`, `"Christmas Week"` |

**Why a map per month:** One read = entire month's calendar. Client-side rendering is instant. ~30 entries × ~100 bytes = ~3KB per document.

### 3.5 Users Collection (Private)

```
/users/{uid}
```

The `uid` matches the Firebase Auth UID.

| Field | Type | Description |
|-------|------|-------------|
| `uid` | `string` | Firebase Auth UID |
| `email` | `string` | |
| `displayName` | `string` | |
| `photoURL` | `string?` | From Google sign-in or uploaded |
| `favoriteParks` | `string[]` | Park IDs |
| `homepark` | `string?` | Primary park ID |
| `contributionCount` | `number` | Total crowd reports submitted |
| `trustLevel` | `string` | `"new"` \| `"bronze"` \| `"silver"` \| `"gold"` \| `"platinum"` |
| `badges` | `string[]` | Achievement badges |
| `preferences` | `map` | `{ units: "imperial", theme: "light", notifications: true }` |
| `createdAt` | `timestamp` | |
| `updatedAt` | `timestamp` | |

### 3.6 Visit Logs / Trips (Private)

```
/users/{uid}/trips/{tripId}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | |
| `startDate` | `string` | ISO date |
| `endDate` | `string` | ISO date |
| `parks` | `array` | `[{ parkId, parkName, rideCount }]` |
| `totalRides` | `number` | Aggregate |
| `notes` | `string?` | User notes |
| `createdAt` | `timestamp` | |
| `updatedAt` | `timestamp` | |

**Subcollection: Ride Logs**

```
/users/{uid}/trips/{tripId}/rideLogs/{logId}
```

| Field | Type | Description |
|-------|------|-------------|
| `parkId` | `string` | |
| `attractionId` | `string` | |
| `attractionName` | `string` | Denormalized for display |
| `date` | `string` | ISO date of the ride |
| `time` | `string?` | Approximate time |
| `waitTime` | `number?` | Wait experienced (minutes) |
| `rideCount` | `number` | How many times ridden this entry |
| `trackVariant` | `string?` | For multi-track rides |
| `rating` | `number?` | 1–5 personal rating |
| `notes` | `string?` | Personal notes |
| `loggedAt` | `timestamp` | |

### 3.7 Crowd Reports Collection (Mixed — Public Aggregates, Private Attribution)

```
/crowdReports/{reportId}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | |
| `parkId` | `string` | |
| `attractionId` | `string` | |
| `userId` | `string` | Author UID — **read-restricted** |
| `displayName` | `string` | For public leaderboard display |
| `waitMinutes` | `number` | Reported wait (-1 = closed) |
| `status` | `string` | `"pending"` \| `"verified"` \| `"disputed"` |
| `accuracy` | `number?` | 0–1 score after verifications |
| `reportedAt` | `timestamp` | |
| `expiresAt` | `timestamp` | Auto-expire after 30 minutes |

**Subcollection: Verifications**

```
/crowdReports/{reportId}/verifications/{verificationId}
```

| Field | Type | Description |
|-------|------|-------------|
| `userId` | `string` | Verifier UID — **read-restricted** |
| `isAccurate` | `boolean` | |
| `alternateWait` | `number?` | If disagreeing, their estimate |
| `confidence` | `string` | `"low"` \| `"medium"` \| `"high"` |
| `verifiedAt` | `timestamp` | |

### 3.8 Required Composite Indexes

```json
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "currentWaitTimes",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "waitMinutes", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "crowdReports",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "parkId", "order": "ASCENDING" },
        { "fieldPath": "attractionId", "order": "ASCENDING" },
        { "fieldPath": "reportedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "crowdReports",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "attractionId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "reportedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "rideLogs",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        { "fieldPath": "parkId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    }
  ]
}
```

### 3.9 Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── PARKS (public read, admin write) ──
    match /parks/{parkId} {
      allow read: if true;
      allow write: if false; // Admin SDK only (seeding scripts + Cloud Functions)

      match /operatingHours/{dateId} {
        allow read: if true;
        allow write: if false;
      }

      match /seasonalSchedules/{seasonId} {
        allow read: if true;
        allow write: if false;
      }

      match /attractions/{attractionId} {
        allow read: if true;
        allow write: if false;
      }

      match /currentWaitTimes/{attractionId} {
        allow read: if true;
        allow write: if false; // Updated by Cloud Functions only
      }
    }

    // ── WAIT TIME HISTORY (public read, server write) ──
    match /waitTimeHistory/{docId} {
      allow read: if true;
      allow write: if false;
    }

    // ── CROWD CALENDAR (public read, server write) ──
    match /crowdCalendar/{docId} {
      allow read: if true;
      allow write: if false;
    }

    // ── USERS (private — owner only) ──
    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create: if request.auth != null && request.auth.uid == uid;
      allow update: if request.auth != null && request.auth.uid == uid;
      allow delete: if false; // Account deletion via Admin SDK

      match /trips/{tripId} {
        allow read, write: if request.auth != null && request.auth.uid == uid;

        match /rideLogs/{logId} {
          allow read, write: if request.auth != null && request.auth.uid == uid;
        }
      }
    }

    // ── CROWD REPORTS (mixed access) ──
    match /crowdReports/{reportId} {
      // Anyone can read public fields (waitMinutes, status, accuracy, reportedAt)
      // userId field is protected by field-level logic in the app
      allow read: if true;

      // Only authenticated users can create reports
      allow create: if request.auth != null
                    && request.resource.data.userId == request.auth.uid
                    && request.resource.data.waitMinutes >= -1
                    && request.resource.data.waitMinutes <= 300;

      // Only the author can update their own report
      allow update: if request.auth != null
                    && resource.data.userId == request.auth.uid;

      allow delete: if false;

      match /verifications/{verificationId} {
        allow read: if true;
        allow create: if request.auth != null
                      && request.resource.data.userId == request.auth.uid;
        allow update, delete: if false;
      }
    }
  }
}
```

---

## 4. Public vs Private Data Separation

### Public (no auth required)

| Data | Path | Rationale |
|------|------|-----------|
| Park metadata | `/parks/{parkId}` | Core app value — must be freely browsable |
| Operating hours | `/parks/{parkId}/operatingHours/{date}` | Trip planning is the #1 use case |
| Seasonal schedules | `/parks/{parkId}/seasonalSchedules/{id}` | Determines which rides are open |
| Attraction details | `/parks/{parkId}/attractions/{id}` | Browse rides without signing up |
| Current wait times | `/parks/{parkId}/currentWaitTimes/{id}` | Real-time value — gated by auth = dead product |
| Wait time history | `/waitTimeHistory/{id}` | Historical analytics — public utility |
| Crowd calendar | `/crowdCalendar/{id}` | Trip planning value |
| Crowd report aggregates | `/crowdReports/{id}` (read) | Community data is public |

### Private (auth required)

| Data | Path | Rationale |
|------|------|-----------|
| User profile | `/users/{uid}` | PII — email, preferences, favorites |
| Trips & ride logs | `/users/{uid}/trips/...` | Personal visit history |
| Crowd report authorship | `crowdReports.userId` | Protect contributor identity |
| Verification authorship | `verifications.userId` | Protect verifier identity |

### Auth-gated actions (requires sign-in)

- Submit a crowd report
- Verify someone else's report
- Log a ride / create a trip
- Save favorite parks
- Set home park
- View personal dashboard/stats

### Design principle

> **Read publicly, write privately.** The app's value proposition (wait times, crowd data, ride info) must be accessible to everyone. Personal data and write actions require authentication. This maximizes the audience funnel while protecting user data.

---

## 5. Authentication Flow

### Providers

1. **Email/Password** — Firebase Auth native
2. **Google Sign-In** — Firebase Auth with Google provider
3. *(Future: Apple Sign-In for iOS PWA)*

### Flow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│  User lands  │────▶│ Browse parks │────▶│ Try to submit    │
│  on app      │     │ (no auth)    │     │ a report / log   │
└─────────────┘     └──────────────┘     └────────┬─────────┘
                                                   │
                                          ┌────────▼─────────┐
                                          │  Auth modal /     │
                                          │  redirect to      │
                                          │  /auth/signin     │
                                          └────────┬─────────┘
                                                   │
                                    ┌──────────────▼──────────────┐
                                    │ Firebase Auth               │
                                    │ (email/password or Google)  │
                                    └──────────────┬──────────────┘
                                                   │
                                    ┌──────────────▼──────────────┐
                                    │ onAuthStateChanged fires    │
                                    │ → AuthContext updates        │
                                    │ → Firestore /users/{uid}    │
                                    │   created if new user       │
                                    └──────────────┬──────────────┘
                                                   │
                                    ┌──────────────▼──────────────┐
                                    │ User returned to original   │
                                    │ action (report / log / etc) │
                                    └─────────────────────────────┘
```

### Implementation

```typescript
// src/lib/firebase/auth.ts
// AuthProvider wraps the app, provides:
// - user: User | null
// - loading: boolean
// - signIn(email, password): Promise<void>
// - signInWithGoogle(): Promise<void>
// - signUp(email, password, displayName): Promise<void>
// - signOut(): Promise<void>

// On first sign-in, create /users/{uid} document with defaults
// On subsequent sign-ins, update lastLoginAt
```

### Session management

- Firebase Auth handles token refresh automatically
- Auth state persists across tabs via `browserLocalPersistence`
- Next.js middleware checks auth for protected routes (`/dashboard`, `/log/history`)
- API routes verify Firebase ID tokens for write operations

---

## 6. Vercel Deployment

### next.config.js

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.googleapis.com' }, // Firebase Storage
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }, // Google profile pics
    ],
  },
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
};

module.exports = nextConfig;
```

### Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Vercel + `.env.local` | Firebase Web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Vercel + `.env.local` | Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Vercel + `.env.local` | Project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Vercel + `.env.local` | Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Vercel + `.env.local` | FCM sender |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Vercel + `.env.local` | App ID |
| `FIREBASE_ADMIN_PROJECT_ID` | Vercel only | Server-side Admin SDK |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Vercel only | Service account email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Vercel only | Service account key |
| `THEMEPARKS_API_KEY` | Vercel only | ThemeParks.wiki API or similar |
| `CRON_SECRET` | Vercel only | Secret for Vercel Cron jobs |

### Preview deployments

- Every PR gets a preview deployment on Vercel automatically
- Preview deployments use the **same Firebase project** but can be configured with a `NEXT_PUBLIC_FIREBASE_ENV=preview` flag to isolate writes if needed
- Branch protection: `main` is production, PRs auto-deploy to previews

### Vercel Cron Jobs

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/refresh-wait-times",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/compute-crowd-calendar",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/update-park-schedules",
      "schedule": "0 6 * * *"
    }
  ]
}
```

---

## 7. Phased Build Plan

### Phase 1: Foundation (Week 1–2)

**Goal:** Deployable skeleton with auth and static park data.

| Task | Owner | Details |
|------|-------|---------|
| `create-next-app` scaffold with TypeScript, Tailwind, App Router | Mouth | Initial project setup |
| Firebase project creation + config | Data | Create project, enable Firestore + Auth |
| shadcn/ui component library setup | Mouth | Port `src/components/ui/` from prototype |
| Firebase Auth integration (email + Google) | Data | `AuthProvider`, sign-in/sign-up pages |
| Firestore security rules (v1) | Mikey | Deploy rules from section 3.9 |
| Type definitions | Mikey | Port + extend types from prototype |
| Park + attraction data model seed script | Chunk | Real park data → Firestore |
| Base layout (Header, Footer, MobileBottomNav) | Mouth | Port from prototype, adapt to Next.js |
| Park selector + park detail pages (read-only) | Mouth | `/parks`, `/parks/[parkId]` |
| Vercel deployment pipeline | Data | Connect repo, set env vars |

**Exit criteria:** App deploys to Vercel. Users can browse parks and attractions with real data. Auth works.

### Phase 2: Live Wait Times (Week 3–4)

**Goal:** Real-time wait time display — the core value prop.

| Task | Owner | Details |
|------|-------|---------|
| Wait time API integration research | Chunk | Evaluate ThemeParks.wiki API, queue-times.com, scraping options |
| Wait time data pipeline | Chunk | Scheduled function to pull + write to Firestore |
| `currentWaitTimes` real-time subscription hook | Data | `useWaitTimes()` with Firestore `onSnapshot` |
| LiveWaitTimes component | Mouth | Port + adapt from prototype, connect to Firestore |
| Attraction detail page with live status | Mouth | `/parks/[parkId]/attractions/[attractionId]` |
| Ride status tracking (open/closed/seasonal) | Chunk + Data | Compute `currentStatus` from schedule + API data |
| Seasonal attraction logic | Data | Client-side: compare current date to `seasonalStartDate`/`seasonalEndDate` |
| Wait time trend indicator | Mouth | Rising/falling/stable badges |

**Exit criteria:** Users see live wait times that update. Rides show correct open/closed status based on the day. Seasonal attractions are flagged.

### Phase 3: User Ride Logging (Week 5–6)

**Goal:** Authenticated users can log rides and track visit history.

| Task | Owner | Details |
|------|-------|---------|
| User profile page (`/dashboard`) | Mouth | Favorites, stats, preferences |
| Trip creation + management | Data | Firestore CRUD for trips |
| Ride log entry UI | Mouth | Port RideLogPage concept, simplify |
| Ride timer component | Mouth | Port from prototype |
| My ride logs / history page | Mouth | `/log/history` with filtering |
| User stats component (total rides, parks visited) | Mouth | Port UserStats from prototype |
| Firestore trip/rideLog service | Data | `services/trip.ts` |
| E2E tests for auth + logging flow | Stef | Critical path testing |

**Exit criteria:** Users can create trips, log rides, view history. Timer works. Stats are accurate.

### Phase 4: Crowd Calendar & Analytics (Week 7–8)

**Goal:** Historical data visualization and crowd predictions.

| Task | Owner | Details |
|------|-------|---------|
| Historical wait time storage | Chunk + Data | Accumulate wait time readings daily |
| Crowd calendar computation | Data | Cloud function: aggregate historical data → crowd levels |
| Crowd calendar UI | Mouth | Port CrowdCalendar + FamilyCrowdCalendar |
| Wait time history charts | Mouth | Port WaitTimeChart with Recharts |
| Historical analytics page | Mouth | Time range selection, park comparison |
| Crowd calendar API route | Data | `/api/parks/[parkId]/schedule` |
| Crowd level seeding (initial data) | Chunk | Bootstrap with historical crowd data |

**Exit criteria:** Crowd calendar shows predicted levels for next 6 months. Historical charts work for any ride. Data updates daily.

### Phase 5: Crowd-Sourced Reporting (Week 9–10)

**Goal:** Community-powered wait time validation.

| Task | Owner | Details |
|------|-------|---------|
| Report wait time modal | Mouth | Port ReportWaitTimeModal |
| Quick report from ride card | Mouth | Port QuickWaitTimeModal |
| Verification system | Data | Firestore triggers for accuracy calculation |
| Consensus algorithm | Data | Weighted average with trust levels (port from `useReporting`) |
| User contribution tracking + badges | Data | Trust level progression |
| Report validation (anti-spam) | Data | Rate limiting, range checks, outlier detection |
| Leaderboard component | Mouth | Top contributors (public display names only) |
| Integration tests for reporting flow | Stef | |

**Exit criteria:** Users can submit and verify wait times. Consensus calculates correctly. Spam is blocked. Contributions are tracked.

---

## 8. Data Strategy Overview

### Data sources (priority order)

1. **ThemeParks.wiki API** (primary) — Open-source API with real-time wait times for Disney, Universal, and others. Free tier available. Chunk to evaluate reliability and coverage.

2. **Official park APIs** (secondary) — Some parks expose schedule/hours data publicly (Disney calendar feeds, Universal app API). Chunk to reverse-engineer what's available.

3. **Crowd-sourced reports** (supplementary) — User-submitted wait times fill gaps where APIs don't cover or for validation. Never the sole source — always cross-reference with API data.

4. **Static data seeding** (bootstrap) — Park metadata, ride details, historical crowd patterns seeded from curated datasets. The prototype's `sampleData.ts` has the right structure but fake numbers — Chunk replaces with real data.

### Data freshness requirements

| Data Type | Target Freshness | Update Mechanism |
|-----------|-----------------|------------------|
| Current wait times | ≤5 minutes | Vercel cron every 5 min → Firestore |
| Ride status (open/closed) | ≤5 minutes | Same cron job |
| Park operating hours | Daily | Cron at 6 AM local time |
| Crowd calendar predictions | Daily | Nightly batch job |
| Historical wait times | End of day | Nightly aggregation |
| Park/ride metadata | Manual | Seed scripts, occasional updates |
| Seasonal schedules | Monthly | Manual review + seed update |

### Caching strategy

| Layer | What | TTL | How |
|-------|------|-----|-----|
| Firestore real-time | Current wait times | Live | `onSnapshot` — no caching needed, Firestore handles it |
| Next.js ISR | Park detail pages | 1 hour | `revalidate: 3600` in page fetch |
| Next.js ISR | Crowd calendar | 6 hours | `revalidate: 21600` |
| Client-side | Wait time history | 10 min | React Query with `staleTime: 600000` |
| CDN (Vercel Edge) | Static park metadata | 24 hours | Cache-Control headers on API routes |
| Service Worker | Offline fallback | Last fetch | Cache recent park data for offline viewing |

### Architectural pattern for data flow

```
┌─────────────────┐    every 5 min    ┌───────────────┐
│ External APIs    │─────────────────▶│ Vercel Cron   │
│ (ThemeParks.wiki)│                  │ API Route     │
└─────────────────┘                  └───────┬───────┘
                                              │ Firebase Admin SDK
                                              ▼
                                    ┌─────────────────┐
                                    │ Firestore        │
                        ┌──────────│ currentWaitTimes │──────────┐
                        │          │ waitTimeHistory   │          │
                        │          │ parks / attractions│          │
                        │          └─────────────────┘          │
                        │ onSnapshot                    read     │
                        ▼                                        ▼
               ┌─────────────────┐                    ┌─────────────────┐
               │ Client (live    │                    │ Next.js SSR/ISR │
               │ dashboard)      │                    │ (park pages,    │
               │                 │                    │  calendar)      │
               └─────────────────┘                    └─────────────────┘

┌─────────────────┐    POST /api/crowd-reports
│ Authenticated   │──────────────────────────▶ Firestore /crowdReports
│ User            │                           → triggers validation
└─────────────────┘                           → updates consensus
```

### Key principle

> **The app never scrapes in the browser.** All external data fetching happens server-side (Vercel Cron or Cloud Functions) and writes to Firestore. The client reads from Firestore only. This keeps API keys safe, centralizes rate limiting, and means we can swap data sources without touching the frontend.

---

## Appendix: Key Technical Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Next.js App Router over Pages Router | App Router is the future of Next.js. Server components reduce client bundle. |
| 2 | Attractions as subcollection of Parks | Data locality — always queried per-park. Avoids cross-collection queries. |
| 3 | Separate currentWaitTimes from attraction docs | High-frequency writes (every 5 min) shouldn't trigger re-reads of static attraction data. |
| 4 | One historical wait time doc per attraction per day | Keeps doc size manageable. Easy date-range queries. |
| 5 | Crowd calendar stored as month-maps | Single read per month. Optimal for calendar UI rendering. |
| 6 | Firebase Auth over custom auth | Never roll your own auth. Firebase gives us email, Google, Apple, MFA for free. |
| 7 | Server-side data fetching only | API keys stay safe. Rate limiting centralized. Source-swappable. |
| 8 | Seasonal availability as date ranges on attraction docs | Client can compute "is this open today" without extra reads. No separate "schedule" collection needed. |
| 9 | Trust-weighted consensus for crowd reports | Prevents spam. Rewards accurate contributors. Same algorithm as prototype but backed by Firestore. |
| 10 | Vercel Cron over Firebase Scheduled Functions | Simpler deployment — single platform. Firebase Functions add cold start latency. |
