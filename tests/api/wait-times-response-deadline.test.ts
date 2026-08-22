/**
 * Contract: a 200 /api/wait-times response must never await background
 * maintenance (historical archive +, on the cron path only, forecast
 * aggregation). Maintenance is scheduled via `after()` (or fire-and-forget
 * outside a request scope) and must be allowed to keep running well past the
 * moment the HTTP response is sent.
 *
 * Root cause under test: prior to the in-flight/maintenance guards, a slow
 * maintenance write (large batch, contention, etc.) could accompany or block
 * the primary response path, contributing to production 504
 * FUNCTION_INVOCATION_TIMEOUT. This test proves — with an actual multi-second
 * delayed Firestore mock standing in for a realistic 20s-slow write — that
 * the GET call resolves almost immediately while that slow operation is
 * still pending.
 *
 * Note: forecast aggregation (`updateForecastAggregates`) is exercised by
 * `wait-times-universal-persistence.test.ts` instead of here, since it is
 * now cron-only (`awaitMaintenance: true`) and is never invoked on this
 * route's interactive request path — see MAINTENANCE_DEADLINE_MS in
 * `refresh.ts` for the production evidence behind that split. This test
 * instead exercises `archiveHistoricalSnapshot`'s Firestore write (the
 * maintenance task that still runs unconditionally on the interactive path)
 * as the slow background operation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// A maintenance write slow enough to prove the point without making the test
// suite slow: real production incidents observed 20s+ stalls; a few hundred
// milliseconds is enough to prove "did not await" vs. "awaited" here because
// the assertion is on ordering/elapsed time, not on hitting the literal 20s.
const SLOW_MAINTENANCE_MS = 2_000;
const RESPONSE_BUDGET_MS = 300;

const mockUpdateForecastAggregates = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockBatchSet = vi.fn();
let maintenanceResolvedRef = { current: false };
// Current publication now commits through a transaction. The batch commit is
// archiveHistoricalSnapshot's write and is deliberately slow to prove the
// response does not await it.
const mockBatchCommit = vi.fn().mockImplementation(() => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      maintenanceResolvedRef.current = true;
      resolve();
    }, SLOW_MAINTENANCE_MS);
  });
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

import { GET } from '@/app/api/wait-times/route';

const MAGIC_KINGDOM_ID = '75ea578a-adc8-4116-a54d-dccb60765ef9';
const LIVE_ENTRY = {
  id: 'test-attraction',
  name: 'Test Attraction',
  entityType: 'ATTRACTION',
  status: 'OPERATING',
  queue: { STANDBY: { waitTime: 20 } },
};

function request(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/wait-times?parkId=${MAGIC_KINGDOM_ID}`);
}

describe('GET /api/wait-times — response does not await slow maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maintenanceResolvedRef.current = false;
    mockGet.mockResolvedValue({ docs: [] });
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ liveData: [LIVE_ENTRY] }) });
  });

  it('resolves the HTTP response long before a slow maintenance write finishes', async () => {
    const startedAt = Date.now();
    const response = await GET(request());
    const elapsedMs = Date.now() - startedAt;

    expect(response.status).toBe(200);
    expect(elapsedMs).toBeLessThan(RESPONSE_BUDGET_MS);
    // The whole point: the response came back while the slow op is *still*
    // pending. If this were false, the route would have awaited maintenance.
    expect(maintenanceResolvedRef.current).toBe(false);
    await vi.waitFor(() => expect(mockBatchCommit).toHaveBeenCalledTimes(1));

    // Let the slow maintenance actually finish so it doesn't leak into the
    // next test as an unhandled/late-resolving timer.
    await new Promise((resolve) => setTimeout(resolve, SLOW_MAINTENANCE_MS + 50));
    expect(maintenanceResolvedRef.current).toBe(true);
  });

  it('still returns fresh, correctly-shaped wait data despite the pending slow maintenance', async () => {
    const response = await GET(request());
    const data = await response.json();

    expect(data.stale).toBe(false);
    expect(data.parkMeta[MAGIC_KINGDOM_ID]).toEqual(
      expect.objectContaining({ source: 'upstream', stale: false }),
    );
    expect(data.parks[MAGIC_KINGDOM_ID]).toEqual([
      expect.objectContaining({ attractionId: 'test-attraction', waitMinutes: 20 }),
    ]);

    await new Promise((resolve) => setTimeout(resolve, SLOW_MAINTENANCE_MS));
  });
});
