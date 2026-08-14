import { createHash } from 'node:crypto';
import reviewedChildCatalog from './data/themeparks-wiki-canonical-children-2026-08-14.json';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

export const REVIEWED_CHILD_CATALOG_ID =
  'themeparks-wiki-canonical-children-2026-08-14';
export const EXPECTED_REVIEWED_CHILD_IDENTITY_SHA256 =
  '1e91879dc1c836f73c7e46e745a583b22726247c91c4a7750ccd22f3ef3a5a89';
export const THEMEPARKS_WIKI_API_BASE = 'https://api.themeparks.wiki/v1';
export const REVIEWED_CHILD_BASELINE_SCRIPT =
  'scripts/generate-catalog-child-baseline.ts';
export const REVIEWED_CHILD_BASELINE_COMMAND =
  'npm run generate:catalog-child-baseline -- --write scripts/data/themeparks-wiki-canonical-children-2026-08-14.json';

export interface ReviewedChildCatalogBaseline {
  id: string;
  reviewedAt: string;
  parkChildIds: Readonly<Record<string, readonly string[]>>;
  growthPolicy: 'allow';
  shrinkPolicy: 'block-until-reviewed';
}

export interface ReviewedChildFeedEvidence {
  endpoint: string;
  retrievedAt: string;
  childCount: number;
  identitySha256: string;
}

export interface ReviewedChildCatalogArtifact extends ReviewedChildCatalogBaseline {
  generatedAt: string;
  expectedIdentitySha256: string;
  source: {
    provider: 'ThemeParks.wiki';
    apiBase: string;
    destinationsEndpoint: string;
    childEndpointTemplate: string;
    retrievalStartedAt: string;
    retrievalCompletedAt: string;
  };
  generator: {
    script: string;
    command: string;
  };
  feedEvidence: Readonly<Record<string, ReviewedChildFeedEvidence>>;
}

export interface ReviewedChildCatalogSummary {
  id: string;
  reviewedAt: string;
  generatedAt?: string;
  sourceRetrievalStartedAt?: string;
  sourceRetrievalCompletedAt?: string;
  reviewedParks: number;
  reviewedChildEntities: number;
  identitySha256: string;
  expectedIdentitySha256?: string;
  verifiedFeedEvidence?: number;
  generatorCommand?: string;
  growthPolicy: 'allow';
  shrinkPolicy: 'block-until-reviewed';
}

export interface ChildCatalogParkEvidence {
  parkId: string;
  reviewedChildEntities: number;
  observedChildEntities: number;
  missingReviewedChildEntities: number;
}

export interface ChildCatalogCompletenessEvidence {
  review: ReviewedChildCatalogSummary;
  expectedFeeds: number;
  validatedFeeds: number;
  observedChildEntities: number;
  parksMissingReviewedBaseline: string[];
  reviewedParksMissingFromCatalog: string[];
  missingReviewedChildIdentities: Array<{ parkId: string; childIds: string[] }>;
  perPark: ChildCatalogParkEvidence[];
  complete: boolean;
  reason?: string;
}

function sortedBaselineEntries(
  baseline: ReviewedChildCatalogBaseline
): Array<[string, readonly string[]]> {
  return Object.entries(baseline.parkChildIds)
    .map(
      ([parkId, childIds]): [string, readonly string[]] => [
        parkId,
        [...childIds].sort(),
      ]
    )
    .sort(([left], [right]) => left.localeCompare(right));
}

export function computeChildFeedIdentitySha256(childIds: readonly string[]): string {
  return createHash('sha256').update([...childIds].sort().join('\n')).digest('hex');
}

export function computeChildCatalogIdentitySha256(
  parkChildIds: Readonly<Record<string, readonly string[]>>
): string {
  return createHash('sha256')
    .update(
      Object.entries(parkChildIds)
        .map(
          ([parkId, childIds]): [string, readonly string[]] => [
            parkId,
            [...childIds].sort(),
          ]
        )
        .sort(([left], [right]) => left.localeCompare(right))
        .flatMap(([parkId, childIds]) => childIds.map((childId) => `${parkId}:${childId}`))
        .join('\n')
    )
    .digest('hex');
}

export function summarizeChildCatalogBaseline(
  baseline: ReviewedChildCatalogBaseline
): ReviewedChildCatalogSummary {
  const entries = sortedBaselineEntries(baseline);
  const artifact = baseline as Partial<ReviewedChildCatalogArtifact>;
  const identitySha256 = computeChildCatalogIdentitySha256(baseline.parkChildIds);
  return {
    id: baseline.id,
    reviewedAt: baseline.reviewedAt,
    ...(artifact.generatedAt ? { generatedAt: artifact.generatedAt } : {}),
    ...(artifact.source?.retrievalStartedAt
      ? { sourceRetrievalStartedAt: artifact.source.retrievalStartedAt }
      : {}),
    ...(artifact.source?.retrievalCompletedAt
      ? { sourceRetrievalCompletedAt: artifact.source.retrievalCompletedAt }
      : {}),
    reviewedParks: entries.length,
    reviewedChildEntities: entries.reduce((sum, [, childIds]) => sum + childIds.length, 0),
    identitySha256,
    ...(artifact.expectedIdentitySha256
      ? { expectedIdentitySha256: artifact.expectedIdentitySha256 }
      : {}),
    ...(artifact.feedEvidence
      ? { verifiedFeedEvidence: Object.keys(artifact.feedEvidence).length }
      : {}),
    ...(artifact.generator?.command
      ? { generatorCommand: artifact.generator.command }
      : {}),
    growthPolicy: baseline.growthPolicy,
    shrinkPolicy: baseline.shrinkPolicy,
  };
}

export function evaluateChildCatalogCompleteness(
  baseline: ReviewedChildCatalogBaseline,
  expectedParkIds: readonly string[],
  observedChildIdsByPark: ReadonlyMap<string, readonly string[]>
): ChildCatalogCompletenessEvidence {
  const expectedIds = [...new Set(expectedParkIds)].sort();
  const expectedIdSet = new Set(expectedIds);
  const baselineEntries = sortedBaselineEntries(baseline);
  const parksMissingReviewedBaseline = expectedIds.filter(
    (parkId) => !(parkId in baseline.parkChildIds)
  );
  const reviewedParksMissingFromCatalog = baselineEntries
    .map(([parkId]) => parkId)
    .filter((parkId) => !expectedIdSet.has(parkId));
  const missingReviewedChildIdentities: Array<{ parkId: string; childIds: string[] }> = [];
  const perPark: ChildCatalogParkEvidence[] = [];

  for (const parkId of expectedIds) {
    const reviewedIds = [...(baseline.parkChildIds[parkId] ?? [])].sort();
    const observedIds = [...(observedChildIdsByPark.get(parkId) ?? [])].sort();
    const observedIdSet = new Set(observedIds);
    const missingIds = reviewedIds.filter((childId) => !observedIdSet.has(childId));
    if (missingIds.length > 0) {
      missingReviewedChildIdentities.push({ parkId, childIds: missingIds });
    }
    perPark.push({
      parkId,
      reviewedChildEntities: reviewedIds.length,
      observedChildEntities: observedIds.length,
      missingReviewedChildEntities: missingIds.length,
    });
  }

  const validatedFeeds = expectedIds.filter((parkId) =>
    observedChildIdsByPark.has(parkId)
  ).length;
  const observedChildEntities = expectedIds.reduce(
    (sum, parkId) => sum + (observedChildIdsByPark.get(parkId)?.length ?? 0),
    0
  );
  let reason: string | undefined;
  if (validatedFeeds !== expectedIds.length) {
    reason =
      `Only ${validatedFeeds} of ${expectedIds.length} canonical child feeds passed ` +
      'response-shape and identity validation.';
  } else if (parksMissingReviewedBaseline.length > 0) {
    reason =
      `Reviewed child baseline ${baseline.id} has no pinned identities for canonical park(s): ` +
      `${parksMissingReviewedBaseline.join(', ')}.`;
  } else if (reviewedParksMissingFromCatalog.length > 0) {
    reason =
      `Reviewed child baseline ${baseline.id} contains park(s) outside the canonical catalog: ` +
      `${reviewedParksMissingFromCatalog.join(', ')}.`;
  } else if (missingReviewedChildIdentities.length > 0) {
    const missingCount = missingReviewedChildIdentities.reduce(
      (sum, park) => sum + park.childIds.length,
      0
    );
    reason =
      `Observed child feeds are missing ${missingCount} reviewed identity/identities from ` +
      `${baseline.id}. Additive growth is allowed; any missing reviewed identity requires a ` +
      'new reviewed baseline.';
  }

  return {
    review: summarizeChildCatalogBaseline(baseline),
    expectedFeeds: expectedIds.length,
    validatedFeeds,
    observedChildEntities,
    parksMissingReviewedBaseline,
    reviewedParksMissingFromCatalog,
    missingReviewedChildIdentities,
    perPark,
    complete: reason === undefined,
    ...(reason ? { reason } : {}),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireTimestamp(value: unknown, label: string): string {
  const timestamp = requireString(value, label);
  if (Number.isNaN(new Date(timestamp).getTime())) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }
  return timestamp;
}

export function validateReviewedChildCatalogArtifact(
  value: unknown
): ReviewedChildCatalogArtifact {
  const raw = requireRecord(value, 'Reviewed child baseline');
  const id = requireString(raw.id, 'Reviewed child baseline id');
  if (id !== REVIEWED_CHILD_CATALOG_ID) {
    throw new Error(`Reviewed child baseline id must be ${REVIEWED_CHILD_CATALOG_ID}.`);
  }
  const reviewedAt = requireString(raw.reviewedAt, 'Reviewed child baseline reviewedAt');
  const generatedAt = requireTimestamp(
    raw.generatedAt,
    'Reviewed child baseline generatedAt'
  );
  const expectedIdentitySha256 = requireString(
    raw.expectedIdentitySha256,
    'Reviewed child baseline expectedIdentitySha256'
  );
  if (
    !SHA256_RE.test(expectedIdentitySha256) ||
    expectedIdentitySha256 !== EXPECTED_REVIEWED_CHILD_IDENTITY_SHA256
  ) {
    throw new Error(
      `Reviewed child baseline expectedIdentitySha256 must equal the reviewed full digest ` +
        `${EXPECTED_REVIEWED_CHILD_IDENTITY_SHA256}.`
    );
  }

  const source = requireRecord(raw.source, 'Reviewed child baseline source');
  if (source.provider !== 'ThemeParks.wiki') {
    throw new Error('Reviewed child baseline source provider must be ThemeParks.wiki.');
  }
  if (source.apiBase !== THEMEPARKS_WIKI_API_BASE) {
    throw new Error(`Reviewed child baseline API base must be ${THEMEPARKS_WIKI_API_BASE}.`);
  }
  const destinationsEndpoint = `${THEMEPARKS_WIKI_API_BASE}/destinations`;
  const childEndpointTemplate = `${THEMEPARKS_WIKI_API_BASE}/entity/{parkId}/children`;
  if (
    source.destinationsEndpoint !== destinationsEndpoint ||
    source.childEndpointTemplate !== childEndpointTemplate
  ) {
    throw new Error('Reviewed child baseline source endpoint metadata is not canonical.');
  }
  const retrievalStartedAt = requireTimestamp(
    source.retrievalStartedAt,
    'Reviewed child baseline source retrievalStartedAt'
  );
  const retrievalCompletedAt = requireTimestamp(
    source.retrievalCompletedAt,
    'Reviewed child baseline source retrievalCompletedAt'
  );
  if (
    new Date(retrievalCompletedAt).getTime() < new Date(retrievalStartedAt).getTime() ||
    new Date(generatedAt).getTime() < new Date(retrievalCompletedAt).getTime()
  ) {
    throw new Error('Reviewed child baseline retrieval/generation timestamps are inconsistent.');
  }

  const generator = requireRecord(raw.generator, 'Reviewed child baseline generator');
  if (
    generator.script !== REVIEWED_CHILD_BASELINE_SCRIPT ||
    generator.command !== REVIEWED_CHILD_BASELINE_COMMAND
  ) {
    throw new Error('Reviewed child baseline generator metadata is not reproducible.');
  }

  const parksRecord = requireRecord(raw.parks, 'Reviewed child baseline parks');
  const feedEvidenceRecord = requireRecord(
    raw.feedEvidence,
    'Reviewed child baseline feedEvidence'
  );
  const parks: Record<string, string[]> = {};
  const feedEvidence: Record<string, ReviewedChildFeedEvidence> = {};
  const seenChildIds = new Set<string>();
  for (const [parkId, childIdsValue] of Object.entries(parksRecord)) {
    if (!UUID_RE.test(parkId)) {
      throw new Error(`Reviewed child baseline contains invalid park UUID ${parkId}.`);
    }
    if (!Array.isArray(childIdsValue) || !childIdsValue.every((id) => typeof id === 'string')) {
      throw new Error(`Reviewed child baseline park ${parkId} must contain a child-id array.`);
    }
    const childIds = childIdsValue as string[];
    if (new Set(childIds).size !== childIds.length) {
      throw new Error(`Reviewed child baseline duplicates a child UUID within park ${parkId}.`);
    }
    if ([...childIds].sort().some((childId, index) => childId !== childIds[index])) {
      throw new Error(`Reviewed child baseline child UUIDs for park ${parkId} are not sorted.`);
    }
    for (const childId of childIds) {
      if (!UUID_RE.test(childId)) {
        throw new Error(`Reviewed child baseline contains invalid child UUID ${childId}.`);
      }
      if (seenChildIds.has(childId)) {
        throw new Error(`Reviewed child baseline assigns child ${childId} to multiple parks.`);
      }
      seenChildIds.add(childId);
    }
    parks[parkId] = [...childIds];

    const evidence = requireRecord(
      feedEvidenceRecord[parkId],
      `Reviewed child baseline feed evidence for ${parkId}`
    );
    const expectedEndpoint = `${THEMEPARKS_WIKI_API_BASE}/entity/${parkId}/children`;
    const retrievedAt = requireTimestamp(
      evidence.retrievedAt,
      `Reviewed child baseline feed ${parkId} retrievedAt`
    );
    const identitySha256 = requireString(
      evidence.identitySha256,
      `Reviewed child baseline feed ${parkId} identitySha256`
    );
    if (
      evidence.endpoint !== expectedEndpoint ||
      evidence.childCount !== childIds.length ||
      identitySha256 !== computeChildFeedIdentitySha256(childIds)
    ) {
      throw new Error(`Reviewed child baseline feed evidence for ${parkId} was tampered.`);
    }
    if (
      new Date(retrievedAt).getTime() < new Date(retrievalStartedAt).getTime() ||
      new Date(retrievedAt).getTime() > new Date(retrievalCompletedAt).getTime()
    ) {
      throw new Error(
        `Reviewed child baseline feed evidence timestamp for ${parkId} is outside retrieval bounds.`
      );
    }
    feedEvidence[parkId] = {
      endpoint: expectedEndpoint,
      retrievedAt,
      childCount: childIds.length,
      identitySha256,
    };
  }
  const parkIds = Object.keys(parks).sort();
  if (
    Object.keys(feedEvidenceRecord).length !== parkIds.length ||
    Object.keys(feedEvidenceRecord).some((parkId) => !(parkId in parks))
  ) {
    throw new Error('Reviewed child baseline feed evidence is incomplete or has extra parks.');
  }
  const identitySha256 = computeChildCatalogIdentitySha256(parks);
  if (identitySha256 !== expectedIdentitySha256) {
    throw new Error(
      `Reviewed child baseline identity digest mismatch: expected ${expectedIdentitySha256}, ` +
        `observed ${identitySha256}.`
    );
  }
  return {
    id,
    reviewedAt,
    generatedAt,
    expectedIdentitySha256,
    source: {
      provider: 'ThemeParks.wiki',
      apiBase: THEMEPARKS_WIKI_API_BASE,
      destinationsEndpoint,
      childEndpointTemplate,
      retrievalStartedAt,
      retrievalCompletedAt,
    },
    generator: {
      script: REVIEWED_CHILD_BASELINE_SCRIPT,
      command: REVIEWED_CHILD_BASELINE_COMMAND,
    },
    feedEvidence,
    parkChildIds: parks,
    growthPolicy: 'allow',
    shrinkPolicy: 'block-until-reviewed',
  };
}

export const REVIEWED_CHILD_CATALOG_BASELINE =
  validateReviewedChildCatalogArtifact(reviewedChildCatalog);
