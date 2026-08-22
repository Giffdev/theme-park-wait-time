/**
 * Regression tests for refreshPark() concurrency behavior.
 *
 * Root cause under test: production /api/wait-times requests were observed
 * to take 40-90+ seconds (and eventually 504 FUNCTION_INVOCATION_TIMEOUT)
 * when the same park was refreshed repeatedly in quick succession. Each
 * refreshPark() call kicked off its own fire-and-forget background
 * maintenance chain (archiveHistoricalSnapshot +, on the cron path only,
 * updateForecastAggregates) with no coalescing, so overlapping maintenance
 * runs piled up concurrent Firestore reads/writes and starved the primary
 * writeCurrentWaitTimes commit of a *later*, non-overlapping request.
 *
 * These tests prove:
 * 1. Concurrent refreshPark() calls for the same park share a single
 *    upstream fetch + write chain (in-flight coalescing).
 * 2. A second refreshPark() call for the same park does not start a new
 *    background maintenance run while a previous one is still in flight —
 *    exercised via archiveHistoricalSnapshot's own Firestore write, since
 *    that is the maintenance task that still runs unconditionally on the
 *    interactive (non-cron) path; `updateForecastAggregates` is exercised
 *    separately in `wait-times-universal-persistence.test.ts` now that it
 *    is cron-only.
 * 3. Independent parks are never coalesced with each other.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUpdateForecastAggregates = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockBatchSet = vi.fn();
// Tracks archiveHistoricalSnapshot batch commits. Current publication uses
// a Firestore transaction and is independent of this maintenance gate.
let commitCallCount = 0;
const gatedCommitIndexes = new Set<number>();
const gatedCommitResolvers = new Map<number, () => void>();
const mockBatchCommit = vi.fn().mockImplementation(() => {
  commitCallCount += 1;
  const callIndex = commitCallCount;
  if (gatedCommitIndexes.has(callIndex)) {
    return new Promise<void>((resolve) => {
      gatedCommitResolvers.set(callIndex, resolve);
    });
  }
  return Promise.resolve(undefined);
});
const mockBatch = { set: mockBatchSet, commit: mockBatchCommit };
const mockGet = vi.fn().mockResolvedValue({ docs: [] });

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
    runTransaction: async (callback: (transaction: {
      get: () => Promise<{ data: () => undefined }>;
      set: () => void;
    }) => Promise<unknown>) => callback({
      get: async () => ({ data: () => undefined }),
      set: vi.fn(),
    }),
  },
}));

vi.mock('@/lib/forecast/aggregation', () => ({
  updateForecastAggregates: mockUpdateForecastAggregates,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { refreshPark } from '@/lib/wait-times/refresh';

const MAGIC_KINGDOM_ID = '75ea578a-adc8-4116-a54d-dccb60765ef9';
const EPCOT_ID = '47f90d2c-e191-4239-a466-5892ef59a88b';

const LIVE_ENTRY = {
  id: 'test-attraction',
  name: 'Test Attraction',
  entityType: 'ATTRACTION',
  status: 'OPERATING',
  queue: { STANDBY: { waitTime: 20 } },
};

function mockFetchResponse(entries = [LIVE_ENTRY]) {
  return { ok: true, json: () => Promise.resolve({ liveData: entries }) };
}

describe('refreshPark concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commitCallCount = 0;
    gatedCommitIndexes.clear();
    gatedCommitResolvers.clear();
    mockGet.mockResolvedValue({ docs: [] });
    mockFetch.mockResolvedValue(mockFetchResponse());
    mockUpdateForecastAggregates.mockResolvedValue(undefined);
  });

  it('coalesces concurrent calls for the same park into a single upstream fetch + write', async () => {
    // Two callers request the same park at the same time (e.g. two open tabs
    // both triggering an arrival refresh).
    const [first, second] = await Promise.all([
      refreshPark(MAGIC_KINGDOM_ID),
      refreshPark(MAGIC_KINGDOM_ID),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first.meta.stale).toBe(false);
  });

  it('does not coalesce concurrent calls for different parks', async () => {
    await Promise.all([refreshPark(MAGIC_KINGDOM_ID), refreshPark(EPCOT_ID)]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not start overlapping background maintenance for the same park', async () => {
    // Exercised via archiveHistoricalSnapshot's own Firestore write — the
    // maintenance task that still runs unconditionally on the interactive
    // (non-cron) path — since `updateForecastAggregates` is now cron-only
    // and never invoked here at all (see
    // `wait-times-universal-persistence.test.ts` for that coverage).
    //
    // Gate the first archive commit so request 1's background maintenance
    // is still pending
    // when request 1 itself resolves.
    gatedCommitIndexes.add(1);

    // First request kicks off (fire-and-forget) maintenance whose own
    // Firestore write is still pending when the request itself resolves.
    const result1 = await refreshPark(MAGIC_KINGDOM_ID);
    expect(result1.meta.stale).toBe(false);
    await vi.waitFor(() => expect(commitCallCount).toBe(1));
    expect(gatedCommitResolvers.has(1)).toBe(true);

    // A second, non-overlapping request for the same park arrives before the
    // first request's background maintenance has finished. It must complete
    // promptly (proving writeCurrentWaitTimes wasn't starved) and must not
    // start a second concurrent maintenance run.
    const result2 = await refreshPark(MAGIC_KINGDOM_ID);
    expect(result2.meta.stale).toBe(false);
    expect(commitCallCount).toBe(1);

    // Let the first maintenance run finish and allow its cleanup to flush.
    gatedCommitResolvers.get(1)!();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Now that the in-flight maintenance has cleared, a subsequent request
    // is free to kick off maintenance again — its own write (call 4) and
    // archive commit should run.
    await refreshPark(MAGIC_KINGDOM_ID);
    await vi.waitFor(() => expect(commitCallCount).toBe(2));
  });
});
