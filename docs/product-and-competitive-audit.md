# Product & Competitive Audit — ParkPulse

> **Owner:** Chunk (Data Engineer)  
> **Date:** 2026-08-11  
> **Status:** Active — maintain as source health changes

---

## 1. Current Data Source Inventory

### Primary: ThemeParks.wiki API (`api.themeparks.wiki/v1`)

| Attribute | Value |
|-----------|-------|
| Auth | None (public) |
| Rate Limit | 300 req/min |
| Coverage | 75+ parks globally |
| Refresh | Park-dependent, typically 1–5 min |
| Used in | `scripts/fetch-wait-times.ts`, `scripts/sync-all-parks.ts`, `src/app/api/wait-times/route.ts`, `src/app/api/park-schedule/route.ts` |
| Health (2026-08-11) | ✅ **200 OK** — Magic Kingdom returned 71 entities, 26 with active STANDBY wait times |

**Endpoints consumed:**
- `GET /v1/destinations` — park discovery + seeding
- `GET /v1/entity/{id}/live` — real-time wait times, forecast, operating hours, virtual queues
- `GET /v1/entity/{id}/children` — attraction list per park
- `GET /v1/entity/{id}/schedule` — park operating hours

**Data shape per attraction:**
- `queue.STANDBY.waitTime` (int | null)
- `queue.RETURN_TIME` / `PAID_RETURN_TIME` / `BOARDING_GROUP`
- `forecast[]` (hourly wait prediction, ~60-70% of attractions)
- `operatingHours[]`
- `status` (OPERATING / CLOSED / DOWN / REFURBISHMENT)

### Secondary: Queue-Times.com API (`queue-times.com`)

| Attribute | Value |
|-----------|-------|
| Auth | None (attribution required) |
| Coverage | 130+ parks |
| Refresh | ~5 min |
| Used in | **Documented in DATA-STRATEGY.md but NOT implemented in code** |
| Health (2026-08-11) | ✅ **200 OK** — 17 park groups returned |

**Gap:** Queue-Times is planned as a cross-reference/fallback but zero integration code exists. This is the biggest reliability gap — a single-source dependency on ThemeParks.wiki.

### Identifier Mapping

| System | ID format | Mapping |
|--------|-----------|---------|
| ThemeParks.wiki | UUID (`75ea578a-...`) | Used as document IDs throughout Firestore |
| Queue-Times | Numeric int (`6` = Magic Kingdom) | No mapping table exists in repo |
| Park Registry (local) | UUID + slug (`magic-kingdom`) | `src/lib/parks/park-registry.ts` — hardcoded 26KB file |

**Bug found:** The `park-registry.ts` slug for "Disney's Hollywood Studios" is `hollywood-studios` but some UI/route references may expect `disneys-hollywood-studios`. The `slugify()` function strips possessives so this is intentionally short — not a bug.

### Refresh Cadence & Failure Modes

| Layer | Cadence | Failure behavior |
|-------|---------|-----------------|
| API route `/api/wait-times` | On-demand (client poll) | In-memory stale cache → returns last-good data with `stale: true` flag |
| `scripts/fetch-wait-times.ts` | Manual/cron (not automated) | Hard fail; no fallback |
| Historical archival | Appended on each `/api/wait-times` call | Fire-and-forget; silent failure |
| Forecast aggregation | Piggybacks on wait-time fetch | Silent failure; blender falls back to `source: 'none'` |
| Park schedule | 1-hour Firestore cache TTL | Refetches from API on cache miss |

**Critical failure mode:** If ThemeParks.wiki returns 429/5xx AND no prior in-memory cache exists (cold start / serverless restart), the API returns 500 to the client. There is no persistent cache layer (Redis/Firestore fallback read) for cold starts.

---

## 2. Competitive Landscape (August 2026)

### TouringPlans / Lines App

| Dimension | Detail |
|-----------|--------|
| Coverage | Disney World, Disneyland, Universal Orlando |
| Crowd calendar | 365-day rolling (paid), 10-day free |
| Wait predictions | Proprietary ML model; claims more accurate than Disney's posted times |
| Planning | Step-by-step touring plans with optimization engine |
| Lightning Lane | Recommendations on when/where to use |
| History | Decades of crowd-sourced + official data since 2012 |
| Pricing | Subscription ($15-20/year) |
| Differentiator | **Optimization engine** — no competitor matches their day-planning algorithm |
| Weakness | Disney/Universal only; no Six Flags, Cedar Fair, etc. |

### Thrill Data (`thrill-data.com`)

| Dimension | Detail |
|-----------|--------|
| Coverage | 130+ parks (Disney, Universal, Six Flags, Cedar Fair, SeaWorld) |
| Crowd calendar | Based on actual posted wait time history (not estimates) |
| Wait predictions | Hourly predictions from historical patterns |
| Lightning Lane | Tracks availability and sellout times |
| Alerts | Paid feature — notify when wait drops below threshold |
| History | Historical data with public accuracy metrics |
| Pricing | Free tier + paid alerts/data export |
| Differentiator | **Transparency** — publishes prediction accuracy; Lightning Lane sellout tracking |
| Weakness | No touring plan optimizer; data-heavy UX can overwhelm casual users |

### Queue-Times.com

| Dimension | Detail |
|-----------|--------|
| Coverage | 130+ parks |
| Crowd calendar | Basic (quietest/busiest ratings) |
| Wait predictions | Limited — historical averages |
| History | Data since 2014; CSV exports for registered users |
| API | Free with attribution; simple REST |
| Differentiator | **Longest historical dataset** publicly accessible; developer-friendly API |
| Weakness | Minimal UI/UX; no optimization; 5-min lag |

### Official Park Apps (My Disney Experience, Universal Orlando)

| Dimension | Detail |
|-----------|--------|
| Wait times | Real-time (best freshness) |
| Lightning Lane | Full booking + management |
| Planning | Itinerary builder, dining reservations, mobile ordering |
| Differentiator | **Authoritative source of truth**; park-exclusive features |
| Weakness | Single-park; no cross-park comparison; no crowd predictions; no historical insight; biased (official times often inflated) |

### Park Queue Times (`parkqueuetimes.com`)

| Dimension | Detail |
|-----------|--------|
| Coverage | 80+ parks |
| Crowd calendar | Yes |
| Wait times | Live |
| Pricing | Free |
| Differentiator | Clean UI; focused on crowd calendar visualization |

---

## 3. Product Thesis & Positioning

### Thesis

> **ParkPulse is a free, transparent, multi-park planning tool that helps theme park visitors minimize wait time and maximize ride count — across any park, not just Disney.**

### Primary Personas

| Persona | Job-to-be-done |
|---------|---------------|
| **Trip Planner** (2-4 weeks out) | Pick which days/parks to visit; avoid peak crowds |
| **In-Park Optimizer** (day-of) | Decide what to ride next based on current + predicted waits |
| **Enthusiast/Data Nerd** | Explore historical trends, compare parks, track personal ride counts |

### Where ParkPulse Can Win

The competitive map reveals a clear gap:

1. **TouringPlans** owns Disney/Universal optimization but ignores regional parks
2. **Thrill Data** covers broadly but lacks an optimizer or trip log
3. **Queue-Times** is developer-focused, not consumer-ready
4. **Official apps** are single-park and biased

**ParkPulse opportunity:** Broad park coverage (via ThemeParks.wiki) + crowd calendar + trip logging + transparent forecast — a "Thrill Data for normal people" with TouringPlans-style planning, covering 75+ parks instead of just Disney.

---

## 4. Current Feature Inventory

| Feature | Status | Quality |
|---------|--------|---------|
| Live wait times (single park) | ✅ Implemented | Good — stale-cache resilience |
| Park schedule / hours | ✅ Implemented | Good — 1hr cache |
| Crowd calendar (rule-based) | ✅ Implemented | Fair — `deriveCrowdLevel` uses simple thresholds |
| Historical archival | ✅ Implemented | Fragile — append-only, no cleanup/compaction |
| Forecast blending (live + historical) | ✅ Implemented | Good — Welford variance tracking |
| Best Plan optimizer | ✅ Implemented | Basic — greedy assignment, not combinatorial |
| Virtual queue / Lightning Lane display | ✅ Implemented | Good — full RETURN_TIME/PAID/BOARDING data |
| Trip logging | ✅ Implemented | Unknown (UI-owned) |
| Queue-Times cross-reference | ❌ Not implemented | **Gap** |
| Multi-source failover | ❌ Not implemented | **Gap** — cold-start vulnerability |
| Ride type/thrill enrichment | Partial | `scripts/attraction-overrides.ts` exists |
| Alerts (wait drop notifications) | ❌ Not implemented | Opportunity |
| Accuracy transparency | ❌ Not implemented | Opportunity |

---

## 5. Source Health Assessment

| Source | Status | Risk | Action needed |
|--------|--------|------|---------------|
| ThemeParks.wiki `/live` | ✅ Healthy | Medium — single dependency | Add Queue-Times fallback |
| ThemeParks.wiki `/schedule` | ✅ Healthy | Low | None |
| ThemeParks.wiki `/destinations` | ✅ Healthy | Low | None |
| Queue-Times `/parks.json` | ✅ Healthy (not integrated) | N/A | Implement integration |
| Firestore historical data | Unknown | Medium — no automated polling | Need cron/Cloud Function |
| Forecast aggregates | Unknown | Low — graceful degradation | Self-heals over time |

**Key risk:** Wait-time polling is **not automated**. The `scripts/fetch-wait-times.ts` requires manual invocation. The API route fetches live on every request but historical aggregation only works if data is collected continuously. Without a cron job or Cloud Scheduler, the forecast blender will never have enough samples (needs ≥15) to produce historical fallbacks.

---

## 6. Prioritized Opportunity Matrix

### Tier 1: Reliability (P0 — do first)

| # | Improvement | Complexity | Impact |
|---|-------------|-----------|--------|
| 1 | **Add Queue-Times as fallback source** — implement cross-reference in wait-times route; use when ThemeParks.wiki returns 429/5xx and no cache exists | Medium | Eliminates cold-start 500s |
| 2 | **Persistent cache layer** — on successful fetch, write a "last-known-good" doc to Firestore; read on cold start before hitting upstream API | Low | Eliminates cold-start failures |
| 3 | **Automated polling** — Cloud Scheduler / Vercel Cron hitting `/api/wait-times?parkId=X` every 5 min for Tier 1 parks | Low | Enables forecast aggregation to actually work |
| 4 | **ID mapping table** — create `src/lib/parks/queue-times-map.ts` mapping ThemeParks.wiki UUIDs → Queue-Times numeric IDs | Low | Prerequisite for #1 |

### Tier 2: High-Value Low-Complexity (P1)

| # | Improvement | Complexity | Impact |
|---|-------------|-----------|--------|
| 5 | **Forecast accuracy tracking** — compare yesterday's prediction to actual wait; publish accuracy % | Medium | Trust differentiator vs competitors |
| 6 | **Data freshness indicator in UI** — expose `stale` flag + `fetchedAt` age to frontend; show ⚠️ when >10min old | Low | User trust |
| 7 | **Park-hours-aware crowd calendar** — factor operating hours into crowd score (longer hours = expects more guests) | Low | Better predictions |
| 8 | **Vercel cron config** — add `vercel.json` cron entries for top 6 parks | Low | Enables #3 cheaply |

### Tier 3: Strategic Bets (P2)

| # | Improvement | Complexity | Impact |
|---|-------------|-----------|--------|
| 9 | **Wait-drop alerts** — notify users when a ride's wait drops below their threshold (via push/email) | High | Killer feature for in-park use |
| 10 | **ML crowd model** — replace rule-based thresholds with trained model once ≥6 months of data collected | High | Prediction quality leap |
| 11 | **Lightning Lane sellout predictor** — track PAID_RETURN_TIME availability over time; predict sellout windows | Medium | Unique vs most competitors |
| 12 | **Cross-park day splitter** — "morning at park A, evening at park B" optimization in Best Plan | Medium | TouringPlans-level planning |

---

## 7. Data-Only Bug Found

**Issue:** In `src/app/api/wait-times/route.ts` line ~195, when resolving a park by slug, if the UUID check fails and `getParkBySlug` returns a match, the code uses `entityId` for the API call but returns results keyed by the original `parkId` (which is the slug string). This means the response key is inconsistent — sometimes a UUID, sometimes a slug — depending on what the client passes. This isn't a crash bug but causes confusing client-side caching.

**Recommendation:** Always key the response by UUID (`entityId`) regardless of input format. This is in the API route (owned by Data), so flagging for follow-up rather than fixing here.

---

## 8. Recommended Next Implementation Batch

**Batch 1 (Chunk owns, ~2 days):**
1. Create `src/lib/parks/queue-times-map.ts` — UUID↔numeric ID mapping for top 20 parks
2. Implement `fetchFromQueueTimes(parkNumericId)` helper with attribution header
3. Add persistent "last-known-good" Firestore cache write in wait-times route (coordinate with Data)

**Batch 2 (Data + Chunk, ~1 day):**
4. Add Vercel cron config for automated 5-min polling of Tier 1 parks
5. Wire Queue-Times as fallback in the wait-times route fetch chain

**Batch 3 (Chunk, ~1 day):**
6. Forecast accuracy tracker — compare prior-day predictions to actuals, write accuracy doc

---

## Appendix: Verified Endpoints (2026-08-11)

```
✅ GET https://api.themeparks.wiki/v1/destinations          → 200 (all parks)
✅ GET https://api.themeparks.wiki/v1/entity/{MK_ID}/live   → 200 (71 entities, 26 with waits)
✅ GET https://queue-times.com/parks.json                   → 200 (17 groups)
```

---

*Last verified: 2026-08-11T14:36 PT*
