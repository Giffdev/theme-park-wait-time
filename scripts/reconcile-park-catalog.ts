/**
 * Full Firestore park/attraction catalog reconciliation.
 *
 * Dry-run is the default. Production writes require an explicit mode plus
 * `--yes`, the exact reviewed manifest artifact, the stable target catalog id,
 * and a state-bound approval digest:
 *   npm run reconcile:park-catalog -- --json --manifest-file catalog-manifest.json
 *   npm run reconcile:park-catalog -- --apply-upserts --yes --manifest-file catalog-manifest.json --manifest-id <id> --phase parks --phase-digest <digest>
 *
 * Upserts create or repair only registry-approved park documents and reconcile
 * children for those supported parks. Retirement candidates and reference
 * audits are review-only evidence; this tool has no delete capability.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { adminDb } from '../src/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  DESTINATION_FAMILIES,
  RETIRED_PARK_REPLACEMENTS,
  getAllParks,
  getParkById,
  isRetiredParkId,
  resolveCurrentParkId,
  type DestinationFamily,
  type ParkEntry,
} from '../src/lib/parks/park-registry';
import {
  REVIEWED_CHILD_CATALOG_BASELINE,
  evaluateChildCatalogCompleteness,
  type ChildCatalogCompletenessEvidence,
  type ReviewedChildCatalogBaseline,
} from './catalog-child-baseline';

const API_BASE = 'https://api.themeparks.wiki/v1';
const FETCH_CONCURRENCY = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_ATOMIC_WRITE_ACTIONS = 400;
export const MAX_ATTRACTION_REFERENCE_AUDITS = 50;
export const ATTRACTION_UPSERT_SHARD_COUNT = 32;
export const AUTHORITATIVE_CATALOG_MODEL = {
  families: 9,
  destinations: 64,
  parks: 96,
  canonicalChildEntities: 6_790,
} as const;
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_ATTEMPTS = 4;
const ENTITY_TYPES = new Set([
  'DESTINATION',
  'PARK',
  'ATTRACTION',
  'RESTAURANT',
  'HOTEL',
  'SHOW',
]);

export { REVIEWED_CHILD_CATALOG_BASELINE, evaluateChildCatalogCompleteness };

export interface EntityLocation {
  latitude: number | null;
  longitude: number | null;
}

export interface ParkStorageLocation {
  lat: number | null;
  lng: number | null;
}

export interface EntityTag {
  tag: string;
  tagName: string;
  id?: string;
  value?: unknown;
}

export interface CatalogParkDocument {
  docId: string;
  id?: string;
  name?: string;
  slug?: string;
  destinationId?: string;
  destinationName?: string;
  entityType?: string;
  parentId?: string | null;
  timezone?: string;
  location?: ParkStorageLocation;
  externalId?: string | null;
  tags?: EntityTag[];
  firestoreUpdateTime?: FirestoreTimestampValue;
}

export interface CatalogAttractionDocument {
  docId: string;
  id?: string;
  name?: string;
  slug?: string;
  parkId?: string;
  parkName?: string;
  entityType?: string;
  firestoreUpdateTime?: FirestoreTimestampValue;
}

export interface UpstreamPark {
  id: string;
  name: string;
  slug?: string;
  destinationId: string;
  destinationName: string;
  entityType: 'PARK';
  parentId: string | null;
  timezone: string;
  location: EntityLocation;
  externalId?: string | null;
  tags?: EntityTag[];
}

export interface UpstreamAttraction {
  id: string;
  name: string;
  slug?: string | null;
  entityType: string;
  parkId: string;
  parkName: string;
}

export interface FieldChange {
  from?: unknown;
  to: unknown;
}

export interface FirestoreWritePrecondition {
  exists: boolean;
  updateTime?: FirestoreTimestampValue;
  fields: Record<string, unknown>;
}

export interface FirestoreTimestampValue {
  seconds: number;
  nanoseconds: number;
}

export interface ParkUpdateAction {
  docId: string;
  phaseId: string;
  mode: 'create' | 'update';
  writeTimestamp: string;
  changes: Record<string, FieldChange>;
  data: Record<string, unknown>;
  precondition: FirestoreWritePrecondition;
}

export interface ParkRetirementEvidence {
  kind: 'pinned-registry-retirement';
  replacementParkId: string;
  replacementPresentInCanonicalUpstream: boolean;
  rawUpstreamStatus: 'present' | 'absent';
  declaredLiveFeedAlias: boolean;
}

export interface ParkRetireAction {
  docId: string;
  slug?: string;
  name?: string;
  replacementParkId: string;
  reason: string;
  evidence: ParkRetirementEvidence;
  precondition: FirestoreWritePrecondition;
}

export interface AttractionUpsertAction {
  docId: string;
  phaseId: string;
  mode: 'create' | 'update';
  writeTimestamp: string;
  changes: Record<string, FieldChange>;
  data: Record<string, unknown>;
  precondition: FirestoreWritePrecondition;
}

export interface AttractionRetireAction {
  docId: string;
  name?: string;
  parkId?: string;
  reason: string;
  precondition: FirestoreWritePrecondition;
}

export interface DuplicateSlug {
  slug: string;
  docIds: string[];
}

export interface IdentityReferenceAudit {
  parkId: string;
  checks: ReferenceCheck[];
  blockingDocumentCount: number;
  complete: boolean;
}

export interface AttractionReferenceAudit {
  attractionId: string;
  parkId?: string;
  checks: ReferenceCheck[];
  blockingDocumentCount: number;
  complete: boolean;
}

export interface ReferenceCheck {
  scope: string;
  count: number;
  complete: boolean;
  error?: string;
}

export interface CatalogFeedFailure {
  stage: 'destinations' | 'entity' | 'children';
  parkId?: string;
  status?: number;
  attempts: number;
  error: string;
}

export interface CatalogIdentityMismatch {
  parkId?: string;
  attractionId?: string;
  reason: string;
}

export interface CatalogUpsertPhase {
  id: string;
  kind: 'parks' | 'attractions';
  targetDocumentCount: number;
  pendingActionCount: number;
  approvalDigest: string;
}

export interface CatalogManifest {
  generatedAt: string;
  source: {
    complete: boolean;
    registryFamilies: number;
    registryDestinations: number;
    registryParks: number;
    registryMatchesAuthoritativeModel: boolean;
    firestoreParkDocuments: number;
    firestoreAttractionDocuments: number;
    upstreamParkEntities: number;
    rawUpstreamParkEntities: number;
    rawUpstreamCatalogComplete: boolean;
    canonicalUpstreamParkEntities: number;
    upstreamAttractionEntities: number;
    upstreamFetchFailures: CatalogFeedFailure[];
    identityMismatches: CatalogIdentityMismatch[];
    childCatalogCompleteness: ChildCatalogCompletenessEvidence;
  };
  parks: {
    duplicateSlugs: DuplicateSlug[];
    staleDocuments: Array<{
      docId: string;
      slug?: string;
      name?: string;
      replacementParkId?: string;
    }>;
    retire: ParkRetireAction[];
    review: Array<{ docId: string; reason: string }>;
    updates: ParkUpdateAction[];
    upstreamFieldDrift: ParkUpdateAction[];
    upstreamParksMissingFromFirestore: UpstreamPark[];
  };
  attractions: {
    upsert: AttractionUpsertAction[];
    retire: AttractionRetireAction[];
    review: Array<{ docId: string; reason: string }>;
    duplicateUpstreamIds: Array<{ attractionId: string; parkIds: string[] }>;
  };
  references: IdentityReferenceAudit[];
  attractionReferences: AttractionReferenceAudit[];
  migration: {
    id: string;
    algorithm: 'parks-then-sha256-mod-32';
    maxActionsPerPhase: number;
    upsertPhases: CatalogUpsertPhase[];
    retirementReview: {
      mode: 'review-only';
      automaticDeletionEnabled: false;
      referenceEvidenceComplete: boolean;
    };
  };
  applied: null | {
    mode: 'upserts';
    manifestId: string;
    approvalDigest: string;
    phaseId: string;
    parkUpserts: number;
    attractionUpserts: number;
  };
}

export interface ManifestInput {
  parks: CatalogParkDocument[];
  attractions: CatalogAttractionDocument[];
  upstreamParks: UpstreamPark[];
  rawUpstreamParkIds?: string[];
  rawUpstreamCatalogComplete?: boolean;
  upstreamAttractions: UpstreamAttraction[];
  upstreamFetchFailures?: CatalogFeedFailure[];
  upstreamIdentityMismatches?: CatalogIdentityMismatch[];
  upstreamCompleteness?: ChildCatalogCompletenessEvidence;
  generatedAt?: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''®™]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function collectChanges(
  current: Record<string, unknown>,
  expected: Record<string, unknown>
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  for (const [field, to] of Object.entries(expected)) {
    if (!deepEqual(current[field], to)) changes[field] = { from: current[field], to };
  }
  return changes;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => deepEqual(value, right[index]))
    );
  }
  if (
    left &&
    right &&
    typeof left === 'object' &&
    typeof right === 'object' &&
    !Array.isArray(left) &&
    !Array.isArray(right)
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] && deepEqual(leftRecord[key], rightRecord[key])
      )
    );
  }
  return false;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function storageLocation(location: EntityLocation): ParkStorageLocation {
  return { lat: location.latitude, lng: location.longitude };
}

function isFirestoreTimestampValue(value: unknown): value is FirestoreTimestampValue {
  if (!value || typeof value !== 'object') return false;
  const timestamp = value as Partial<FirestoreTimestampValue>;
  return (
    Number.isSafeInteger(timestamp.seconds) &&
    Number.isInteger(timestamp.nanoseconds) &&
    timestamp.nanoseconds! >= 0 &&
    timestamp.nanoseconds! < 1_000_000_000
  );
}

function writePrecondition(
  document: Record<string, unknown> | undefined,
  fields: string[]
): FirestoreWritePrecondition {
  if (!document) return { exists: false, fields: {} };
  return {
    exists: true,
    ...(isFirestoreTimestampValue(document.firestoreUpdateTime)
      ? { updateTime: document.firestoreUpdateTime }
      : {}),
    fields: Object.fromEntries(
      fields.sort().map((field) => [
        field,
        Object.prototype.hasOwnProperty.call(document, field)
          ? { exists: true, value: document[field] }
          : { exists: false },
      ])
    ),
  };
}

function phaseActions(manifest: CatalogManifest, phaseId: string) {
  return [
    ...manifest.parks.updates
      .filter((action) => action.phaseId === phaseId)
      .map((action) => ({ collection: 'parks' as const, ...action })),
    ...manifest.attractions.upsert
      .filter((action) => action.phaseId === phaseId)
      .map((action) => ({ collection: 'attractions' as const, ...action })),
  ].sort((left, right) =>
    `${left.collection}:${left.docId}`.localeCompare(`${right.collection}:${right.docId}`)
  );
}

export function computeUpsertPhaseApprovalDigest(
  manifest: CatalogManifest,
  phaseId: string
): string {
  return sha256({
    contract: 'catalog-upsert-phase-approval-v2',
    targetCatalogId: manifest.migration.id,
    phaseId,
    writeTimestamp: manifest.generatedAt,
    actions: phaseActions(manifest, phaseId),
  });
}

export function bindCatalogApprovalDigests(manifest: CatalogManifest): CatalogManifest {
  for (const phase of manifest.migration.upsertPhases) {
    phase.approvalDigest = computeUpsertPhaseApprovalDigest(manifest, phase.id);
  }
  manifest.migration.retirementReview.referenceEvidenceComplete =
    hasCompleteRetirementReferenceEvidence(manifest);
  return manifest;
}

export function attractionUpsertPhaseId(docId: string): string {
  const shard = createHash('sha256').update(docId).digest()[0] % ATTRACTION_UPSERT_SHARD_COUNT;
  return `attractions-${shard.toString(16).padStart(2, '0')}`;
}

function duplicateSlugs(parks: CatalogParkDocument[]): DuplicateSlug[] {
  const idsBySlug = new Map<string, string[]>();
  for (const park of parks) {
    if (!park.slug) continue;
    idsBySlug.set(park.slug, [...(idsBySlug.get(park.slug) ?? []), park.docId]);
  }
  return [...idsBySlug.entries()]
    .filter(([, docIds]) => docIds.length > 1)
    .map(([slug, docIds]) => ({ slug, docIds }));
}

function sortByDocId<T extends { docId: string }>(values: T[]): T[] {
  return values.sort((left, right) => left.docId.localeCompare(right.docId));
}

export function buildCatalogManifest(input: ManifestInput): CatalogManifest {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  if (Number.isNaN(new Date(generatedAt).getTime())) {
    throw new Error('Catalog manifest generatedAt must be a valid ISO timestamp.');
  }
  const failures = input.upstreamFetchFailures ?? [];
  const identityMismatches = input.upstreamIdentityMismatches ?? [];
  const rawUpstreamParkIds = new Set(
    input.rawUpstreamParkIds ?? input.upstreamParks.map((park) => park.id)
  );
  const rawUpstreamCatalogComplete = input.rawUpstreamCatalogComplete ?? true;
  const expectedCanonicalParkIds = getAllParks().map((park) => park.id);
  const completeness = input.upstreamCompleteness
    ? {
        ...input.upstreamCompleteness,
        review: { ...input.upstreamCompleteness.review },
        parksMissingReviewedBaseline: [
          ...input.upstreamCompleteness.parksMissingReviewedBaseline,
        ],
        reviewedParksMissingFromCatalog: [
          ...input.upstreamCompleteness.reviewedParksMissingFromCatalog,
        ],
        missingReviewedChildIdentities:
          input.upstreamCompleteness.missingReviewedChildIdentities.map((entry) => ({
            parkId: entry.parkId,
            childIds: [...entry.childIds],
          })),
        perPark: input.upstreamCompleteness.perPark.map((entry) => ({ ...entry })),
      }
    : evaluateChildCatalogCompleteness(
        REVIEWED_CHILD_CATALOG_BASELINE,
        expectedCanonicalParkIds,
        new Map()
      );
  const canonicalUpstreamParks = input.upstreamParks.filter(
    (park) => !isRetiredParkId(park.id)
  );
  const upstreamParkById = new Map(canonicalUpstreamParks.map((park) => [park.id, park]));
  const firestoreParkById = new Map(input.parks.map((park) => [park.docId, park]));
  const supportedCatalogParkIds = new Set(
    canonicalUpstreamParks
      .filter((park) => !!getParkById(park.id))
      .map((park) => park.id)
  );

  const activeFirestoreParkBySlug = new Map<string, CatalogParkDocument[]>();
  for (const park of input.parks) {
    if (!park.slug || !supportedCatalogParkIds.has(park.docId)) continue;
    activeFirestoreParkBySlug.set(park.slug, [
      ...(activeFirestoreParkBySlug.get(park.slug) ?? []),
      park,
    ]);
  }

  const staleDocuments = input.parks
    .filter((park) => isRetiredParkId(park.docId) || !upstreamParkById.has(park.docId))
    .map((park) => {
      const pinnedReplacementId = RETIRED_PARK_REPLACEMENTS[park.docId];
      const replacements = park.slug ? activeFirestoreParkBySlug.get(park.slug) ?? [] : [];
      return {
        docId: park.docId,
        slug: park.slug,
        name: park.name,
        pinnedReplacementId,
        inferredReplacementParkId:
          replacements.length === 1 ? replacements[0].docId : undefined,
        precondition: writePrecondition(
          park as unknown as Record<string, unknown>,
          Object.keys(park).filter(
            (field) => field !== 'docId' && field !== 'firestoreUpdateTime'
          )
        ),
      };
    });

  const parkRetire: ParkRetireAction[] = [];
  const parkReview: Array<{ docId: string; reason: string }> = [];
  for (const stale of staleDocuments) {
    if (
      stale.pinnedReplacementId &&
      upstreamParkById.has(stale.pinnedReplacementId) &&
      rawUpstreamCatalogComplete
    ) {
      const registryReplacement = getParkById(stale.pinnedReplacementId);
      const rawUpstreamStatus = rawUpstreamParkIds.has(stale.docId)
        ? ('present' as const)
        : ('absent' as const);
      const declaredLiveFeedAlias =
        registryReplacement?.liveDataIds?.includes(stale.docId) ?? false;
      if (rawUpstreamStatus === 'present' && !declaredLiveFeedAlias) {
        parkReview.push({
          docId: stale.docId,
          reason:
            `Retired id remains present in raw upstream park rows but is not declared as a ` +
            `live-feed alias of ${stale.pinnedReplacementId}. Never delete automatically.`,
        });
        continue;
      }
      parkRetire.push({
        docId: stale.docId,
        slug: stale.slug,
        name: stale.name,
        replacementParkId: stale.pinnedReplacementId,
        reason:
          rawUpstreamStatus === 'present'
            ? `Retired identity remains present in raw upstream park rows but is pinned only ` +
              `as a live-feed alias of canonical document ${stale.pinnedReplacementId}; it ` +
              `must not remain a separate Firestore park.`
            : `Retired identity is absent from the complete raw upstream park catalog and is ` +
              `pinned to canonical document ${stale.pinnedReplacementId}` +
              `${declaredLiveFeedAlias ? ' while remaining a live-feed-only alias.' : '.'}`,
        evidence: {
          kind: 'pinned-registry-retirement',
          replacementParkId: stale.pinnedReplacementId,
          replacementPresentInCanonicalUpstream: true,
          rawUpstreamStatus,
          declaredLiveFeedAlias,
        },
        precondition: stale.precondition,
      });
    } else {
      parkReview.push({
        docId: stale.docId,
        reason:
          !rawUpstreamCatalogComplete
            ? 'Raw upstream park enumeration is incomplete. Retirement evidence is unresolved.'
            : stale.pinnedReplacementId
              ? `Pinned replacement ${stale.pinnedReplacementId} is not present in the complete ` +
                'canonical upstream preflight. Never delete automatically.'
              : `No pinned retired-identity mapping exists` +
                `${stale.inferredReplacementParkId
                  ? ` (same-slug document ${stale.inferredReplacementParkId} is only a hint)`
                  : ''}. Never delete automatically.`,
      });
    }
  }

  const parkUpdates: ParkUpdateAction[] = [];
  const upstreamFieldDrift: ParkUpdateAction[] = [];
  const canonicalParkTargets: Array<{ docId: string; data: Record<string, unknown> }> = [];
  for (const upstream of canonicalUpstreamParks) {
    const registry = getParkById(upstream.id);
    if (!registry) continue;
    const park = firestoreParkById.get(upstream.id);
    const canonical = {
      id: upstream.id,
      name: registry.name,
      slug: registry.slug,
      destinationId: upstream.destinationId,
      destinationName: upstream.destinationName,
      entityType: upstream.entityType,
      parentId: upstream.parentId,
      timezone: upstream.timezone,
      location: storageLocation(upstream.location),
      ...(upstream.externalId !== undefined ? { externalId: upstream.externalId } : {}),
      ...(upstream.tags !== undefined ? { tags: upstream.tags } : {}),
    };
    const current = (park ?? {}) as Record<string, unknown>;
    canonicalParkTargets.push({ docId: upstream.id, data: canonical });
    const changes = collectChanges(current, canonical);
    if (Object.keys(changes).length > 0) {
      parkUpdates.push({
        docId: upstream.id,
        phaseId: 'parks',
        mode: park ? 'update' : 'create',
        writeTimestamp: generatedAt,
        changes,
        data: canonical,
        precondition: writePrecondition(
          park as Record<string, unknown> | undefined,
          Object.keys(canonical)
        ),
      });
    }

    const upstreamExpected = {
      id: upstream.id,
      name: upstream.name,
      slug: upstream.slug ?? slugify(upstream.name),
      destinationId: upstream.destinationId,
      destinationName: upstream.destinationName,
      entityType: upstream.entityType,
      parentId: upstream.parentId,
      timezone: upstream.timezone,
      location: storageLocation(upstream.location),
      ...(upstream.externalId !== undefined ? { externalId: upstream.externalId } : {}),
      ...(upstream.tags !== undefined ? { tags: upstream.tags } : {}),
    };
    const upstreamChanges = collectChanges(current, upstreamExpected);
    if (Object.keys(upstreamChanges).length > 0) {
      upstreamFieldDrift.push({
        docId: upstream.id,
        phaseId: 'parks',
        mode: park ? 'update' : 'create',
        writeTimestamp: generatedAt,
        changes: upstreamChanges,
        data: upstreamExpected,
        precondition: writePrecondition(
          park as Record<string, unknown> | undefined,
          Object.keys(upstreamExpected)
        ),
      });
    }
  }

  const upstreamOwners = new Map<string, Map<string, UpstreamAttraction>>();
  for (const attraction of input.upstreamAttractions) {
    const canonicalParkId = resolveCurrentParkId(attraction.parkId);
    const canonicalPark = upstreamParkById.get(canonicalParkId);
    const normalized = {
      ...attraction,
      parkId: canonicalParkId,
      parkName: canonicalPark?.name ?? attraction.parkName,
    };
    const owners = upstreamOwners.get(attraction.id) ?? new Map<string, UpstreamAttraction>();
    const existing = owners.get(canonicalParkId);
    if (!existing || attraction.parkId === canonicalParkId) {
      owners.set(canonicalParkId, normalized);
    }
    upstreamOwners.set(attraction.id, owners);
  }
  const duplicateUpstreamIds = [...upstreamOwners.entries()]
    .filter(([, owners]) => owners.size > 1)
    .map(([attractionId, owners]) => ({
      attractionId,
      parkIds: [...owners.keys()],
    }));
  const uniqueOwnerById = new Map(
    [...upstreamOwners.entries()]
      .filter(([, owners]) => owners.size === 1)
      .map(([id, owners]) => [id, [...owners.values()][0]])
  );

  const localAttractionById = new Map(
    input.attractions.map((attraction) => [attraction.docId, attraction])
  );
  const attractionUpsert: AttractionUpsertAction[] = [];
  const attractionRetire: AttractionRetireAction[] = [];
  const attractionReview: Array<{ docId: string; reason: string }> = [];

  for (const attraction of input.attractions) {
    const upstream = uniqueOwnerById.get(attraction.docId);
    if (upstream) {
      if (!supportedCatalogParkIds.has(upstream.parkId)) {
        attractionReview.push({
          docId: attraction.docId,
          reason:
            `Current upstream owner ${upstream.parkId} is not a registry-approved canonical park; ` +
            'do not move or delete automatically.',
        });
        continue;
      }
      const expected = {
        id: upstream.id,
        name: upstream.name,
        slug: upstream.slug ?? slugify(upstream.name),
        parkId: upstream.parkId,
        parkName: upstream.parkName,
        entityType: upstream.entityType,
      };
      const changes = collectChanges(
        attraction as unknown as Record<string, unknown>,
        expected
      );
      if (Object.keys(changes).length > 0) {
        attractionUpsert.push({
          docId: attraction.docId,
          phaseId: attractionUpsertPhaseId(attraction.docId),
          mode: 'update',
          writeTimestamp: generatedAt,
          changes,
          data: expected,
          precondition: writePrecondition(
            attraction as unknown as Record<string, unknown>,
            Object.keys(expected)
          ),
        });
      }
      continue;
    }

    const storedOwnerId = attraction.parkId
      ? resolveCurrentParkId(attraction.parkId)
      : undefined;
    const storedOwner = storedOwnerId ? getParkById(storedOwnerId) : undefined;
    if (!storedOwner || !attraction.parkId || isRetiredParkId(attraction.parkId)) {
      attractionReview.push({
        docId: attraction.docId,
        reason:
          `Stored owner ${attraction.parkId ?? '(missing)'} is not an active canonical registry ` +
          'park. Unsupported or retired Firestore parks are review-only.',
      });
    } else if (
      failures.length > 0 ||
      identityMismatches.length > 0 ||
      !completeness.complete
    ) {
      attractionReview.push({
        docId: attraction.docId,
        reason:
          'Not found in the incomplete upstream child catalog. Retirement evidence remains ' +
          'review-only until every canonical park feed and ownership proof succeeds.',
      });
    } else {
      attractionRetire.push({
        docId: attraction.docId,
        name: attraction.name,
        parkId: attraction.parkId,
        reason: 'Absent from every current upstream park child catalog.',
        precondition: writePrecondition(
          attraction as unknown as Record<string, unknown>,
          Object.keys(attraction).filter(
            (field) => field !== 'docId' && field !== 'firestoreUpdateTime'
          )
        ),
      });
    }
  }

  for (const [id, upstream] of uniqueOwnerById) {
    if (localAttractionById.has(id) || !supportedCatalogParkIds.has(upstream.parkId)) continue;
    const data = {
      id: upstream.id,
      name: upstream.name,
      slug: upstream.slug ?? slugify(upstream.name),
      parkId: upstream.parkId,
      parkName: upstream.parkName,
      entityType: upstream.entityType,
    };
    attractionUpsert.push({
      docId: id,
      phaseId: attractionUpsertPhaseId(id),
      mode: 'create',
      writeTimestamp: generatedAt,
      changes: Object.fromEntries(
        Object.entries(data).map(([field, to]) => [field, { from: undefined, to }])
      ),
      data,
      precondition: writePrecondition(undefined, Object.keys(data)),
    });
  }

  const registryFamilies = DESTINATION_FAMILIES.length;
  const registryDestinations = DESTINATION_FAMILIES.flatMap(
    (family) => family.destinations
  ).length;
  const registryParks = getAllParks().length;
  const registryMatchesAuthoritativeModel =
    registryFamilies === AUTHORITATIVE_CATALOG_MODEL.families &&
    registryDestinations === AUTHORITATIVE_CATALOG_MODEL.destinations &&
    registryParks === AUTHORITATIVE_CATALOG_MODEL.parks;
  const canonicalAttractionTargets = [...uniqueOwnerById.entries()]
    .filter(([, upstream]) => supportedCatalogParkIds.has(upstream.parkId))
    .map(([docId, upstream]) => ({
      docId,
      data: {
        id: upstream.id,
        name: upstream.name,
        slug: upstream.slug ?? slugify(upstream.name),
        parkId: upstream.parkId,
        parkName: upstream.parkName,
        entityType: upstream.entityType,
      },
    }))
    .sort((left, right) => left.docId.localeCompare(right.docId));
  canonicalParkTargets.sort((left, right) => left.docId.localeCompare(right.docId));
  const migrationId = createHash('sha256')
    .update(
      stableJson({
        algorithm: 'parks-then-sha256-mod-32',
        review: completeness.review,
        registryFamilies,
        registryDestinations,
        registryParks,
        parks: canonicalParkTargets,
        attractions: canonicalAttractionTargets,
      })
    )
    .digest('hex');
  const phaseTargets = new Map<string, number>([['parks', canonicalParkTargets.length]]);
  for (const target of canonicalAttractionTargets) {
    const phaseId = attractionUpsertPhaseId(target.docId);
    phaseTargets.set(phaseId, (phaseTargets.get(phaseId) ?? 0) + 1);
  }
  const pendingByPhase = new Map<string, number>();
  for (const action of [...parkUpdates, ...attractionUpsert]) {
    pendingByPhase.set(action.phaseId, (pendingByPhase.get(action.phaseId) ?? 0) + 1);
  }
  const upsertPhases: CatalogUpsertPhase[] = [...phaseTargets.entries()]
    .map(([id, targetDocumentCount]) => ({
      id,
      kind: id === 'parks' ? ('parks' as const) : ('attractions' as const),
      targetDocumentCount,
      pendingActionCount: pendingByPhase.get(id) ?? 0,
      approvalDigest: '',
    }))
    .sort((left, right) => {
      if (left.id === 'parks') return -1;
      if (right.id === 'parks') return 1;
      return left.id.localeCompare(right.id);
    });
  const manifest: CatalogManifest = {
    generatedAt,
    source: {
      complete:
        failures.length === 0 &&
        identityMismatches.length === 0 &&
        rawUpstreamCatalogComplete &&
        completeness.complete &&
        registryMatchesAuthoritativeModel,
      registryFamilies,
      registryDestinations,
      registryParks,
      registryMatchesAuthoritativeModel,
      firestoreParkDocuments: input.parks.length,
      firestoreAttractionDocuments: input.attractions.length,
      upstreamParkEntities: input.upstreamParks.length,
      rawUpstreamParkEntities: rawUpstreamParkIds.size,
      rawUpstreamCatalogComplete,
      canonicalUpstreamParkEntities: canonicalUpstreamParks.length,
      upstreamAttractionEntities: input.upstreamAttractions.length,
      upstreamFetchFailures: failures,
      identityMismatches,
      childCatalogCompleteness: completeness,
    },
    parks: {
      duplicateSlugs: duplicateSlugs(input.parks),
      staleDocuments,
      retire: parkRetire,
      review: parkReview,
      updates: parkUpdates,
      upstreamFieldDrift,
      upstreamParksMissingFromFirestore: canonicalUpstreamParks.filter(
        (park) => !!getParkById(park.id) && !firestoreParkById.has(park.id)
      ),
    },
    attractions: {
      upsert: attractionUpsert,
      retire: attractionRetire,
      review: attractionReview,
      duplicateUpstreamIds,
    },
    references: [],
    attractionReferences: [],
    migration: {
      id: migrationId,
      algorithm: 'parks-then-sha256-mod-32',
      maxActionsPerPhase: MAX_ATOMIC_WRITE_ACTIONS,
      upsertPhases,
      retirementReview: {
        mode: 'review-only',
        automaticDeletionEnabled: false,
        referenceEvidenceComplete: false,
      },
    },
    applied: null,
  };

  manifest.parks.duplicateSlugs.sort((left, right) => left.slug.localeCompare(right.slug));
  for (const duplicate of manifest.parks.duplicateSlugs) duplicate.docIds.sort();
  sortByDocId(manifest.parks.staleDocuments);
  sortByDocId(manifest.parks.retire);
  sortByDocId(manifest.parks.review);
  sortByDocId(manifest.parks.updates);
  sortByDocId(manifest.parks.upstreamFieldDrift);
  manifest.parks.upstreamParksMissingFromFirestore.sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  sortByDocId(manifest.attractions.upsert);
  sortByDocId(manifest.attractions.retire);
  sortByDocId(manifest.attractions.review);
  manifest.attractions.duplicateUpstreamIds.sort((left, right) =>
    left.attractionId.localeCompare(right.attractionId)
  );
  for (const duplicate of manifest.attractions.duplicateUpstreamIds) {
    duplicate.parkIds.sort();
  }
  manifest.source.upstreamFetchFailures.sort((left, right) =>
    `${left.stage}:${left.parkId ?? ''}`.localeCompare(`${right.stage}:${right.parkId ?? ''}`)
  );
  manifest.source.identityMismatches.sort((left, right) =>
    `${left.parkId ?? ''}:${left.attractionId ?? ''}:${left.reason}`.localeCompare(
      `${right.parkId ?? ''}:${right.attractionId ?? ''}:${right.reason}`
    )
  );
  return bindCatalogApprovalDigests(manifest);
}

export interface CatalogHttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type CatalogTransport = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> }
) => Promise<CatalogHttpResponse>;

export interface FetchRetryOptions {
  transport?: CatalogTransport;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  attempts?: number;
}

export class CatalogFetchError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly attempts: number
  ) {
    super(message);
    this.name = 'CatalogFetchError';
  }
}

function retryAfterMilliseconds(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const dateMs = Date.parse(value);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - nowMs);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function fetchJsonWithRetry<T>(
  url: string,
  options: FetchRetryOptions = {}
): Promise<T> {
  const transport =
    options.transport ??
    ((input, init) => fetch(input, init) as unknown as Promise<CatalogHttpResponse>);
  const sleep =
    options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const attempts = options.attempts ?? FETCH_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  let lastError: unknown;
  let lastStatus: number | undefined;
  let usedAttempts = 0;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    usedAttempts = attempt;
    try {
      const response = await transport(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'ParkPulse catalog reconciler' },
      });
      lastStatus = response.status;
      if (response.ok) return (await response.json()) as T;
      lastError = new Error(`HTTP ${response.status} ${response.statusText ?? ''}`.trim());
      if (!isRetryableStatus(response.status) || attempt === attempts) break;
      const retryAfter = retryAfterMilliseconds(
        response.headers.get('Retry-After'),
        (options.now ?? Date.now)()
      );
      await sleep(retryAfter ?? attempt * 750);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      await sleep(attempt * 750);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new CatalogFetchError(message, lastStatus, usedAttempts);
}

export interface UpstreamCatalogResult {
  parks: UpstreamPark[];
  rawUpstreamParkIds: string[];
  rawUpstreamCatalogComplete: boolean;
  attractions: UpstreamAttraction[];
  failures: CatalogFeedFailure[];
  identityMismatches: CatalogIdentityMismatch[];
  completeness: ChildCatalogCompletenessEvidence;
}

interface UpstreamEntity {
  id?: unknown;
  name?: unknown;
  entityType?: unknown;
  destinationId?: unknown;
  parentId?: unknown;
  timezone?: unknown;
  location?: unknown;
  externalId?: unknown;
  tags?: unknown;
}

interface UpstreamChild {
  id: string;
  name: string;
  slug?: string | null;
  entityType: string;
  parentId?: string;
}

export interface FetchUpstreamCatalogOptions extends FetchRetryOptions {
  registry?: DestinationFamily[];
  childCatalogBaseline?: ReviewedChildCatalogBaseline;
}

function validateChildPayload(
  payload: unknown,
  park: ParkEntry
): { children?: UpstreamChild[]; issues: CatalogIdentityMismatch[]; error?: string } {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as { children?: unknown }).children)
  ) {
    return {
      issues: [],
      error: 'HTTP 200 child response is malformed: required children array is missing.',
    };
  }

  const children = (payload as { children: unknown[] }).children;
  const parsed: UpstreamChild[] = [];
  const issues: CatalogIdentityMismatch[] = [];
  const seenIds = new Set<string>();
  for (const [index, value] of children.entries()) {
    if (!value || typeof value !== 'object') {
      issues.push({
        parkId: park.id,
        reason: `Child row ${index} is not an object.`,
      });
      continue;
    }
    const child = value as Record<string, unknown>;
    if (typeof child.id !== 'string' || !UUID_RE.test(child.id)) {
      issues.push({
        parkId: park.id,
        attractionId: typeof child.id === 'string' ? child.id : undefined,
        reason: `Child row ${index} has an invalid UUID.`,
      });
      continue;
    }
    if (seenIds.has(child.id)) {
      issues.push({
        parkId: park.id,
        attractionId: child.id,
        reason: 'Child UUID is duplicated within the same canonical park feed.',
      });
      continue;
    }
    seenIds.add(child.id);
    if (typeof child.name !== 'string' || child.name.trim().length === 0) {
      issues.push({
        parkId: park.id,
        attractionId: child.id,
        reason: `Child ${child.id} has no valid name.`,
      });
      continue;
    }
    if (
      typeof child.entityType !== 'string' ||
      !ENTITY_TYPES.has(child.entityType) ||
      child.entityType === 'PARK' ||
      child.entityType === 'DESTINATION'
    ) {
      issues.push({
        parkId: park.id,
        attractionId: child.id,
        reason: `Child ${child.id} has an invalid entityType.`,
      });
      continue;
    }
    if (
      child.slug !== undefined &&
      child.slug !== null &&
      (typeof child.slug !== 'string' ||
        child.slug.trim().length === 0 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(child.slug))
    ) {
      issues.push({
        parkId: park.id,
        attractionId: child.id,
        reason: `Child ${child.id} has an invalid slug.`,
      });
      continue;
    }
    if (
      child.parentId !== undefined &&
      (typeof child.parentId !== 'string' ||
        !UUID_RE.test(child.parentId))
    ) {
      issues.push({
        parkId: park.id,
        attractionId: child.id,
        reason: 'Child parentId is malformed.',
      });
      continue;
    }
    parsed.push({
      id: child.id,
      name: child.name,
      entityType: child.entityType,
      ...(child.slug !== undefined ? { slug: child.slug as string | null } : {}),
      ...(child.parentId !== undefined ? { parentId: child.parentId as string } : {}),
    });
  }
  return { children: issues.length === 0 ? parsed : undefined, issues };
}

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function parseLocation(value: unknown): EntityLocation | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const location = value as Record<string, unknown>;
  const latitude = location.latitude;
  const longitude = location.longitude;
  if (
    (latitude !== null && (typeof latitude !== 'number' || !Number.isFinite(latitude))) ||
    (longitude !== null && (typeof longitude !== 'number' || !Number.isFinite(longitude))) ||
    latitude === undefined ||
    longitude === undefined
  ) {
    return undefined;
  }
  if (
    (typeof latitude === 'number' && (latitude < -90 || latitude > 90)) ||
    (typeof longitude === 'number' && (longitude < -180 || longitude > 180))
  ) {
    return undefined;
  }
  return {
    latitude: latitude as number | null,
    longitude: longitude as number | null,
  };
}

function parseTags(value: unknown): EntityTag[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return undefined;
  const tags: EntityTag[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
    const tag = entry as Record<string, unknown>;
    if (
      typeof tag.tag !== 'string' ||
      tag.tag.trim().length === 0 ||
      typeof tag.tagName !== 'string' ||
      tag.tagName.trim().length === 0 ||
      (tag.id !== undefined && typeof tag.id !== 'string')
    ) {
      return undefined;
    }
    tags.push({
      tag: tag.tag,
      tagName: tag.tagName,
      ...(tag.id !== undefined ? { id: tag.id as string } : {}),
      ...(tag.value !== undefined ? { value: tag.value } : {}),
    });
  }
  return tags;
}

function validateParkEntity(
  payload: UpstreamEntity,
  park: ParkEntry,
  destinationId: string,
  destinationName: string,
  upstreamName: string,
  upstreamSlug?: string
): { park?: UpstreamPark; reason?: string } {
  if (
    typeof payload.id !== 'string' ||
    payload.id !== park.id ||
    !UUID_RE.test(payload.id) ||
    typeof payload.name !== 'string' ||
    payload.name.trim().length === 0 ||
    payload.entityType !== 'PARK' ||
    payload.parentId !== destinationId ||
    payload.destinationId !== destinationId ||
    typeof payload.timezone !== 'string' ||
    payload.timezone.trim().length === 0 ||
    !validTimezone(payload.timezone)
  ) {
    return {
      reason:
        `Entity schema/ownership mismatch: id=${String(payload.id)}, ` +
        `type=${String(payload.entityType)}, parent=${String(payload.parentId)}, ` +
        `destination=${String(payload.destinationId)}, timezone=${String(payload.timezone)}.`,
    };
  }
  const location = parseLocation(payload.location);
  if (!location) return { reason: 'Entity location is missing or malformed.' };
  if (
    payload.externalId !== undefined &&
    payload.externalId !== null &&
    (typeof payload.externalId !== 'string' || payload.externalId.trim().length === 0)
  ) {
    return { reason: 'Entity externalId is malformed.' };
  }
  const tags = parseTags(payload.tags);
  if (payload.tags !== undefined && !tags) return { reason: 'Entity tags are malformed.' };
  return {
    park: {
      id: payload.id,
      name: upstreamName,
      ...(upstreamSlug ? { slug: upstreamSlug } : {}),
      destinationId,
      destinationName,
      entityType: 'PARK',
      parentId: destinationId,
      timezone: payload.timezone,
      location,
      ...(payload.externalId !== undefined
        ? { externalId: payload.externalId as string | null }
        : {}),
      ...(tags ? { tags } : {}),
    },
  };
}

export async function fetchUpstreamCatalog(
  options: FetchUpstreamCatalogOptions = {}
): Promise<UpstreamCatalogResult> {
  const failures: CatalogFeedFailure[] = [];
  const identityMismatches: CatalogIdentityMismatch[] = [];
  const registry = options.registry ?? DESTINATION_FAMILIES;
  const baseline = options.childCatalogBaseline ?? REVIEWED_CHILD_CATALOG_BASELINE;
  const expectedParkIds = registry.flatMap((family) =>
    family.destinations.flatMap((destination) => destination.parks)
  ).map((park) => park.id);
  const observedChildIdsByPark = new Map<string, string[]>();
  let destinationData: {
    destinations: Array<{
      id: string;
      name: string;
      parks: Array<{ id: string; name: string; slug?: string }>;
    }>;
  };
  try {
    destinationData = await fetchJsonWithRetry(`${API_BASE}/destinations`, options);
  } catch (error) {
    const fetchError = error as CatalogFetchError;
    failures.push({
      stage: 'destinations',
      status: fetchError.status,
      attempts: fetchError.attempts ?? (options.attempts ?? FETCH_ATTEMPTS),
      error: fetchError.message,
    });
    return {
      parks: [],
      rawUpstreamParkIds: [],
      rawUpstreamCatalogComplete: false,
      attractions: [],
      failures,
      identityMismatches,
      completeness: evaluateChildCatalogCompleteness(
        baseline,
        expectedParkIds,
        observedChildIdsByPark
      ),
    };
  }

  const destinationsById = new Map(
    destinationData.destinations.map((destination) => [destination.id, destination])
  );
  const rawUpstreamParkIds = destinationData.destinations
    .flatMap((destination) => destination.parks.map((park) => park.id))
    .filter((id): id is string => typeof id === 'string' && UUID_RE.test(id))
    .sort();
  const rawUpstreamCatalogComplete = destinationData.destinations.every(
    (destination) =>
      Array.isArray(destination.parks) &&
      destination.parks.every(
        (park) =>
          typeof park.id === 'string' &&
          UUID_RE.test(park.id) &&
          typeof park.name === 'string' &&
          park.name.trim().length > 0
      )
  );
  if (!rawUpstreamCatalogComplete) {
    identityMismatches.push({
      reason: 'Raw upstream park enumeration contains malformed or incomplete park rows.',
    });
  }
  const parks: UpstreamPark[] = [];
  const attractions: UpstreamAttraction[] = [];
  const jobs: Array<{
    park: ParkEntry;
    destinationId: string;
    destinationName: string;
    upstreamPark: { id: string; name: string; slug?: string };
  }> = [];

  for (const family of registry) {
    for (const destination of family.destinations) {
      const upstreamDestination = destinationsById.get(destination.id);
      if (!upstreamDestination) {
        identityMismatches.push({
          reason: `Canonical destination ${destination.id} (${destination.name}) is missing upstream.`,
        });
        continue;
      }
      const upstreamParksById = new Map(
        upstreamDestination.parks.map((park) => [park.id, park])
      );
      for (const registryPark of destination.parks) {
        const upstreamPark = upstreamParksById.get(registryPark.id);
        if (!upstreamPark) {
          identityMismatches.push({
            parkId: registryPark.id,
            reason:
              `Canonical park is missing from upstream destination ${destination.id} ` +
              `(${destination.name}).`,
          });
          continue;
        }
        if (
          typeof upstreamPark.name !== 'string' ||
          upstreamPark.name.trim().length === 0 ||
          (upstreamPark.slug !== undefined &&
            (typeof upstreamPark.slug !== 'string' ||
              upstreamPark.slug.trim().length === 0))
        ) {
          identityMismatches.push({
            parkId: registryPark.id,
            reason: 'Canonical park row in /destinations has malformed name or slug metadata.',
          });
          continue;
        }
        jobs.push({
          park: registryPark,
          destinationId: destination.id,
          destinationName: destination.name,
          upstreamPark,
        });
      }
    }
  }

  let nextIndex = 0;

  async function fetchParkFeeds(
    job: {
      park: ParkEntry;
      destinationId: string;
      destinationName: string;
      upstreamPark: { id: string; name: string; slug?: string };
    }
  ): Promise<void> {
    const park = job.park;
    try {
      const entity = await fetchJsonWithRetry<UpstreamEntity>(
        `${API_BASE}/entity/${park.id}`,
        options
      );
      const validated = validateParkEntity(
        entity,
        park,
        job.destinationId,
        job.destinationName,
        job.upstreamPark.name,
        job.upstreamPark.slug
      );
      if (!validated.park) {
        identityMismatches.push({
          parkId: park.id,
          reason: validated.reason ?? 'Entity schema validation failed.',
        });
      } else {
        parks.push(validated.park);
      }
    } catch (error) {
      const fetchError = error as CatalogFetchError;
      failures.push({
        stage: 'entity',
        parkId: park.id,
        status: fetchError.status,
        attempts: fetchError.attempts ?? (options.attempts ?? FETCH_ATTEMPTS),
        error: fetchError.message,
      });
    }

    try {
      const payload = await fetchJsonWithRetry<unknown>(
        `${API_BASE}/entity/${park.id}/children`,
        options
      );
      const validation = validateChildPayload(payload, park);
      identityMismatches.push(...validation.issues);
      if (validation.error) {
        failures.push({
          stage: 'children',
          parkId: park.id,
          status: 200,
          attempts: 1,
          error: validation.error,
        });
        return;
      }
      if (!validation.children) return;
      observedChildIdsByPark.set(
        park.id,
        validation.children.map((child) => child.id)
      );
      for (const child of validation.children) {
        attractions.push({
          ...child,
          parkId: park.id,
          parkName: park.name,
        });
      }
    } catch (error) {
      const fetchError = error as CatalogFetchError;
      failures.push({
        stage: 'children',
        parkId: park.id,
        status: fetchError.status,
        attempts: fetchError.attempts ?? (options.attempts ?? FETCH_ATTEMPTS),
        error: fetchError.message,
      });
    }
  }

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex++;
      if (index >= jobs.length) return;
      await fetchParkFeeds(jobs[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, jobs.length || 1) }, () => worker())
  );
  parks.sort((left, right) => left.id.localeCompare(right.id));
  attractions.sort((left, right) =>
    `${left.parkId}:${left.id}`.localeCompare(`${right.parkId}:${right.id}`)
  );
  return {
    parks,
    rawUpstreamParkIds,
    rawUpstreamCatalogComplete,
    attractions,
    failures,
    identityMismatches,
    completeness: evaluateChildCatalogCompleteness(
      baseline,
      expectedParkIds,
      observedChildIdsByPark
    ),
  };
}

export function mapFirestoreDocument<T extends object>(document: {
  id: string;
  data(): T;
  updateTime?: { seconds: number; nanoseconds: number };
}): T & { docId: string; firestoreUpdateTime?: FirestoreTimestampValue } {
  return {
    ...document.data(),
    docId: document.id,
    ...(document.updateTime
      ? {
          firestoreUpdateTime: {
            seconds: document.updateTime.seconds,
            nanoseconds: document.updateTime.nanoseconds,
          },
        }
      : {}),
  };
}

export async function readFirestoreCatalog(): Promise<{
  parks: CatalogParkDocument[];
  attractions: CatalogAttractionDocument[];
}> {
  const [parkSnapshot, attractionSnapshot] = await Promise.all([
    adminDb.collection('parks').get(),
    adminDb.collection('attractions').get(),
  ]);
  return {
    parks: parkSnapshot.docs.map((doc) =>
      mapFirestoreDocument(doc as {
        id: string;
        data(): Omit<CatalogParkDocument, 'docId'>;
      })
    ),
    attractions: attractionSnapshot.docs.map((doc) =>
      mapFirestoreDocument(doc as {
        id: string;
        data(): Omit<CatalogAttractionDocument, 'docId'>;
      })
    ),
  };
}

async function collectionCount(collection: FirebaseFirestore.Query): Promise<number> {
  const snapshot = await collection.count().get();
  return Number(snapshot.data().count ?? 0);
}

async function documentCount(document: FirebaseFirestore.DocumentReference): Promise<number> {
  return (await document.get()).exists ? 1 : 0;
}

export const PARK_REFERENCE_SCOPES = [
  'attractions',
  'user-ride-logs',
  'user-dining-logs-by-park',
  'active-timers',
  'trips',
  'trip-days',
  'crowd-reports',
  'crowd-calendar-embedded-park-ids',
  'wait-time-reports',
  'park-operating-hours',
  'park-seasonal-schedules',
  'park-nested-attractions',
  'park-current-wait-times',
  'park-descendants',
  'wait-times-parent',
  'wait-times-current',
  'wait-times-history',
  'wait-times-descendants',
  'wait-time-history-parent',
  'wait-time-history-days',
  'wait-time-history-descendants',
  'forecast-aggregates-parent',
  'forecast-aggregate-days',
  'forecast-aggregates-descendants',
  'park-schedules-parent',
  'park-schedule-days',
  'park-schedules-descendants',
  'crowdsourced-parent',
  'crowdsourced-reports',
  'crowdsourced-aggregates',
  'crowdsourced-descendants',
] as const;

export const ATTRACTION_REFERENCE_SCOPES = [
  'user-ride-logs',
  'user-dining-logs-by-child',
  'active-timers',
  'crowd-reports',
  'wait-time-reports',
  'current-wait-time',
  'crowdsourced-reports',
  'crowdsourced-aggregate',
  'nested-history-and-forecast',
] as const;

export interface CatalogReferenceProbe {
  countPark(scope: (typeof PARK_REFERENCE_SCOPES)[number], parkId: string): Promise<number>;
  countAttraction(
    scope: (typeof ATTRACTION_REFERENCE_SCOPES)[number],
    attraction: AttractionRetireAction
  ): Promise<number>;
}

export interface FirestoreTreeCollection {
  listDocuments(): Promise<FirestoreTreeDocument[]>;
}

export interface FirestoreTreeDocument {
  get(): Promise<{ exists: boolean; data?(): unknown }>;
  listCollections(): Promise<FirestoreTreeCollection[]>;
}

export async function countDescendantDocuments(
  root: FirestoreTreeDocument
): Promise<number> {
  let count = 0;
  for (const collection of await root.listCollections()) {
    for (const document of await collection.listDocuments()) {
      if ((await document.get()).exists) count++;
      count += await countDescendantDocuments(document);
    }
  }
  return count;
}

function countExactStringValues(value: unknown, target: string): number {
  if (value === target) return 1;
  if (Array.isArray(value)) {
    return value.reduce((sum, entry) => sum + countExactStringValues(entry, target), 0);
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>(
      (sum, entry) => sum + countExactStringValues(entry, target),
      0
    );
  }
  return 0;
}

export async function countEmbeddedValueReferences(
  root: FirestoreTreeCollection,
  target: string
): Promise<number> {
  let count = 0;
  for (const document of await root.listDocuments()) {
    const snapshot = await document.get();
    if (snapshot.exists) {
      if (!snapshot.data) {
        throw new Error('Reference enumeration returned an existing document without data.');
      }
      const data = snapshot.data();
      if (data === undefined) {
        throw new Error('Reference enumeration returned undefined document data.');
      }
      count += countExactStringValues(data, target);
    }
    for (const collection of await document.listCollections()) {
      count += await countEmbeddedValueReferences(collection, target);
    }
  }
  return count;
}

export function createFirestoreReferenceProbe(
  database: FirebaseFirestore.Firestore = adminDb
): CatalogReferenceProbe {
  return {
  async countPark(scope, parkId) {
    switch (scope) {
      case 'attractions':
        return collectionCount(database.collection('attractions').where('parkId', '==', parkId));
      case 'user-ride-logs':
        return collectionCount(database.collectionGroup('rideLogs').where('parkId', '==', parkId));
      case 'user-dining-logs-by-park':
        return collectionCount(database.collectionGroup('diningLogs').where('parkId', '==', parkId));
      case 'active-timers':
        return collectionCount(database.collectionGroup('activeTimer').where('parkId', '==', parkId));
      case 'trips':
        return collectionCount(database.collectionGroup('trips').where('parkIds', 'array-contains', parkId));
      case 'trip-days':
        return collectionCount(database.collectionGroup('days').where('parkIds', 'array-contains', parkId));
      case 'crowd-reports':
        return collectionCount(database.collection('crowdReports').where('parkId', '==', parkId));
      case 'crowd-calendar-embedded-park-ids':
        return countEmbeddedValueReferences(database.collection('crowdCalendar'), parkId);
      case 'wait-time-reports':
        return collectionCount(database.collection('waitTimeReports').where('parkId', '==', parkId));
      case 'park-operating-hours':
        return collectionCount(database.collection('parks').doc(parkId).collection('operatingHours'));
      case 'park-seasonal-schedules':
        return collectionCount(database.collection('parks').doc(parkId).collection('seasonalSchedules'));
      case 'park-nested-attractions':
        return collectionCount(database.collection('parks').doc(parkId).collection('attractions'));
      case 'park-current-wait-times':
        return collectionCount(database.collection('parks').doc(parkId).collection('currentWaitTimes'));
      case 'park-descendants':
        return countDescendantDocuments(database.collection('parks').doc(parkId));
      case 'wait-times-parent':
        return documentCount(database.collection('waitTimes').doc(parkId));
      case 'wait-times-current':
        return collectionCount(database.collection('waitTimes').doc(parkId).collection('current'));
      case 'wait-times-history':
        return collectionCount(database.collection('waitTimes').doc(parkId).collection('history'));
      case 'wait-times-descendants':
        return countDescendantDocuments(database.collection('waitTimes').doc(parkId));
      case 'wait-time-history-parent':
        return documentCount(database.collection('waitTimeHistory').doc(parkId));
      case 'wait-time-history-days':
        return collectionCount(database.collection('waitTimeHistory').doc(parkId).collection('daily'));
      case 'wait-time-history-descendants':
        return countDescendantDocuments(database.collection('waitTimeHistory').doc(parkId));
      case 'forecast-aggregates-parent':
        return documentCount(database.collection('forecastAggregates').doc(parkId));
      case 'forecast-aggregate-days':
        return collectionCount(database.collection('forecastAggregates').doc(parkId).collection('byDayOfWeek'));
      case 'forecast-aggregates-descendants':
        return countDescendantDocuments(database.collection('forecastAggregates').doc(parkId));
      case 'park-schedules-parent':
        return documentCount(database.collection('parkSchedules').doc(parkId));
      case 'park-schedule-days':
        return collectionCount(database.collection('parkSchedules').doc(parkId).collection('daily'));
      case 'park-schedules-descendants':
        return countDescendantDocuments(database.collection('parkSchedules').doc(parkId));
      case 'crowdsourced-parent':
        return documentCount(database.collection('crowdsourcedWaitTimes').doc(parkId));
      case 'crowdsourced-reports':
        return collectionCount(database.collection('crowdsourcedWaitTimes').doc(parkId).collection('reports'));
      case 'crowdsourced-aggregates':
        return collectionCount(database.collection('crowdsourcedWaitTimes').doc(parkId).collection('aggregates'));
      case 'crowdsourced-descendants':
        return countDescendantDocuments(database.collection('crowdsourcedWaitTimes').doc(parkId));
    }
  },
  async countAttraction(scope, attraction) {
    if (!attraction.parkId) {
      throw new Error('Stored attraction has no parkId; reference ownership is unresolved.');
    }
    switch (scope) {
      case 'user-ride-logs':
        return collectionCount(
          database.collectionGroup('rideLogs').where('attractionId', '==', attraction.docId)
        );
      case 'user-dining-logs-by-child':
        return collectionCount(
          database.collectionGroup('diningLogs').where('restaurantId', '==', attraction.docId)
        );
      case 'active-timers':
        return collectionCount(
          database.collectionGroup('activeTimer').where('attractionId', '==', attraction.docId)
        );
      case 'crowd-reports':
        return collectionCount(
          database.collection('crowdReports').where('attractionId', '==', attraction.docId)
        );
      case 'wait-time-reports':
        return collectionCount(
          database.collection('waitTimeReports').where('attractionId', '==', attraction.docId)
        );
      case 'current-wait-time':
        return documentCount(
          database
            .collection('waitTimes')
            .doc(attraction.parkId)
            .collection('current')
            .doc(attraction.docId)
        );
      case 'crowdsourced-reports':
        return collectionCount(
          database
            .collection('crowdsourcedWaitTimes')
            .doc(attraction.parkId)
            .collection('reports')
            .where('attractionId', '==', attraction.docId)
        );
      case 'crowdsourced-aggregate':
        return documentCount(
          database
            .collection('crowdsourcedWaitTimes')
            .doc(attraction.parkId)
            .collection('aggregates')
            .doc(attraction.docId)
        );
      case 'nested-history-and-forecast':
        throw new Error(
          'Nested wait-time history and forecast documents have no queryable attractionId; ' +
            'child retirement evidence remains unresolved and review-only.'
        );
    }
  },
  };
}

const firestoreReferenceProbe = createFirestoreReferenceProbe();

async function runReferenceChecks<TScope extends string>(
  scopes: readonly TScope[],
  counter: (scope: TScope) => Promise<number>
): Promise<ReferenceCheck[]> {
  const checks: ReferenceCheck[] = [];
  for (const scope of scopes) {
    try {
      checks.push({ scope, count: await counter(scope), complete: true });
    } catch (error) {
      checks.push({
        scope,
        count: 0,
        complete: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return checks;
}

export async function auditRetiredIdentityReferences(
  parkIds: string[],
  probe: CatalogReferenceProbe = firestoreReferenceProbe
): Promise<IdentityReferenceAudit[]> {
  const audits: IdentityReferenceAudit[] = [];

  for (const parkId of [...parkIds].sort()) {
    const checks = await runReferenceChecks(PARK_REFERENCE_SCOPES, (scope) =>
      probe.countPark(scope, parkId)
    );
    audits.push({
      parkId,
      checks,
      blockingDocumentCount: checks.reduce((sum, check) => sum + check.count, 0),
      complete: checks.every((check) => check.complete),
    });
  }
  return audits;
}

export async function auditAttractionReferences(
  attractions: AttractionRetireAction[],
  probe: CatalogReferenceProbe = firestoreReferenceProbe
): Promise<AttractionReferenceAudit[]> {
  if (attractions.length > MAX_ATTRACTION_REFERENCE_AUDITS) {
    return [...attractions]
      .sort((left, right) => left.docId.localeCompare(right.docId))
      .map((attraction) => ({
        attractionId: attraction.docId,
        parkId: attraction.parkId,
        checks: [
          {
            scope: 'reference-audit-quota',
            count: 0,
            complete: false,
            error:
              `${attractions.length} candidates exceed the bounded reference-audit quota of ` +
              `${MAX_ATTRACTION_REFERENCE_AUDITS}; retirement evidence is review-only.`,
          },
        ],
        blockingDocumentCount: 0,
        complete: false,
      }));
  }
  const audits: AttractionReferenceAudit[] = [];
  for (const attraction of [...attractions].sort((left, right) =>
    left.docId.localeCompare(right.docId)
  )) {
    const checks = await runReferenceChecks(ATTRACTION_REFERENCE_SCOPES, (scope) =>
      probe.countAttraction(scope, attraction)
    );
    audits.push({
      attractionId: attraction.docId,
      parkId: attraction.parkId,
      checks,
      blockingDocumentCount: checks.reduce((sum, check) => sum + check.count, 0),
      complete: checks.every((check) => check.complete),
    });
  }
  return audits;
}

function hasExactChecks(
  checks: ReferenceCheck[],
  requiredScopes: readonly string[],
  blockingDocumentCount: number,
  complete: boolean
): boolean {
  const scopes = checks.map((check) => check.scope);
  return (
    complete &&
    checks.length === requiredScopes.length &&
    new Set(scopes).size === requiredScopes.length &&
    requiredScopes.every((scope) => scopes.includes(scope)) &&
    checks.every(
      (check) =>
        check.complete &&
        Number.isSafeInteger(check.count) &&
        check.count >= 0 &&
        check.error === undefined
    ) &&
    checks.reduce((sum, check) => sum + check.count, 0) === blockingDocumentCount
  );
}

export function hasCompleteRetirementReferenceEvidence(
  manifest: CatalogManifest
): boolean {
  const parkIds = manifest.parks.retire.map((action) => action.docId);
  const attractionIds = manifest.attractions.retire.map((action) => action.docId);
  if (
    new Set(parkIds).size !== parkIds.length ||
    new Set(attractionIds).size !== attractionIds.length ||
    manifest.references.length !== parkIds.length ||
    manifest.attractionReferences.length !== attractionIds.length
  ) {
    return false;
  }
  const parkAudits = new Map(manifest.references.map((audit) => [audit.parkId, audit]));
  const attractionAudits = new Map(
    manifest.attractionReferences.map((audit) => [audit.attractionId, audit])
  );
  if (
    parkAudits.size !== manifest.references.length ||
    attractionAudits.size !== manifest.attractionReferences.length
  ) {
    return false;
  }
  return (
    parkIds.every((parkId) => {
      const audit = parkAudits.get(parkId);
      return (
        !!audit &&
        hasExactChecks(
          audit.checks,
          PARK_REFERENCE_SCOPES,
          audit.blockingDocumentCount,
          audit.complete
        )
      );
    }) &&
    attractionIds.every((attractionId) => {
      const audit = attractionAudits.get(attractionId);
      return (
        !!audit &&
        hasExactChecks(
          audit.checks,
          ATTRACTION_REFERENCE_SCOPES,
          audit.blockingDocumentCount,
          audit.complete
        )
      );
    })
  );
}

export function assertSafeUpsertManifest(manifest: CatalogManifest): void {
  if (!manifest.source.registryMatchesAuthoritativeModel) {
    throw new Error('Upsert apply blocked: canonical registry counts drifted from the approved model.');
  }
  if (!manifest.source.childCatalogCompleteness.complete) {
    throw new Error(
      `Upsert apply blocked: reviewed child-catalog completeness failed. ` +
        `${manifest.source.childCatalogCompleteness.reason ?? 'Evidence is incomplete.'}`
    );
  }
  if (!manifest.source.complete || manifest.source.upstreamFetchFailures.length > 0) {
    throw new Error('Upsert apply blocked: upstream preflight is incomplete.');
  }
  if (manifest.source.identityMismatches.length > 0) {
    throw new Error('Upsert apply blocked: upstream identity or ownership proof failed.');
  }
  if (manifest.attractions.duplicateUpstreamIds.length > 0) {
    throw new Error('Upsert apply blocked: attraction ownership is ambiguous.');
  }
  const invalidWriteAction = [
    ...manifest.parks.updates,
    ...manifest.attractions.upsert,
  ].find(
    (action) =>
      action.writeTimestamp !== manifest.generatedAt ||
      Number.isNaN(new Date(action.writeTimestamp).getTime())
  );
  if (invalidWriteAction) {
    throw new Error(
      `Upsert apply blocked: action ${invalidWriteAction.docId} is not bound to the reviewed ` +
        'manifest write timestamp.'
    );
  }
  const inconsistentPhase = manifest.migration.upsertPhases.find(
    (phase) => phase.pendingActionCount !== phaseActions(manifest, phase.id).length
  );
  if (inconsistentPhase) {
    throw new Error(
      `Upsert apply blocked: phase ${inconsistentPhase.id} pending-action metadata is stale.`
    );
  }
  const oversizedPhase = manifest.migration.upsertPhases.find(
    (phase) =>
      phase.targetDocumentCount > MAX_ATOMIC_WRITE_ACTIONS ||
      phase.pendingActionCount > MAX_ATOMIC_WRITE_ACTIONS
  );
  if (oversizedPhase) {
    throw new Error(
      `Upsert apply blocked: deterministic phase ${oversizedPhase.id} exceeds the ` +
        `${MAX_ATOMIC_WRITE_ACTIONS}-action limit and requires a newly reviewed shard plan.`
    );
  }
}

export function assertSafeUpsertPhase(
  manifest: CatalogManifest,
  phaseId: string
): CatalogUpsertPhase {
  assertSafeUpsertManifest(manifest);
  const phase = manifest.migration.upsertPhases.find((candidate) => candidate.id === phaseId);
  if (!phase) throw new Error(`Upsert apply blocked: unknown migration phase ${phaseId}.`);
  const currentDigest = computeUpsertPhaseApprovalDigest(manifest, phaseId);
  if (phase.approvalDigest !== currentDigest) {
    throw new Error(
      `Upsert apply blocked: phase ${phaseId} approval digest is stale for the current actions ` +
        'or Firestore preconditions.'
    );
  }
  if (
    phase.kind === 'attractions' &&
    manifest.parks.updates.some((action) => action.phaseId === 'parks')
  ) {
    throw new Error(
      'Upsert apply blocked: the parks phase must converge before any attraction phase.'
    );
  }
  return phase;
}

async function commitOperationsAtomically(
  operations: Array<(batch: FirebaseFirestore.WriteBatch) => void>
): Promise<void> {
  if (operations.length > MAX_ATOMIC_WRITE_ACTIONS) {
    throw new Error(
      `Apply blocked: ${operations.length} writes exceed the atomic quota of ` +
        `${MAX_ATOMIC_WRITE_ACTIONS}. Narrow the reviewed manifest; no writes started.`
    );
  }
  if (operations.length === 0) return;
  const batch = adminDb.batch();
  for (const operation of operations) operation(batch);
  await batch.commit();
}

function requiredLastUpdateTime(
  precondition: FirestoreWritePrecondition,
  label: string
): Timestamp {
  if (!precondition.exists || !precondition.updateTime) {
    throw new Error(
      `Apply blocked: ${label} lacks the current Firestore update-time precondition.`
    );
  }
  if (!isFirestoreTimestampValue(precondition.updateTime)) {
    throw new Error(`Apply blocked: ${label} has a malformed Firestore update-time precondition.`);
  }
  return new Timestamp(
    precondition.updateTime.seconds,
    precondition.updateTime.nanoseconds
  );
}

export async function applyUpserts(
  manifest: CatalogManifest,
  phaseId: string
): Promise<void> {
  assertSafeUpsertPhase(manifest, phaseId);
  const operations: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
  for (const action of manifest.parks.updates.filter(
    (candidate) => candidate.phaseId === phaseId
  )) {
    operations.push((batch) => {
      const reference = adminDb.collection('parks').doc(action.docId);
      const updatedAt = Timestamp.fromDate(new Date(action.writeTimestamp));
      if (action.mode === 'create') {
        if (action.precondition.exists) {
          throw new Error(`Apply blocked: park create ${action.docId} expected document absence.`);
        }
        batch.create(reference, { ...action.data, updatedAt });
        return;
      }
      batch.update(
        reference,
        { ...action.data, updatedAt },
        {
          lastUpdateTime: requiredLastUpdateTime(
            action.precondition,
            `park update ${action.docId}`
          ),
        }
      );
    });
  }
  for (const action of manifest.attractions.upsert.filter(
    (candidate) => candidate.phaseId === phaseId
  )) {
    operations.push((batch) => {
      const reference = adminDb.collection('attractions').doc(action.docId);
      const updatedAt = Timestamp.fromDate(new Date(action.writeTimestamp));
      if (action.mode === 'create') {
        if (action.precondition.exists) {
          throw new Error(
            `Apply blocked: attraction create ${action.docId} expected document absence.`
          );
        }
        batch.create(reference, { ...action.data, updatedAt });
        return;
      }
      batch.update(
        reference,
        { ...action.data, updatedAt },
        {
          lastUpdateTime: requiredLastUpdateTime(
            action.precondition,
            `attraction update ${action.docId}`
          ),
        }
      );
    });
  }
  await commitOperationsAtomically(operations);
}

export function formatCatalogManifest(manifest: CatalogManifest): string {
  return [
    '=== Firestore park/attraction catalog reconciliation ===',
    `Firestore parks:                ${manifest.source.firestoreParkDocuments}`,
    `Validated canonical park rows: ${manifest.source.upstreamParkEntities}`,
    `Raw upstream enumerated ids:    ${manifest.source.rawUpstreamParkEntities}`,
    `Canonical upstream parks:       ${manifest.source.canonicalUpstreamParkEntities}`,
    `Registry model:                 ${manifest.source.registryFamilies} families / ` +
      `${manifest.source.registryDestinations} destinations / ${manifest.source.registryParks} parks`,
    `Approved canonical children:    ${AUTHORITATIVE_CATALOG_MODEL.canonicalChildEntities}`,
    `Duplicate park slugs:           ${manifest.parks.duplicateSlugs.length}`,
    `Stale park documents:           ${manifest.parks.staleDocuments.length}`,
    `Park retire candidates (review): ${manifest.parks.retire.length}`,
    `Park creates:                   ${
      manifest.parks.updates.filter((action) => action.mode === 'create').length
    }`,
    `Park updates:                   ${
      manifest.parks.updates.filter((action) => action.mode === 'update').length
    }`,
    `Firestore attractions:          ${manifest.source.firestoreAttractionDocuments}`,
    `Current upstream attractions:   ${manifest.source.upstreamAttractionEntities}`,
    `Reviewed child baseline:        ${manifest.source.childCatalogCompleteness.review.reviewedChildEntities} ` +
      `(growth allowed)`,
    `Validated child feeds:          ${manifest.source.childCatalogCompleteness.validatedFeeds}/` +
      `${manifest.source.childCatalogCompleteness.expectedFeeds}`,
    `Child completeness:             ${
      manifest.source.childCatalogCompleteness.complete ? 'yes' : 'NO'
    }`,
    `Attraction upserts:             ${manifest.attractions.upsert.length}`,
    `Child retire candidates (review): ${manifest.attractions.retire.length}`,
    `Attraction review-only records: ${manifest.attractions.review.length}`,
    `Upstream fetch failures:        ${manifest.source.upstreamFetchFailures.length}`,
    `Identity mismatches:             ${manifest.source.identityMismatches.length}`,
    `Preflight complete:              ${manifest.source.complete ? 'yes' : 'NO'}`,
    `Migration manifest:              ${manifest.migration.id}`,
    `Deterministic upsert phases:      ${manifest.migration.upsertPhases.length}`,
    ...manifest.migration.upsertPhases.map(
      (phase) =>
        `  ${phase.id}: ${phase.pendingActionCount} pending / ` +
        `${phase.targetDocumentCount} authoritative documents / digest ${phase.approvalDigest}`
    ),
    'Automatic deletion:              DISABLED',
    `Retirement references complete:  ${
      manifest.migration.retirementReview.referenceEvidenceComplete ? 'yes' : 'NO'
    }`,
    '',
    ...(manifest.applied
      ? [
          `Applied upsert phase ${manifest.applied.phaseId}: ` +
            `${manifest.applied.parkUpserts} park and ` +
            `${manifest.applied.attractionUpserts} child upsert(s).`,
          `Applied reviewed migration manifest ${manifest.applied.manifestId}.`,
          `Applied state-bound approval digest ${manifest.applied.approvalDigest}.`,
        ]
      : [
          'Dry run only. Use --json --manifest-file <path> to persist the exact review artifact.',
          'Upserts require --apply-upserts --yes --manifest-file <path> --manifest-id <id> ' +
            '--phase <phase-id> --phase-digest <digest>.',
          'Retire candidates and reference audits are review-only; this tool cannot delete.',
        ]),
    `Each phase is one atomic batch and is limited to ${MAX_ATOMIC_WRITE_ACTIONS} actions.`,
  ].join('\n');
}

export interface CatalogReconcileIo {
  out(line: string): void;
  err(line: string): void;
}

const consoleIo: CatalogReconcileIo = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

export function formatSafeCatalogDiagnostic(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(
      /\b(token|secret|password|api[-_]?key|credential)\s*[:=]\s*\S+/gi,
      '$1=[redacted]'
    )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300) || 'unknown error';
}

export interface RunCatalogReconcileCliOptions {
  argv: string[];
  loadManifest: () => Promise<CatalogManifest>;
  loadManifestArtifact?: (artifactPath: string) => Promise<CatalogManifest>;
  saveManifestArtifact?: (
    artifactPath: string,
    manifest: CatalogManifest
  ) => Promise<void>;
  applyUpsertManifest?: (manifest: CatalogManifest, phaseId: string) => Promise<void>;
  io?: CatalogReconcileIo;
}

function optionValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function phaseActionCount(manifest: CatalogManifest, phaseId: string): number {
  return (
    manifest.parks.updates.filter((action) => action.phaseId === phaseId).length +
    manifest.attractions.upsert.filter((action) => action.phaseId === phaseId).length
  );
}

export async function runCatalogReconcileCli(
  options: RunCatalogReconcileCliOptions
): Promise<number> {
  const args = new Set(options.argv);
  const json = args.has('--json');
  const applyUpsertMode = args.has('--apply-upserts');
  const requestedDeleteMode = args.has('--apply-deletes');
  const confirmed = args.has('--yes');
  const requestedManifestId = optionValue(options.argv, '--manifest-id');
  const requestedManifestFile = optionValue(options.argv, '--manifest-file');
  const requestedPhaseId = optionValue(options.argv, '--phase');
  const requestedPhaseDigest = optionValue(options.argv, '--phase-digest');
  const requestedDeleteDigest = optionValue(options.argv, '--delete-digest');
  const io = options.io ?? consoleIo;

  if (requestedDeleteMode || requestedDeleteDigest) {
    io.err(
      'Automatic deletion is disabled. --apply-deletes and --delete-digest are unsupported; ' +
        'retire candidates and reference audits are review-only.'
    );
    return 1;
  }
  if (applyUpsertMode && !confirmed) {
    io.err('Apply modes require explicit --yes confirmation after reviewing a dry run.');
    return 1;
  }
  if (confirmed && !applyUpsertMode) {
    io.err('Refusing --yes without an explicit apply mode.');
    return 1;
  }
  if (applyUpsertMode && !requestedPhaseId) {
    io.err('Upsert apply requires an explicit deterministic --phase <phase-id>.');
    return 1;
  }
  if (applyUpsertMode && !requestedPhaseDigest) {
    io.err('Upsert apply requires --phase-digest <digest> from the reviewed dry run.');
    return 1;
  }
  if (applyUpsertMode && !requestedManifestId) {
    io.err('Apply requires --manifest-id <id> from the reviewed dry-run manifest.');
    return 1;
  }
  if (applyUpsertMode && !requestedManifestFile) {
    io.err(
      'Apply requires --manifest-file <path> containing the exact reviewed dry-run artifact.'
    );
    return 1;
  }

  let manifest: CatalogManifest;
  try {
    if (applyUpsertMode) {
      if (!options.loadManifestArtifact) {
        io.err('Apply blocked: no reviewed manifest artifact loader was provided.');
        return 1;
      }
      manifest = await options.loadManifestArtifact(requestedManifestFile!);
    } else {
      manifest = await options.loadManifest();
      if (requestedManifestFile) {
        if (!options.saveManifestArtifact) {
          io.err('Dry run failed: no manifest artifact writer was provided.');
          return 1;
        }
        await options.saveManifestArtifact(requestedManifestFile, manifest);
      }
    }
  } catch (error) {
    io.err(`Manifest load failed: ${formatSafeCatalogDiagnostic(error)}`);
    return 1;
  }

  try {
    if (
      applyUpsertMode &&
      requestedManifestId !== manifest.migration.id
    ) {
      io.err(
        `Apply blocked: reviewed manifest id does not match current manifest ` +
          `${manifest.migration.id}; no writes started.`
      );
      return 1;
    }
    if (applyUpsertMode) {
      const phaseId = requestedPhaseId!;
      const phase = assertSafeUpsertPhase(manifest, phaseId);
      if (requestedPhaseDigest !== phase.approvalDigest) {
        io.err(
          `Apply blocked: reviewed phase digest does not match current phase ${phaseId} actions ` +
            'and Firestore preconditions; no writes started.'
        );
        return 1;
      }
      const writes = phaseActionCount(manifest, phaseId);
      if (writes > MAX_ATOMIC_WRITE_ACTIONS) {
        io.err(
          `Apply blocked: phase ${phaseId} has ${writes} writes exceeding the atomic quota of ` +
            `${MAX_ATOMIC_WRITE_ACTIONS}; no writes started.`
        );
        return 1;
      }
      if (!options.applyUpsertManifest) {
        io.err('Apply blocked: no upsert store was provided.');
        return 1;
      }
      await options.applyUpsertManifest(manifest, phaseId);
    }
  } catch (error) {
    io.err(formatSafeCatalogDiagnostic(error));
    return 1;
  }
  if (applyUpsertMode) {
    const phaseId = requestedPhaseId!;
    manifest.applied = {
      mode: 'upserts',
      manifestId: manifest.migration.id,
      approvalDigest: manifest.migration.upsertPhases.find(
        (candidate) => candidate.id === phaseId
      )!.approvalDigest,
      phaseId,
      parkUpserts: manifest.parks.updates.filter(
        (action) => action.phaseId === phaseId
      ).length,
      attractionUpserts: manifest.attractions.upsert.filter(
        (action) => action.phaseId === phaseId
      ).length,
    };
  }

  if (json) io.out(JSON.stringify(manifest, null, 2));
  else io.out(formatCatalogManifest(manifest));
  return 0;
}

export async function buildLiveCatalogManifest(
  options: FetchUpstreamCatalogOptions & {
    clock?: () => Date;
    referenceProbe?: CatalogReferenceProbe;
  } = {}
): Promise<CatalogManifest> {
  const [firestore, upstream] = await Promise.all([
    readFirestoreCatalog(),
    fetchUpstreamCatalog(options),
  ]);
  const manifest = buildCatalogManifest({
    ...firestore,
    upstreamParks: upstream.parks,
    rawUpstreamParkIds: upstream.rawUpstreamParkIds,
    rawUpstreamCatalogComplete: upstream.rawUpstreamCatalogComplete,
    upstreamAttractions: upstream.attractions,
    upstreamFetchFailures: upstream.failures,
    upstreamIdentityMismatches: upstream.identityMismatches,
    upstreamCompleteness: upstream.completeness,
    generatedAt: (options.clock ?? (() => new Date()))().toISOString(),
  });
  const probe = options.referenceProbe ?? firestoreReferenceProbe;
  manifest.references = await auditRetiredIdentityReferences(
    manifest.parks.retire.map((action) => action.docId),
    probe
  );
  manifest.attractionReferences = await auditAttractionReferences(
    manifest.attractions.retire,
    probe
  );
  return bindCatalogApprovalDigests(manifest);
}

export async function loadCatalogManifestArtifact(
  artifactPath: string
): Promise<CatalogManifest> {
  return JSON.parse(
    await readFile(path.resolve(artifactPath), 'utf8')
  ) as CatalogManifest;
}

export async function saveCatalogManifestArtifact(
  artifactPath: string,
  manifest: CatalogManifest
): Promise<void> {
  await writeFile(
    path.resolve(artifactPath),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
}

export async function runLiveCatalogReconcile(argv: string[]): Promise<number> {
  return runCatalogReconcileCli({
    argv,
    loadManifest: () => buildLiveCatalogManifest(),
    loadManifestArtifact: loadCatalogManifestArtifact,
    saveManifestArtifact: saveCatalogManifestArtifact,
    applyUpsertManifest: applyUpserts,
  });
}

async function main(): Promise<void> {
  process.exitCode = await runLiveCatalogReconcile(process.argv.slice(2));
}

const isDirectlyExecuted =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectlyExecuted) {
  main().catch((error) => {
    console.error(`Park catalog reconciliation failed: ${formatSafeCatalogDiagnostic(error)}`);
    process.exit(1);
  });
}
