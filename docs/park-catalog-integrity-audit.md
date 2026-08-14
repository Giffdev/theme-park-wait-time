# Park Catalog Integrity Audit

**Original audit:** Chunk
**Independent escalated revision owner:** Keaton
**Current non-destructive migration/security revision:** Rosalita
**Date:** 2026-08-14
**Sources:** canonical registry plus live, read-only ThemeParks.wiki
`/destinations`, `/entity/{id}`, `/children`, and `/live` responses.

## Deterministic identity rules

1. A park's canonical identity is its current ThemeParks.wiki UUID.
2. Its application slug is stable and globally unique; upstream names may
   change without changing routes.
3. Family and destination membership come only from
   `DESTINATION_FAMILIES`.
4. A legacy upstream UUID may be a live-feed alias, but never a second park
   card or Firestore park document.
5. Attraction UUID is authoritative. Equal names with different UUIDs are
   review signals, not automatic duplicates.

## Results

- Authoritative reconciled product model: **9 families / 64 destinations /
  96 parks / 6,790 canonical child entities**.
- Firestore inventory counts are operational database counts and must never
  be substituted for those product-model counts.
- Registry before audit: 64 destinations / 79 parks.
- Upstream rows inside those destinations: 97.
- Registry after conclusive additions: 64 destinations / 96 canonical parks,
  plus one recognized upstream duplicate alias.
- All 64 destinations and 96 canonical park UUIDs resolve upstream.
- No malformed or duplicate family ids, destination ids/slugs, or park
  ids/slugs.
- No canonical park is missing, retired, or assigned to the wrong
  destination.
- 6,790 current child entities audited: no malformed UUIDs, duplicate UUIDs
  within a park, or UUIDs owned by multiple parks.
- 76 same-normalized-name groups remain UUID-distinct upstream records
  (commonly shows, meet-and-greets, and restaurants); none were guessed away.
- 28 live entries are emitted under the wrong sibling feed: 10 Knott's Soak
  City entries under Knott's Berry Farm, one Oceans of Fun entry under Worlds
  of Fun, and 17 Rulantica/Traumatica entries under Europa-Park. Those three
  feeds are filtered by canonical `/children` membership at runtime. The audit
  keeps these registry-handled assignments visible and informational; any
  cross-feed assignment without that explicit registry control remains
  blocking and produces a non-zero exit.

## Added canonical parks

Discovery Cove Orlando; Hurricane Harbor St. Louis; Cedar Point Shores;
Hurricane Harbor Oklahoma City; Aquatica San Antonio; Hurricane Harbor Los
Angeles; Traumatica; Caribbean Bay; Hurricane Harbor Chicago; Superior Shores
Waterpark; Caribe Aquatic Park; Water Country USA; Adventure Island Tampa;
WildWater Adventure; Knott's Soak City; Hurricane Harbor New Jersey; and
Hurricane Harbor Arlington.

## Duplicate/alias decisions

- Oceans of Fun canonical UUID remains
  `b5a89552-3381-47ad-88cc-ab0087019c8b`; retired virtual UUID
  `951987f7-3387-4221-8368-2859469aebcd` is genuinely absent from the raw
  upstream park catalog, is suppressed on reads, and remains a reconciliation
  candidate.
- Hurricane Harbor Arlington uses
  `a96eb7c6-1fd3-4363-84d9-c84e23f886f1` for identity, children, schedule,
  and timezone. Legacy `08e5d95c-7c73-4c65-b17a-06fede1801fb` remains present
  in raw upstream park rows but is registry-pinned as a live-feed alias only;
  it is not described as upstream-absent.
- Hurricane Harbor Oklahoma City uses
  `3964ae15-a1a8-41a1-aea9-23b456e2911f`; legacy
  `aa8c2744-b792-4802-8a70-8bba51bc73da` is absent from raw upstream park rows
  while remaining a registry-declared live-feed alias.

## Remaining manual work

- Data's completed read-only Firestore manifest found 136 park documents and
  8,109 attraction documents. It identified three evidence-backed retired
  park identities (Oceans of Fun, Hurricane Harbor Oklahoma City, and
  Hurricane Harbor Arlington), plus one legitimate two-park
  `disneyland-park` slug collision.
- The 8,607-child Firestore comparison is a database-drift inventory across
  134 Firestore park documents still present upstream. It is intentionally a
  different universe from the 6,790-child canonical product audit above.
  The reported 406 local-only, 904 missing-local, 28 misassigned, 135
  name-drift, and one type-drift records are evidence, not all automatic
  actions: `scripts/reconcile-park-catalog.ts` now emits attraction mutations
  only for the 96 registry-approved canonical parks. Missing canonical park
  documents are now explicit create actions in the first reviewed phase;
  attraction actions remain in later deterministic shards. No unsupported
  park or attraction is promoted into product support.
- A separate retry of the fast park-only production read returned
  `Quota exceeded`. No additional Firestore reads were forced after that.
- Run the corrected canonical seed and then the reconciliation dry run after
  Firestore quota recovers. Applying either production mutation requires
  separate approval.
- Reconciliation applies only canonical upserts. Retire candidates and
  reference audits remain review-only evidence. Automatic deletion is disabled
  even after upserts converge and even when every current reference count is
  zero.
- Merge-only seeding cannot remove stale attraction documents. A future
  Firestore audit should compare stored attraction UUID/parkId pairs to this
  audit's upstream child sets before any cleanup.
- Seventeen upstream/app name differences are cosmetic canonical naming
  choices; UUID, slug, and destination identity match, so names were not
  churned automatically.
- ThemeParks.wiki does not publish the app's high-level operator-family
  taxonomy. All park-to-destination assignments match upstream; changing
  labels such as `Cedar Fair` would be a product taxonomy decision, not an
  evidence-backed data correction.

No production Firestore mutation, delete, commit, push, or deploy was
performed.

## Revision safety contract

- `seed-parks.ts`, `sync-all-parks.ts`, and `reconcile-park-catalog.ts` now
  share one manifest-first implementation. All are read-only by default.
- `migration.id` is the stable target-catalog digest used for resumability.
  It intentionally remains stable as phases converge. It is not sufficient
  authorization by itself.
- Every upsert phase has a separate SHA-256 approval digest over the stable
  target id, the exact pending park/attraction actions, and each affected
  Firestore document's existence, relevant current fields, update time, exact
  write payload, and persisted `updatedAt` timestamp (`writeTimestamp`).
  A dry run must persist the reviewed artifact with `--manifest-file <path>`.
  Upserts load that exact file rather than rebuilding against a later clock and
  require `--apply-upserts --yes --manifest-file <path> --manifest-id
  <reviewed-id> --phase <phase-id> --phase-digest <reviewed-digest>`. Added/changed actions or
  changed document state, payload, or write timestamp invalidate the prior
  phase approval. Firestore update-time preconditions retain exact seconds and
  nanoseconds; they are never round-tripped through `Date`. Re-running after a completed phase keeps the target id stable
  and emits only still-pending actions with newly reviewed timestamps/digests.
- Automatic deletion is disabled. `--apply-deletes` and `--delete-digest` are
  rejected before the manifest is loaded, no delete store/callback is accepted,
  and no Firestore `batch.delete` path exists. Park/child retire candidates,
  preconditions, and reference audits are evidence for a future explicit
  tombstone/security-rules migration only.
- Every canonical destination, park entity, and child feed is fetched before
  an upsert can begin. Requests have a 15-second timeout, bounded retries, and
  honor `Retry-After`. Any feed failure, parent/destination mismatch, or
  duplicate attraction owner blocks every attraction upsert.
- A successful child response is accepted only when it contains a `children`
  array whose rows have valid UUIDs, names, entity types, optional slugs, and
  optional parent UUIDs, with no within-feed duplicate UUIDs. Objects, numbers,
  unknown entity types, and malformed present slugs are rejected before any
  persisted child action is emitted.
  Completeness is evaluated against reviewed baseline
  `themeparks-wiki-canonical-children-2026-08-14`, which pins all 6,790 child
  UUIDs under their reviewed park owners. Additive growth is allowed, but one
  park cannot shrink while another offsets the global total: any missing
  reviewed UUID or missing per-park baseline blocks both audit and apply.
  The checked-in artifact declares the full reviewed identity SHA-256
  `1e91879dc1c836f73c7e46e745a583b22726247c91c4a7750ccd22f3ef3a5a89`,
  exact ThemeParks.wiki endpoint templates, retrieval/generation timestamps,
  the generator script/command, and endpoint/count/hash evidence for all 96
  feeds. `npm run verify:catalog-child-baseline` fails on identity, endpoint,
  timestamp, generator, count, or per-feed hash tampering. The reproducible
  read-only source command is
  `npm run generate:catalog-child-baseline -- --write
  scripts/data/themeparks-wiki-canonical-children-2026-08-14.json`; it refuses
  to write if live identities differ from the reviewed full digest.
- Park creates and repairs carry the validated `/entity/{id}` metadata while
  preserving the released Firestore/application location contract
  `location: {lat,lng}`:
  `entityType`, `parentId`, `destinationId`, `timezone`, `location`, and
  present `externalId`/`tags`, alongside the canonical registry name/slug.
  Upstream `{latitude,longitude}` is converted explicitly. Updates replace the
  top-level location map under an update-time precondition, so legacy
  `latitude`/`longitude` leaves cannot survive merge semantics. A realistic
  existing `{lat,lng}` document converges in one pass and emits no action on
  rerun.
- Every registry-approved park missing from Firestore is a deterministic
  `mode=create` park action. The first deterministic phase contains all park
  creates/repairs (96 actions for empty Firestore). A subsequent manifest over
  those 96 documents emits no park action.
- Every action materializes the exact reviewed `writeTimestamp` persisted as
  `updatedAt`; that value is part of the phase digest. Business-field equality
  produces no action on the next run, so timestamps do not churn.
- The realistic empty-Firestore plan is 6,886 upserts (96 parks plus 6,790
  children), so it is never described as one atomic batch. The target catalog
  receives a stable SHA-256 manifest id. Upserts are deterministic and
  resumable: phase `parks` runs first, then child UUIDs are assigned to 32
  fixed `sha256(id) mod 32` attraction phases. Every phase is independently
  atomic and capped at 400 writes; a phase cannot be selected with a changed
  target id or stale phase digest, and attraction phases are blocked until the
  park phase converges. Re-running after any phase preserves the target/phase
  ids, emits only still-pending actions, and produces a new phase digest for
  the new current Firestore state.
- No destructive phase exists. Automatic deletion cannot intermix with a
  partial or converged migration because it is absent from the implementation.
- Child retirement candidates are emitted only for active registry park owners.
  Unsupported, missing-owner, and retired-owner Firestore attractions are
  review-only.
- Park retirement reference reviews cover attraction ownership, user ride
  logs, `users/*/diningLogs/*` by `parkId`, active timers, trips, trip days,
  crowd/wait reports, schedule/history/forecast stores, crowdsourced stores,
  `waitTimes/{parkId}/history`, and known park subcollections. They also
  recursively enumerate the actual family-keyed
  `crowdCalendar/*/monthly/*` tree and inspect nested values for embedded park
  UUIDs. Each tree is traversed through missing parent documents, so a nested
  reference remains blocking even when its parent document does not exist.
  Any enumeration or document-read failure is unresolved and fails closed.
- Child retirement reviews cover ride logs, `users/*/diningLogs/*` by
  `restaurantId`, timers, reports, current waits, and crowdsourced data. Nested
  history/forecast documents do not expose a queryable child id, so that scope
  is explicitly unresolved evidence for future design.
- Attraction reference audits are bounded to 50 candidates. Larger candidate
  sets are marked unresolved without issuing thousands of Firestore queries,
  protecting read quota while keeping the review evidence honest.
- `reconcile-parks.ts` is permanently read-only. Its former `--apply` path is
  refused so it cannot bypass the full reference audit (including the retired
  Oklahoma City document with 28 attraction records).
- Legacy `seed-parks.ts` and `sync-all-parks.ts` direct entrypoints write
  sanitized manifest/CLI failures to stderr and preserve non-zero exit codes;
  they no longer swallow exceptions.
- Public identity reads reject unknown/stale slugs, and `/api/park-schedule`
  accepts only active registry UUIDs.

## Fresh what-if sequence (no production writes)

1. Run `npm run audit:parks -- --json`; require `status.complete=true` and zero
   blocking identity issues. Registry-handled sibling-feed assignments remain
   visible but do not make the audit fail. Any unknown assignment or other
   non-zero exit means stop.
2. Run each legacy sync command with no apply flags and compare its JSON
   manifest with `npm run reconcile:park-catalog -- --json --manifest-file
   reviewed-catalog-manifest.json`; they use the same implementation.
3. Review the stable `migration.id`, exact phase actions/preconditions, each
   phase's `approvalDigest`, target counts, and pending counts. For an empty
   database the what-if is exactly 6,886 actions: `parks` (96), followed by 32
   stable attraction shards totaling 6,790. No phase may exceed 400.
4. A future authorized run would apply exactly one reviewed phase:
   `--apply-upserts --yes --manifest-file reviewed-catalog-manifest.json
   --manifest-id <id> --phase parks --phase-digest <digest>`. Apply consumes
   the exact reviewed file; it never regenerates the manifest. After a phase,
   generate and review a new artifact before applying another named attraction
   phase. Stop for re-review if either requested digest no longer matches.
   The complete legacy equivalents are
   `npm run seed:parks -- --apply-upserts --yes --manifest-file
   reviewed-catalog-manifest.json --manifest-id <id> --phase parks
   --phase-digest <digest>` and
   `npm run sync:all-parks -- --apply-upserts --yes --manifest-file
   reviewed-catalog-manifest.json --manifest-id <id> --phase parks
   --phase-digest <digest>`.
5. Regenerate the manifest and all reference checks after every upsert phase.
   Oklahoma
   City remains blocked while any of its 28 old-owner attractions or user/
   system references remain.
6. Keep all retirement evidence review-only. Any future removal requires a
   separate, explicitly designed tombstone plus security-rules migration with
   user-linked data preservation; this tool intentionally cannot execute it.

The latest Firestore read-only manifest retry remains unavailable because the
project returned `Quota exceeded`. No additional production Firestore reads
or any production mutation were forced during this revision.
