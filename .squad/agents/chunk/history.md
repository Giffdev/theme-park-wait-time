# Chunk — History

## Project Context

- **Project:** theme-park-wait-times — A platform for theme park visitors to track ride wait times, log visits, plan trips with crowd calendars, and crowd-source real-time wait data.
- **Stack:** React/Next.js, TypeScript, Firebase, Vercel
- **User:** Devin Sinha
- **Key concern:** Accurate ride data — which rides are open/closed by day, seasonal attractions, real wait times via public APIs + crowd-sourcing. Started with a few parks to prove out.
- **Competitors:** thrill-data.com (good data, bad UI)
- **Data needs:** Real-time wait times, historical patterns, crowd calendars, ride status, seasonal schedules.

## Learnings

### 2026-04-28 — Architecture Decision: Data Integration Strategy (via Scribe)

**APIs Evaluated:**
- **ThemeParks.wiki** (PRIMARY): 75+ parks, 300 req/min, free, no auth. Endpoints: `/v1/destinations`, `/v1/entity/{id}/live`, `/v1/entity/{id}/schedule`. GitHub: ThemeParks/parksapi. Best structured data.
- **Queue-Times.com** (SECONDARY): 80+ parks, ~5 min refresh, free with attribution required. Endpoints: `/parks.json`, `/parks/{id}/queue_times.json`. Has historical data since 2014 but no bulk download API.
- **park.fan**: ML-predicted wait times + weather. Good for enrichment.
- **Wartezeiten.APP**: Free, requires attribution link. EU-focused but global coverage.

**Key Decisions Made:**
- Launch with 6 Orlando parks (WDW 4 + Universal 2) — best API coverage, geographic cluster
- 5-minute polling interval matches data freshness of sources
- Crowd calendar starts rule-based (day of week + holidays + events), transitions to ML after 6 months
- Crowd-sourced data supplements APIs, never replaces them
- No scraping — APIs cover 95%+ of needs

**Architecture:**
- Firebase Cloud Functions for polling (scheduledPollWaitTimes every 5 min)
- Firestore structure: /parks/{id}/liveData/{rideId} for hot reads
- Historical data logged to /waitTimeHistory/ for crowd calendar training
- Confidence scoring (0.0-1.0) based on data age and source

**Cost Estimates:**
- ThemeParks.wiki: ~2,880 requests/day for 10 parks (well under 432,000/day limit)
- Firestore: minimal at launch scale
- Cloud Functions: ~288 invocations/day (free tier)
