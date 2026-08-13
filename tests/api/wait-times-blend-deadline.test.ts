/**
 * Contract: cache-read / upstream / blend deadlines must degrade correctly.
 *
 * - If the historical-forecast blend lookup (Firestore `forecastAggregates`
 *   read) stalls or fails, the request must NOT lose the fresh live wait
 *   times it already has — forecast degrades to `source: 'none'`, waits stay.
 * - If upstream fails and there is no persistent Firestore cache and no
 *   memory cache, the failure must be explicit (502 / error surfaced), never
 *   silently returned as if fresh.
 * - If upstream fails and a persistent Firestore cache exists, that stale
 *   cache is returned honestly (`stale: true`, `source: 'firestore-cache'`),
 *   not disguised as live data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockUpdateForecastAggregates = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = { set: mockBatchSet, commit: mockBatchCommit };
const mockGet = vi.hoisted(() => vi.fn());
const mockGetAll = vi.hoisted(() => vi.fn());

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
    getAll: mockGetAll,
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

const ATTRACTION_NO_LIVE_FORECAST = {
  id: 'space-mountain',
  name: 'Space Mountain',
  entityType: 'ATTRACTION',
  status: 'OPERATING',
  queue: { STANDBY: { waitTime: 45 } },
  forecast: null, // forces the blend path to consult forecastAggregates
};

function request(parkId = MAGIC_KINGDOM_ID): NextRequest {
  return new NextRequest(`http://localhost:3000/api/wait-times?parkId=${parkId}`);
}

describe('GET /api/wait-times — cache/upstream/blend deadline degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ docs: [] });
    mockGetAll.mockResolvedValue([{ exists: false }]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ liveData: [ATTRACTION_NO_LIVE_FORECAST] }),
    });
  });

  it('does not lose fresh wait data when the forecast-aggregate read fails outright', async () => {
    mockGetAll.mockRejectedValue(new Error('forecastAggregates read failed'));

    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stale).toBe(false);
    expect(data.parks[MAGIC_KINGDOM_ID]).toEqual([
      expect.objectContaining({
        attractionId: 'space-mountain',
        waitMinutes: 45,
        forecastMeta: expect.objectContaining({ source: 'none' }),
      }),
    ]);
  });

  it(
    'bounds the forecast-aggregate read so a hung lookup cannot stall the response indefinitely',
    async () => {
      // Simulate a Firestore read that never resolves (e.g. a network
      // partition to Firestore while ThemeParks Wiki itself is healthy). A
      // well-behaved blend step must apply its own deadline rather than hang
      // forever, because an un-timed-out await here reintroduces the exact
      // class of 504 this architecture exists to prevent. Uses a park id
      // distinct from other tests in this file: refreshPark's in-flight map
      // never clears for a promise that hangs forever, so a shared park id
      // would poison every later test in this file.
      mockGetAll.mockImplementation(() => new Promise(() => {}));

      const DEADLINE_BUDGET_MS = 1_000;
      const response = await Promise.race([
        GET(request(EPCOT_ID)),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('forecast blend did not honor a bounded deadline')),
            DEADLINE_BUDGET_MS,
          ),
        ),
      ]);

      expect(response.status).toBe(200);
      const data = await (response as Response).json();
      expect(data.parks[EPCOT_ID]).toEqual([
        expect.objectContaining({ attractionId: 'space-mountain', waitMinutes: 45 }),
      ]);
    },
    3_000,
  );

  it('returns stale Firestore cache honestly when upstream fails (no silent "fresh" mislabel)', async () => {
    mockFetch.mockRejectedValue(new Error('upstream unreachable'));
    mockGet.mockResolvedValueOnce({
      docs: [
        {
          data: () => ({
            attractionId: 'space-mountain',
            attractionName: 'Space Mountain',
            status: 'OPERATING',
            waitMinutes: 40,
            fetchedAt: '2026-08-11T20:00:00.000Z',
          }),
        },
      ],
    });

    // A park never touched elsewhere in this file, so there is no
    // module-level memory cache to fall back to first — this isolates the
    // Firestore-cache fallback path specifically.
    const response = await GET(request(HOLLYWOOD_STUDIOS_ID));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stale).toBe(true);
    expect(data.parkMeta[HOLLYWOOD_STUDIOS_ID]).toEqual(
      expect.objectContaining({ stale: true, source: 'firestore-cache' }),
    );
    expect(mockBatchCommit).not.toHaveBeenCalled();
  });

  it('surfaces a hard, explicit failure when upstream fails and no cache exists at any layer', async () => {
    mockFetch.mockRejectedValue(new Error('upstream unreachable'));
    mockGet.mockResolvedValueOnce({ docs: [] });

    // Another park untouched elsewhere in this file: no memory cache, no
    // Firestore cache — nothing to honestly degrade to, so the failure must
    // be explicit rather than silently reported as a 200.
    const response = await GET(request(ANIMAL_KINGDOM_ID));

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toEqual(expect.any(String));
  });
});
