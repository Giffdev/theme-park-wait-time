import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  batchGet: vi.fn(),
  runQuery: vi.fn(),
  queryInputs: [] as unknown[],
  transports: [] as Array<{ deadlineAt?: number }>,
  rateLimits: new Map<string, number>(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  getAdminServiceAccount: () => ({}),
}));

vi.mock('@/lib/firebase/firestore-rest-commit', () => {
  class FirestoreRestCommitError extends Error {
    constructor(public readonly code: string, message: string) {
      super(message);
    }
  }
  return {
    FirestoreRestCommitError,
    createServiceAccountAccessTokenProvider: () => async () => 'token',
    beginFirestoreTransaction: async (transport: { deadlineAt?: number }) => {
      mocks.transports.push(transport);
      return 'transaction';
    },
    rollbackFirestoreTransaction: async () => {},
    batchGetFirestoreDocuments: async (
      paths: string[],
      transport: { deadlineAt?: number },
    ) => {
      mocks.transports.push(transport);
      const rateLimitRead = paths.every((path) => path.startsWith('sharedTripRateLimits/'));
      if (rateLimitRead) {
        return new Map(paths.map((path) => [
          path,
          mocks.rateLimits.has(path)
            ? { path, fields: { count: mocks.rateLimits.get(path) } }
            : null,
        ]));
      }
      return mocks.batchGet(paths, transport);
    },
    commitFirestoreDocuments: async (
      writes: Array<{ path: string; fields: { count: number } }>,
      transport: { deadlineAt?: number },
    ) => {
      mocks.transports.push(transport);
      for (const write of writes) mocks.rateLimits.set(write.path, write.fields.count);
    },
    runFirestoreEqualityQuery: async (
      query: unknown,
      transport: { deadlineAt?: number },
    ) => {
      mocks.queryInputs.push(query);
      mocks.transports.push(transport);
      return mocks.runQuery(query, transport);
    },
  };
});

import { Timestamp } from 'firebase-admin/firestore';
import { GET } from '@/app/api/trips/[shareId]/route';

function firestoreDoc(path: string, fields: Record<string, unknown>) {
  return { path, fields };
}

function request(cursor?: string) {
  const url = new URL('http://localhost/api/trips/share-123456');
  if (cursor) url.searchParams.set('cursor', cursor);
  return new Request(url, { headers: { 'x-forwarded-for': '203.0.113.10' } });
}

const context = { params: Promise.resolve({ shareId: 'share-123456' }) };

describe('shared trip route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryInputs.length = 0;
    mocks.transports.length = 0;
    mocks.rateLimits.clear();
    mocks.batchGet.mockImplementation(async (paths: string[]) => {
      if (paths[0] === 'sharedTrips/share-123456') {
        return new Map([[
          paths[0],
          firestoreDoc(paths[0], { userId: 'owner-1', tripId: 'trip-1' }),
        ]]);
      }
      return new Map([[
        paths[0],
        firestoreDoc(paths[0], {
          shareId: 'share-123456',
          name: 'Shared',
          stats: { totalRides: 21, totalWaitMinutes: 100 },
          statsUpdatedAt: '2026-04-20T01:02:00.123456789Z',
        }),
      ]]);
    });
    mocks.runQuery.mockResolvedValue({ documents: [], readTime: null });
  });

  it('returns a projected first page and a stable next cursor', async () => {
    mocks.runQuery.mockResolvedValueOnce({
      documents: Array.from({ length: 21 }, (_, index) => firestoreDoc(
        `users/owner-1/rideLogs/ride-${index}`,
        {
          attractionName: `Ride ${index}`,
          parkName: 'Park',
          waitTimeMinutes: index,
          rating: 5,
          rodeAt: new Date(`2026-08-18T${String(23 - index).padStart(2, '0')}:00:00Z`)
            .toISOString(),
          notes: 'private note',
          userId: 'private owner',
        },
      )),
      readTime: '2026-08-19T00:00:00Z',
    });

    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.rideLogs).toHaveLength(20);
    expect(body.trip.statsUpdatedAt).toMatch(/\.123456789Z$/);
    expect(body.nextCursor).toEqual(expect.any(String));
    expect(body.rideLogs[0]).not.toHaveProperty('notes');
    expect(body.rideLogs[0]).not.toHaveProperty('userId');
    expect(mocks.queryInputs[0]).toMatchObject({
      projectionFields: [
        'attractionName',
        'parkName',
        'waitTimeMinutes',
        'rating',
        'rodeAt',
      ],
      orderBy: [
        { field: 'rodeAt', direction: 'DESCENDING' },
        { field: '__name__', direction: 'DESCENDING' },
      ],
      limit: 21,
    });

    mocks.runQuery.mockResolvedValueOnce({
      documents: [firestoreDoc('users/owner-1/rideLogs/ride-20', {
        attractionName: 'Ride 20',
        parkName: 'Park',
        rodeAt: '2026-08-17T03:00:00Z',
      })],
      readTime: '2026-08-19T00:00:00Z',
    });
    const secondResponse = await GET(request(body.nextCursor), context);
    const secondBody = await secondResponse.json();
    expect(secondBody.rideLogs.map((log: { id: string }) => log.id)).toEqual(['ride-20']);
    expect(secondBody.nextCursor).toBeNull();
    expect(mocks.queryInputs[1]).toMatchObject({
      startAfter: {
        values: [expect.any(Timestamp)],
        documentPath: 'users/owner-1/rideLogs/ride-19',
      },
    });
  });

  it('does not honor an orphaned share index after sharing is disabled', async () => {
    mocks.batchGet.mockImplementationOnce(async (paths: string[]) => new Map([[
      paths[0],
      firestoreDoc(paths[0], { userId: 'owner-1', tripId: 'trip-1' }),
    ]])).mockImplementationOnce(async (paths: string[]) => new Map([[
      paths[0],
      firestoreDoc(paths[0], { shareId: null }),
    ]]));
    const response = await GET(request(), context);
    expect(response.status).toBe(404);
    expect(mocks.runQuery).not.toHaveBeenCalled();
  });

  it('uses one route deadline for limiter, shared index, trip, and ride-log REST reads', async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    const deadlines = new Set(mocks.transports.map(({ deadlineAt }) => deadlineAt));
    expect(deadlines.size).toBe(1);
    expect([...deadlines][0]).toEqual(expect.any(Number));
    expect(mocks.batchGet).toHaveBeenCalledTimes(2);
    expect(mocks.runQuery).toHaveBeenCalledTimes(1);
  });

  it('maps an abortable REST read deadline without starting another operation', async () => {
    const { FirestoreRestCommitError } = await import('@/lib/firebase/firestore-rest-commit');
    mocks.runQuery.mockRejectedValueOnce(
      new FirestoreRestCommitError('DEADLINE_EXCEEDED', 'aborted'),
    );
    const response = await GET(request(), context);
    expect(response.status).toBe(504);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.runQuery).toHaveBeenCalledTimes(1);
    expect(mocks.batchGet).toHaveBeenCalledTimes(2);
  });

  it('durably limits a hashed trusted client without storing IPs or share IDs', async () => {
    const trustedRequest = () => new Request('http://localhost/api/trips/share-123456', {
      headers: { 'x-vercel-forwarded-for': '203.0.113.10' },
    });
    for (let index = 0; index < 30; index += 1) {
      await expect(GET(trustedRequest(), context)).resolves.toMatchObject({ status: 200 });
    }
    const limited = await GET(trustedRequest(), context);
    expect(limited.status).toBe(429);
    expect([...mocks.rateLimits.keys()].join(' ')).not.toContain('203.0.113.10');
    expect([...mocks.rateLimits.keys()].join(' ')).not.toContain('share-123456');
  });
});
