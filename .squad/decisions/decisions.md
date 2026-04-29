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
