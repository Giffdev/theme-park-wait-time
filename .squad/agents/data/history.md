# Data — History

## Project Context

- **Project:** theme-park-wait-times — A platform for theme park visitors to track ride wait times, log visits, plan trips with crowd calendars, and crowd-source real-time wait data.
- **Stack:** React/Next.js, TypeScript, Firebase (Firestore, Auth, Security Rules, Cloud Functions), Vercel
- **User:** Devin Sinha
- **Key concern:** Database structure for user accounts, public vs private data separation. Crowd calendars and wait times should be public; user ride logs and profiles should be private.
- **Deployment pattern:** Similar to Devin's arkham-horror-tracker and unmatched apps (Firebase + Vercel).

*Detailed history of early work (2026-04-28 through mid-2026-04-29) archived in history-archive.md.*

## Recent Work (2026-04-29)

### Blended Forecast System — Phase 1

Built forecast resolution logic per Mikey's architecture decision.

**Files Created/Modified:**
- `src/lib/forecast/blender.ts` — `resolveForecast()` function implements decision logic: live wins, historical fallback at ≥15 totalSamples, confidence = min(totalSamples/50, 1), skips hours with <3 samples. Exports `BlendedForecastResult` interface.
- `src/types/queue.ts` — Added `ForecastAggregate` and `ForecastMeta` interfaces (Chunk's aggregation module also needs these).
- `src/app/api/wait-times/route.ts` — Added `blendForecasts()` helper that batch-reads aggregate docs for attractions missing live forecasts (uses `adminDb.getAll()` for efficiency). `formatWaitTimeEntry` now accepts and includes `forecastMeta` field. `forecast` field remains backward-compatible (entries array or null). Historical entries replace null forecasts when available.
- `firestore.rules` — Added `forecastAggregates/{parkId}/{document=**}` rule: public read, server-only write.
- Graceful degradation: aggregate read failures fall back to `source: 'none'` with console error. No user-facing errors.
- TypeScript compiles clean. Next.js build passes.

### Crowd Calendar Historical Fix

Fixed crowd calendar showing empty data for non-today dates. Root cause: `computeFamilyCrowdDays` only read live forecast data from `waitTimes/{parkId}/current` docs which only contain TODAY's hourly forecast. Fix: rewrote function to read historical aggregate data from `forecastAggregates/{parkId}/byDayOfWeek/{dow}/attractions/` for all days in the month. Live data still wins for today. Aggregates require totalSamples ≥ 15 and hourly sampleCount ≥ 3 (matching blender thresholds). Updated `hasRealData` check: if ≥50% of days have data, treat as real (not placeholder). Falls back to `generatePlaceholderData` on cold start. Build passes clean.

## Scribe Batch Update (2026-04-29 21:55:00Z)

**Orchestration:** Blended Forecast System Completion

Successfully shipped forecast blending + crowd calendar historical fix. 11 decisions merged into main decisions.md. All three agents (Chunk, Data, Mouth) delivered core components in parallel.

**Your Contributions to This Batch:**
- Blending logic: `resolveForecast()` returns live > historical > none with confidence thresholds
- API response includes `forecastMeta` with source, confidence, dataRange for all attractions
- Firestore security rules: `forecastAggregates` public read, server-only write
- Crowd calendar fixed to source from historical aggregates for all days in month
- No breaking changes — `forecast` field unchanged; metadata in sibling field

**Decisions Processed (18–26):**
- Blended Forecast Architecture
- Crowd Calendar Aggregate Sourcing
- Park Family Calendar UX redesign
- 4-Tier Crowd Algorithm
- Park Family Calendar Design Decisions
- FamilySelector Combobox Implementation
- Dual Temperature Format (°F/°C)
- Relative Time Freshness Indicator
- Home Page Auth-Aware Pattern

**Status:** Batch orchestration complete. Decisions archived. All components integrated. Ready for Phase 2 refinement.

## Scribe Batch Update (2026-04-29 21:55:00Z)

**Orchestration:** Blended Forecast System Completion

Successfully shipped forecast blending + crowd calendar historical fix. 11 decisions merged into main decisions.md. All three agents (Chunk, Data, Mouth) delivered core components in parallel.

**Your Contributions to This Batch:**
- Blending logic: `resolveForecast()` returns live > historical > none with confidence thresholds
- API response includes `forecastMeta` with source, confidence, dataRange for all attractions
- Firestore security rules: `forecastAggregates` public read, server-only write
- Crowd calendar fixed to source from historical aggregates for all days in month
- No breaking changes — `forecast` field unchanged; metadata in sibling field

**Decisions Processed (18–26):**
- Blended Forecast Architecture
- Crowd Calendar Aggregate Sourcing
- Park Family Calendar UX redesign
- 4-Tier Crowd Algorithm
- Park Family Calendar Design Decisions
- FamilySelector Combobox Implementation
- Dual Temperature Format (°F/°C)
- Relative Time Freshness Indicator
- Home Page Auth-Aware Pattern

**Status:** Batch orchestration complete. Decisions archived. All components integrated. Ready for Phase 2 refinement.

