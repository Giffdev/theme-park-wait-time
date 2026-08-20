/**
 * Contract: the all-parks (no-parkId) branch of GET /api/wait-times uses the
 * canonical static registry as its provider-refresh boundary. A quota-failed
 * Firestore catalog observation must remain visible in logs without blocking
 * provider-backed data or becoming a top-level 503.
 *
 * Firestore remains a bounded catastrophic fallback if the static registry
 * is empty. That fallback still filters unknown documents, reports catalog
 * mismatches honestly, and fails explicitly if neither source can produce a
 * supported provider id.
 *
 * Cache-control still distinguishes static fallback mismatches from transient
 * per-park provider failures.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockUpdateForecastAggregates = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = { set: mockBatchSet, commit: mockBatchCommit };
const mockConfiguredGet = vi.hoisted(() => vi.fn());
const mockDataGet = vi.hoisted(() => vi.fn());
const mockRegistryParkIds = vi.hoisted(() => ({ current: [] as string[] }));

vi.mock('@/lib/parks/park-registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/parks/park-registry')>();
  return {
    ...actual,
    getAllParks: () =>
      mockRegistryParkIds.current.map((id) => actual.getParkById(id)!),
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminApp: { name: 'mock-app' },
  adminDb: {
    batch: () => mockBatch,
    collection: (collectionName: string) => {
      const mock: Record<string, unknown> = {};
      mock.doc = vi.fn().mockReturnValue(mock);
      mock.collection = vi.fn().mockReturnValue(mock);
      mock.get = collectionName === 'parks' ? mockConfiguredGet : mockDataGet;
      mock.id = 'mock-doc';
      return mock;
    },
    getAll: (...refs: unknown[]) => Promise.resolve(refs.map(() => ({ exists: false }))),
  },
}));

vi.mock('@/lib/forecast/aggregation', () => ({
  updateForecastAggregates: mockUpdateForecastAggregates,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { GET } from '@/app/api/wait-times/route';

const MAGIC_KINGDOM_ID = '75ea578a-adc8-4116-a54d-dccb60765ef9';
const EPCOT_ID = '47f90d2c-e191-4239-a466-5892ef59a88b';
const HOLLYWOOD_STUDIOS_ID = '288747d1-8b4f-4a64-867e-ea7c9b27bad8';
const ANIMAL_KINGDOM_ID = '1c84a229-8862-4648-9c71-378ddd2c7693';
const UNIVERSAL_STUDIOS_FLORIDA_ID = 'eb3f4560-2383-4a36-9152-6b3e5ed6bc57';
const VOLCANO_BAY_ID = 'fe78a026-b91b-470c-b906-9d2266b692da';
// Real-shaped Firestore `parks` doc ids that park-registry.ts does not know
// about — the class of document production has 57 of.
const UNREGISTERED_PARK_IDS = [
  '00000000-1111-2222-3333-444444444444',
  '55555555-6666-7777-8888-999999999999',
];

const CATALOG_MISMATCH_MESSAGE = 'Park is not present in the supported park registry.';

function request(): NextRequest {
  return new NextRequest('http://localhost:3000/api/wait-times');
}

function catalogDocs(ids: string[]) {
  return { docs: ids.map((id) => ({ id, data: () => ({ id, name: id }) })) };
}

const UUID_IN_URL = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function liveResponseFor(url: string) {
  const parkId = url.match(UUID_IN_URL)?.[0] ?? 'unknown';
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        liveData: [
          {
            id: `${parkId}-attraction`,
            name: 'Test Attraction',
            entityType: 'ATTRACTION',
            status: 'OPERATING',
            queue: { STANDBY: { waitTime: 15 } },
          },
        ],
      }),
  };
}

describe('GET /api/wait-times — all-parks cache-control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfiguredGet.mockReset();
    mockDataGet.mockReset();
    mockFetch.mockReset();
    mockRegistryParkIds.current = [];
    mockConfiguredGet.mockResolvedValue(catalogDocs([]));
    mockDataGet.mockResolvedValue({ docs: [] });
    mockUpdateForecastAggregates.mockResolvedValue(undefined);
  });

  it('returns provider data when the Firestore configured-list observation rejects with quota code 8', async () => {
    const quotaError = Object.assign(new Error('Quota exceeded.'), { code: 8 });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRegistryParkIds.current = [MAGIC_KINGDOM_ID, EPCOT_ID];
    mockConfiguredGet.mockRejectedValue(quotaError);
    mockFetch.mockImplementation(async (url: string) => liveResponseFor(url));

    const response = await GET(request());
    const data = await response.json();
    const cacheControl = response.headers.get('cache-control') ?? '';

    expect(response.status).toBe(200);
    expect(data.parks[MAGIC_KINGDOM_ID]).toEqual([
      expect.objectContaining({ attractionId: `${MAGIC_KINGDOM_ID}-attraction` }),
    ]);
    expect(data.parks[EPCOT_ID]).toEqual([
      expect.objectContaining({ attractionId: `${EPCOT_ID}-attraction` }),
    ]);
    expect(data.parkMeta[MAGIC_KINGDOM_ID]).toEqual(
      expect.objectContaining({ source: 'upstream', stale: false })
    );
    await vi.waitFor(() => expect(mockConfiguredGet).toHaveBeenCalledOnce());
    expect(errorLog).toHaveBeenCalledWith(
      'Wait-time configured park catalog read failed:',
      quotaError
    );
    expect(cacheControl).toMatch(/s-maxage=30\b/);
    expect(cacheControl).not.toMatch(/no-store/);
    errorLog.mockRestore();
  });

  it('filters unsupported Firestore-only documents in the empty-registry fallback', async () => {
    mockConfiguredGet.mockResolvedValue(
      catalogDocs([MAGIC_KINGDOM_ID, EPCOT_ID, ...UNREGISTERED_PARK_IDS])
    );
    mockFetch.mockImplementation(async (url: string) => liveResponseFor(url));

    const response = await GET(request());
    const data = await response.json();
    const cacheControl = response.headers.get('cache-control') ?? '';

    expect(response.status).toBe(200);
    // Honest body: every unsupported catalog doc is still reported.
    for (const parkId of UNREGISTERED_PARK_IDS) {
      expect(data.errors[parkId]).toBe(CATALOG_MISMATCH_MESSAGE);
      expect(data.parks[parkId]).toEqual([]);
      expect(data.parkMeta[parkId]).toBeUndefined();
    }
    // ...but the static mismatch alone no longer makes the response
    // permanently uncacheable.
    expect(cacheControl).toMatch(/s-maxage=\d+/);
    expect(cacheControl).toMatch(/stale-while-revalidate=\d+/);
    expect(cacheControl).not.toMatch(/no-store/);
  });

  it('preserves successful registry parks when another supported park fails transiently', async () => {
    // Distinct park ids per test: refresh.ts keeps a module-level in-memory
    // last-known-good cache per park, so reusing a park that already
    // succeeded earlier in this file would degrade to a stale success
    // instead of the transient failure under test.
    mockRegistryParkIds.current = [HOLLYWOOD_STUDIOS_ID, ANIMAL_KINGDOM_ID];
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes(ANIMAL_KINGDOM_ID)) {
        return { ok: false, status: 503, statusText: 'Service Unavailable' };
      }
      return liveResponseFor(url);
    });

    const response = await GET(request());
    const data = await response.json();
    const cacheControl = response.headers.get('cache-control') ?? '';

    expect(response.status).toBe(200);
    expect(data.parks[HOLLYWOOD_STUDIOS_ID]).toEqual([
      expect.objectContaining({ attractionId: `${HOLLYWOOD_STUDIOS_ID}-attraction` }),
    ]);
    expect(data.parkMeta[HOLLYWOOD_STUDIOS_ID]).toEqual(
      expect.objectContaining({ source: 'upstream' })
    );
    expect(data.errors[ANIMAL_KINGDOM_ID]).toBeDefined();
    expect(data.errors[ANIMAL_KINGDOM_ID]).not.toBe(CATALOG_MISMATCH_MESSAGE);
    // Firestore-only documents are not provider targets on the registry path.
    for (const parkId of UNREGISTERED_PARK_IDS) {
      expect(data.parks[parkId]).toBeUndefined();
      expect(data.errors[parkId]).toBeUndefined();
    }
    expect(cacheControl).toMatch(/no-store/);
    expect(cacheControl).not.toMatch(/s-maxage/);
  });

  it('keeps the all-failed case an explicit, uncacheable 502', async () => {
    mockRegistryParkIds.current = [UNIVERSAL_STUDIOS_FLORIDA_ID, VOLCANO_BAY_ID];
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

    const response = await GET(request());
    const cacheControl = response.headers.get('cache-control') ?? '';

    expect(response.status).toBe(502);
    expect(cacheControl).toMatch(/no-store/);
  });

  it('returns an explicit 503 when neither registry nor Firestore can supply a supported id', async () => {
    mockConfiguredGet.mockResolvedValue(catalogDocs(UNREGISTERED_PARK_IDS));

    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toEqual({ error: 'Configured park list is temporarily unavailable.' });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(response.headers.get('cache-control')).toMatch(/no-store/);
  });
});
