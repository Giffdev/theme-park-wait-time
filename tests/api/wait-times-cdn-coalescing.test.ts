/**
 * Contract: cross-instance request coalescing for /api/wait-times requires a
 * CDN-visible cache-control signal (short `s-maxage` + `stale-while-revalidate`)
 * on the cacheable single-park read path, so that concurrent requests for the
 * same park hitting *different* serverless instances can still be collapsed
 * by Vercel's edge/CDN layer rather than each instance independently hitting
 * upstream + Firestore. In-process `refreshPark()` in-flight coalescing (see
 * wait-times-refresh-coalescing.test.ts) only helps requests that land on the
 * same instance — it does nothing for the multi-instance case.
 *
 * Today, `vercel.json` forces `Cache-Control: no-store, max-age=0` on every
 * `/api/*` route (including wait-times), and the route handler hardcodes the
 * same no-store header on every response. That blanket policy is correct for
 * the cron and mutation-adjacent paths, but it defeats CDN-level coalescing
 * for the read-mostly single-park GET path — every request, even ones
 * milliseconds apart for the identical park, is forced to bypass any shared
 * edge cache.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
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
const LIVE_ENTRY = {
  id: 'test-attraction',
  name: 'Test Attraction',
  entityType: 'ATTRACTION',
  status: 'OPERATING',
  queue: { STANDBY: { waitTime: 20 } },
};

function request(parkId: string = MAGIC_KINGDOM_ID): NextRequest {
  return new NextRequest(`http://localhost:3000/api/wait-times?parkId=${parkId}`);
}

describe('GET /api/wait-times — CDN cross-instance coalescing headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ docs: [] });
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ liveData: [LIVE_ENTRY] }) });
  });

  it('advertises a short CDN-cacheable window for the single-park read path', async () => {
    const response = await GET(request());
    const cacheControl = response.headers.get('cache-control') ?? '';

    expect(cacheControl).toMatch(/s-maxage=\d+/);
    expect(cacheControl).toMatch(/stale-while-revalidate=\d+/);
  });

  it('shrinks the CDN window (does not drop it) when serving stale/degraded data', async () => {
    // Populate the Firestore fallback cache, then force upstream to fail so
    // the response is served stale — the CDN window must shrink, not vanish
    // and not stay at the full fresh duration (never pin stale data at the
    // edge for the same window as fresh data).
    mockGet.mockResolvedValueOnce({
      docs: [{
        data: () => ({
          attractionId: 'test-attraction',
          attractionName: 'Test Attraction',
          status: 'OPERATING',
          waitMinutes: 20,
          fetchedAt: new Date().toISOString(),
        }),
      }],
    });
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' });

    const response = await GET(request());
    const data = await response.json();
    const cacheControl = response.headers.get('cache-control') ?? '';

    expect(data.stale).toBe(true);
    expect(cacheControl).toMatch(/s-maxage=5\b/);
    expect(cacheControl).not.toMatch(/no-store/);
  });

  it('never advertises a CDN-cacheable window when the response carries per-park errors', async () => {
    // Earlier tests may leave an unconsumed `mockResolvedValueOnce` queued on
    // mockGet/mockFetch (vi.clearAllMocks() clears call history but NOT
    // pending "Once" queues — only mockReset() does). Explicitly reset both
    // so no leftover queued value from a previous test can leak in here.
    mockGet.mockReset();
    mockFetch.mockReset();
    mockGet.mockResolvedValue({ docs: [] });

    // No Firestore fallback cache and upstream fails outright — this must be
    // an explicit hard failure, and hard failures must never be CDN-cached
    // (an error response getting pinned at the edge would serve everyone a
    // stale failure for the cache window).
    const hardFailureParkId = '47f90d2c-e191-4239-a466-5892ef59a88b';
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

    const response = await GET(request(hardFailureParkId));
    const cacheControl = response.headers.get('cache-control') ?? '';

    expect(response.status).toBe(502);
    expect(cacheControl).toMatch(/no-store/);
  });

  it('does not force a blanket no-store override for this route in vercel.json', () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };

    const apiWideRule = (config.headers ?? []).find((rule) => rule.source === '/api/(.*)');
    const noStoreOnEverything = apiWideRule?.headers.some(
      (h) => h.key.toLowerCase() === 'cache-control' && /no-store/.test(h.value),
    );

    // A blanket no-store rule matching every /api/* path (including
    // wait-times) overrides any per-route CDN cache-control the route
    // handler sets, defeating cross-instance coalescing. The cron and
    // mutation endpoints should keep no-store; the wait-times read path
    // needs a carve-out.
    expect(noStoreOnEverything).not.toBe(true);
  });
});
