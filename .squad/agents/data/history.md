# Data — History

## Project Context

- **Project:** theme-park-wait-times — A platform for theme park visitors to track ride wait times, log visits, plan trips with crowd calendars, and crowd-source real-time wait data.
- **Stack:** React/Next.js, TypeScript, Firebase (Firestore, Auth, Security Rules, Cloud Functions), Vercel
- **User:** Devin Sinha
- **Key concern:** Database structure for user accounts, public vs private data separation. Crowd calendars and wait times should be public; user ride logs and profiles should be private.
- **Deployment pattern:** Similar to Devin's arkham-horror-tracker and unmatched apps (Firebase + Vercel).

## Architecture Decisions (via Scribe — 2026-04-28)

### Firestore Schema & Data Structure

**Parks → Attractions → currentWaitTimes Hierarchy**
```
/parks/{parkId}
  - name, location, operatingHours, metadata
  - /attractions/{rideId}
    - name, type (ride/show/restaurant), themedArea, metadata
    - /currentWaitTimes (separate collection — high-frequency writes)
      - waitMinutes, status (open/closed/down), source, confidence
    - /historicalWaitTimes/{date}
      - hourly wait data (one doc per ride per day, ~5KB each)
```

**Rationale:**
- Attractions as subcollection keeps data locality (always queried per-park)
- currentWaitTimes separated from attraction metadata (writes every 5 min vs metadata rarely changes)
- Historical stored per-day per-ride (manageable doc sizes, efficient date-range queries)

**Crowd Calendar Storage**
- `/parks/{parkId}/crowdCalendar/{yearMonth}` 
- Single doc per month with daily crowd level (1-10 scale)
- Instant calendar rendering, one Firestore read per month view

**Private User Data**
- `/users/{uid}/trips/{tripId}` — trip metadata + rider list
- `/users/{uid}/rideLogs/{rideLogId}` — individual ride completion logs
- All private to user via Security Rules

### Authentication & Security Rules

**Firebase Auth Setup**
- Email/password + Google sign-in enabled
- No custom auth — prototype's SHA-256 KV replaced entirely
- Firebase Admin SDK for server-side writes only

**Security Rules: Public/Private Boundary**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public: parks, attractions, live waits
    match /parks/{parkId}/attractions/{rideId}/{document=**} {
      allow read: if true;
    }
    // Private: user trips, ride logs
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth.uid == uid;
    }
  }
}
```

### Phase 1 Tasks (Data focus)

- Wire up Firebase project (Firestore, Auth, Cloud Functions)
- Create Firestore security rules with public/private split
- Seed Firestore with static park and attraction data (6 Orlando parks)
- Build Cloud Function: scheduledPollWaitTimes (cron every 5 min)
- Validate data flow: API → Firestore → Client

## Learnings

- **2026-04-28:** Created Firebase infrastructure layer (`src/lib/firebase/config.ts`, `auth.ts`, `firestore.ts`, `auth-context.tsx`). All files use Firebase v9+ modular SDK — no compat layer. Config uses `getApps().length` guard for Next.js hot-reload safety. Auth context is a `'use client'` component wrapping `onAuthStateChanged` with loading state. Firestore helpers are generic CRUD + batch + timestamp utilities — services layer will compose on top of these. Security rules match ARCHITECTURE.md §3.9 exactly. Composite indexes from §3.8 in `firestore.indexes.json`. Added `.env.local` to `.gitignore`. Created `vercel.json` with `iad1` region (closest to Orlando data sources). Created `firebase.json` pointing rules/indexes. All files designed to merge cleanly with Mouth's parallel Next.js scaffold.

## Phase 1 Completion (2026-04-29)

- **Firebase Setup:** Config, initialization guards, environment handling complete.
- **Auth Module:** signUp, signIn (email + Google OAuth), signOut helpers implemented and tested.
- **Firestore Layer:** Generic CRUD functions (`getDocument<T>`, `addDocument`, `updateDocument`, `deleteDocument`, etc.) with TypeScript generics. Ready for service layer composition.
- **Security Rules:** Write-protected public collections (parks, attractions, wait-times, crowd-calendar). Admin SDK only for mutations. Matches ARCHITECTURE.md §3.9.
- **Composite Indexes:** All 4 indexes from ARCHITECTURE.md §3.8 defined in `firestore.indexes.json`.
- **Deployment:** Vercel config with `iad1` region. Environment template created. Firebase JSON manifests ready.
- **Files:** 9 files — all build passes, no TS errors, lint clean.
- **Decisions Filed:** Firebase Infrastructure Patterns (5 design decisions on auth context, Firestore helpers, security defaults, region, write protection).
- **Next:** Merge with Mouth's frontend scaffold. Ready for Phase 2 park data seeding and live wait-times API.

- **2026-04-29:** Wired real Firebase credentials into `.env.local`. Project ID is `theme-park-log-and-wait-time`. Storage bucket uses `.firebasestorage.app` domain (not `.appspot.com` — newer Firebase projects use this). Added `measurementId` (G-774BVGWH68) to config.ts and both env templates for Google Analytics support. All 7 NEXT_PUBLIC_FIREBASE_* vars confirmed reading correctly. TS compiles clean.

## 2026-04-29 09:28 — Scribe: Orchestration Complete
- Firebase config wired into .env.local
- TypeScript compilation clean
- Ready for next phase (UI integration or testing)

- **2026-04-29:** Wired Firebase Auth into sign-in, sign-up, and dashboard pages. Key patterns:
  - `src/app/providers.tsx` — Client-side wrapper that injects `<AuthProvider>` (layout.tsx stays a server component for metadata export).
  - Auth pages are `'use client'` — import `signIn`, `signUp`, `signInWithGoogle` from `src/lib/firebase/auth.ts`. No changes needed to auth.ts — it already had the right exports.
  - Error handling uses `FirebaseError` codes mapped to user-friendly messages.
  - Redirect-if-authenticated: auth pages check `useAuth().user` and call `router.replace('/dashboard')`.
  - Dashboard shows user info (name, email, provider) when signed in, sign-in CTA when not.
  - Loading states on all buttons during async auth calls. `disabled:opacity-50` for visual feedback.
  - Pre-existing build error (500.html rename ENOENT) is unrelated to auth — likely needs a `pages/500.tsx` or Next.js config fix.

## Phase 1 Orchestration Complete (2026-04-29 16:38:58Z)

- **Decision Merged:** Client-Side Data Fetching for Parks Pages decision from Mouth filed and archived.
- **Orchestration Logs:** Data, Mouth, and Stef orchestration logs written.
- **Session Log:** Orchestration completion logged.
- **Status:** All Phase 1 deliverables complete. Firebase Auth wired, parks dashboard live, 99 tests passing. Ready for Phase 2 (seeding, scheduling, analytics).

- **2026-04-29:** Built ride logging + crowdsourced timer backend per Mikey's architecture decision. Deliverables:
  - `src/types/ride-log.ts` — Full type definitions: RideLog, RideLogCreateData, RideLogUpdateData, ActiveTimer, TimerStartData, CrowdReport, CrowdAggregate, QueueReportRequest.
  - `src/lib/services/ride-log-service.ts` — Complete CRUD (addRideLog, getRideLogs with filtering by parkId/attractionId, getRideLog, updateRideLog, deleteRideLog) + client-side submitCrowdReport helper.
  - `src/lib/services/timer-service.ts` — startTimer, stopTimer, getActiveTimer, abandonTimer, subscribeToActiveTimer (realtime), checkForAbandonedTimer (4h threshold). Uses client SDK directly for low-latency timer ops.
  - `src/lib/services/crowd-service.ts` — Server-side (Admin SDK): getCrowdAggregate, getCrowdAggregatesForPark, submitCrowdReport (writes anonymized report + re-aggregates with simple average placeholder).
  - `src/app/api/queue-report/route.ts` — POST endpoint: verifies Firebase ID token, validates bounds (2-180 min), anonymizes (no userId passed), writes report, re-aggregates.
  - `firestore.rules` — Added: users/{uid}/rideLogs/{logId}, users/{uid}/activeTimer/{docId} (owner only), crowdsourcedWaitTimes/{parkId}/reports + aggregates (public read, server write only).
  - `firestore.indexes.json` — Added: rideLogs parkId+rodeAt DESC, rideLogs attractionId+rodeAt DESC, crowdsourced reports attractionId+reportedAt DESC.
  - Fixed existing TS error in TimerCompleteSheet (removed stale `rodeAt` param from submitCrowdReport call).
  - Aligned CrowdAggregate.confidence type with Chunk's aggregation module (includes 'none' for 0-report case).
  - TypeScript compiles clean (zero errors).

- **2026-04-29:** Vercel deployment prep complete. Key findings:
  - `vercel.json` already existed (created during Phase 1) with `iad1` region + API no-cache headers — no changes needed.
  - `npm run build` passes clean — all pages compile (static + dynamic).
  - Vercel CLI v52.0.0 is available locally but project not yet linked (needs `vercel login` + `vercel link`).
  - `src/lib/firebase/admin.ts` reads `FIREBASE_SERVICE_ACCOUNT` env var (JSON string) with fallback to local `service-account.json`.
  - 8 env vars total needed in Vercel dashboard: 7 client-side `NEXT_PUBLIC_FIREBASE_*` + 1 server-side `FIREBASE_SERVICE_ACCOUNT`.
  - Filed deployment decision to `.squad/decisions/inbox/data-vercel-deploy.md` with full env var table and CLI steps.

- **2026-04-29:** Built Trip service layer per Mikey's architecture decision. Deliverables:
  - `src/types/trip.ts` — Replaced old prototype types with new Trip, TripStats, TripStatus, TripCreateData, TripUpdateData interfaces. Clean separation of concerns.
  - `src/types/ride-log.ts` — Added `tripId: string | null` to RideLog interface. Made it optional in RideLogCreateData so existing callers aren't broken.
  - `src/lib/services/trip-service.ts` — Full CRUD (createTrip, getTrips, getTrip, updateTrip, deleteTrip) + status management (getActiveTrip, activateTrip, completeTrip) + stats (updateTripStats, getTripRideLogs) + sharing (getSharedTrip, generateShareId). Uses `sharedTrips/{shareId}` collection as public-read index pointing to owner's private trip doc.
  - `src/lib/services/ride-log-service.ts` — addRideLog now accepts optional `tripId` parameter. Backward-compatible (defaults to null).
  - `src/types/index.ts` — Updated exports to match new trip types.
  - TypeScript compiles clean (zero errors). Existing code unbroken.
  - Key pattern: `generateShareId()` uses `crypto.getRandomValues` + URL-safe base64 (22 chars, 128 bits entropy). Share lookup is two reads: sharedTrips index → user's trip doc.

- **2026-04-29:** Wired trip integration into ride logging + created sharing API route. Deliverables:
  - `src/lib/services/ride-log-service.ts` — `addRideLog` now auto-detects active trip via `getActiveTrip(userId)` when no explicit tripId is passed. After logging, calls `updateTripStats()` to recompute denormalized stats. Backward-compatible: explicit `tripId` param or `null` overrides auto-detection.
  - `src/lib/services/trip-service.ts` — Added `generateShareLink(userId, tripId)` which generates shareId, writes to trip doc + sharedTrips index, returns URL path. Idempotent (reuses existing shareId).
  - `src/app/api/trips/[shareId]/route.ts` — Public GET endpoint using firebase-admin. Reads sharedTrips index → user's trip + ride logs. Returns sanitized JSON (no userId exposed). In-memory rate limiting (60 req/min per IP).
  - `firestore.rules` — Added `sharedTrips/{shareId}`: public read, authenticated create, owner-only update/delete.
  - TypeScript compiles clean. Next.js build passes.
  - Design choice: Rate limiting is in-memory (resets on cold start). Acceptable for v1; upgrade to Redis/KV if abuse occurs.
  - Design choice: sharedTrips rules allow client-side writes (not admin-only) because trip-service runs client-side. Secured by auth + owner check on mutations.

## Scribe Batch Update (2026-04-29 10:59:18Z)

**Decision inbox processed:**
- Trip Sharing, Vercel Deployment decisions archived with full details
- Ride Logging & Crowdsourced Wait Times decision integrated
- Trip Planner & Ride Type Filters decision filed
- Inbox cleared

**Status:** Trip service layer complete. 12 functions tested. Vercel deployment decision documented (iad1 region, env var strategy). Ready for Phase 2 (API integration, trip pages UI).

- **2026-04-29:** Created `/api/park-schedule` endpoint per Mikey's virtual-queue-sidebar-events architecture decision. Deliverables:
  - `src/app/api/park-schedule/route.ts` — GET endpoint with `parkId` (required) and `date` (optional, defaults to today) params. Fetches from ThemeParks Wiki `/entity/{parkId}/schedule`, transforms to `ParkDaySchedule` shape, caches in Firestore at `parkSchedules/{parkId}/daily/{YYYY-MM-DD}`.
  - Cache strategy: 1-hour TTL. On API 429/5xx, returns stale cached data with `stale: true` flag. If no cache exists and API is down, returns 503 with friendly message.
  - `firestore.rules` — Added `parkSchedules/{parkId}/daily/{date}`: public read, server-only write (Admin SDK bypasses rules).
  - Response shape: `ParkDaySchedule` with parkId, date, timezone, segments array (type/description/openingTime/closingTime/purchases), fetchedAt.
  - Follows same patterns as wait-times route: uses `adminDb` from `@/lib/firebase/admin`, `Timestamp` from firebase-admin, NextResponse.
  - TypeScript compiles clean. No new dependencies.
  - Key pattern: Graceful degradation — stale cache is better than no data. API errors are categorized (retryable vs fatal).

## Scribe Orchestration Log (2026-04-29 18:47:57Z)

**Phase 1 Team Delivery:**
- Park schedule endpoint complete: fetches ThemeParks Wiki schedule, caches in Firestore at 1-hour TTL
- Response includes park open/close times + special events (Early Entry, Extended Evening, etc.) + Lightning Lane pricing
- Resilience pattern: 429/5xx fallback to stale cache with indicator
- Mouth integrated endpoint into park detail page; fetches `/api/park-schedule?parkId=X` in parallel
- ParkScheduleBar component renders color-coded timeline with event badges + LL pricing display
- Stef validated 11 API tests passing for park-schedule endpoint
- Decision #15 filed with full 3-feature (virtual queues, forecast chart, schedule bar) architecture

- **2026-04-29:** Built blended forecast system (Phase 1) per Mikey's architecture decision. Deliverables:
  - `src/lib/forecast/blender.ts` — `resolveForecast()` function implements decision logic: live wins, historical fallback at ≥15 totalSamples, confidence = min(totalSamples/50, 1), skips hours with <3 samples. Exports `BlendedForecastResult` interface.
  - `src/types/queue.ts` — Added `ForecastAggregate` and `ForecastMeta` interfaces (Chunk's aggregation module also needs these).
  - `src/app/api/wait-times/route.ts` — Added `blendForecasts()` helper that batch-reads aggregate docs for attractions missing live forecasts (uses `adminDb.getAll()` for efficiency). `formatWaitTimeEntry` now accepts and includes `forecastMeta` field. `forecast` field remains backward-compatible (entries array or null). Historical entries replace null forecasts when available.
  - `firestore.rules` — Added `forecastAggregates/{parkId}/{document=**}` rule: public read, server-only write.
  - Graceful degradation: aggregate read failures fall back to `source: 'none'` with console error. No user-facing errors.
  - TypeScript compiles clean. Next.js build passes.

- **2026-04-29:** Fixed crowd calendar showing empty data for non-today dates. Root cause: `computeFamilyCrowdDays` only read live forecast data from `waitTimes/{parkId}/current` docs which only contain TODAY's hourly forecast. Fix: rewrote function to read historical aggregate data from `forecastAggregates/{parkId}/byDayOfWeek/{dow}/attractions/` for all days in the month. Live data still wins for today. Aggregates require totalSamples ≥ 15 and hourly sampleCount ≥ 3 (matching blender thresholds). Updated `hasRealData` check: if ≥50% of days have data, treat as real (not placeholder). Falls back to `generatePlaceholderData` on cold start. Build passes clean.

