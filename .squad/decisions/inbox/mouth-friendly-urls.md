# Decision: Friendly URL Slugs for Parks and Attractions

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Implemented

## Context

Park and attraction pages previously used ThemeParks Wiki UUIDs in URLs (e.g., `/parks/75ea578a-adc8-4116-a54d-dccb60765ef9`). This is bad for UX, SEO, and shareability.

## Decision

All park and attraction URLs now use the `slug` field already present in Firestore documents. URLs are now human-readable: `/parks/magic-kingdom`, `/parks/magic-kingdom/attractions/seven-dwarfs-mine-train`.

## Implementation Details

- Park detail page queries `parks` collection with `where('slug', '==', slug)` to resolve the park, then uses the park's UUID for subsequent queries (attractions, wait times, schedule API).
- Attraction detail page similarly resolves both park slug and attraction slug to UUIDs for data operations.
- `ActiveTimer` interface gained an optional `parkSlug` field for navigation links in QueueTimerBanner (backward-compatible with existing timer documents that lack this field).
- Next.js route folder structure unchanged (`[parkId]`/`[attractionId]` params) — values are slugs now.

## Impact

- All links throughout the app now produce friendly URLs
- Firestore queries use slug field (ensure index exists on `parks.slug` and `attractions.slug`)
- Old UUID-based URLs will 404 unless a redirect is set up (not implemented — would need middleware)
- Timer documents created going forward will include `parkSlug`; old ones fall back to slugified `parkName`
