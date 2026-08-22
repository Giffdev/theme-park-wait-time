/**
 * Regression coverage for the Universal-family silent persistence failure.
 *
 * Root cause (production evidence): Universal-family parks (Islands of
 * Adventure, Universal Studios Florida, Epic Universe) have zero
 * upstream-provided live forecasts for any attraction, so *every* entry
 * triggered `updateForecastAggregates()` — a full unbounded Firestore
 * collection read plus one individual `.get()` per attraction with valid
 * history — on the interactive request path. Combined with these parks'
 * high real-world traffic (frequent overlapping requests), a still-running
 * maintenance chain was observed to starve a later request's own
 * `writeCurrentWaitTimes` commit of Firestore client resources for tens of
 * seconds, so the persisted `waitTimes/{parkId}/current/*` docs simply never
 * updated — with no visible error anywhere. It was NOT a payload-shape /
 * `undefined`-value Firestore validation bug (that hypothesis was built and
 * disproven with real captured upstream payloads during investigation).
 *
 * The fix: forecast aggregation (`updateForecastAggregates`) now only runs
 * on the cron path (`awaitMaintenance: true`, 300s maxDuration, guaranteed
 * daily pass), never on the interactive per-request path — and both the
 * write and the (now-timeboxed) maintenance step emit explicit,
 * structured, secret-free telemetry so a future write/maintenance failure
 * is never silent again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUpdateForecastAggregates = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockBatchSet = vi.hoisted(() => vi.fn());
const mockBatchCommit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockTransactionCommit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@/lib/firebase/admin', () => ({
  adminApp: { name: 'mock-app' },
  adminDb: {
    batch: () => ({ set: mockBatchSet, commit: mockBatchCommit }),
    collection: () => {
      const mock: Record<string, unknown> = {};
      mock.doc = vi.fn().mockReturnValue(mock);
      mock.collection = vi.fn().mockReturnValue(mock);
      mock.get = vi.fn().mockResolvedValue({ docs: [] });
      mock.id = 'mock-doc';
      return mock;
    },
    getAll: (...refs: unknown[]) => Promise.resolve(refs.map(() => ({ exists: false }))),
    runTransaction: async (callback: (transaction: {
      get: () => Promise<{ data: () => undefined }>;
      set: (_ref: unknown, data: Record<string, unknown>) => void;
    }) => Promise<unknown>) => {
      const writes: Record<string, unknown>[] = [];
      const result = await callback({
        get: async () => ({ data: () => undefined }),
        set: (_ref, data) => writes.push(data),
      });
      if (writes.some((data) => Array.isArray(data.entries))) {
        await mockTransactionCommit();
      }
      return result;
    },
  },
}));

vi.mock('@/lib/forecast/aggregation', () => ({
  updateForecastAggregates: mockUpdateForecastAggregates,
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { refreshPark } from '@/lib/wait-times/refresh';

// Islands of Adventure — a real Universal-family park-registry.ts id.
const ISLANDS_OF_ADVENTURE_ID = '267615cc-8943-4c2a-ae2c-5da728ca591f';

// Universal-shaped payload: every attraction has queue data but NO live
// `forecast` field at all — matching the confirmed production evidence
// (`withForecast: 0` for all Universal-family attractions).
function universalShapedPayload(count = 12) {
  return {
    liveData: Array.from({ length: count }, (_, i) => ({
      id: `attraction-${i}`,
      name: `Attraction ${i}`,
      entityType: 'ATTRACTION',
      status: 'OPERATING',
      queue: { STANDBY: { waitTime: 10 + i } },
      // No `forecast` field — 0 live-provided forecasts, as observed for
      // every Universal-family attraction in production.
    })),
  };
}

describe('Universal-family wait-time persistence (silent-failure regression)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransactionCommit.mockResolvedValue(undefined);
    mockBatchCommit.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(universalShapedPayload()),
    });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('reliably writes every entry for a Universal-shaped (0-live-forecast) payload on the interactive path', async () => {
    const result = await refreshPark(ISLANDS_OF_ADVENTURE_ID);

    expect(result.entries).toHaveLength(12);
    // writeCurrentWaitTimes must have actually run to completion (not been
    // starved out) even though every single entry needed the historical
    // aggregate-lookup branch in blendForecasts.
    expect(mockTransactionCommit).toHaveBeenCalled();
  });

  it('never runs the read-amplifying forecast aggregation step on the interactive (non-cron) request path', async () => {
    await refreshPark(ISLANDS_OF_ADVENTURE_ID);

    // Give any fire-and-forget background work a chance to run.
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockUpdateForecastAggregates).not.toHaveBeenCalled();
  });

  it('runs forecast aggregation only on the cron path (awaitMaintenance: true)', async () => {
    await refreshPark(ISLANDS_OF_ADVENTURE_ID, { awaitMaintenance: true });

    expect(mockUpdateForecastAggregates).toHaveBeenCalledTimes(1);
    expect(mockUpdateForecastAggregates).toHaveBeenCalledWith(
      ISLANDS_OF_ADVENTURE_ID,
      expect.any(String)
    );
  });

  it('emits explicit persist-write failure telemetry instead of silently dropping the error', async () => {
    mockTransactionCommit.mockRejectedValue(new Error('simulated Firestore write failure'));

    await expect(
      refreshPark(ISLANDS_OF_ADVENTURE_ID, { awaitMaintenance: true })
    ).rejects.toThrow('simulated Firestore write failure');

    const loggedLines = consoleLogSpy.mock.calls.map((call) => String(call[0]));
    const writeFailureLine = loggedLines.find((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed.stage === 'persist-write' && parsed.ok === false;
      } catch {
        return false;
      }
    });

    expect(writeFailureLine).toBeDefined();
    const parsed = JSON.parse(writeFailureLine as string);
    expect(parsed.parkId).toBe(ISLANDS_OF_ADVENTURE_ID);
    expect(parsed.error).toMatch(/simulated Firestore write failure/);
    // Secret-free: never leak more than a message string.
    expect(Object.keys(parsed).sort()).toEqual(
      ['durationMs', 'error', 'ok', 'parkId', 'scope', 'stage'].sort()
    );
  });

  it('does not let a persist-write failure on the interactive path surface to the caller', async () => {
    mockTransactionCommit.mockRejectedValue(new Error('simulated Firestore write failure'));

    // Interactive path (no awaitMaintenance): the caller still gets a
    // successful response with the freshly-fetched entries even though
    // persistence subsequently fails in the background.
    const result = await refreshPark(ISLANDS_OF_ADVENTURE_ID);
    expect(result.entries).toHaveLength(12);

    // Let the deferred persistAndMaintain settle before the test exits.
    await new Promise((resolve) => setImmediate(resolve));

    const loggedLines = consoleLogSpy.mock.calls.map((call) => String(call[0]));
    const writeFailureLine = loggedLines.find((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed.stage === 'persist-write' && parsed.ok === false;
      } catch {
        return false;
      }
    });
    expect(writeFailureLine).toBeDefined();
  });
});

describe('Universal-family wait-time persistence — timeboxed maintenance telemetry', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockTransactionCommit.mockResolvedValue(undefined);
    mockBatchCommit.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(universalShapedPayload()),
    });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.useRealTimers();
  });

  it('reports a timed-out maintenance stage via telemetry rather than hanging the cron await indefinitely', async () => {
    // Historical-archive commit hangs forever — simulates the exact
    // resource-contention failure mode that starved writes in production.
    mockBatchCommit.mockImplementation(() => new Promise(() => {}));

    const resultPromise = refreshPark(ISLANDS_OF_ADVENTURE_ID, { awaitMaintenance: true });

    // Advance past MAINTENANCE_DEADLINE_MS (8s).
    await vi.advanceTimersByTimeAsync(8_100);

    const result = await resultPromise;
    expect(result.entries).toHaveLength(12);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => String(call[0]));
    const maintenanceLine = loggedLines.find((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed.stage === 'persist-maintenance';
      } catch {
        return false;
      }
    });

    expect(maintenanceLine).toBeDefined();
    const parsed = JSON.parse(maintenanceLine as string);
    expect(parsed.timedOut).toBe(true);
    expect(parsed.ok).toBe(false);
  });
});
