# Follow-up: review-only duplicate park slugs

**Status:** open — deliberately *not* auto-remediated.
**Tooling:** `scripts/reconcile-parks.ts` (dry run is read-only; deletes require `--apply --yes`).
**Evidence:** read-only dry run against production Firestore `parks`.

## Why this file exists

The `parks` collection is queried by slug with an unordered
`where('slug', '==', ...)`. When two documents share a slug, Firestore picks
one non-deterministically, so the wrong park can win. `scripts/reconcile-parks.ts`
finds these, but it only proposes a **delete** for the narrow, provable case:

> a registry-unknown document, inside a seeded destination, that shadows the
> slug of a park the registry *does* have a canonical document for.

That is exactly one document today (`oceans-of-fun`, retired virtual id
`951987f7-3387-4221-8368-2859469aebcd`). Everything else lands in the
**review** bucket and is never deleted by tooling.

The three pairs below are review-only because **neither document in the pair is
canonical** — the park registry has no entry claiming the slug, so the tool
cannot tell which id is the real one and which is the stale one. Deleting
either side would be a guess against production data.

## The three pairs

| Slug | Document ids | Why review-only |
| --- | --- | --- |
| `disneyland-park` | `7340550b-c14d-4def-80bb-acdb51d49a66`<br>`dae968d5-630d-4719-8b06-3d107e944401` | Two different real parks legitimately share this name (Disneyland Resort, California vs. Disneyland Paris). Likely a **slug-collision bug**, not a duplicate — both documents probably need to stay, with one re-slugged. |
| `hurricane-harbor-arlington` | `08e5d95c-7c73-4c65-b17a-06fede1801fb`<br>`a96eb7c6-1fd3-4363-84d9-c84e23f886f1` | Upstream lists the water park under more than one entity id. No registry entry, so neither id is provably canonical. |
| `hurricane-harbor-oklahoma-city` | `3964ae15-a1a8-41a1-aea9-23b456e2911f`<br>`aa8c2744-b792-4802-8a70-8bba51bc73da` | Same shape as Arlington. |

## Proposed follow-up (separate, reviewed change)

1. **`disneyland-park` first — it is a correctness bug, not cleanup.** Decide the
   slug policy for same-name parks in different resorts (e.g. qualify with the
   destination: `disneyland-park-paris`). This is a user-visible URL decision and
   needs a product call, not a delete.
2. **Hurricane Harbor pairs:** confirm against the upstream catalog which entity
   id is currently served, add the winner to the park registry, and only then
   re-run `scripts/reconcile-parks.ts`. Once a canonical document exists, the
   stale twin moves from *review* into the *retire* plan automatically and is
   covered by the existing safety rules and tests.
3. Do **not** widen the reconcile tool's delete rule to cover "any duplicate
   slug". The narrow rule is what makes it safe to run against production.

## Constraints carried forward

- Deletes are shallow: removing a `parks/{id}` document leaves all park-id-keyed
  data in place (`attractions`, `waitTimes`, `waitTimeHistory`,
  `forecastAggregates`, `parkSchedules`, `crowdsourcedWaitTimes`, and the
  `parks/{id}/*` subcollections). The tool reports this in both text and
  `--json` output; cleaning it up is a separate, explicitly scoped decision.
- No production mutation has been performed for any item in this document.
