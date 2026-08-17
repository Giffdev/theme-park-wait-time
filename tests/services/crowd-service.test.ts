import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredDocument = Record<string, unknown>;

const hoisted = vi.hoisted(() => {
  type DocRef = { kind: 'doc'; path: string; id: string };
  type QueryRef = {
    kind: 'query';
    path: string;
    filters: Array<[string, string, unknown]>;
    orders: Array<[string, 'asc' | 'desc']>;
    resultLimit?: number;
  };
  const store = new Map<string, StoredDocument>();
  const queryResultSizes: number[] = [];
  const queryLimits: number[] = [];
  let transactionQueue = Promise.resolve();
  const docRef = (path: string): DocRef => ({
    kind: 'doc',
    path,
    id: path.split('/').at(-1) ?? '',
  });
  const snapshot = (reference: DocRef) => {
    const data = store.get(reference.path);
    return {
      exists: Boolean(data),
      id: reference.id,
      data: () => data,
    };
  };
  const querySnapshot = (reference: QueryRef) => {
    const docs = [...store.entries()]
      .filter(([path]) => path.startsWith(`${reference.path}/`))
      .filter(([, data]) => reference.filters.every(([field, operator, value]) => {
        if (operator === '==') return data[field] === value;
        if (operator === '>=') return Number(data[field]) >= Number(value);
        return true;
      }))
      .sort(([leftPath, leftData], [rightPath, rightData]) => {
        for (const [field, direction] of reference.orders) {
          const left = field === '__name__' ? leftPath.split('/').at(-1) : leftData[field];
          const right = field === '__name__' ? rightPath.split('/').at(-1) : rightData[field];
          const comparison = typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left).localeCompare(String(right));
          if (comparison !== 0) return direction === 'desc' ? -comparison : comparison;
        }
        return 0;
      })
      .slice(0, reference.resultLimit)
      .map(([path, data]) => ({
        id: path.split('/').at(-1) ?? '',
        data: () => data,
      }));
    queryResultSizes.push(docs.length);
    return { docs };
  };
  const adminDb = {
    doc: vi.fn((path: string) => ({
      ...docRef(path),
      get: async () => snapshot(docRef(path)),
    })),
    collection: vi.fn((path: string) => {
      const filters: Array<[string, string, unknown]> = [];
      const orders: Array<[string, 'asc' | 'desc']> = [];
      const query = {
        kind: 'query' as const,
        path,
        filters,
        orders,
        resultLimit: undefined as number | undefined,
        where(field: string, operator: string, value: unknown) {
          filters.push([field, operator, value]);
          return query;
        },
        orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
          orders.push([field, direction]);
          return query;
        },
        limit(value: number) {
          query.resultLimit = value;
          queryLimits.push(value);
          return query;
        },
        async get() {
          return querySnapshot(query);
        },
      };
      return query;
    }),
    runTransaction: vi.fn(<T,>(update: (transaction: {
      get: (reference: DocRef | QueryRef) => Promise<unknown>;
      set: (reference: DocRef, data: StoredDocument) => void;
      create: (reference: DocRef, data: StoredDocument) => void;
      delete: (reference: DocRef) => void;
    }) => Promise<T>) => {
      const run = transactionQueue.then(async () => {
        const writes: Array<() => void> = [];
        const result = await update({
          get: async (reference) => (
            reference.kind === 'query' ? querySnapshot(reference) : snapshot(reference)
          ),
          set: (reference, data) => writes.push(() => store.set(reference.path, data)),
          create: (reference, data) => {
            if (store.has(reference.path)) throw new Error('already exists');
            writes.push(() => store.set(reference.path, data));
          },
          delete: (reference) => writes.push(() => store.delete(reference.path)),
        });
        writes.forEach((write) => write());
        return result;
      });
      transactionQueue = run.then(() => undefined, () => undefined);
      return run;
    }),
  };
  return {
    adminDb,
    store,
    queryLimits,
    queryResultSizes,
    resetQueue: () => {
      transactionQueue = Promise.resolve();
    },
  };
});

const store = hoisted.store;
vi.mock('@/lib/firebase/admin', () => ({ adminDb: hoisted.adminDb }));

vi.mock('firebase-admin/firestore', () => ({
  FieldPath: {
    documentId: () => '__name__',
  },
  FieldValue: {
    serverTimestamp: () => ({ _type: 'serverTimestamp' }),
  },
  Timestamp: {
    fromDate: (date: Date) => ({
      millis: date.getTime(),
      toDate: () => new Date(date.getTime()),
    }),
  },
}));

import {
  CONSENSUS_CONTRIBUTION_WINDOW_MS,
  CONSENSUS_CONTRIBUTOR_LIMIT,
  CONSENSUS_CONTRIBUTOR_QUERY_LIMIT,
  getCrowdAggregate,
  getCrowdAggregatesForPark,
  submitCrowdReport,
} from '@/lib/services/crowd-service';

const baseTime = new Date('2026-08-17T18:00:00Z').getTime();

function report(overrides: Partial<Parameters<typeof submitCrowdReport>[1]> = {}) {
  return {
    requestId: 'report-request-1234',
    uid: 'user-1',
    attractionId: 'space-mountain',
    attractionName: 'Space Mountain',
    waitTimeMinutes: 35,
    reportedAt: new Date(baseTime),
    allowStaleReplay: false,
    ...overrides,
  };
}

function aggregate(path = 'crowdsourcedWaitTimes/magic-kingdom/aggregates/space-mountain') {
  return store.get(path);
}

function seedContribution(
  contributorId: string,
  reportedAtMs: number,
  waitTimeMinutes: number,
): void {
  store.set(`queueReportContributions/${contributorId}`, {
    schemaVersion: 1,
    attractionKey: 'magic-kingdom:space-mountain',
    parkId: 'magic-kingdom',
    attractionId: 'space-mountain',
    requestId: `request-${contributorId}`,
    reportId: `report-${contributorId}`,
    waitTimeMinutes,
    reportedAtMs,
    windowStartedAtMs: reportedAtMs,
  });
}

function callerContributionEntry(): [string, StoredDocument] {
  const entry = [...store.entries()].find(([path]) => (
    path.startsWith('queueReportContributions/')
    && (store.get(path)?.requestId === 'caller-original')
  ));
  if (!entry) throw new Error('Caller contribution was not created');
  return entry;
}

describe('crowd-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    hoisted.queryLimits.length = 0;
    hoisted.queryResultSizes.length = 0;
    hoisted.resetQueue();
  });

  it('reads sanitized aggregate documents', async () => {
    store.set('crowdsourcedWaitTimes/magic-kingdom/aggregates/space-mountain', {
      currentEstimateMinutes: 35,
      confidence: 'low',
    });
    await expect(getCrowdAggregate('magic-kingdom', 'space-mountain')).resolves.toEqual({
      attractionId: 'space-mountain',
      currentEstimateMinutes: 35,
      confidence: 'low',
    });
    await expect(getCrowdAggregatesForPark('magic-kingdom')).resolves.toHaveLength(1);
  });

  it('atomically writes the exact anonymous report and private contributor state', async () => {
    await expect(submitCrowdReport('magic-kingdom', report())).resolves.toBe('accepted');

    const publicReport = store.get('waitTimeReports/report-request-1234');
    expect(publicReport).toEqual({
      schemaVersion: 1,
      attractionId: 'space-mountain',
      attractionName: 'Space Mountain',
      parkId: 'magic-kingdom',
      waitTime: 35,
      reportedAt: expect.objectContaining({ millis: baseTime }),
      status: 'pending',
    });
    expect(publicReport).not.toHaveProperty('uid');
    expect(publicReport).not.toHaveProperty('uidHash');
    expect([...store.keys()].filter((path) => path.startsWith('queueReportContributions/')))
      .toHaveLength(1);
    expect(aggregate()).toEqual(expect.objectContaining({
      currentEstimateMinutes: 35,
      reportCount: 1,
      lastReportedAtMs: baseTime,
    }));
  });

  it('treats an exact stable request replay as a no-op', async () => {
    await submitCrowdReport('magic-kingdom', report());
    await expect(submitCrowdReport('magic-kingdom', report({ allowStaleReplay: true })))
      .resolves.toBe('replay');
    expect([...store.keys()].filter((path) => path.startsWith('waitTimeReports/')))
      .toEqual(['waitTimeReports/report-request-1234']);
  });

  it('adopts a matching pre-deployment anonymous report without recreating it', async () => {
    const reportedAt = new Date(baseTime);
    store.set('waitTimeReports/report-request-1234', {
      schemaVersion: 1,
      attractionId: 'space-mountain',
      attractionName: 'Space Mountain',
      parkId: 'magic-kingdom',
      waitTime: 35,
      reportedAt: { toDate: () => reportedAt },
      status: 'pending',
    });

    await expect(submitCrowdReport('magic-kingdom', report({ allowStaleReplay: true })))
      .resolves.toBe('accepted');
    expect([...store.keys()].filter((path) => path.startsWith('waitTimeReports/')))
      .toEqual(['waitTimeReports/report-request-1234']);
    expect([...store.keys()].some((path) => path.startsWith('queueReportRequests/'))).toBe(true);
    expect(aggregate()).toEqual(expect.objectContaining({ reportCount: 1 }));
  });

  it('prevents three request IDs from one UID dominating one attraction', async () => {
    await submitCrowdReport('magic-kingdom', report({
      requestId: 'other-user-report-1',
      uid: 'user-2',
      waitTimeMinutes: 20,
    }));
    for (const [index, waitTimeMinutes] of [10, 100, 180].entries()) {
      await submitCrowdReport('magic-kingdom', report({
        requestId: `same-user-report-${index}`,
        waitTimeMinutes,
        reportedAt: new Date(baseTime + index + 1),
      }));
    }

    expect(aggregate()).toEqual(expect.objectContaining({
      currentEstimateMinutes: 100,
      reportCount: 2,
    }));
    expect([...store.keys()].filter((path) => path.startsWith('waitTimeReports/')).sort())
      .toEqual(['waitTimeReports/other-user-report-1', 'waitTimeReports/same-user-report-2']);
  });

  it('allows different attractions and a later contribution window', async () => {
    await submitCrowdReport('magic-kingdom', report({ requestId: 'first-window-report' }));
    await submitCrowdReport('magic-kingdom', report({
      requestId: 'different-attraction-report',
      attractionId: 'pirates',
      attractionName: 'Pirates',
      waitTimeMinutes: 15,
    }));
    await submitCrowdReport('magic-kingdom', report({
      requestId: 'later-window-report',
      waitTimeMinutes: 45,
      reportedAt: new Date(baseTime + CONSENSUS_CONTRIBUTION_WINDOW_MS + 1),
    }));

    expect(store.has('waitTimeReports/first-window-report')).toBe(true);
    expect(store.has('waitTimeReports/later-window-report')).toBe(true);
    expect(aggregate()).toEqual(expect.objectContaining({
      currentEstimateMinutes: 45,
      reportCount: 1,
    }));
    expect(aggregate('crowdsourcedWaitTimes/magic-kingdom/aggregates/pirates'))
      .toEqual(expect.objectContaining({ currentEstimateMinutes: 15 }));
  });

  it('ignores an older out-of-order correction without moving the aggregate backward', async () => {
    await submitCrowdReport('magic-kingdom', report({
      requestId: 'newer-report',
      waitTimeMinutes: 60,
      reportedAt: new Date(baseTime + 2_000),
    }));
    await expect(submitCrowdReport('magic-kingdom', report({
      requestId: 'older-correction',
      waitTimeMinutes: 5,
      reportedAt: new Date(baseTime + 1_000),
    }))).resolves.toBe('ignored-older-correction');

    expect(store.has('waitTimeReports/older-correction')).toBe(false);
    expect(aggregate()).toEqual(expect.objectContaining({
      currentEstimateMinutes: 60,
      reportCount: 1,
      lastReportedAtMs: baseTime + 2_000,
    }));
  });

  it('serializes concurrent reports and keeps lastReportedAt monotonic', async () => {
    await Promise.all([
      submitCrowdReport('magic-kingdom', report({
        requestId: 'newest-concurrent',
        uid: 'user-new',
        waitTimeMinutes: 40,
        reportedAt: new Date(baseTime + 4_000),
      })),
      submitCrowdReport('magic-kingdom', report({
        requestId: 'older-concurrent',
        uid: 'user-old',
        waitTimeMinutes: 20,
        reportedAt: new Date(baseTime + 2_000),
      })),
    ]);

    expect(aggregate()).toEqual(expect.objectContaining({
      currentEstimateMinutes: 30,
      reportCount: 2,
      lastReportedAtMs: baseTime + 4_000,
    }));
  });

  it('bounds transaction reads and aggregate input at the latest-20 contract', async () => {
    for (let index = 0; index < 50; index += 1) {
      seedContribution(
        `contributor-${index.toString().padStart(2, '0')}`,
        baseTime - index,
        index,
      );
    }

    await submitCrowdReport('magic-kingdom', report({
      requestId: 'newest-volume-report',
      uid: 'newest-volume-user',
      waitTimeMinutes: 100,
      reportedAt: new Date(baseTime + 1),
    }));

    expect(hoisted.queryLimits).toEqual([CONSENSUS_CONTRIBUTOR_QUERY_LIMIT]);
    expect(Math.max(...hoisted.queryResultSizes)).toBe(CONSENSUS_CONTRIBUTOR_QUERY_LIMIT);
    expect(aggregate()).toEqual(expect.objectContaining({
      currentEstimateMinutes: 14,
      reportCount: CONSENSUS_CONTRIBUTOR_LIMIT,
    }));
  });

  it.each([
    ['inside', baseTime + 1_915],
    ['at the extra-candidate boundary', baseTime + 1_805],
    ['outside', baseTime + 1_785],
  ])('replaces a contributor %s the cap without exceeding it', async (_, callerTime) => {
    await submitCrowdReport('magic-kingdom', report({
      requestId: 'caller-original',
      uid: 'replacement-user',
      waitTimeMinutes: 1,
      reportedAt: new Date(baseTime),
    }));
    const [callerPath, callerData] = callerContributionEntry();
    store.set(callerPath, {
      ...callerData,
      reportedAtMs: callerTime,
    });
    for (let index = 0; index < 25; index += 1) {
      seedContribution(
        `ranked-${index.toString().padStart(2, '0')}`,
        baseTime + 2_000 - index * 10,
        index,
      );
    }
    hoisted.queryLimits.length = 0;
    hoisted.queryResultSizes.length = 0;

    await submitCrowdReport('magic-kingdom', report({
      requestId: 'caller-replacement',
      uid: 'replacement-user',
      waitTimeMinutes: 100,
      reportedAt: new Date(baseTime + 3_000),
    }));

    expect(hoisted.queryLimits).toEqual([CONSENSUS_CONTRIBUTOR_QUERY_LIMIT]);
    expect(hoisted.queryResultSizes).toEqual([CONSENSUS_CONTRIBUTOR_QUERY_LIMIT]);
    expect(aggregate()).toEqual(expect.objectContaining({
      currentEstimateMinutes: 14,
      reportCount: CONSENSUS_CONTRIBUTOR_LIMIT,
    }));
    expect(store.has('waitTimeReports/caller-original')).toBe(false);
  });

  it('uses contributor ID descending as the stable equal-timestamp tie-breaker', async () => {
    await submitCrowdReport('magic-kingdom', report({
      requestId: 'caller-original',
      uid: 'equal-time-user',
      waitTimeMinutes: 1,
    }));
    for (let index = 0; index < 25; index += 1) {
      seedContribution(
        `00-${index.toString().padStart(2, '0')}`,
        baseTime,
        index,
      );
    }
    hoisted.queryLimits.length = 0;
    hoisted.queryResultSizes.length = 0;

    await submitCrowdReport('magic-kingdom', report({
      requestId: 'equal-time-replacement',
      uid: 'equal-time-user',
      waitTimeMinutes: 100,
    }));

    expect(hoisted.queryResultSizes).toEqual([CONSENSUS_CONTRIBUTOR_QUERY_LIMIT]);
    expect(aggregate()).toEqual(expect.objectContaining({
      currentEstimateMinutes: 19,
      reportCount: CONSENSUS_CONTRIBUTOR_LIMIT,
      lastReportedAtMs: baseTime,
    }));
  });

  it('keeps closed reports out of numeric averages and represents all-closed as -1', async () => {
    await submitCrowdReport('magic-kingdom', report({
      requestId: 'closed-report',
      waitTimeMinutes: -1,
    }));
    expect(aggregate()).toEqual(expect.objectContaining({ currentEstimateMinutes: -1 }));

    await submitCrowdReport('magic-kingdom', report({
      requestId: 'operating-report',
      uid: 'user-2',
      waitTimeMinutes: 20,
      reportedAt: new Date(baseTime + 1),
    }));
    expect(aggregate()).toEqual(expect.objectContaining({ currentEstimateMinutes: 20 }));
  });
});
