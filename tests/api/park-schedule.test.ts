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
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_SCHEDULE_RESPONSE = {
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
      parkId: 'magic-kingdom',
      date: '2026-04-29',
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
      const response = await GET(createRequest({ parkId: 'magic-kingdom', date: '2026-04-29' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.segments).toHaveLength(3);
      expect(data.parkId).toBe('magic-kingdom');
      expect(data.date).toBe('2026-04-29');
    });

    it('returns TICKETED_EVENT segments with correct type and description', async () => {
      const response = await GET(createRequest({ parkId: 'magic-kingdom', date: '2026-04-29' }));
      const data = await response.json();

      const ticketedEvents = data.segments.filter(
        (s: { type: string }) => s.type === 'TICKETED_EVENT'
      );
      expect(ticketedEvents).toHaveLength(2);
      expect(ticketedEvents[0].description).toBe('Early Entry');
      expect(ticketedEvents[1].description).toBe('Extended Evening');
    });

    it('includes purchases array (Lightning Lane pricing) in OPERATING segment', async () => {
      const response = await GET(createRequest({ parkId: 'magic-kingdom', date: '2026-04-29' }));
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

      const response = await GET(createRequest({ parkId: 'magic-kingdom', date: '2026-04-29' }));

      expect(response.status).toBe(200);
      // Should NOT have called the external API
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('re-fetches from API when cache is older than 1 hour', async () => {
      const oldFetch = new Date(Date.now() - 61 * 60 * 1000); // 61 min ago
      mockDocGet.mockResolvedValue(
        createCachedDoc(FULL_SCHEDULE_RESPONSE.schedule, oldFetch)
      );

      const response = await GET(createRequest({ parkId: 'magic-kingdom', date: '2026-04-29' }));

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

      const response = await GET(createRequest({ parkId: 'magic-kingdom', date: '2026-04-29' }));
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

      const response = await GET(createRequest({ parkId: 'magic-kingdom', date: '2026-04-29' }));

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

      const response = await GET(createRequest({ parkId: 'magic-kingdom', date: '2026-04-29' }));

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

      const response = await GET(createRequest({ parkId: 'magic-kingdom', date: '2026-04-29' }));
      const data = await response.json();

      expect(response.status).toBe(200);
      const operating = data.segments[0];
      // purchases should be null/undefined/empty, not crash
      expect(operating.purchases === undefined || operating.purchases === null || Array.isArray(operating.purchases)).toBe(true);
    });
  });
});
