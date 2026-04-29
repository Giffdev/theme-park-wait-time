# Skill: Firestore API Caching

## Pattern
Cache external API responses in Firestore with TTL-based freshness and graceful degradation on upstream failures.

## When to Use
- Fetching data from external APIs (ThemeParks Wiki, etc.) that should be cached server-side
- Data that updates periodically but doesn't need real-time freshness
- Endpoints that must remain available even when upstream APIs are down

## Implementation

### Structure
```
collection/{entityId}/subcollection/{cacheKey}
```
- Cache key is typically a date or entity ID
- Document contains the transformed response + `fetchedAt` ISO timestamp

### Flow
1. Check Firestore for cached doc
2. If exists and fresh (within TTL): return cached
3. If stale or missing: fetch from upstream API
4. On success: write to Firestore, return fresh data
5. On retryable failure (429, 5xx): return stale cache with `stale: true` flag
6. On retryable failure with no cache: return 503 with friendly message
7. On non-retryable failure (400, 404): throw normally

### Key Decisions
- **TTL as code constant** (not Firestore TTL policy) — allows returning stale data on failure
- **Admin SDK bypasses security rules** — rules set `allow write: if false` for public collections
- **`stale` flag in response** — lets frontend show "data may be outdated" indicator
- **No Firestore TTL auto-delete** — stale data has value as fallback

## File Reference
- `src/app/api/park-schedule/route.ts` — canonical implementation
- `src/app/api/wait-times/route.ts` — simpler version (no staleness handling)

## Anti-patterns
- Don't use `next: { revalidate: N }` as the sole caching layer — it doesn't survive cold starts or provide stale fallback
- Don't delete stale cache docs — they serve as fallback during outages
