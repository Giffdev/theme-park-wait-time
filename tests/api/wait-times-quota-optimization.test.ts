import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  type StoredDocument = Record<string, unknown>;
  type DocumentRef = { path: string; id: string };
  type PendingWrite = {
    ref: DocumentRef;
    data: StoredDocument;
    options?: { merge?: boolean };
  };

  const documents = new Map<string, StoredDocument>();
  const pendingBatches: PendingWrite[][] = [];
  const counts = {
    cacheReads: 0,
    publicationReads: 0,
    gateReads: 0,
    cacheWrites: 0,
    gateWrites: 0,
    attractionWrites: 0,
    historyWrites: 0,
    historyQueryReads: 0,
    forecastBlendReads: 0,
    forecastAggregateReads: 0,
    forecastAggregateWrites: 0,
  };
  let liveData: StoredDocument[] = [];
  let upstreamError = false;
  let transactionError: Error | null = null;
  let transactionTail = Promise.resolve();

  function snapshot(path: string) {
    const data = documents.get(path);
    return {
      id: path.split('/').at(-1) ?? '',
      exists: data !== undefined,
      data: () => data,
    };
  }

  function applyWrite(write: PendingWrite) {
    const existing = documents.get(write.ref.path) ?? {};
    const materialized = Object.fromEntries(
      Object.entries(write.data).map(([key, value]) => {
        if (
          key === 'snapshots'
          && value
          && typeof value === 'object'
          && Array.isArray((value as { elements?: unknown }).elements)
        ) {
          const previous = Array.isArray(existing.snapshots) ? existing.snapshots : [];
          return [key, [...previous, ...(value as { elements: unknown[] }).elements]];
        }
        return [key, value];
      }),
    );
    documents.set(
      write.ref.path,
      write.options?.merge ? { ...existing, ...materialized } : materialized,
    );
    if (
      /^waitTimes\/[^/]+$/.test(write.ref.path)
      && !('historyArchiveClaimedAtMs' in write.data)
    ) {
      counts.cacheWrites += 1;
    }
    if (/^waitTimes\/[^/]+\/current\/[^/]+$/.test(write.ref.path)) {
      counts.attractionWrites += 1;
    }
    if (write.ref.path.startsWith('waitTimeHistory/')) counts.historyWrites += 1;
    if (write.ref.path.startsWith('forecastAggregates/')) {
      counts.forecastAggregateWrites += 1;
    }
  }

  function documentRef(path: string): DocumentRef & {
    collection: (name: string) => ReturnType<typeof collectionRef>;
  } {
    return {
      path,
      id: path.split('/').at(-1) ?? '',
      collection: (name: string) => collectionRef(`${path}/${name}`),
      get: async () => {
        if (path.startsWith('forecastAggregates/')) {
          counts.forecastAggregateReads += 1;
        }
        return snapshot(path);
      },
    };
  }

  function collectionRef(path: string) {
    return {
      path,
      id: path.split('/').at(-1) ?? '',
      doc: (id: string) => documentRef(`${path}/${id}`),
      get: vi.fn(async () => {
        const prefix = `${path}/`;
        const docs = [...documents.entries()]
          .filter(([documentPath]) => {
            if (!documentPath.startsWith(prefix)) return false;
            return !documentPath.slice(prefix.length).includes('/');
          })
          .map(([documentPath]) => snapshot(documentPath));
        if (path.startsWith('waitTimeHistory/')) {
          // Firestore bills a minimum of one document read for an empty query.
          counts.historyQueryReads += Math.max(1, docs.length);
        }
        return { docs, empty: docs.length === 0 };
      }),
    };
  }

  const adminDb = {
    collection: (name: string) => collectionRef(name),
    getAll: async (...refs: DocumentRef[]) => refs.map((ref) => {
      if (/^waitTimes\/[^/]+$/.test(ref.path)) counts.cacheReads += 1;
      if (ref.path.startsWith('forecastAggregates/')) counts.forecastBlendReads += 1;
      return snapshot(ref.path);
    }),
    batch: () => {
      const writes: PendingWrite[] = [];
      pendingBatches.push(writes);
      return {
        set: (
          ref: DocumentRef,
          data: StoredDocument,
          options?: { merge?: boolean },
        ) => writes.push({ ref, data, options }),
        commit: async () => {
          for (const write of writes) applyWrite(write);
        },
      };
    },
    runTransaction: async <T>(
      callback: (transaction: {
        get: (ref: DocumentRef) => Promise<ReturnType<typeof snapshot>>;
        set: (
          ref: DocumentRef,
          data: StoredDocument,
          options?: { merge?: boolean },
        ) => void;
      }) => Promise<T>,
    ) => {
      const predecessor = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await predecessor;
      try {
        const writes: PendingWrite[] = [];
        const result = await callback({
          get: async (ref) => snapshot(ref.path),
          set: (ref, data, options) => writes.push({ ref, data, options }),
        });
        const isGate = writes.some((write) => 'historyArchiveClaimedAtMs' in write.data);
        if (isGate) {
          counts.gateReads += 1;
          if (transactionError) throw transactionError;
        } else {
          counts.publicationReads += 1;
        }
        for (const write of writes) {
          if ('historyArchiveClaimedAtMs' in write.data) counts.gateWrites += 1;
          applyWrite(write);
        }
        return result;
      } finally {
        release();
      }
    },
  };

  return {
    adminDb,
    counts,
    documents,
    get liveData() {
      return liveData;
    },
    set liveData(value: StoredDocument[]) {
      liveData = value;
    },
    get transactionError() {
      return transactionError;
    },
    set transactionError(value: Error | null) {
      transactionError = value;
    },
    get upstreamError() {
      return upstreamError;
    },
    set upstreamError(value: boolean) {
      upstreamError = value;
    },
    reset() {
      documents.clear();
      pendingBatches.length = 0;
      Object.assign(counts, {
        cacheReads: 0,
        publicationReads: 0,
        gateReads: 0,
        cacheWrites: 0,
        gateWrites: 0,
        attractionWrites: 0,
        historyWrites: 0,
        historyQueryReads: 0,
        forecastBlendReads: 0,
        forecastAggregateReads: 0,
        forecastAggregateWrites: 0,
      });
      transactionError = null;
      upstreamError = false;
      transactionTail = Promise.resolve();
    },
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminApp: { name: 'mock-app' },
  adminDb: mocks.adminDb,
}));

vi.stubGlobal('fetch', vi.fn(async () => {
  if (mocks.upstreamError) throw new Error('simulated upstream failure');
  return {
    ok: true,
    json: async () => ({ liveData: mocks.liveData }),
  };
}));

const PARK_ID = '75ea578a-adc8-4116-a54d-dccb60765ef9';
const START = new Date('2026-08-22T05:00:00.000Z');
const BILLED_OPERATION_CATEGORIES = [
  'parkCacheReads',
  'publicationTransactionReads',
  'parkCacheWrites',
  'archiveGateReads',
  'archiveGateWrites',
  'currentWrites',
  'historyWrites',
  'historyQueryReads',
  'forecastBlendReads',
  'forecastAggregateReads',
  'forecastAggregateWrites',
] as const;
type BilledOperationCategory = (typeof BILLED_OPERATION_CATEGORIES)[number];
type OperationCounts = Record<BilledOperationCategory, number>;

function operationTotal(counts: OperationCounts) {
  expect(Object.keys(counts).sort()).toEqual([...BILLED_OPERATION_CATEGORIES].sort());
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function liveEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'attraction-1',
    name: 'Attraction 1',
    entityType: 'ATTRACTION',
    status: 'OPERATING',
    lastUpdated: '2026-08-22T04:59:00.000Z',
    queue: {
      STANDBY: { waitTime: 20 },
      RETURN_TIME: {
        state: 'AVAILABLE',
        returnStart: '2026-08-22T05:30:00.000Z',
        returnEnd: '2026-08-22T06:30:00.000Z',
      },
    },
    forecast: [{
      time: '2026-08-22T06:00:00.000Z',
      waitTime: 25,
      percentage: 60,
    }],
    ...overrides,
  };
}

function formattedEntries(count: number, fetchedAt: string, namePadding = 0) {
  return Array.from({ length: count }, (_, index) => ({
    attractionId: `attraction-${index + 1}`,
    attractionName: `Attraction ${index + 1}${'x'.repeat(namePadding)}`,
    status: 'OPERATING',
    waitMinutes: 20,
    lastUpdated: fetchedAt,
    fetchedAt,
  }));
}

async function importRefreshModule() {
  return import('@/lib/wait-times/refresh');
}

describe('wait-time Firestore quota optimization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    vi.clearAllMocks();
    mocks.reset();
    mocks.liveData = [liveEntry(), liveEntry({
      id: 'attraction-2',
      name: 'Attraction 2',
    })];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('archives once within five minutes, then archives again when the cadence elapses', async () => {
    const { refreshPark } = await importRefreshModule();

    await refreshPark(PARK_ID, { awaitMaintenance: true });
    expect(mocks.counts.historyWrites).toBe(2);
    expect(mocks.counts.gateReads).toBe(1);
    expect(mocks.counts.gateWrites).toBe(1);

    vi.setSystemTime(new Date(START.getTime() + 4 * 60 * 1000));
    await refreshPark(PARK_ID, { awaitMaintenance: true });
    expect(mocks.counts.historyWrites).toBe(2);
    expect(mocks.counts.gateReads).toBe(1);
    expect(mocks.counts.gateWrites).toBe(1);

    vi.setSystemTime(new Date(START.getTime() + 5 * 60 * 1000));
    await refreshPark(PARK_ID, { awaitMaintenance: true });
    expect(mocks.counts.historyWrites).toBe(4);
    // The second contender either observes the first claim in its initial
    // park-cache read (one gate read total) or loses inside the transaction
    // (two gate reads total). Both paths admit exactly one claimant.
    expect(mocks.counts.gateReads).toBeGreaterThanOrEqual(1);
    expect(mocks.counts.gateReads).toBeLessThanOrEqual(2);
    expect(mocks.counts.gateWrites).toBe(2);
  });

  it('allows only one archive when separate serverless instances contend', async () => {
    const firstModule = await importRefreshModule();
    vi.resetModules();
    const secondModule = await importRefreshModule();

    await Promise.all([
      firstModule.refreshPark(PARK_ID, { awaitMaintenance: true }),
      secondModule.refreshPark(PARK_ID, { awaitMaintenance: true }),
    ]);

    expect(mocks.counts.gateReads).toBeGreaterThanOrEqual(1);
    expect(mocks.counts.gateReads).toBeLessThanOrEqual(2);
    expect(mocks.counts.gateWrites).toBe(1);
    expect(mocks.counts.historyWrites).toBe(2);
  });

  it('writes only park freshness when current attraction data is unchanged', async () => {
    const { refreshPark } = await importRefreshModule();

    await refreshPark(PARK_ID, { awaitMaintenance: true });
    const before = { ...mocks.counts };

    vi.setSystemTime(new Date(START.getTime() + 60_000));
    await refreshPark(PARK_ID, { awaitMaintenance: true });

    expect(mocks.counts.attractionWrites - before.attractionWrites).toBe(0);
    expect(mocks.counts.cacheWrites - before.cacheWrites).toBe(1);
    expect(mocks.counts.historyWrites - before.historyWrites).toBe(0);
    expect(mocks.counts.gateReads - before.gateReads).toBe(0);
    expect(mocks.counts.cacheReads - before.cacheReads).toBe(1);
    expect(mocks.counts.publicationReads - before.publicationReads).toBe(1);

    // Two attractions previously cost four amplified writes per refresh
    // (current + history). Inside the cadence window the optimized refresh
    // performs only the required single park-cache freshness write.
    expect(
      (mocks.counts.attractionWrites - before.attractionWrites)
      + (mocks.counts.historyWrites - before.historyWrites)
      + (mocks.counts.cacheWrites - before.cacheWrites),
    ).toBe(1);
  });

  it('uses the successful unchanged refresh time for a later Firestore fallback', async () => {
    const firstModule = await importRefreshModule();
    await firstModule.refreshPark(PARK_ID, { awaitMaintenance: true });

    const unchangedRefreshAt = new Date(START.getTime() + 60_000);
    vi.setSystemTime(unchangedRefreshAt);
    await firstModule.refreshPark(PARK_ID, { awaitMaintenance: true });

    const currentPath = `waitTimes/${PARK_ID}/current/attraction-1`;
    expect(mocks.documents.get(currentPath)?.fetchedAt).toBe(START.toISOString());

    vi.resetModules();
    mocks.upstreamError = true;
    vi.setSystemTime(new Date(START.getTime() + 120_000));
    const secondModule = await importRefreshModule();
    const fallback = await secondModule.refreshPark(PARK_ID, { awaitMaintenance: true });

    expect(fallback.meta.source).toBe('firestore-cache');
    expect(fallback.meta.stale).toBe(true);
    expect(fallback.meta.fetchedAt).toBe(unchangedRefreshAt.toISOString());
    expect(fallback.meta.ageSeconds).toBe(60);
  });

  it('does not archive or aggregate when an older refresh loses publication', async () => {
    const { refreshPark } = await importRefreshModule();
    vi.setSystemTime(new Date(START.getTime() + 60_000));
    await refreshPark(PARK_ID, { awaitMaintenance: true });
    const cachePath = `waitTimes/${PARK_ID}`;
    const authoritative = structuredClone(mocks.documents.get(cachePath));
    const historyWrites = mocks.counts.historyWrites;
    const historyQueryReads = mocks.counts.historyQueryReads;

    vi.setSystemTime(START);
    await refreshPark(PARK_ID, { awaitMaintenance: true });

    expect(mocks.documents.get(cachePath)).toEqual(authoritative);
    expect(mocks.counts.historyWrites).toBe(historyWrites);
    expect(mocks.counts.historyQueryReads).toBe(historyQueryReads);
  });

  it('accounts for every billed category in a race-sensitive 100-attraction cycle', async () => {
    mocks.liveData = Array.from({ length: 100 }, (_, index) => liveEntry({
      id: `attraction-${index + 1}`,
      name: `Attraction ${index + 1}`,
    }));
    const { refreshPark } = await importRefreshModule();

    for (let refresh = 0; refresh < 7; refresh += 1) {
      vi.setSystemTime(new Date(START.getTime() + refresh * 40_000));
      await refreshPark(PARK_ID, { awaitMaintenance: true });
    }

    // Assumptions: today's history starts empty; all 100 attractions have
    // valid waits and live forecasts; seven unchanged forced refreshes occur
    // 40 seconds apart (240 seconds total); transactions do not retry.
    // The real archive and aggregate tasks run concurrently. This mock
    // deterministically lets the first aggregate query read before the first
    // archive commit, so it pays the one-read empty-query minimum. The other
    // six queries see 100 history docs. Only one snapshot per attraction is
    // archived inside the five-minute window, so optimized aggregation never
    // reaches its three-snapshot eligibility threshold.
    const optimizedAggregationFirst: OperationCounts = {
      parkCacheReads: mocks.counts.cacheReads,
      publicationTransactionReads: mocks.counts.publicationReads,
      parkCacheWrites: mocks.counts.cacheWrites,
      archiveGateReads: mocks.counts.gateReads,
      archiveGateWrites: mocks.counts.gateWrites,
      currentWrites: mocks.counts.attractionWrites,
      historyWrites: mocks.counts.historyWrites,
      historyQueryReads: mocks.counts.historyQueryReads,
      forecastBlendReads: mocks.counts.forecastBlendReads,
      forecastAggregateReads: mocks.counts.forecastAggregateReads,
      forecastAggregateWrites: mocks.counts.forecastAggregateWrites,
    };
    const optimizedArchiveFirst: OperationCounts = {
      ...optimizedAggregationFirst,
      historyQueryReads: 700,
    };

    // Like-for-like baseline: the same seven park-cache reads and aggregate
    // passes occur, but every refresh writes all current and history docs and
    // there is no archive gate or publication transaction read. Starting
    // empty, aggregation-first leaves the third pass at two snapshots; passes
    // four through seven perform 100 aggregate reads and writes. If each
    // archive wins its race, the third pass is also eligible.
    const baselineAggregationFirst: OperationCounts = {
      parkCacheReads: 7,
      publicationTransactionReads: 0,
      parkCacheWrites: 7,
      archiveGateReads: 0,
      archiveGateWrites: 0,
      currentWrites: 700,
      historyWrites: 700,
      historyQueryReads: 601,
      forecastBlendReads: 0,
      forecastAggregateReads: 400,
      forecastAggregateWrites: 400,
    };
    const baselineArchiveFirst: OperationCounts = {
      ...baselineAggregationFirst,
      historyQueryReads: 700,
      forecastAggregateReads: 500,
      forecastAggregateWrites: 500,
    };

    expect(optimizedAggregationFirst).toEqual({
      parkCacheReads: 7,
      publicationTransactionReads: 7,
      parkCacheWrites: 7,
      archiveGateReads: 1,
      archiveGateWrites: 1,
      currentWrites: 100,
      historyWrites: 100,
      historyQueryReads: 601,
      forecastBlendReads: 0,
      forecastAggregateReads: 0,
      forecastAggregateWrites: 0,
    });
    expect(operationTotal(baselineAggregationFirst)).toBe(2_815);
    expect(operationTotal(baselineArchiveFirst)).toBe(3_114);
    expect(operationTotal(optimizedAggregationFirst)).toBe(824);
    expect(operationTotal(optimizedArchiveFirst)).toBe(923);

    const favorableReduction =
      ((operationTotal(baselineArchiveFirst) - operationTotal(optimizedArchiveFirst))
        / operationTotal(baselineArchiveFirst)) * 100;
    const conservativeMinimumReduction =
      ((operationTotal(baselineAggregationFirst) - operationTotal(optimizedArchiveFirst))
        / operationTotal(baselineAggregationFirst)) * 100;
    const conservativeMaximumReduction =
      ((operationTotal(baselineArchiveFirst) - operationTotal(optimizedAggregationFirst))
        / operationTotal(baselineArchiveFirst)) * 100;

    expect(favorableReduction).toBeCloseTo(70.36, 2);
    expect(conservativeMinimumReduction).toBeCloseTo(67.21, 2);
    expect(conservativeMaximumReduction).toBeCloseTo(73.54, 2);
  });

  it.each([
    ['wait', () => liveEntry({ queue: { STANDBY: { waitTime: 35 } } })],
    ['open/closed status', () => liveEntry({ status: 'DOWN' })],
    ['name/category', () => liveEntry({ name: 'Renamed Attraction' })],
    ['upstream update time', () => liveEntry({ lastUpdated: '2026-08-22T05:01:00.000Z' })],
    ['queue status', () => liveEntry({
      queue: {
        STANDBY: { waitTime: 20 },
        RETURN_TIME: {
          state: 'TEMPORARILY_FULL',
          returnStart: null,
          returnEnd: null,
        },
      },
    })],
    ['forecast', () => liveEntry({
      forecast: [{
        time: '2026-08-22T06:00:00.000Z',
        waitTime: 30,
        percentage: 70,
      }],
    })],
  ])('writes the attraction when meaningful %s data changes', async (_label, nextEntry) => {
    mocks.liveData = [liveEntry()];
    const { refreshPark } = await importRefreshModule();
    await refreshPark(PARK_ID, { awaitMaintenance: true });
    const before = mocks.counts.attractionWrites;

    vi.setSystemTime(new Date(START.getTime() + 60_000));
    mocks.liveData = [nextEntry()];
    await refreshPark(PARK_ID, { awaitMaintenance: true });

    expect(mocks.counts.attractionWrites - before).toBe(1);
  });

  it('treats persisted source metadata as meaningful', async () => {
    mocks.liveData = [liveEntry()];
    const { refreshPark } = await importRefreshModule();
    await refreshPark(PARK_ID, { awaitMaintenance: true });
    const cachePath = `waitTimes/${PARK_ID}`;
    const cache = mocks.documents.get(cachePath)!;
    const entries = structuredClone(cache.entries) as Array<Record<string, unknown>>;
    entries[0].forecastMeta = {
      ...(entries[0].forecastMeta as Record<string, unknown>),
      source: 'historical',
    };
    mocks.documents.set(cachePath, { ...cache, entries });
    const before = mocks.counts.attractionWrites;

    vi.setSystemTime(new Date(START.getTime() + 60_000));
    await refreshPark(PARK_ID, { awaitMaintenance: true });

    expect(mocks.counts.attractionWrites - before).toBe(1);
  });

  it('publishes 499 changed attractions plus the parent atomically', async () => {
    const { writeCurrentWaitTimes } = await importRefreshModule();
    const fetchedAt = START.toISOString();

    await expect(
      writeCurrentWaitTimes(PARK_ID, formattedEntries(499, fetchedAt), fetchedAt),
    ).resolves.toBe('published');

    expect(mocks.counts.attractionWrites).toBe(499);
    expect(mocks.counts.cacheWrites).toBe(1);
    expect(mocks.documents.get(`waitTimes/${PARK_ID}`)?.fetchedAt).toBe(fetchedAt);
    expect(mocks.documents.size).toBe(500);
  });

  it('rejects 500 changed attractions without mutating parent or current docs', async () => {
    const { writeCurrentWaitTimes } = await importRefreshModule();
    const fetchedAt = START.toISOString();

    await expect(
      writeCurrentWaitTimes(PARK_ID, formattedEntries(500, fetchedAt), fetchedAt),
    ).rejects.toThrow('changes 500 attractions');

    expect(mocks.counts.attractionWrites).toBe(0);
    expect(mocks.counts.cacheWrites).toBe(0);
    expect(mocks.documents.size).toBe(0);
  });

  it('rejects a parent above 900KB without partial parent or current writes', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { writeCurrentWaitTimes } = await importRefreshModule();
    const fetchedAt = START.toISOString();

    await expect(
      writeCurrentWaitTimes(PARK_ID, formattedEntries(1, fetchedAt, 900_000), fetchedAt),
    ).rejects.toThrow('exceeds the safe document size');

    expect(mocks.counts.publicationReads).toBe(0);
    expect(mocks.counts.attractionWrites).toBe(0);
    expect(mocks.counts.cacheWrites).toBe(0);
    expect(mocks.documents.size).toBe(0);
    consoleWarn.mockRestore();
  });

  it('keeps a gate failure best-effort and emits structured failure telemetry', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.transactionError = new Error('simulated gate failure');
    const { refreshPark } = await importRefreshModule();

    const result = await refreshPark(PARK_ID, { awaitMaintenance: true });

    expect(result.entries).toHaveLength(2);
    expect(result.meta.stale).toBe(false);
    expect(mocks.counts.historyWrites).toBe(0);
    expect(consoleLog.mock.calls.some(([line]) => {
      const event = JSON.parse(String(line));
      return event.stage === 'history-archive-gate'
        && event.ok === false
        && event.error === 'simulated gate failure';
    })).toBe(true);
    expect(consoleError).toHaveBeenCalledWith(
      'Historical archive error:',
      expect.objectContaining({ message: 'simulated gate failure' }),
    );

    consoleLog.mockRestore();
    consoleError.mockRestore();
  });
});
