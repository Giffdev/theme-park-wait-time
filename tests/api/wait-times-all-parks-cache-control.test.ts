/**
 * Contract: the all-parks (no-parkId) branch of GET /api/wait-times must be
 * able to engage CDN caching, and must distinguish a *static catalog
 * mismatch* from a *transient failure* when deciding whether it can.
 *
 * Production evidence: the Firestore `parks` collection contains 57
 * documents that park-registry.ts does not support (parks seeded before the
 * registry existed / retired upstream entities). Every one of them was
 * folded into the response's `errors` map, and any entry in `errors` forced
 * `Cache-Control: no-store`. Because those 57 documents are always present,
 * the all-parks response was *permanently* uncacheable: the CDN coalescing
 * this route was given cache headers for could never engage even once, and
 * the parks listing paid the full 11–12.7s fan-out on every request.
 *
 * A registry mismatch cannot resolve itself between two requests seconds
 * apart, so sharing that response at the edge for a few seconds is safe. A
 * transient failure (upstream down, deadline elapsed) can resolve on the
 * very next request and must never be pinned at the edge.
 *
 * Both conditions stay fully visible in the JSON body either way — degraded
 * caching must not buy honesty-in-the-response as a trade.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockUpdateForecastAggregates = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = { set: mockBatchSet, commit: mockBatchCommit };
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/firebase/admin', () => ({
  adminApp: { name: 'mock-app' },
  adminDb: {
    batch: () => mockBatch,
    collection: () => {
      const mock: Record<string, unknown> = {};
      mock.doc = vi.fn().mockReturnValue(mock);
      mock.collection = vi.fn().mockReturnValue(mock);
      mock.get = mockGet;
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
    mockGet.mockReset();
    mockFetch.mockReset();
    mockUpdateForecastAggregates.mockResolvedValue(undefined);
  });

  it('advertises a CDN-cacheable window when every supported park is fresh', async () => {
    mockGet.mockResolvedValue(catalogDocs([MAGIC_KINGDOM_ID, EPCOT_ID]));
    mockFetch.mockImplementation(async (url: string) => liveResponseFor(url));

    const response = await GET(request());
    const cacheControl = response.headers.get('cache-control') ?? '';

    expect(response.status).toBe(200);
    expect(cacheControl).toMatch(/s-maxage=30\b/);
    expect(cacheControl).not.toMatch(/no-store/);
  });

  it('still allows a degraded CDN window when the only errors are registry/catalog mismatches', async () => {
    mockGet.mockResolvedValue(
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

  it('forces no-store when a supported park fails transiently, even alongside catalog mismatches', async () => {
    // Distinct park ids per test: refresh.ts keeps a module-level in-memory
    // last-known-good cache per park, so reusing a park that already
    // succeeded earlier in this file would degrade to a stale success
    // instead of the transient failure under test.
    mockGet.mockResolvedValue(
      catalogDocs([HOLLYWOOD_STUDIOS_ID, ANIMAL_KINGDOM_ID, ...UNREGISTERED_PARK_IDS])
    );
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
    expect(data.errors[ANIMAL_KINGDOM_ID]).toBeDefined();
    expect(data.errors[ANIMAL_KINGDOM_ID]).not.toBe(CATALOG_MISMATCH_MESSAGE);
    // Catalog mismatches remain reported alongside the transient failure.
    for (const parkId of UNREGISTERED_PARK_IDS) {
      expect(data.errors[parkId]).toBe(CATALOG_MISMATCH_MESSAGE);
    }
    expect(cacheControl).toMatch(/no-store/);
    expect(cacheControl).not.toMatch(/s-maxage/);
  });

  it('keeps the all-failed case an explicit, uncacheable 502', async () => {
    mockGet.mockResolvedValue(catalogDocs([UNIVERSAL_STUDIOS_FLORIDA_ID, VOLCANO_BAY_ID]));
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

    const response = await GET(request());
    const cacheControl = response.headers.get('cache-control') ?? '';

    expect(response.status).toBe(502);
    expect(cacheControl).toMatch(/no-store/);
  });
});
