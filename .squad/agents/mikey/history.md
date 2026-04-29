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
