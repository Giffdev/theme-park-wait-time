# Follow-up: review-only duplicate park slugs

**Status:** open — deliberately *not* auto-remediated.
**Tooling:** `scripts/reconcile-parks.ts` for the fast, permanently read-only
park check, and
`npm run reconcile:park-catalog -- --json` for the full live park/attraction
what-if manifest. Both are dry-run/read-only by default.
**Evidence:** read-only dry run against production Firestore `parks`.

## Why this file exists

The `parks` collection is queried by slug with an unordered
`where('slug', '==', ...)`. When two documents share a slug, Firestore picks
one non-deterministically, so the wrong park can win. `scripts/reconcile-parks.ts`
finds these, but it only proposes a retire candidate for the narrow,
provable case:

> a registry-unknown document, inside a seeded destination, that shadows the
> slug of a park the registry *does* have a canonical document for.

The full comparison now proves three non-canonical documents:

- `oceans-of-fun`: `951987f7-3387-4221-8368-2859469aebcd` → current
  `b5a89552-3381-47ad-88cc-ab0087019c8b`
- `hurricane-harbor-oklahoma-city`:
  `aa8c2744-b792-4802-8a70-8bba51bc73da` → current
  `3964ae15-a1a8-41a1-aea9-23b456e2911f`
- `hurricane-harbor-arlington`:
  `08e5d95c-7c73-4c65-b17a-06fede1801fb` → canonical
  `a96eb7c6-1fd3-4363-84d9-c84e23f886f1`. Both ids remain in the raw
  upstream catalog, but the former is a live-feed alias for one physical park,
  not a second user-facing park.

All three are pinned in `RETIRED_PARK_REPLACEMENTS` and filtered from public
read paths immediately. Neither the park-only tool nor the full catalog
reconciler can delete them. The full reconciler keeps a stable target-catalog
id for resumable upserts, while each upsert phase needs its current
`--phase-digest` covering exact actions, Firestore preconditions, write
payloads, and persisted timestamps. Retire candidates and complete reference
audits remain review-only evidence.

## 2026-08-14 read-only database audit

- Firestore: 136 park documents and 8,109 attraction documents.
- Current upstream: 197 raw park rows. Two Firestore documents are absent
  upstream; one additional document is a recognized live-feed alias.
- Four Firestore slug collisions: three non-canonical duplicates above, plus
  the legitimate two-park `disneyland-park` collision below.
- Across the 134 Firestore parks still present upstream, 8,607 upstream child
  entities were audited with zero API failures: 406 local records are absent
  upstream, 904 upstream records are missing locally, 28 records point at the
  retired Oklahoma City id, 135 names drift, and one entity type drifts. This
  is a database-drift inventory, not the canonical product universe; automatic
  attraction actions remain limited to the 96-park application registry.
  Missing canonical park documents are explicit create actions in the first
  bounded `parks` phase; deterministic attraction shards follow only after
  that phase converges. Unsupported parks remain review-only.
- The retired Oceans of Fun id has no attraction, wait-time, history,
  forecast, schedule, crowd-report, or park-subcollection records.
- The retired Oklahoma City id has 28 attraction records (all 28 UUIDs still
  exist under the current park id) and no wait-time, history, forecast,
  schedule, crowd-report, or park-subcollection records. Its current entity
  has two additional children missing locally.

No production document was changed by this audit.

The remaining pair below is review-only because both documents are real parks.
Deleting either side would be a guess against production data.

## The remaining review-only collision

| Slug | Document ids | Why review-only |
| --- | --- | --- |
| `disneyland-park` | `7340550b-c14d-4def-80bb-acdb51d49a66`<br>`dae968d5-630d-4719-8b06-3d107e944401` | Two different real parks legitimately share this name (Disneyland Resort, California vs. Disneyland Paris). Likely a **slug-collision bug**, not a duplicate — both documents probably need to stay, with one re-slugged. |

## Proposed follow-up (separate, reviewed change)

1. **`disneyland-park` first — it is a correctness bug, not cleanup.** Decide the
   slug policy for same-name parks in different resorts (e.g. qualify with the
   destination: `disneyland-park-paris`). This is a user-visible URL decision and
   needs a product call, not a delete.
2. Do **not** add a reconcile-tool delete rule for "any duplicate slug".
   Retirement remains review-only; public filtering and upserts are sufficient.

## Constraints carried forward

- Firestore deletes are shallow, so a future explicit tombstone/rules migration
  must account for `attractions`, `waitTimes`, `waitTimeHistory`,
  `forecastAggregates`, `parkSchedules`, `crowdsourcedWaitTimes`, and the
  `parks/{id}/*` subcollections. The current tools report this evidence but
  expose no delete path.
- User ride logs, dining logs (`parkId` and `restaurantId` child identity),
  active timers, trips, trip days, crowd/wait reports, and child references
  remain part of the review inventory. Any failed or unqueryable reference
  scope is treated as unresolved evidence.
  The family-keyed `crowdCalendar/*/monthly/*` tree is recursively enumerated
  for embedded park UUIDs, including nested documents below missing parents.
- No production mutation has been performed for any item in this document.
