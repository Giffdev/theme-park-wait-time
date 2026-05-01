# Data — History

## Project Context

- **Project:** theme-park-wait-times — Platform for tracking ride wait times, logging visits, crowd calendars, and crowd-sourced data.
- **Stack:** React/Next.js, TypeScript, Firebase (Firestore, Auth, Security Rules), Vercel

## Current Sprint — Stats Dashboard + Trip Sharing (2026-05-01)

**Your Role:** Backend lead for stats aggregation  
**Status:** ✅ Career stats module delivered

### Deliverable (Sprint A Item #1)

Built `src/lib/stats/career-stats.ts` — client-side stats computation:

**API:**
- `computeCareerStats(rideLogs, dateRange?)` — all-in-one aggregation
- `filterByDateRange(rideLogs, range)` — date scoping
- `computeRideDistributionByPark(rideLogs)` — per-park counts
- `computeAttractionCounts(rideLogs)` — ranked attractions

**Returns:** totalRides, totalParksVisited, averageWaitMinutes, mostVisitedPark, favoriteAttraction, topAttractions, rideDistributionByPark

**Design:** Pure functions, no Firestore calls. Mouth imports and passes ride log arrays.

**Commit:** ea46bab

---

## Recent Sprints Completed

| Sprint | Status | Key Work |
|---|---|---|
| ParkFlow Brand + Schedule API | ✅ | `/api/parks/[slug]/schedule`, `/api/park-hours` |
| Forecast System Phase 1 | ✅ | Confidence thresholds, historical aggregates |
| Stale Data + Auto-Refresh | ✅ | Triple-layer cache fix, 19 unit tests |
| Slug Resolution Debug | ✅ | API endpoints accept slug/UUID, 15 tests |

## Key Architecture Patterns

- **API slug resolution:** Endpoints accept both slug and UUID formats (Firestore → UUID lookup)
- **Forecast blending:** Live > historical > none with confidence = min(samples/50, 1)
- **Triple-layer caching:** Next.js revalidate + CDN + app state
- **Seed script generalization:** Multi-destination config (13 parks × 627 attractions)

## Current Status

✅ All tests passing (15+ suites)  
✅ Production deployed  
✅ Slug resolution working all endpoints  
✅ Career stats ready for Mouth (Sprint A)

*Full history: see history-archive-2026-05-01T18-28-49Z.md*
