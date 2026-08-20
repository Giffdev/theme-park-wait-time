/**
 * Contract: the no-parkId (all-parks) path of GET /api/wait-times must not
 * sequentially live-refresh every supported registry park one at a time, and must
 * remain bounded (an explicit worker/concurrency cap), the same way the
 * `/api/cron/refresh-wait-times` route already uses `refreshParksBounded`.
 *
 * Root cause under test: a purely sequential `for (const parkId of
 * configured.supported) { await refreshPark(parkId); }` loop means the total
 * request duration scales linearly with the number of configured parks —
 * each additional park adds a full upstream-fetch-plus-Firestore-write
 * latency to the critical path of a single HTTP response, which is exactly
 * the shape of request that times out and 504s as the park catalog grows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const PER_PARK_UPSTREAM_DELAY_MS = 150;

const mockUpdateForecastAggregates = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = { set: mockBatchSet, commit: mockBatchCommit };
const mockGet = vi.hoisted(() => vi.fn());
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

// Four real, distinct supported park ids so the all-parks path has more than
// one entry to fan out over.
const PARK_IDS = [
  '75ea578a-adc8-4116-a54d-dccb60765ef9', // Magic Kingdom
  '47f90d2c-e191-4239-a466-5892ef59a88b', // EPCOT
  '288747d1-8b4f-4a64-867e-ea7c9b27bad8', // Hollywood Studios
  '1c84a229-8862-4648-9c71-378ddd2c7693', // Animal Kingdom
];

function request(): NextRequest {
  return new NextRequest('http://localhost:3000/api/wait-times');
}

describe('GET /api/wait-times — no-parkId path concurrency', () => {
  let concurrentFetchesInFlight = 0;
  let maxObservedConcurrency = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    concurrentFetchesInFlight = 0;
    maxObservedConcurrency = 0;
    mockRegistryParkIds.current = [...PARK_IDS];

    mockGet.mockResolvedValue({ docs: [] });

    mockFetch.mockImplementation(async (url: string) => {
      concurrentFetchesInFlight += 1;
      maxObservedConcurrency = Math.max(maxObservedConcurrency, concurrentFetchesInFlight);
      await new Promise((resolve) => setTimeout(resolve, PER_PARK_UPSTREAM_DELAY_MS));
      concurrentFetchesInFlight -= 1;
      const parkId = PARK_IDS.find((id) => url.includes(id)) ?? 'unknown';
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
                queue: { STANDBY: { waitTime: 10 } },
              },
            ],
          }),
      };
    });
  });

  it('refreshes multiple supported registry parks concurrently, not one at a time', async () => {
    await GET(request());

    // A strictly sequential loop can never have more than one upstream fetch
    // in flight at once. Observing overlap proves the route fans requests
    // out instead of awaiting each park before starting the next.
    expect(maxObservedConcurrency).toBeGreaterThan(1);
  });

  it('completes in roughly one bounded round, not linearly with park count', async () => {
    const startedAt = Date.now();
    await GET(request());
    const elapsedMs = Date.now() - startedAt;

    // Sequential would take >= PARK_IDS.length * PER_PARK_UPSTREAM_DELAY_MS
    // (600ms for 4 parks at 150ms each). Bounded concurrent execution should
    // complete in roughly a single delay window plus overhead.
    const sequentialFloorMs = PARK_IDS.length * PER_PARK_UPSTREAM_DELAY_MS;
    expect(elapsedMs).toBeLessThan(sequentialFloorMs);
  });

  it('still returns correct per-park data and metadata for every supported registry park', async () => {
    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    for (const parkId of PARK_IDS) {
      expect(data.parks[parkId]).toEqual([
        expect.objectContaining({ attractionId: `${parkId}-attraction`, waitMinutes: 10 }),
      ]);
      expect(data.parkMeta[parkId]).toEqual(expect.objectContaining({ source: 'upstream' }));
    }
  });
});
