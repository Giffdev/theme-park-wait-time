# Decision: Architecture Plan for Theme Park Wait Times

- **Author:** Mikey
- **Date:** 2026-04-28
- **Status:** Proposed
- **Scope:** Full system architecture

## Summary

Comprehensive architecture plan established for porting the GitHub Spark prototype (Giffdev/theme-park-wait-time) to a production Next.js + Firebase + Vercel stack. Full plan written to `docs/ARCHITECTURE.md`.

## Key Decisions

### 1. Next.js App Router + Vercel
- App Router (not Pages Router) for server components and modern patterns
- Vercel for deployment with Cron jobs for scheduled data refresh
- ISR for park pages (1hr), crowd calendar (6hr)

### 2. Firebase as sole backend
- Firestore for all data persistence
- Firebase Auth for authentication (email/password + Google sign-in)
- No custom auth — prototype's SHA-256 KV approach is replaced entirely
- Firebase Admin SDK for server-side writes only

### 3. Firestore Schema — Key Structural Choices
- **Attractions as subcollection of Parks** — always queried per-park, natural data locality
- **currentWaitTimes separated from attraction docs** — high-frequency writes (every 5 min) isolated from static metadata
- **Historical wait times: one doc per attraction per day** — manageable doc sizes (~5KB), efficient date-range queries
- **Crowd calendar: month-maps** — single Firestore read per month, instant calendar rendering
- **Trips/rideLogs as user subcollections** — private by structure, security rules enforce owner-only access

### 4. Public vs Private Data Boundary
- **Public (no auth):** Parks, attractions, wait times, crowd calendar, crowd report aggregates
- **Private (auth required):** User profiles, trips, ride logs, report/verification authorship
- **Principle:** "Read publicly, write privately" — maximize audience, protect user data

### 5. Data Strategy
- **Server-side only data fetching** — no API keys in browser, no scraping from client
- **ThemeParks.wiki API as primary source** (Chunk to evaluate)
- **Vercel Cron (5-min interval)** for wait time refresh
- **Crowd-sourced reports supplement, never replace, API data**
- **Trust-weighted consensus algorithm** for crowd reports (ported from prototype)

### 6. Five-Phase Build Plan
- Phase 1: Scaffold + Auth + Static Data (Mouth + Data + Chunk)
- Phase 2: Live Wait Times + Ride Status (Chunk + Mouth + Data)
- Phase 3: User Ride Logging (Mouth + Data + Stef)
- Phase 4: Crowd Calendar + Analytics (Mouth + Data + Chunk)
- Phase 5: Crowd-Sourced Reporting (Mouth + Data + Stef)

### 7. What Ports From Prototype
- UI components (shadcn/Radix primitives, custom components adapted)
- Type definitions (extended for Firestore)
- Styling system (Tailwind config, color scheme, CSS variables)
- UX patterns (mobile nav, park selector, ride timer, multi-day trips)
- Business logic (busy level calculation, consensus algorithm, time formatting)

### 8. What Gets Rewritten
- Routing (React Router DOM → Next.js file-based)
- Data layer (Spark KV → Firestore SDK)
- Authentication (custom SHA-256 → Firebase Auth)
- Data initialization (fake sampleData.ts → real API-sourced Firestore data)

## Impact

This plan is the foundational document for the entire team. All subsequent work references it. Key file: `docs/ARCHITECTURE.md`.
