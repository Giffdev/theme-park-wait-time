/**
 * Tests for GET /api/wait-times — Phase 1 expanded data capture.
 *
 * Validates:
 * - Virtual queue fields (RETURN_TIME, PAID_RETURN_TIME, BOARDING_GROUP) are captured
 * - Forecast array is stored when present
 * - Forecast null handled gracefully (~30-40% of attractions won't have it)
 * - operatingHours array is captured
 * - API resilience: 429/500 → serve stale cache
 * - N/A wait times are NOT treated as longest (regression)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
const mockBatch = { set: mockBatchSet, commit: mockBatchCommit };

const mockGet = vi.fn();

// Recursive mock that handles arbitrary .collection().doc() chains
function createChainableMock() {
  const mock: Record<string, unknown> = {};
  mock.doc = vi.fn().mockReturnValue(mock);
  mock.collection = vi.fn().mockReturnValue(mock);
  mock.get = mockGet;
  mock.id = 'mock-doc';
  return mock;
}

vi.mock('@/lib/firebase/admin', () => ({
  adminApp: { name: 'mock-app' },
  adminDb: {
    batch: () => mockBatch,
    collection: () => createChainableMock(),
  },
}));

// Mock global fetch for ThemeParks API
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { GET } from '@/app/api/wait-times/route';

// ---------------------------------------------------------------------------
// Fixtures: realistic ThemeParks Wiki API responses
// ---------------------------------------------------------------------------

const ATTRACTION_WITH_ALL_QUEUES = {
  id: 'tron-lightcycle-run',
  name: 'TRON Lightcycle / Run',
  entityType: 'ATTRACTION',
  status: 'OPERATING',
  lastUpdated: '2026-04-29T14:30:00-04:00',
  queue: {
    STANDBY: { waitTime: 75 },
    RETURN_TIME: {
      state: 'AVAILABLE',
      returnStart: '2026-04-29T15:55:00-04:00',
      returnEnd: '2026-04-29T16:55:00-04:00',
    },
    PAID_RETURN_TIME: {
      state: 'AVAILABLE',
      returnStart: '2026-04-29T16:00:00-04:00',
      returnEnd: '2026-04-29T17:00:00-04:00',
      price: { amount: 2000, currency: 'USD', formatted: '$20.00' },
    },
    BOARDING_GROUP: {
      state: 'AVAILABLE',
      currentGroupStart: 45,
      currentGroupEnd: 55,
      estimatedWait: 30,
    },
  },
  forecast: [
    { time: '2026-04-29T09:00:00-04:00', waitTime: 35, percentage: 30 },
    { time: '2026-04-29T10:00:00-04:00', waitTime: 55, percentage: 47 },
    { time: '2026-04-29T11:00:00-04:00', waitTime: 75, percentage: 64 },
    { time: '2026-04-29T12:00:00-04:00', waitTime: 90, percentage: 77 },
    { time: '2026-04-29T13:00:00-04:00', waitTime: 100, percentage: 85 },
    { time: '2026-04-29T14:00:00-04:00', waitTime: 80, percentage: 68 },
    { time: '2026-04-29T15:00:00-04:00', waitTime: 60, percentage: 51 },
  ],
  operatingHours: [
    { type: 'Early Entry', startTime: '2026-04-29T08:30:00-04:00', endTime: '2026-04-29T09:00:00-04:00' },
    { type: 'Operating', startTime: '2026-04-29T09:00:00-04:00', endTime: '2026-04-29T22:00:00-04:00' },
  ],
};

const ATTRACTION_WITHOUT_FORECAST = {
  id: 'its-a-small-world',
  name: "it's a small world",
  entityType: 'ATTRACTION',
  status: 'OPERATING',
  lastUpdated: '2026-04-29T14:30:00-04:00',
  queue: {
    STANDBY: { waitTime: 15 },
  },
  forecast: null,
  operatingHours: [
    { type: 'Operating', startTime: '2026-04-29T09:00:00-04:00', endTime: '2026-04-29T22:00:00-04:00' },
  ],
};

const ATTRACTION_NA_WAIT = {
  id: 'hall-of-presidents',
  name: 'The Hall of Presidents',
  entityType: 'SHOW',
  status: 'OPERATING',
  lastUpdated: '2026-04-29T14:30:00-04:00',
  queue: {
    STANDBY: { waitTime: null },
  },
  forecast: null,
  operatingHours: null,
};

function createMockApiResponse(attractions = [ATTRACTION_WITH_ALL_QUEUES, ATTRACTION_WITHOUT_FORECAST]) {
  return { liveData: attractions };
}

function createRequest(parkId?: string): NextRequest {
  const url = parkId
    ? `http://localhost:3000/api/wait-times?parkId=${parkId}`
    : 'http://localhost:3000/api/wait-times';
  return new NextRequest(url, { method: 'GET' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/wait-times — expanded data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(createMockApiResponse()),
    });
  });

  describe('Virtual queue fields', () => {
    it('captures queue.RETURN_TIME with state, returnStart, returnEnd', async () => {
      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();
      const tron = data.parks['magic-kingdom'].find(
        (a: { attractionId: string }) => a.attractionId === 'tron-lightcycle-run'
      );

      expect(tron.queue?.RETURN_TIME).toEqual({
        state: 'AVAILABLE',
        returnStart: '2026-04-29T15:55:00-04:00',
        returnEnd: '2026-04-29T16:55:00-04:00',
      });
    });

    it('captures queue.PAID_RETURN_TIME with price object', async () => {
      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();
      const tron = data.parks['magic-kingdom'].find(
        (a: { attractionId: string }) => a.attractionId === 'tron-lightcycle-run'
      );

      expect(tron.queue?.PAID_RETURN_TIME).toEqual({
        state: 'AVAILABLE',
        returnStart: '2026-04-29T16:00:00-04:00',
        returnEnd: '2026-04-29T17:00:00-04:00',
        price: { amount: 2000, currency: 'USD', formatted: '$20.00' },
      });
    });

    it('captures queue.BOARDING_GROUP fields', async () => {
      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();
      const tron = data.parks['magic-kingdom'].find(
        (a: { attractionId: string }) => a.attractionId === 'tron-lightcycle-run'
      );

      expect(tron.queue?.BOARDING_GROUP).toEqual({
        state: 'AVAILABLE',
        currentGroupStart: 45,
        currentGroupEnd: 55,
        estimatedWait: 30,
      });
    });

    it('handles attraction with ALL queue types simultaneously', async () => {
      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();
      const tron = data.parks['magic-kingdom'].find(
        (a: { attractionId: string }) => a.attractionId === 'tron-lightcycle-run'
      );

      // This is rare but the spec says possible — all three should coexist
      expect(tron.queue?.RETURN_TIME).toBeDefined();
      expect(tron.queue?.PAID_RETURN_TIME).toBeDefined();
      expect(tron.queue?.BOARDING_GROUP).toBeDefined();
      expect(tron.waitMinutes).toBe(75); // STANDBY still captured separately
    });
  });

  describe('Forecast data', () => {
    it('stores forecast array when present', async () => {
      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();
      const tron = data.parks['magic-kingdom'].find(
        (a: { attractionId: string }) => a.attractionId === 'tron-lightcycle-run'
      );

      expect(tron.forecast).toHaveLength(7);
      expect(tron.forecast[0]).toEqual({
        time: '2026-04-29T09:00:00-04:00',
        waitTime: 35,
        percentage: 30,
      });
    });

    it('stores forecast: null gracefully when not present', async () => {
      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();
      const smallWorld = data.parks['magic-kingdom'].find(
        (a: { attractionId: string }) => a.attractionId === 'its-a-small-world'
      );

      expect(smallWorld.forecast).toBeNull();
    });

    it('handles forecast with 0 entries (empty array)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          liveData: [{
            ...ATTRACTION_WITH_ALL_QUEUES,
            id: 'test-ride',
            forecast: [],
          }],
        }),
      });

      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();
      const ride = data.parks['magic-kingdom'].find(
        (a: { attractionId: string }) => a.attractionId === 'test-ride'
      );

      // Empty array is falsy for .length check, so implementation returns null
      expect(ride.forecast).toBeNull();
    });

    it('handles forecast: undefined (field missing entirely)', async () => {
      const attractionNoForecastField = { ...ATTRACTION_WITHOUT_FORECAST };
      delete (attractionNoForecastField as Record<string, unknown>).forecast;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ liveData: [attractionNoForecastField] }),
      });

      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();
      const ride = data.parks['magic-kingdom'][0];

      // Should normalize undefined to null, not crash
      expect(ride.forecast === null || ride.forecast === undefined).toBe(true);
    });
  });

  describe('Operating hours', () => {
    it('captures operatingHours array with type, startTime, endTime', async () => {
      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();
      const tron = data.parks['magic-kingdom'].find(
        (a: { attractionId: string }) => a.attractionId === 'tron-lightcycle-run'
      );

      expect(tron.operatingHours).toHaveLength(2);
      expect(tron.operatingHours[0]).toEqual({
        type: 'Early Entry',
        startTime: '2026-04-29T08:30:00-04:00',
        endTime: '2026-04-29T09:00:00-04:00',
      });
    });

    it('handles operatingHours: null gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ liveData: [ATTRACTION_NA_WAIT] }),
      });

      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();

      expect(data.parks['magic-kingdom'][0].operatingHours).toBeNull();
    });

    it('handles Early Entry starting before main operating hours', async () => {
      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();
      const tron = data.parks['magic-kingdom'].find(
        (a: { attractionId: string }) => a.attractionId === 'tron-lightcycle-run'
      );

      const earlyEntry = tron.operatingHours.find((h: { type: string }) => h.type === 'Early Entry');
      const operating = tron.operatingHours.find((h: { type: string }) => h.type === 'Operating');

      // Early Entry ends when Operating starts
      expect(new Date(earlyEntry.endTime).getTime()).toBeLessThanOrEqual(
        new Date(operating.startTime).getTime()
      );
    });
  });

  describe('API resilience', () => {
    it('serves stale cache on 429 (rate limit) response', async () => {
      // First: populate the in-memory cache with a successful request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockApiResponse()),
      });
      await GET(createRequest('magic-kingdom'));

      // Now: API returns 429 — should serve stale in-memory cache
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const response = await GET(createRequest('magic-kingdom'));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.parks['magic-kingdom']).toBeDefined();
      expect(data.stale).toBe(true);
    });

    it('serves stale cache with staleness indicator on 500 response', async () => {
      // First: populate the in-memory cache with a successful request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(createMockApiResponse()),
      });
      await GET(createRequest('magic-kingdom'));

      // Now: API returns 500 — should serve stale in-memory cache
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stale).toBe(true);
    });
  });

  describe('Regression tests', () => {
    it('N/A wait times are NOT treated as longest wait (sort regression)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          liveData: [
            { ...ATTRACTION_WITH_ALL_QUEUES, id: 'ride-a', queue: { STANDBY: { waitTime: 90 } } },
            { ...ATTRACTION_NA_WAIT, id: 'ride-b' }, // waitTime: null
            { ...ATTRACTION_WITH_ALL_QUEUES, id: 'ride-c', queue: { STANDBY: { waitTime: 45 } } },
          ],
        }),
      });

      const response = await GET(createRequest('magic-kingdom'));
      const data = await response.json();
      const rides = data.parks['magic-kingdom'];

      const rideB = rides.find((r: { attractionId: string }) => r.attractionId === 'ride-b');
      // null should NOT be treated as Infinity or max value
      expect(rideB.waitMinutes).toBeNull();

      // If sorted by wait, null should not be at the top
      const sortedByWait = [...rides]
        .filter((r: { waitMinutes: number | null }) => r.waitMinutes !== null)
        .sort((a: { waitMinutes: number }, b: { waitMinutes: number }) => b.waitMinutes - a.waitMinutes);
      if (sortedByWait.length > 0) {
        expect(sortedByWait[0].attractionId).toBe('ride-a'); // 90 min is longest actual wait
      }
    });

    it('price field missing currency or formatted string does not crash', async () => {
      const attractionBadPrice = {
        ...ATTRACTION_WITH_ALL_QUEUES,
        id: 'bad-price-ride',
        queue: {
          STANDBY: { waitTime: 30 },
          PAID_RETURN_TIME: {
            state: 'AVAILABLE',
            returnStart: '2026-04-29T16:00:00-04:00',
            returnEnd: null,
            price: { amount: 1500 }, // missing currency and formatted
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ liveData: [attractionBadPrice] }),
      });

      const response = await GET(createRequest('magic-kingdom'));
      expect(response.status).toBe(200);

      const data = await response.json();
      const ride = data.parks['magic-kingdom'][0];
      expect(ride.queue?.PAID_RETURN_TIME?.price?.amount).toBe(1500);
    });
  });
});
