# Data Strategy — Theme Park Wait Times

> Owner: Chunk (Data Engineer)  
> Created: 2026-04-28  
> Status: Draft — awaiting team review

---

## 1. Theme Park Data APIs

### Primary: ThemeParks.wiki API (Recommended)

| Attribute | Detail |
|-----------|--------|
| **URL** | `https://api.themeparks.wiki/v1/` |
| **Source** | [github.com/ThemeParks/parksapi](https://github.com/ThemeParks/parksapi) |
| **Coverage** | 75+ parks globally (Disney, Universal, Six Flags, Cedar Fair, SeaWorld, Merlin, Busch Gardens) |
| **Data** | Live wait times, ride status (Operating/Down/Closed/Refurbishment), park schedules, entity metadata |
| **Freshness** | Near real-time (park-dependent, typically 1-5 min) |
| **Rate Limit** | 300 requests/minute (headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`) |
| **Cost** | Free |
| **Auth** | None for public endpoints |
| **Terms** | Open-source; attribution appreciated |

**Key Endpoints:**
- `GET /v1/destinations` — all parks/resorts
- `GET /v1/entity/{id}/live` — real-time wait times + ride status
- `GET /v1/entity/{id}/schedule` — operating hours
- `GET /v1/entity/{id}/children` — rides/shows/restaurants within a park

### Secondary: Queue-Times.com API

| Attribute | Detail |
|-----------|--------|
| **URL** | `https://queue-times.com/parks.json` |
| **Coverage** | 80+ parks (Disney, Universal, Six Flags, Cedar Fair, SeaWorld, Merlin) |
| **Data** | Live wait times, ride status, historical data since 2014 (limited access) |
| **Freshness** | ~5 minute refresh cycle |
| **Rate Limit** | No published numeric limit; fair-use expected (poll ≤ every 5 min) |
| **Cost** | Free with mandatory attribution ("Powered by Queue-Times.com" + link) |
| **Historical** | Available on-site (CSV exports for logged-in users); no bulk API endpoint |

**Key Endpoints:**
- `GET /parks.json` — list all parks with IDs
- `GET /parks/{id}/queue_times.json` — current wait times for a park

### Supplementary APIs

| API | Coverage | Notes |
|-----|----------|-------|
| **park.fan** | Global | ML-predicted wait times + weather; REST API |
| **Wartezeiten.APP** | Global (EU-focused) | Free; requires visible attribution link |

### API Selection Strategy

```
Primary source:     ThemeParks.wiki  (best coverage, structured data, generous rate limit)
Cross-reference:    Queue-Times.com  (validate data, fill gaps, historical baseline)
Fallback/enrich:    park.fan          (predictions, weather correlation)
```

---

## 2. Ride Database

### Schema Design

```typescript
interface Ride {
  id: string;                    // ThemeParks.wiki entity ID
  parkId: string;                // Parent park entity ID
  name: string;
  type: 'roller_coaster' | 'dark_ride' | 'water_ride' | 'flat_ride' | 'show' | 'character_meet' | 'other';
  thrillLevel: 1 | 2 | 3 | 4 | 5;  // 1=gentle, 5=extreme
  heightRequirement?: number;     // inches (null if none)
  area: string;                   // Park land/area (e.g., "Adventureland")
  location?: GeoPoint;            // lat/lng for map features
  seasonal: boolean;              // true for Halloween/holiday overlays
  seasonalSchedule?: {
    name: string;                 // e.g., "Halloween Horror Nights"
    startDate: string;            // ISO date
    endDate: string;
  }[];
  tags: string[];                 // e.g., ["family", "indoor", "new-2026"]
  imageUrl?: string;
  lastUpdated: Timestamp;
}

interface RideStatus {
  rideId: string;
  status: 'operating' | 'closed' | 'down' | 'refurbishment' | 'seasonal';
  waitMinutes: number | null;     // null when not operating
  lastUpdated: Timestamp;
  source: 'api' | 'crowdsourced' | 'manual';
}
```

### Data Maintenance Strategy

1. **Initial seed**: Pull all entities from ThemeParks.wiki `/children` endpoint for each park
2. **Metadata enrichment**: Manual curation for thrill levels, height requirements, area names (APIs don't provide these consistently)
3. **Automated status sync**: Cloud Function polls live data every 5 minutes
4. **Seasonal tracking**: Manual input for seasonal events (dates announced by parks); flag rides as seasonal with date ranges
5. **Change detection**: Compare entity lists weekly; alert on new/removed rides

---

## 3. Wait Time Data Strategy

### Real-Time Pipeline

```
ThemeParks.wiki API ──→ Cloud Function (every 5 min) ──→ Firestore (live collection)
                                                       ──→ Historical log (append-only)
Queue-Times.com ──→ Cloud Function (every 5 min) ──→ Cross-reference / gap-fill
```

### Freshness Targets

| Metric | Target |
|--------|--------|
| Poll interval | Every 5 minutes |
| Max staleness displayed to user | 10 minutes |
| Stale warning threshold | 15 minutes |
| Data considered "dead" | 30+ minutes (show "unknown") |

### Crowd-Sourced Submissions (Supplement)

Users can submit wait times they observe in-person. This is a **supplement**, not the primary source.

**Validation rules:**
1. **Time-gating**: Only accept submissions during park operating hours
2. **Geo-fencing** (optional): User must be within park boundary (GPS check)
3. **Outlier detection**: Reject if value > 3x current API-reported wait OR > 300 minutes
4. **Cross-reference**: If crowd-sourced value is within ±20% of API data, accept with high confidence
5. **Reputation system**: Track user submission accuracy over time; weight trusted users higher
6. **Consensus**: If 3+ users report similar times within 10 min, override stale API data

**When crowd-sourced data is critical:**
- When API data is stale (park data feed down)
- For rides not covered by APIs
- For seasonal/temporary attractions
- For confirming "soft openings" or unannounced closures

### Data Quality Scoring

Each wait time entry gets a confidence score:
- **High (0.8-1.0)**: Fresh API data < 5 min old
- **Medium (0.5-0.8)**: API data 5-15 min old OR crowd-sourced with consensus
- **Low (0.2-0.5)**: Single crowd-sourced report OR API data 15-30 min old
- **Unknown (0.0)**: No data > 30 min

---

## 4. Crowd Calendar Approach

### Data Sources for Predictions

1. **Historical wait times** — Collected over time from our own polling (ThemeParks.wiki + Queue-Times)
2. **Park operating schedules** — Hours, Extra Magic Hours, special events
3. **School calendars** — Major US districts + international breaks
4. **Holiday calendar** — Federal holidays, spring break windows, Thanksgiving week
5. **Weather data** — Historical and forecast (OpenWeatherMap API)
6. **Special events** — Marathons, food festivals, new ride openings

### Scoring Methodology

**Scale: 1-10** (easier for users to understand than 1-100)

| Level | Meaning | Typical Wait (headliners) |
|-------|---------|--------------------------|
| 1-2 | Ghost town | < 15 min |
| 3-4 | Light crowds | 15-30 min |
| 5-6 | Moderate | 30-60 min |
| 7-8 | Heavy crowds | 60-90 min |
| 9-10 | Avoid if possible | 90+ min |

### Algorithm (Phase 1 — Rule-Based)

Start simple, then evolve to ML:

```
crowd_score = base_score(day_of_week)
            + holiday_modifier(date)
            + school_break_modifier(date)
            + event_modifier(date, park)
            + season_modifier(month)

// Normalize to 1-10 scale
```

**Base scores (day of week):**
- Monday-Thursday: 4
- Friday: 6
- Saturday: 8
- Sunday: 7

**Modifiers (additive, then clamp 1-10):**
- Major holiday (Christmas week, July 4): +3
- Spring break window: +2
- School break (regional): +1
- Special event (Food & Wine, etc.): +1
- Rainy forecast: -2
- January/February (off-season): -2

### Algorithm (Phase 2 — ML-Based)

After collecting 6+ months of historical data:
1. Train gradient boosting model (XGBoost) on features: day_of_week, month, holiday flags, event flags, historical avg wait
2. Target variable: average wait time across top 10 rides (normalized to 1-10)
3. Retrain monthly with new data
4. A/B test predictions vs rule-based; switch when ML consistently outperforms

### Cold-Start Strategy

Before we have our own historical data:
- Use Queue-Times historical data (available since 2014 for some parks)
- Scrape/reference crowd calendar sites for baseline patterns
- Park operating hours as a proxy (longer hours = expected higher crowds)

---

## 5. Scraping Considerations

### What APIs Cover vs. What Might Need Scraping

| Data Need | API Coverage | Scraping Needed? |
|-----------|-------------|-----------------|
| Live wait times | ✅ Full | No |
| Ride status (open/closed) | ✅ Full | No |
| Park hours/schedules | ✅ Full | No |
| Ride metadata (name, type) | ✅ Partial | Minimal (enrich manually) |
| Height requirements | ❌ Not in APIs | Manual data entry preferred |
| Thrill levels | ❌ Not in APIs | Manual curation |
| Seasonal event dates | ❌ Rarely in APIs | Manual + park announcement monitoring |
| Historical wait time bulk data | ⚠️ Limited | Self-collect going forward |

### Recommendation: Avoid Scraping

**Reasons:**
1. **Legal risk** — Parks actively block scrapers; ToS violations
2. **Maintenance burden** — Scrapers break constantly as sites change
3. **Unnecessary** — ThemeParks.wiki + Queue-Times cover 95%+ of our live data needs
4. **Alternative for gaps** — Manual curation + crowd-sourcing fill remaining 5%

**Exception:** If a specific park has zero API coverage and high user demand, consider a targeted, respectful scraper as a last resort with proper caching and rate limiting.

---

## 6. Data Architecture

### Firestore Document Structure

```
/parks/{parkId}
  - name, resort, location, timezone, imageUrl
  - operatingHours: { open, close, specialHours[] }

/parks/{parkId}/rides/{rideId}
  - (Ride interface fields from Section 2)

/parks/{parkId}/liveData/{rideId}
  - status, waitMinutes, lastUpdated, confidence, source

/parks/{parkId}/crowdCalendar/{YYYY-MM}
  - days: { "1": { score: 7, predicted: true }, "2": { score: 4, predicted: true }, ... }

/waitTimeHistory/{parkId}/{rideId}/{date}
  - entries: [ { time: Timestamp, wait: number, source: string } ]

/userSubmissions/{submissionId}
  - userId, parkId, rideId, reportedWait, timestamp, status (pending/verified/rejected)
```

### Caching Strategy

| Layer | What | TTL | Reasoning |
|-------|------|-----|-----------|
| **CDN/Edge** | Park metadata, ride list | 24 hours | Rarely changes |
| **Server (Firestore)** | Live wait times | 5 minutes | Matches poll interval |
| **Client (local)** | Last-viewed wait times | 2 minutes | Quick refresh on pull-to-refresh |
| **Client (local)** | Crowd calendar | 12 hours | Predictions don't change often |
| **Server** | Historical aggregates | 1 hour | Computed periodically |

### Firebase Cloud Functions

```
scheduledPollWaitTimes (every 5 min)
  → Fetch from ThemeParks.wiki for each active park
  → Write to /parks/{id}/liveData/
  → Append to /waitTimeHistory/
  → Cross-reference with Queue-Times (every 15 min)

scheduledCrowdCalendarUpdate (daily at 2 AM)
  → Recalculate crowd scores for next 90 days
  → Write to /parks/{id}/crowdCalendar/

onUserSubmission (triggered on write)
  → Validate submission (time, geo, outlier check)
  → If valid, merge with live data (weighted average)

scheduledRideSync (weekly)
  → Compare API entity list to our ride database
  → Flag new/removed rides for review
```

### Cost Optimization

- **ThemeParks.wiki**: 300 req/min limit → polling 10 parks × 1 req per 5 min = 2,880 req/day (well within limits)
- **Firestore reads**: Live data reads are the hot path; structure for single-document reads per park (denormalize)
- **Cloud Functions**: ~288 invocations/day for polling (minimal cost on free tier)

---

## 7. Recommended Starting Parks

### Tier 1: Launch Parks (Best API coverage + highest demand)

| # | Park | Resort | Why |
|---|------|--------|-----|
| 1 | **Magic Kingdom** | Walt Disney World | Most visited park in the world; excellent API coverage |
| 2 | **EPCOT** | Walt Disney World | Same resort; seasonal events (Food & Wine, Flower & Garden) |
| 3 | **Hollywood Studios** | Walt Disney World | Galaxy's Edge, Toy Story Land — high-demand attractions |
| 4 | **Animal Kingdom** | Walt Disney World | Completes WDW set |
| 5 | **Universal Studios Florida** | Universal Orlando | Major competitor; different data patterns |
| 6 | **Islands of Adventure** | Universal Orlando | Completes Universal Orlando set |

### Why This Set?

1. **API Coverage**: All 6 parks fully covered by ThemeParks.wiki AND Queue-Times
2. **Geographic cluster**: All in Orlando — easy for one user/team to validate data in person
3. **Diverse ride types**: Coasters, dark rides, shows, water rides, character meets
4. **Seasonal variety**: Halloween Horror Nights, Mickey's Not-So-Scary, Food & Wine, Mardi Gras
5. **High user demand**: Orlando is the #1 theme park destination globally
6. **Cross-reference**: Two different operators (Disney + Universal) validates our multi-source approach

### Tier 2: Expansion (Month 2-3)

| Park | Notes |
|------|-------|
| Disneyland Park (CA) | West coast users; different crowd patterns |
| Disney California Adventure | Completes Disneyland Resort |
| Universal Studios Hollywood | Smaller park; good for testing compact layouts |
| Cedar Point | Roller coaster capital; different audience |

### Tier 3: Scale (Month 4+)

- Six Flags parks (many locations, similar ride sets)
- Busch Gardens Tampa/Williamsburg
- SeaWorld parks
- International: Disneyland Paris, Tokyo Disney

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Set up ThemeParks.wiki API integration
- [ ] Seed ride database for 6 launch parks
- [ ] Build polling Cloud Function (5-min interval)
- [ ] Design Firestore schema and write first data

### Phase 2: Live Data (Week 3-4)
- [ ] Cross-reference with Queue-Times API
- [ ] Implement staleness detection and confidence scoring
- [ ] Build crowd-sourced submission flow
- [ ] Basic outlier detection for user submissions

### Phase 3: Crowd Calendar (Week 5-8)
- [ ] Implement rule-based crowd scoring algorithm
- [ ] Integrate school/holiday calendar data
- [ ] Begin collecting historical data for future ML model
- [ ] Display 90-day forward predictions

### Phase 4: Intelligence (Month 3+)
- [ ] Train ML model on collected historical data
- [ ] Add weather correlation
- [ ] Implement ride-specific wait predictions
- [ ] Expand to Tier 2 parks

---

## 9. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| ThemeParks.wiki goes down | Low | High | Queue-Times as fallback; local cache survives 30 min |
| API rate limit hit | Low | Medium | Efficient polling; 2,880/day vs 432,000/day limit |
| Inaccurate crowd-sourced data | Medium | Medium | Validation rules + reputation system |
| Park changes ride IDs | Low | Low | Weekly sync detects changes; manual review |
| API ToS changes | Low | High | Multi-source strategy; self-hosted parksapi as backup |

---

## Appendix: API Quick Reference

### ThemeParks.wiki — Get Live Wait Times
```bash
# List all destinations
curl https://api.themeparks.wiki/v1/destinations

# Get live data for Magic Kingdom
curl https://api.themeparks.wiki/v1/entity/{magicKingdomId}/live

# Get park schedule
curl https://api.themeparks.wiki/v1/entity/{parkId}/schedule
```

### Queue-Times — Get Wait Times
```bash
# List all parks
curl https://queue-times.com/parks.json

# Get wait times for a park (e.g., ID 6 = Magic Kingdom)
curl https://queue-times.com/parks/6/queue_times.json
```
