---
last_updated: 2026-04-30T15:07:41.207-07:00
---

# Team Wisdom

Reusable patterns and heuristics learned through work. NOT transcripts — each entry is a distilled, actionable insight.

## Patterns

<!-- Append entries below. Format: **Pattern:** description. **Context:** when it applies. -->

- **Pattern:** When logging data to Firestore during a trip, never rely solely on `trip.parkNames` for the park name — it may be empty for new trips. Always fall back to a static registry lookup (e.g., `getParkById`). **Context:** Any service that writes parkName to a document.

- **Pattern:** Window focus/visibility events should not trigger full loading state re-renders. Use a `background` flag on data fetch functions called by these events. **Context:** Pages with edit/delete buttons or navigation Links that unmount during loading.

- **Pattern:** When displaying grouped data (e.g., rides by park), always provide a fallback for the group label — never display empty strings. Chain: `log.field || parentDocument.field || registryLookup || 'Unknown'`. **Context:** Timeline views, grouped lists.
