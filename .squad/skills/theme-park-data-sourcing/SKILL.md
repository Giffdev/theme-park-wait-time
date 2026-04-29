# Skill: Theme Park Data Sourcing

## When to Use
When adding a new theme park to the platform or debugging data issues with an existing park.

## Steps

### Adding a New Park
1. Check ThemeParks.wiki coverage: `curl https://api.themeparks.wiki/v1/destinations` — search for park name
2. Get entity ID from destinations response
3. Verify live data works: `curl https://api.themeparks.wiki/v1/entity/{id}/live`
4. Cross-check Queue-Times: `curl https://queue-times.com/parks.json` — find matching park ID
5. Seed ride database from `/v1/entity/{id}/children`
6. Manually enrich: thrill levels, height requirements, area names, seasonal flags
7. Add park ID to polling Cloud Function configuration
8. Verify data flowing within 10 minutes

### Debugging Stale Data
1. Check ThemeParks.wiki directly — is the source returning fresh data?
2. Check Cloud Function logs for errors/timeouts
3. Verify Firestore `lastUpdated` timestamps
4. Fall back to Queue-Times if primary is down
5. Check for HTTP 429 (rate limited) — back off and retry

### API Rate Budget
- ThemeParks.wiki: 300 req/min = 18,000 req/hour
- Our usage per park: 12 req/hour (every 5 min)
- Safe capacity: ~1,500 parks before rate limit concern
- Queue-Times: fair-use only, keep to ≤12 req/hour per park

## Key URLs
- ThemeParks.wiki docs: https://themeparks.wiki/api/http
- Queue-Times API: https://queue-times.com/pages/api
- ThemeParks GitHub: https://github.com/ThemeParks/parksapi
