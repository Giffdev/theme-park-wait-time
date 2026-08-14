import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAllParks } from '../src/lib/parks/park-registry';
import {
  EXPECTED_REVIEWED_CHILD_IDENTITY_SHA256,
  REVIEWED_CHILD_BASELINE_COMMAND,
  REVIEWED_CHILD_BASELINE_SCRIPT,
  REVIEWED_CHILD_CATALOG_ID,
  THEMEPARKS_WIKI_API_BASE,
  computeChildCatalogIdentitySha256,
  computeChildFeedIdentitySha256,
  validateReviewedChildCatalogArtifact,
  type ReviewedChildCatalogArtifact,
} from './catalog-child-baseline';

const OUTPUT_PATH =
  'scripts/data/themeparks-wiki-canonical-children-2026-08-14.json';
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITY_TYPES = new Set([
  'DESTINATION',
  'PARK',
  'ATTRACTION',
  'RESTAURANT',
  'HOTEL',
  'SHOW',
]);
const FETCH_ATTEMPTS = 4;
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_CONCURRENCY = 6;

interface BaselineResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type BaselineTransport = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> }
) => Promise<BaselineResponse>;

interface BaselineChild {
  id: string;
  name: string;
  entityType: string;
  slug?: string | null;
  parentId?: string | null;
}

function retryDelayMs(response: BaselineResponse, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const date = new Date(retryAfter);
    if (!Number.isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
  }
  return Math.min(8_000, 500 * 2 ** (attempt - 1));
}

async function fetchJsonWithRetry(
  url: string,
  options: {
    transport: BaselineTransport;
    sleep: (milliseconds: number) => Promise<void>;
  }
): Promise<unknown> {
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await options.transport(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });
      if (response.ok) return await response.json();
      lastError = `HTTP ${response.status}`;
      if (attempt < FETCH_ATTEMPTS && (response.status === 429 || response.status >= 500)) {
        await options.sleep(retryDelayMs(response, attempt));
        continue;
      }
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < FETCH_ATTEMPTS) {
        await options.sleep(Math.min(8_000, 500 * 2 ** (attempt - 1)));
        continue;
      }
    }
  }
  throw new Error(`Baseline source fetch failed for ${url}: ${lastError}`);
}

function requireChildren(payload: unknown, parkId: string): BaselineChild[] {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as Record<string, unknown>).children)
  ) {
    throw new Error(`Child feed ${parkId} is missing the required children array.`);
  }
  const children = (payload as { children: unknown[] }).children;
  const seen = new Set<string>();
  return children.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Child feed ${parkId} row ${index} is not an object.`);
    }
    const child = value as Record<string, unknown>;
    if (typeof child.id !== 'string' || !UUID_RE.test(child.id)) {
      throw new Error(`Child feed ${parkId} row ${index} has an invalid UUID.`);
    }
    if (seen.has(child.id)) {
      throw new Error(`Child feed ${parkId} duplicates child UUID ${child.id}.`);
    }
    seen.add(child.id);
    if (typeof child.name !== 'string' || child.name.trim().length === 0) {
      throw new Error(`Child feed ${parkId} child ${child.id} has an invalid name.`);
    }
    if (typeof child.entityType !== 'string' || !ENTITY_TYPES.has(child.entityType)) {
      throw new Error(`Child feed ${parkId} child ${child.id} has an invalid entity type.`);
    }
    if (
      child.slug !== undefined &&
      child.slug !== null &&
      (typeof child.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(child.slug))
    ) {
      throw new Error(`Child feed ${parkId} child ${child.id} has an invalid slug.`);
    }
    if (
      child.parentId !== undefined &&
      child.parentId !== null &&
      (typeof child.parentId !== 'string' || !UUID_RE.test(child.parentId))
    ) {
      throw new Error(`Child feed ${parkId} child ${child.id} has an invalid parent UUID.`);
    }
    return child as unknown as BaselineChild;
  });
}

function requireDestinationParkIds(payload: unknown): Set<string> {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as Record<string, unknown>).destinations)
  ) {
    throw new Error('Destinations source is missing the required destinations array.');
  }
  const parkIds = new Set<string>();
  for (const destination of (payload as { destinations: unknown[] }).destinations) {
    if (!destination || typeof destination !== 'object' || Array.isArray(destination)) continue;
    const parks = (destination as Record<string, unknown>).parks;
    if (!Array.isArray(parks)) continue;
    for (const park of parks) {
      if (
        park &&
        typeof park === 'object' &&
        !Array.isArray(park) &&
        typeof (park as Record<string, unknown>).id === 'string'
      ) {
        parkIds.add((park as { id: string }).id);
      }
    }
  }
  return parkIds;
}

async function mapWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex++];
        await worker(item);
      }
    })
  );
}

export async function generateReviewedChildCatalogArtifact(
  options: {
    transport?: BaselineTransport;
    sleep?: (milliseconds: number) => Promise<void>;
    now?: () => Date;
  } = {}
): Promise<ReviewedChildCatalogArtifact & { parks: Record<string, string[]> }> {
  const transport =
    options.transport ??
    ((url, init) => fetch(url, init) as unknown as Promise<BaselineResponse>);
  const sleep =
    options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now ?? (() => new Date());
  const retrievalStartedAt = now().toISOString();
  const destinationsEndpoint = `${THEMEPARKS_WIKI_API_BASE}/destinations`;
  const destinationPayload = await fetchJsonWithRetry(destinationsEndpoint, {
    transport,
    sleep,
  });
  const sourceParkIds = requireDestinationParkIds(destinationPayload);
  const parks = getAllParks().sort((left, right) => left.id.localeCompare(right.id));
  const missingSourceParks = parks.filter((park) => !sourceParkIds.has(park.id));
  if (missingSourceParks.length > 0) {
    throw new Error(
      `Destinations source is missing canonical park(s): ` +
        missingSourceParks.map((park) => park.id).join(', ')
    );
  }

  const parkChildIds: Record<string, string[]> = {};
  const feedEvidence: Record<
    string,
    {
      endpoint: string;
      retrievedAt: string;
      childCount: number;
      identitySha256: string;
    }
  > = {};
  await mapWithConcurrency(parks, FETCH_CONCURRENCY, async (park) => {
    const endpoint = `${THEMEPARKS_WIKI_API_BASE}/entity/${park.id}/children`;
    const payload = await fetchJsonWithRetry(endpoint, { transport, sleep });
    const childIds = requireChildren(payload, park.id)
      .map((child) => child.id)
      .sort();
    const retrievedAt = now().toISOString();
    parkChildIds[park.id] = childIds;
    feedEvidence[park.id] = {
      endpoint,
      retrievedAt,
      childCount: childIds.length,
      identitySha256: computeChildFeedIdentitySha256(childIds),
    };
  });

  const retrievalCompletedAt = now().toISOString();
  const generatedAt = now().toISOString();
  const sortedParkChildIds = Object.fromEntries(
    Object.entries(parkChildIds).sort(([left], [right]) => left.localeCompare(right))
  );
  const sortedFeedEvidence = Object.fromEntries(
    Object.entries(feedEvidence).sort(([left], [right]) => left.localeCompare(right))
  );
  const observedIdentitySha256 = computeChildCatalogIdentitySha256(sortedParkChildIds);
  if (observedIdentitySha256 !== EXPECTED_REVIEWED_CHILD_IDENTITY_SHA256) {
    throw new Error(
      `Live child identity digest ${observedIdentitySha256} does not match reviewed digest ` +
        `${EXPECTED_REVIEWED_CHILD_IDENTITY_SHA256}; no baseline was written.`
    );
  }
  const artifact = {
    id: REVIEWED_CHILD_CATALOG_ID,
    reviewedAt: '2026-08-14',
    generatedAt,
    expectedIdentitySha256: EXPECTED_REVIEWED_CHILD_IDENTITY_SHA256,
    source: {
      provider: 'ThemeParks.wiki' as const,
      apiBase: THEMEPARKS_WIKI_API_BASE,
      destinationsEndpoint,
      childEndpointTemplate: `${THEMEPARKS_WIKI_API_BASE}/entity/{parkId}/children`,
      retrievalStartedAt,
      retrievalCompletedAt,
    },
    generator: {
      script: REVIEWED_CHILD_BASELINE_SCRIPT,
      command: REVIEWED_CHILD_BASELINE_COMMAND,
    },
    feedEvidence: sortedFeedEvidence,
    parkChildIds: sortedParkChildIds,
    parks: sortedParkChildIds,
    growthPolicy: 'allow' as const,
    shrinkPolicy: 'block-until-reviewed' as const,
  };
  validateReviewedChildCatalogArtifact(artifact);
  return artifact;
}

function serializableArtifact(
  artifact: ReviewedChildCatalogArtifact & { parks?: Record<string, string[]> }
) {
  const { parkChildIds, ...metadata } = artifact;
  return { ...metadata, parks: artifact.parks ?? parkChildIds };
}

function canonicalOutputPath(): string {
  return path.resolve(process.cwd(), OUTPUT_PATH);
}

export async function verifyCheckedInBaseline(): Promise<ReviewedChildCatalogArtifact> {
  const raw = JSON.parse(await readFile(canonicalOutputPath(), 'utf8')) as unknown;
  return validateReviewedChildCatalogArtifact(raw);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const writeIndex = argv.indexOf('--write');
  const checkLive = argv.includes('--check-live');
  const verify = argv.includes('--verify') || (writeIndex < 0 && !checkLive);
  if ([verify, checkLive, writeIndex >= 0].filter(Boolean).length !== 1) {
    throw new Error('Choose exactly one of --verify, --check-live, or --write <path>.');
  }

  if (verify) {
    const artifact = await verifyCheckedInBaseline();
    console.log(
      `Verified ${Object.keys(artifact.feedEvidence).length} feeds / ` +
        `${Object.values(artifact.parkChildIds).flat().length} children / ` +
        `${artifact.expectedIdentitySha256}.`
    );
    return;
  }

  const artifact = await generateReviewedChildCatalogArtifact();
  if (checkLive) {
    console.log(
      `Live baseline matches ${artifact.expectedIdentitySha256} across ` +
        `${Object.keys(artifact.feedEvidence).length} feeds.`
    );
    return;
  }

  const requestedOutput = argv[writeIndex + 1];
  if (!requestedOutput || path.resolve(process.cwd(), requestedOutput) !== canonicalOutputPath()) {
    throw new Error(`--write is restricted to ${OUTPUT_PATH}.`);
  }
  await writeFile(
    canonicalOutputPath(),
    `${JSON.stringify(serializableArtifact(artifact), null, 2)}\n`,
    'utf8'
  );
  console.log(
    `Wrote reviewed baseline candidate ${artifact.expectedIdentitySha256} to ${OUTPUT_PATH}.`
  );
}

const isDirectlyExecuted =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectlyExecuted) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Catalog child baseline failed: ${message}`);
    process.exit(1);
  });
}
