/**
 * Regression tests for forced (cron) wait-time refreshes vs. public
 * read-path refreshes.
 *
 * Root cause under test: `refreshPark()` coalesced concurrent calls onto a
 * single in-flight promise keyed by parkId *alone*. The cron route calls
 * `refreshPark(parkId, { awaitMaintenance: true })`, which is a materially
 * different operation — it skips the read-first Firestore cache and awaits
 * persistence + maintenance — but with a parkId-only key it silently adopted
 * whatever public request happened to be in flight for that park. On a park
 * with any real traffic (i.e. the ones that matter most), the scheduled
 * refresh could therefore return a cached read, perform no upstream fetch and
 * run no maintenance, while still reporting `status: "fresh"`. The daily
 * refresh guarantee was defeated by ordinary user traffic.
 *
 * These tests pin:
 *  1. a forced refresh never joins an in-flight public refresh,
 *  2. a public refresh never joins an in-flight forced refresh,
 *  3. forced refreshes still coalesce with each other, and
 *  4. public refreshes still coalesce with each other (no regression to the
 *     existing in-flight coalescing behaviour).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { refreshPark } from '@/lib/wait-times/refresh';

const MAGIC_KINGDOM_ID = '75ea578a-adc8-4116-a54d-dccb60765ef9';

const LIVE_ENTRY = {
  id: 'test-attraction',
  name: 'Test Attraction',
  entityType: 'ATTRACTION',
  status: 'OPERATING',
  queue: { STANDBY: { waitTime: 20 } },
};

/** Upstream response whose body resolution is held open until released. */
function gatedFetchResponse(release: Promise<void>) {
  return {
    ok: true,
    json: async () => {
      await release;
      return { liveData: [LIVE_ENTRY] };
    },
  };
}

describe('refreshPark — forced vs public coalescing identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockReset();
    mockFetch.mockReset();
    mockGet.mockResolvedValue({ docs: [] });
    mockUpdateForecastAggregates.mockResolvedValue(undefined);
  });

  it('does not let a forced (cron) refresh join an in-flight public refresh', async () => {
    let releasePublic: () => void = () => {};
    const publicGate = new Promise<void>((resolve) => {
      releasePublic = resolve;
    });
    let markPublicFetchStarted: () => void = () => {};
    const publicFetchStarted = new Promise<void>((resolve) => {
      markPublicFetchStarted = resolve;
    });

    // The first upstream call is the public one and is held open; every
    // later call resolves immediately. Waiting on `publicFetchStarted`
    // (rather than a fixed number of microtask ticks) guarantees the public
    // refresh really is inside its gated fetch before the forced refresh
    // starts, so the test cannot deadlock on its own ordering.
    mockFetch.mockImplementationOnce(async () => {
      markPublicFetchStarted();
      return gatedFetchResponse(publicGate);
    });
    mockFetch.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ liveData: [LIVE_ENTRY] }),
    }));

    const publicRefresh = refreshPark(MAGIC_KINGDOM_ID);
    await publicFetchStarted;

    const forcedRefresh = refreshPark(MAGIC_KINGDOM_ID, { awaitMaintenance: true });
    expect(forcedRefresh).not.toBe(publicRefresh);

    const forcedResult = await forcedRefresh;
    // The forced refresh completed on its own upstream fetch while the
    // public one was still gated — proof it did not adopt that promise.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(forcedResult.meta.source).toBe('upstream');

    releasePublic();
    await publicRefresh;
  });

  it('does not let a public refresh join an in-flight forced refresh', async () => {
    let releaseForced: () => void = () => {};
    const forcedGate = new Promise<void>((resolve) => {
      releaseForced = resolve;
    });
    let markForcedFetchStarted: () => void = () => {};
    const forcedFetchStarted = new Promise<void>((resolve) => {
      markForcedFetchStarted = resolve;
    });

    mockFetch.mockImplementationOnce(async () => {
      markForcedFetchStarted();
      return gatedFetchResponse(forcedGate);
    });
    mockFetch.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ liveData: [LIVE_ENTRY] }),
    }));

    const forcedRefresh = refreshPark(MAGIC_KINGDOM_ID, { awaitMaintenance: true });
    await forcedFetchStarted;

    const publicRefresh = refreshPark(MAGIC_KINGDOM_ID);
    expect(publicRefresh).not.toBe(forcedRefresh);

    await publicRefresh;
    expect(mockFetch).toHaveBeenCalledTimes(2);

    releaseForced();
    await forcedRefresh;
  });

  it('forces a genuine upstream fetch even when a fresh single-doc cache exists', async () => {
    // A forced refresh must never be satisfied by the read-first cache: the
    // cron's entire purpose is a real upstream refresh on a schedule.
    mockGet.mockResolvedValue({
      docs: [
        {
          data: () => ({
            attractionId: 'test-attraction',
            attractionName: 'Test Attraction',
            status: 'OPERATING',
            waitMinutes: 20,
            fetchedAt: new Date().toISOString(),
          }),
        },
      ],
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ liveData: [LIVE_ENTRY] }),
    });

    const result = await refreshPark(MAGIC_KINGDOM_ID, { awaitMaintenance: true });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.meta.source).toBe('upstream');
  });

  it('still coalesces concurrent forced refreshes with each other', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ liveData: [LIVE_ENTRY] }),
    });

    const [first, second] = await Promise.all([
      refreshPark(MAGIC_KINGDOM_ID, { awaitMaintenance: true }),
      refreshPark(MAGIC_KINGDOM_ID, { awaitMaintenance: true }),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('still coalesces concurrent public refreshes with each other', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ liveData: [LIVE_ENTRY] }),
    });

    const [first, second] = await Promise.all([
      refreshPark(MAGIC_KINGDOM_ID),
      refreshPark(MAGIC_KINGDOM_ID),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });
});
