/**
 * Tests for GET /api/park-schedule — new endpoint (Phase 1).
 *
 * Validates:
 * - Happy path: parkId + date → schedule segments
 * - Cache behavior: hit within 1hr, miss after 1hr
 * - Stale fallback: API down → serve stale with stale: true
 * - No cache + API down: return 503
 * - Invalid parkId: return 400
 * - TICKETED_EVENT segments typed correctly
 * - purchases array (Lightning Lane pricing) included
 * - Overlapping time segments edge case
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDocGet = vi.fn();
const mockDocSet = vi.fn().mockResolvedValue(undefined);
const mockDocRef = { get: mockDocGet, set: mockDocSet };

vi.mock('@/lib/firebase/admin', () => ({
  adminApp: { name: 'mock-app' },
  adminDb: {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => mockDocRef,
        }),
      }),
    }),
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({
      toDate: () => new Date('2026-04-29T14:30:00-04:00'),
    }),
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import AFTER mocks
import { GET } from '@/app/api/park-schedule/route';
import { getParkOperatingStatus } from '@/lib/parks/park-schedule-check';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MAGIC_KINGDOM_UUID = '75ea578a-adc8-4116-a54d-dccb60765ef9';
const ISLANDS_OF_ADVENTURE_UUID = '267615cc-8943-4c2a-ae2c-5da728ca591f';

const FULL_SCHEDULE_RESPONSE = {
  id: MAGIC_KINGDOM_UUID,
  name: 'Magic Kingdom',
  timezone: 'America/New_York',
  schedule: [
    {
      date: '2026-04-29',
      type: 'TICKETED_EVENT',
      description: 'Early Entry',
      openingTime: '2026-04-29T08:30:00-04:00',
      closingTime: '2026-04-29T09:00:00-04:00',
    },
    {
      date: '2026-04-29',
      type: 'OPERATING',
      description: null,
      openingTime: '2026-04-29T09:00:00-04:00',
      closingTime: '2026-04-29T22:00:00-04:00',
      purchases: [
        {
          name: 'Lightning Lane Multi Pass',
          type: 'PACKAGE',
          price: { amount: 3500, currency: 'USD', formatted: '$35.00' },
          available: true,
        },
        {
          name: 'Lightning Lane for TRON Lightcycle / Run',
          type: 'ATTRACTION',
          price: { amount: 2000, currency: 'USD', formatted: '$20.00' },
          available: false,
        },
      ],
    },
    {
      date: '2026-04-29',
      type: 'TICKETED_EVENT',
      description: 'Extended Evening',
      openingTime: '2026-04-29T22:00:00-04:00',
      closingTime: '2026-04-30T00:00:00-04:00',
    },
  ],
};

function createRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/park-schedule');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString(), { method: 'GET' });
}

function createCachedDoc(schedule: unknown, fetchedAt: Date) {
  return {
    exists: true,
    data: () => ({
      segments: schedule,
      fetchedAt: fetchedAt.toISOString(),
      parkId: MAGIC_KINGDOM_UUID,
      date: '2026-04-29',
      timezone: 'America/New_York',
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/park-schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDocGet.mockResolvedValue({ exists: false });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(FULL_SCHEDULE_RESPONSE),
    });
  });

  describe('Happy path', () => {
    it('returns schedule segments for valid parkId + date', async () => {
      const response = await GET(createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-29' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.segments).toHaveLength(3);
      expect(data.parkId).toBe(MAGIC_KINGDOM_UUID);
      expect(data.date).toBe('2026-04-29');
      expect(data.hasData).toBe(true);
      expect(mockDocSet).toHaveBeenCalledWith(
        expect.objectContaining({ hasData: true })
      );
    });

    it('returns TICKETED_EVENT segments with correct type and description', async () => {
      const response = await GET(createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-29' }));
      const data = await response.json();

      const ticketedEvents = data.segments.filter(
        (s: { type: string }) => s.type === 'TICKETED_EVENT'
      );
      expect(ticketedEvents).toHaveLength(2);
      expect(ticketedEvents[0].description).toBe('Early Entry');
      expect(ticketedEvents[1].description).toBe('Extended Evening');
    });

    it('includes purchases array (Lightning Lane pricing) in OPERATING segment', async () => {
      const response = await GET(createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-29' }));
      const data = await response.json();

      const operating = data.segments.find(
        (s: { type: string }) => s.type === 'OPERATING'
      );
      expect(operating.purchases).toHaveLength(2);
      expect(operating.purchases[0]).toMatchObject({
        name: 'Lightning Lane Multi Pass',
        price: { formatted: '$35.00' },
        available: true,
      });
      expect(operating.purchases[1]).toMatchObject({
        name: 'Lightning Lane for TRON Lightcycle / Run',
        available: false,
      });
    });
  });

  describe('Cache behavior', () => {
    it('uses Firestore cache on second request within 1 hour', async () => {
      const recentFetch = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
      mockDocGet.mockResolvedValue(
        createCachedDoc(FULL_SCHEDULE_RESPONSE.schedule, recentFetch)
      );

      const response = await GET(createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-29' }));

      expect(response.status).toBe(200);
      // Should NOT have called the external API
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('re-fetches from API when cache is older than 1 hour', async () => {
      const oldFetch = new Date(Date.now() - 61 * 60 * 1000); // 61 min ago
      mockDocGet.mockResolvedValue(
        createCachedDoc(FULL_SCHEDULE_RESPONSE.schedule, oldFetch)
      );

      const response = await GET(createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-29' }));

      expect(response.status).toBe(200);
      // Should have called the external API for fresh data
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Stale fallback', () => {
    it('serves stale cache with stale: true when API is down', async () => {
      const oldFetch = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      mockDocGet.mockResolvedValue(
        createCachedDoc(FULL_SCHEDULE_RESPONSE.schedule, oldFetch)
      );
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const response = await GET(createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-29' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stale).toBe(true);
      expect(data.segments).toBeDefined();
    });

    it('returns 503 when no cache exists AND API is down', async () => {
      mockDocGet.mockResolvedValue({ exists: false });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const response = await GET(createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-29' }));

      expect(response.status).toBe(503);
    });
  });

  describe('Input validation', () => {
    it('returns 400 for missing parkId', async () => {
      const response = await GET(createRequest({ date: '2026-04-29' }));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });

    it('returns 400 with helpful message for invalid parkId format', async () => {
      const response = await GET(createRequest({ parkId: '', date: '2026-04-29' }));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/park/i);
    });

    it('rejects unknown UUIDs before cache or upstream access', async () => {
      const response = await GET(
        createRequest({
          parkId: '00000000-0000-4000-8000-000000000001',
          date: '2026-04-29',
        })
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: expect.stringMatching(/canonical/i) });
      expect(mockDocGet).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects retired UUIDs rather than silently resolving them', async () => {
      const response = await GET(
        createRequest({
          parkId: 'aa8c2744-b792-4802-8a70-8bba51bc73da',
          date: '2026-04-29',
        })
      );

      expect(response.status).toBe(400);
      expect(mockDocGet).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('handles schedule with overlapping time segments', async () => {
      const overlappingSchedule = {
        schedule: [
          {
            date: '2026-04-29',
            type: 'OPERATING',
            openingTime: '2026-04-29T09:00:00-04:00',
            closingTime: '2026-04-29T22:00:00-04:00',
          },
          {
            date: '2026-04-29',
            type: 'TICKETED_EVENT',
            description: 'Extended Evening',
            openingTime: '2026-04-29T21:00:00-04:00', // Overlaps with OPERATING
            closingTime: '2026-04-30T00:00:00-04:00',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(overlappingSchedule),
      });

      const response = await GET(createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-29' }));

      // Should not crash — overlaps happen in real data
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.segments).toHaveLength(2);
    });

    it('handles schedule with no purchases array', async () => {
      const noPurchases = {
        schedule: [{
          date: '2026-04-29',
          type: 'OPERATING',
          openingTime: '2026-04-29T09:00:00-04:00',
          closingTime: '2026-04-29T22:00:00-04:00',
          // No purchases field at all
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(noPurchases),
      });

      const response = await GET(createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-29' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      const operating = data.segments[0];
      // purchases should be null/undefined/empty, not crash
      expect(operating.purchases === undefined || operating.purchases === null || Array.isArray(operating.purchases)).toBe(true);
    });
  });

  describe('Shared cache schema', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-29T16:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('writes confirmed closures with hasData so the crowd-calendar reader can reuse them', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: MAGIC_KINGDOM_UUID,
          name: 'Magic Kingdom',
          timezone: 'America/New_York',
          schedule: [
            {
              date: '2026-04-29',
              type: 'OPERATING',
              openingTime: '2026-04-29T09:00:00-04:00',
              closingTime: '2026-04-29T22:00:00-04:00',
            },
            {
              date: '2026-05-01',
              type: 'OPERATING',
              openingTime: '2026-05-01T09:00:00-04:00',
              closingTime: '2026-05-01T22:00:00-04:00',
            },
          ],
        }),
      });

      const response = await GET(
        createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-30' })
      );
      const routeData = await response.json();
      const written = mockDocSet.mock.calls.at(-1)?.[0];

      expect(routeData).toMatchObject({
        date: '2026-04-30',
        segments: [],
        hasData: true,
      });
      expect(written).toMatchObject({ segments: [], hasData: true });

      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => written,
      });
      mockFetch.mockClear();

      const status = await getParkOperatingStatus(MAGIC_KINGDOM_UUID, '2026-04-30');

      expect(mockFetch).not.toHaveBeenCalled();
      expect(status).toMatchObject({ isOpen: false, hasData: true });
    });

    it('serves a crowd-calendar writer document through the route without schema ambiguity', async () => {
      await getParkOperatingStatus(MAGIC_KINGDOM_UUID, '2026-04-29');
      const written = mockDocSet.mock.calls.at(-1)?.[0];

      expect(written).toMatchObject({ hasData: true });

      mockDocGet.mockResolvedValue({
        exists: true,
        data: () => written,
      });
      mockFetch.mockClear();

      const response = await GET(
        createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-29' })
      );
      const routeData = await response.json();

      expect(mockFetch).not.toHaveBeenCalled();
      expect(routeData).toMatchObject({ hasData: true });
    });

    it('does not persist a temporary beyond-horizon NO_DATA response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: MAGIC_KINGDOM_UUID,
          name: 'Magic Kingdom',
          timezone: 'America/New_York',
          schedule: [
            {
              date: '2026-04-29',
              type: 'OPERATING',
              openingTime: '2026-04-29T09:00:00-04:00',
              closingTime: '2026-04-29T22:00:00-04:00',
            },
            {
              date: '2026-04-30',
              type: 'OPERATING',
              openingTime: '2026-04-30T09:00:00-04:00',
              closingTime: '2026-04-30T22:00:00-04:00',
            },
          ],
        }),
      });

      const response = await GET(
        createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-05-01' })
      );
      const routeData = await response.json();

      expect(routeData).toMatchObject({ hasData: false, segments: [] });
      expect(mockDocSet).not.toHaveBeenCalled();
    });
  });

  describe('Bounded reads/writes (production 45s-hang regression)', () => {
    // Root cause: this route previously had zero timeout/deadline handling
    // anywhere — an unbounded Firestore `cacheRef.get()`/`.set()` or a
    // stalled upstream fetch could hang the whole request indefinitely,
    // observed in production as a 45+ second hang for Islands of Adventure
    // and Magic Kingdom while the upstream API itself responded in ~253ms.

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('degrades a hung Firestore cache read to a cache miss and still serves fresh data', async () => {
      // Cache read never resolves — simulates a stalled/hung Firestore call.
      mockDocGet.mockReturnValue(new Promise(() => {}));

      const responsePromise = GET(createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-29' }));

      // Advance past the cache-read timeout (3s) but well below the route
      // deadline (15s) — the read should be abandoned, not awaited forever.
      await vi.advanceTimersByTimeAsync(3_100);

      const response = await responsePromise;
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.segments).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns an explicit 504 rather than hanging when every stage stalls past the route deadline', async () => {
      // Both the cache read and the upstream fetch hang indefinitely —
      // exactly the failure mode observed in production.
      mockDocGet.mockReturnValue(new Promise(() => {}));
      mockFetch.mockReturnValue(new Promise(() => {}));

      const responsePromise = GET(createRequest({ parkId: ISLANDS_OF_ADVENTURE_UUID, date: '2026-04-29' }));

      // Advance past the route-level deadline (15s).
      await vi.advanceTimersByTimeAsync(15_100);

      const response = await responsePromise;
      const data = await response.json();

      expect(response.status).toBe(504);
      expect(data.error).toMatch(/deadline/i);
    });

    it('never awaits the Firestore cache write before responding', async () => {
      // Cache write hangs forever — the response must still return promptly
      // because the write is deferred via scheduleBackgroundWrite(), not
      // awaited in the response path.
      mockDocSet.mockReturnValue(new Promise(() => {}));

      const response = await GET(createRequest({ parkId: MAGIC_KINGDOM_UUID, date: '2026-04-29' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.segments).toHaveLength(3);
    });
  });
});
