/**
 * Read-only ThemeParks.wiki catalog audit.
 *
 * Usage:
 *   npx tsx scripts/audit-park-catalog.ts
 *   npx tsx scripts/audit-park-catalog.ts --json
 */
import { fileURLToPath } from 'url';
import path from 'path';
import {
  DESTINATION_FAMILIES,
  RETIRED_PARK_REPLACEMENTS,
  getParkLiveDataIds,
  type DestinationFamily,
} from '../src/lib/parks/park-registry';
import {
  REVIEWED_CHILD_CATALOG_BASELINE,
  evaluateChildCatalogCompleteness,
  type ChildCatalogCompletenessEvidence,
  type ReviewedChildCatalogBaseline,
} from './catalog-child-baseline';

const API_BASE = 'https://api.themeparks.wiki/v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTHORITATIVE_COUNTS = {
  families: 9,
  destinations: 64,
  parks: 96,
  childEntities: 6_790,
} as const;

export interface ApiPark {
  id: string;
  name: string;
}

export interface ApiDestination {
  id: string;
  name: string;
  parks: ApiPark[];
}

export interface ApiEntity {
  id: string;
  name: string;
  entityType: string;
  parentId?: string;
  destinationId?: string;
  timezone?: string;
}

export interface ApiChild {
  id: string;
  name: string;
  entityType: string;
  slug?: string | null;
  parentId?: string;
}

export interface FetchResult<T> {
  status: number;
  data?: T;
  error?: string;
}

export interface CatalogAuditInput {
  registry?: DestinationFamily[];
  childCatalogBaseline?: ReviewedChildCatalogBaseline;
  destinations: ApiDestination[];
  entities: Map<string, FetchResult<ApiEntity>>;
  children: Map<string, FetchResult<ApiChild[]>>;
  live: Map<string, FetchResult<ApiChild[]>>;
}

interface RegistryParkRow {
  id: string;
  name: string;
  slug: string;
  destinationId: string;
  destinationName: string;
  familyId: string;
  familyName: string;
  liveDataIds: string[];
  filterLiveDataToChildren: boolean;
}

interface NamedIdentity {
  id: string;
  name: string;
}

export interface ParkCatalogAuditReport {
  status: {
    complete: boolean;
    blockingIssueCount: number;
    authoritativeModelMatch: boolean | null;
    reviewedChildIdentityMatch: boolean | null;
  };
  counts: {
    families: number;
    destinations: number;
    canonicalParks: number;
    upstreamParksInSupportedDestinations: number;
    attractionEntities: number;
    liveEntities: number;
  };
  identity: {
    malformedDestinationIds: NamedIdentity[];
    malformedParkIds: NamedIdentity[];
    duplicateFamilyIds: string[];
    duplicateDestinationIds: string[];
    duplicateDestinationSlugs: string[];
    duplicateParkIds: string[];
    duplicateParkSlugs: string[];
    duplicateLiveAliasIds: string[];
  };
  upstream: {
    missingDestinations: NamedIdentity[];
    missingCanonicalParks: Array<NamedIdentity & { destinationId: string }>;
    crossDestinationAssignments: Array<NamedIdentity & {
      registryDestinationId: string;
      upstreamDestinationId: string;
    }>;
    aliasedUpstreamParks: Array<NamedIdentity & { canonicalId: string }>;
    unregisteredParks: Array<NamedIdentity & { destinationId: string; destinationName: string }>;
    parkNameDifferences: Array<NamedIdentity & { upstreamName: string }>;
  };
  entities: {
    fetchFailures: Array<NamedIdentity & { status: number; error?: string }>;
    nonParkEntities: Array<NamedIdentity & { entityType: string }>;
    parentMismatches: Array<NamedIdentity & {
      registryDestinationId: string;
      upstreamDestinationId?: string;
      upstreamParentId?: string;
    }>;
    missingTimezones: NamedIdentity[];
  };
  attractions: {
    fetchFailures: Array<NamedIdentity & { status: number; error?: string }>;
    malformedIds: Array<NamedIdentity & { parkId: string; parkName: string }>;
    malformedFields: Array<NamedIdentity & {
      parkId: string;
      parkName: string;
      reason: string;
    }>;
    duplicateIdsWithinPark: Array<NamedIdentity & { parkId: string; parkName: string }>;
    crossParkIds: Array<NamedIdentity & { parks: string[] }>;
    duplicateNameGroups: Array<{
      parkId: string;
      parkName: string;
      normalizedName: string;
      entities: NamedIdentity[];
    }>;
    liveFetchFailures: Array<NamedIdentity & { status: number; error?: string }>;
    registryHandledCrossParkLiveAssignments: Array<NamedIdentity & {
      requestedParkId: string;
      requestedParkName: string;
      owningParks: string[];
    }>;
    crossParkLiveAssignments: Array<NamedIdentity & {
      requestedParkId: string;
      requestedParkName: string;
      owningParks: string[];
    }>;
    unresolvedLiveEntities: Array<NamedIdentity & {
      requestedParkId: string;
      requestedParkName: string;
    }>;
    liveIdentityMismatches: Array<NamedIdentity & {
      parkId: string;
      childName: string;
      liveName: string;
      childType: string;
      liveType: string;
    }>;
  };
  childCatalogCompleteness: ChildCatalogCompletenessEvidence | null;
}

function duplicateValues(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
}

function normalizeName(name: string): string {
  return name.normalize('NFKC').replace(/\p{P}|\p{S}/gu, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function flattenRegistry(registry: DestinationFamily[]) {
  const destinations = registry.flatMap((family) =>
    family.destinations.map((destination) => ({
      ...destination,
      familyId: family.familyId,
      familyName: family.familyName,
    }))
  );
  const parks: RegistryParkRow[] = destinations.flatMap((destination) =>
    destination.parks.map((park) => ({
      ...park,
      destinationId: destination.id,
      destinationName: destination.name,
      familyId: destination.familyId,
      familyName: destination.familyName,
      liveDataIds: park.liveDataIds ? [...park.liveDataIds] : [park.id],
      filterLiveDataToChildren: park.filterLiveDataToChildren ?? false,
    }))
  );
  return { destinations, parks };
}

export function buildParkCatalogAudit(input: CatalogAuditInput): ParkCatalogAuditReport {
  const registry = input.registry ?? DESTINATION_FAMILIES;
  const { destinations: registryDestinations, parks: registryParks } = flattenRegistry(registry);
  const registryDestinationIds = new Set(registryDestinations.map((destination) => destination.id));
  const registryParksById = new Map(registryParks.map((park) => [park.id, park]));
  const apiDestinationsById = new Map(input.destinations.map((destination) => [destination.id, destination]));
  const upstreamParks = input.destinations
    .filter((destination) => registryDestinationIds.has(destination.id))
    .flatMap((destination) =>
      destination.parks.map((park) => ({
        ...park,
        destinationId: destination.id,
        destinationName: destination.name,
      }))
    );
  const upstreamParksById = new Map(upstreamParks.map((park) => [park.id, park]));

  const missingDestinations = registryDestinations
    .filter((destination) => !apiDestinationsById.has(destination.id))
    .map(({ id, name }) => ({ id, name }));
  const missingCanonicalParks = registryParks
    .filter((park) => !upstreamParksById.has(park.id))
    .map(({ id, name, destinationId }) => ({ id, name, destinationId }));
  const crossDestinationAssignments = registryParks
    .filter((park) => {
      const upstream = upstreamParksById.get(park.id);
      return upstream && upstream.destinationId !== park.destinationId;
    })
    .map((park) => ({
      id: park.id,
      name: park.name,
      registryDestinationId: park.destinationId,
      upstreamDestinationId: upstreamParksById.get(park.id)!.destinationId,
    }));

  const aliasedUpstreamParks: ParkCatalogAuditReport['upstream']['aliasedUpstreamParks'] = [];
  const unregisteredParks: ParkCatalogAuditReport['upstream']['unregisteredParks'] = [];
  for (const park of upstreamParks) {
    if (registryParksById.has(park.id)) continue;
    const canonicalId = RETIRED_PARK_REPLACEMENTS[park.id];
    if (canonicalId && registryParksById.has(canonicalId)) {
      aliasedUpstreamParks.push({ id: park.id, name: park.name, canonicalId });
    } else {
      unregisteredParks.push(park);
    }
  }

  const parkNameDifferences = registryParks
    .filter((park) => {
      const upstream = upstreamParksById.get(park.id);
      return upstream && upstream.name !== park.name;
    })
    .map((park) => ({
      id: park.id,
      name: park.name,
      upstreamName: upstreamParksById.get(park.id)!.name,
    }));

  const entityFetchFailures: ParkCatalogAuditReport['entities']['fetchFailures'] = [];
  const nonParkEntities: ParkCatalogAuditReport['entities']['nonParkEntities'] = [];
  const parentMismatches: ParkCatalogAuditReport['entities']['parentMismatches'] = [];
  const missingTimezones: NamedIdentity[] = [];
  for (const park of registryParks) {
    const result = input.entities.get(park.id);
    if (!result || result.status !== 200 || !result.data) {
      entityFetchFailures.push({
        id: park.id,
        name: park.name,
        status: result?.status ?? 0,
        error: result?.error,
      });
      continue;
    }
    const entity = result.data;
    if (entity.entityType !== 'PARK') {
      nonParkEntities.push({ id: park.id, name: park.name, entityType: entity.entityType });
    }
    if (
      entity.destinationId !== park.destinationId ||
      (entity.parentId && entity.parentId !== park.destinationId)
    ) {
      parentMismatches.push({
        id: park.id,
        name: park.name,
        registryDestinationId: park.destinationId,
        upstreamDestinationId: entity.destinationId,
        upstreamParentId: entity.parentId,
      });
    }
    if (!entity.timezone) missingTimezones.push({ id: park.id, name: park.name });
  }

  const attractionFetchFailures: ParkCatalogAuditReport['attractions']['fetchFailures'] = [];
  const malformedAttractionIds: ParkCatalogAuditReport['attractions']['malformedIds'] = [];
  const malformedAttractionFields: ParkCatalogAuditReport['attractions']['malformedFields'] = [];
  const duplicateIdsWithinPark: ParkCatalogAuditReport['attractions']['duplicateIdsWithinPark'] = [];
  const duplicateNameGroups: ParkCatalogAuditReport['attractions']['duplicateNameGroups'] = [];
  const childOwners = new Map<string, Array<{ parkId: string; parkName: string; child: ApiChild }>>();
  const childrenByPark = new Map<string, Map<string, ApiChild>>();
  const observedChildIdsByPark = new Map<string, string[]>();
  let attractionEntities = 0;

  for (const park of registryParks) {
    const result = input.children.get(park.id);
    if (!result || result.status !== 200 || !result.data) {
      attractionFetchFailures.push({
        id: park.id,
        name: park.name,
        status: result?.status ?? 0,
        error: result?.error,
      });
      continue;
    }
    attractionEntities += result.data.length;
    const byId = new Map<string, ApiChild>();
    const idsSeen = new Set<string>();
    const names = new Map<string, ApiChild[]>();
    for (const [index, value] of result.data.entries()) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        malformedAttractionFields.push({
          id: `row-${index}`,
          name: '(malformed child)',
          parkId: park.id,
          parkName: park.name,
          reason: 'Child row is not an object.',
        });
        continue;
      }
      const child = value as ApiChild;
      const safeId = typeof child.id === 'string' ? child.id : `row-${index}`;
      const safeName = typeof child.name === 'string' ? child.name : '(malformed child)';
      if (typeof child.id !== 'string' || !UUID_RE.test(child.id)) {
        malformedAttractionIds.push({
          id: safeId,
          name: safeName,
          parkId: park.id,
          parkName: park.name,
        });
        continue;
      }
      if (
        typeof child.name !== 'string' ||
        child.name.trim().length === 0 ||
        typeof child.entityType !== 'string' ||
        !['ATTRACTION', 'RESTAURANT', 'HOTEL', 'SHOW'].includes(child.entityType) ||
        (child.slug !== undefined &&
          child.slug !== null &&
          (typeof child.slug !== 'string' ||
            child.slug.trim().length === 0 ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(child.slug))) ||
        (child.parentId !== undefined &&
          (typeof child.parentId !== 'string' || !UUID_RE.test(child.parentId)))
      ) {
        malformedAttractionFields.push({
          id: child.id,
          name: safeName,
          parkId: park.id,
          parkName: park.name,
          reason: 'Child name, entityType, slug, or parentId is malformed.',
        });
        continue;
      }
      if (idsSeen.has(child.id)) {
        duplicateIdsWithinPark.push({
          id: child.id,
          name: child.name,
          parkId: park.id,
          parkName: park.name,
        });
      }
      idsSeen.add(child.id);
      byId.set(child.id, child);
      childOwners.set(child.id, [
        ...(childOwners.get(child.id) ?? []),
        { parkId: park.id, parkName: park.name, child },
      ]);
      const normalized = normalizeName(child.name);
      names.set(normalized, [...(names.get(normalized) ?? []), child]);
    }
    childrenByPark.set(park.id, byId);
    if (
      !malformedAttractionIds.some((finding) => finding.parkId === park.id) &&
      !malformedAttractionFields.some((finding) => finding.parkId === park.id) &&
      !duplicateIdsWithinPark.some((finding) => finding.parkId === park.id)
    ) {
      observedChildIdsByPark.set(park.id, [...byId.keys()]);
    }
    for (const [normalizedName, entities] of names) {
      if (normalizedName && entities.length > 1) {
        duplicateNameGroups.push({
          parkId: park.id,
          parkName: park.name,
          normalizedName,
          entities: entities.map(({ id, name }) => ({ id, name })),
        });
      }
    }
  }

  const crossParkIds = [...childOwners.entries()]
    .filter(([, owners]) => new Set(owners.map((owner) => owner.parkId)).size > 1)
    .map(([id, owners]) => ({
      id,
      name: owners[0].child.name,
      parks: [...new Set(owners.map((owner) => owner.parkName))],
    }));

  const liveFetchFailures: ParkCatalogAuditReport['attractions']['liveFetchFailures'] = [];
  const registryHandledCrossParkLiveAssignments: ParkCatalogAuditReport['attractions']['registryHandledCrossParkLiveAssignments'] = [];
  const crossParkLiveAssignments: ParkCatalogAuditReport['attractions']['crossParkLiveAssignments'] = [];
  const unresolvedLiveEntities: ParkCatalogAuditReport['attractions']['unresolvedLiveEntities'] = [];
  const liveIdentityMismatches: ParkCatalogAuditReport['attractions']['liveIdentityMismatches'] = [];
  let liveEntities = 0;

  for (const park of registryParks) {
    const mergedLive = new Map<string, ApiChild>();
    for (const sourceId of park.liveDataIds) {
      const result = input.live.get(sourceId);
      if (!result || result.status !== 200 || !result.data) {
        liveFetchFailures.push({
          id: sourceId,
          name: park.name,
          status: result?.status ?? 0,
          error: result?.error,
        });
        continue;
      }
      for (const entry of result.data) mergedLive.set(entry.id, entry);
    }
    liveEntities += mergedLive.size;
    const ownChildren = childrenByPark.get(park.id) ?? new Map<string, ApiChild>();
    for (const entry of mergedLive.values()) {
      if (entry.entityType === 'PARK' && (entry.id === park.id || park.liveDataIds.includes(entry.id))) {
        continue;
      }
      const child = ownChildren.get(entry.id);
      if (child) {
        if (child.name !== entry.name || child.entityType !== entry.entityType) {
          liveIdentityMismatches.push({
            id: entry.id,
            name: entry.name,
            parkId: park.id,
            childName: child.name,
            liveName: entry.name,
            childType: child.entityType,
            liveType: entry.entityType,
          });
        }
        continue;
      }
      const owners = childOwners.get(entry.id) ?? [];
      if (owners.length > 0) {
        const finding = {
          id: entry.id,
          name: entry.name,
          requestedParkId: park.id,
          requestedParkName: park.name,
          owningParks: [...new Set(owners.map((owner) => owner.parkName))],
        };
        if (park.filterLiveDataToChildren) {
          registryHandledCrossParkLiveAssignments.push(finding);
        } else {
          crossParkLiveAssignments.push(finding);
        }
      } else {
        unresolvedLiveEntities.push({
          id: entry.id,
          name: entry.name,
          requestedParkId: park.id,
          requestedParkName: park.name,
        });
      }
    }
  }

  const report: ParkCatalogAuditReport = {
    status: {
      complete: true,
      blockingIssueCount: 0,
      authoritativeModelMatch: null,
      reviewedChildIdentityMatch: null,
    },
    counts: {
      families: registry.length,
      destinations: registryDestinations.length,
      canonicalParks: registryParks.length,
      upstreamParksInSupportedDestinations: upstreamParks.length,
      attractionEntities,
      liveEntities,
    },
    identity: {
      malformedDestinationIds: registryDestinations
        .filter((destination) => !UUID_RE.test(destination.id))
        .map(({ id, name }) => ({ id, name })),
      malformedParkIds: registryParks
        .filter((park) => !UUID_RE.test(park.id))
        .map(({ id, name }) => ({ id, name })),
      duplicateFamilyIds: duplicateValues(registry.map((family) => family.familyId)),
      duplicateDestinationIds: duplicateValues(registryDestinations.map((destination) => destination.id)),
      duplicateDestinationSlugs: duplicateValues(registryDestinations.map((destination) => destination.slug)),
      duplicateParkIds: duplicateValues(registryParks.map((park) => park.id)),
      duplicateParkSlugs: duplicateValues(registryParks.map((park) => park.slug)),
      duplicateLiveAliasIds: duplicateValues(
        registryParks.flatMap((park) =>
          park.liveDataIds.filter((sourceId) => sourceId !== park.id)
        )
      ),
    },
    upstream: {
      missingDestinations,
      missingCanonicalParks,
      crossDestinationAssignments,
      aliasedUpstreamParks,
      unregisteredParks,
      parkNameDifferences,
    },
    entities: {
      fetchFailures: entityFetchFailures,
      nonParkEntities,
      parentMismatches,
      missingTimezones,
    },
    attractions: {
      fetchFailures: attractionFetchFailures,
      malformedIds: malformedAttractionIds,
      malformedFields: malformedAttractionFields,
      duplicateIdsWithinPark,
      crossParkIds,
      duplicateNameGroups,
      liveFetchFailures,
      registryHandledCrossParkLiveAssignments,
      crossParkLiveAssignments,
      unresolvedLiveEntities,
      liveIdentityMismatches,
    },
    childCatalogCompleteness: null,
  };
  const feedFailureCount =
    report.entities.fetchFailures.length +
    report.attractions.fetchFailures.length +
    report.attractions.liveFetchFailures.length;
  report.status.complete = feedFailureCount === 0;
  const reviewedBaseline =
    input.childCatalogBaseline ??
    (registry === DESTINATION_FAMILIES ? REVIEWED_CHILD_CATALOG_BASELINE : undefined);
  if (reviewedBaseline) {
    report.childCatalogCompleteness = evaluateChildCatalogCompleteness(
      reviewedBaseline,
      registryParks.map((park) => park.id),
      observedChildIdsByPark
    );
    report.status.reviewedChildIdentityMatch = report.childCatalogCompleteness.complete;
  }
  if (registry === DESTINATION_FAMILIES) {
    report.status.authoritativeModelMatch =
      report.counts.families === AUTHORITATIVE_COUNTS.families &&
      report.counts.destinations === AUTHORITATIVE_COUNTS.destinations &&
      report.counts.canonicalParks === AUTHORITATIVE_COUNTS.parks &&
      report.childCatalogCompleteness?.review.reviewedChildEntities ===
        AUTHORITATIVE_COUNTS.childEntities;
  }
  report.status.complete =
    report.status.complete && report.status.reviewedChildIdentityMatch !== false;
  report.status.blockingIssueCount =
    Object.values(report.identity).reduce((count, findings) => count + findings.length, 0) +
    report.upstream.missingDestinations.length +
    report.upstream.missingCanonicalParks.length +
    report.upstream.crossDestinationAssignments.length +
    report.upstream.unregisteredParks.length +
    report.entities.nonParkEntities.length +
    report.entities.parentMismatches.length +
    report.entities.missingTimezones.length +
    report.attractions.malformedIds.length +
    report.attractions.malformedFields.length +
    report.attractions.duplicateIdsWithinPark.length +
    report.attractions.crossParkIds.length +
    report.attractions.crossParkLiveAssignments.length +
    report.attractions.unresolvedLiveEntities.length +
    report.attractions.liveIdentityMismatches.length +
    (report.status.authoritativeModelMatch === false ? 1 : 0) +
    (report.status.reviewedChildIdentityMatch === false ? 1 : 0);
  return report;
}

async function fetchResult<T>(url: string, pick?: (payload: unknown) => T): Promise<FetchResult<T>> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ParkPulse catalog integrity audit' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { status: response.status };
    try {
      const payload = await response.json();
      return { status: response.status, data: pick ? pick(payload) : (payload as T) };
    } catch (error) {
      return {
        status: response.status,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } catch (error) {
    return { status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

function requireArrayProperty<T>(payload: unknown, property: string): T[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as Record<string, unknown>)[property])
  ) {
    throw new Error(`HTTP 200 response is malformed: required ${property} array is missing.`);
  }
  return (payload as Record<string, T[]>)[property];
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const index = next++;
        if (index >= items.length) return;
        await worker(items[index]);
      }
    })
  );
}

function formatReport(report: ParkCatalogAuditReport): string {
  return [
    '=== Park catalog integrity audit (read-only) ===',
    `complete: ${report.status.complete ? 'yes' : 'NO'}`,
    `authoritative model: ${
      report.status.authoritativeModelMatch === null
        ? 'custom fixture'
        : report.status.authoritativeModelMatch
          ? 'match'
          : 'MISMATCH'
    }`,
    `reviewed child identities: ${
      report.status.reviewedChildIdentityMatch === null
        ? 'not evaluated'
        : report.status.reviewedChildIdentityMatch
          ? 'match (additive growth allowed)'
          : 'MISMATCH'
    }`,
    `families: ${report.counts.families}`,
    `destinations: ${report.counts.destinations}`,
    `canonical parks: ${report.counts.canonicalParks}`,
    `upstream park rows in supported destinations: ${report.counts.upstreamParksInSupportedDestinations}`,
    `attraction entities: ${report.counts.attractionEntities}`,
    `live entities: ${report.counts.liveEntities}`,
    `blocking identity issues: ${report.status.blockingIssueCount}`,
    `feed failures: ${
      report.entities.fetchFailures.length +
      report.attractions.fetchFailures.length +
      report.attractions.liveFetchFailures.length
    }`,
    `recognized upstream aliases: ${report.upstream.aliasedUpstreamParks.length}`,
    `duplicate attraction-name groups (UUID-distinct, review only): ${report.attractions.duplicateNameGroups.length}`,
    `registry-handled sibling-feed assignments (informational): ${report.attractions.registryHandledCrossParkLiveAssignments.length}`,
    `unknown cross-park live assignments (blocking): ${report.attractions.crossParkLiveAssignments.length}`,
    `unresolved live entities: ${report.attractions.unresolvedLiveEntities.length}`,
  ].join('\n');
}

export interface CatalogAuditIo {
  out(line: string): void;
}

export function runCatalogAuditCli(
  report: ParkCatalogAuditReport,
  options: { json?: boolean; io?: CatalogAuditIo } = {}
): number {
  const io = options.io ?? { out: (line: string) => console.log(line) };
  io.out(options.json ? JSON.stringify(report, null, 2) : formatReport(report));
  return report.status.complete && report.status.blockingIssueCount === 0 ? 0 : 1;
}

export async function runLiveCatalogAudit(): Promise<ParkCatalogAuditReport> {
  const destinationsResult = await fetchResult<{ destinations: ApiDestination[] }>(
    `${API_BASE}/destinations`
  );
  if (!destinationsResult.data) {
    throw new Error(`ThemeParks.wiki destinations fetch failed (${destinationsResult.status})`);
  }

  const { parks } = flattenRegistry(DESTINATION_FAMILIES);
  const entities = new Map<string, FetchResult<ApiEntity>>();
  const children = new Map<string, FetchResult<ApiChild[]>>();
  const live = new Map<string, FetchResult<ApiChild[]>>();
  const jobs = [
    ...parks.flatMap((park) => [
      { kind: 'entity' as const, id: park.id },
      { kind: 'children' as const, id: park.id },
    ]),
    ...[...new Set(parks.flatMap((park) => getParkLiveDataIds(park.id)))].map((id) => ({
      kind: 'live' as const,
      id,
    })),
  ];

  await mapWithConcurrency(jobs, 6, async (job) => {
    if (job.kind === 'entity') {
      entities.set(job.id, await fetchResult<ApiEntity>(`${API_BASE}/entity/${job.id}`));
    } else if (job.kind === 'children') {
      children.set(
        job.id,
        await fetchResult<ApiChild[]>(
          `${API_BASE}/entity/${job.id}/children`,
          (payload) => requireArrayProperty<ApiChild>(payload, 'children')
        )
      );
    } else {
      live.set(
        job.id,
        await fetchResult<ApiChild[]>(
          `${API_BASE}/entity/${job.id}/live`,
          (payload) => requireArrayProperty<ApiChild>(payload, 'liveData')
        )
      );
    }
  });

  return buildParkCatalogAudit({
    destinations: destinationsResult.data.destinations,
    entities,
    children,
    live,
  });
}

async function main(): Promise<void> {
  const report = await runLiveCatalogAudit();
  process.exitCode = runCatalogAuditCli(report, { json: process.argv.includes('--json') });
}

const isDirectlyExecuted =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectlyExecuted) {
  main().catch((error) => {
    console.error('Catalog audit failed:', error);
    process.exit(1);
  });
}
