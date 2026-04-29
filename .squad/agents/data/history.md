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
