import { beforeEach, describe, expect, it, vi } from 'vitest';

const { documents, queryResults, firestoreControl, mockAdminDb } = vi.hoisted(() => {
  const stored = new Map<string, Record<string, unknown>>();
  type QueryResult = {
    rows: Array<Record<string, unknown>>;
    readTime: { seconds: number; nanoseconds: number };
  };
  const queuedQueries: Array<QueryResult | Promise<QueryResult>> = [];
  const control = {
    readAttempts: 0,
    queryAttempts: 0,
    transactionAttempts: 0,
    batchCommits: 0,
    exhaustReads: false,
    nextBatchError: null as Error | null,
  };
  const makeSnapshot = (path: string) => {
    const data = stored.get(path);
    return {
      exists: Boolean(data),
      id: path.split('/').at(-1),
      get: (field: string) => data?.[field],
      data: () => data,
    };
  };
  const querySnapshot = ({ rows, readTime }: QueryResult) => ({
    docs: rows.map((data, index) => ({
      id: `query-${index}`,
      data: () => data,
    })),
    readTime: {
      seconds: readTime.seconds,
      nanoseconds: readTime.nanoseconds,
      toMillis: () => readTime.seconds * 1_000 + Math.floor(readTime.nanoseconds / 1_000_000),
    },
  });
  return {
    documents: stored,
    queryResults: queuedQueries,
    mockAdminDb: {
      doc: (path: string) => ({
        path,
        get: async () => {
          control.readAttempts += 1;
          if (control.exhaustReads) {
            throw Object.assign(new Error('RESOURCE_EXHAUSTED'), {
              code: 8,
              details: 'RESOURCE_EXHAUSTED',
            });
          }
          return makeSnapshot(path);
        },
      }),
      batch: () => {
        const creates: Array<{ ref: { path: string }; data: Record<string, unknown> }> = [];
        return {
          create: (ref: { path: string }, data: Record<string, unknown>) => {
            creates.push({ ref, data });
          },
          commit: async () => {
            control.batchCommits += 1;
            if (control.nextBatchError) {
              const error = control.nextBatchError;
              control.nextBatchError = null;
              throw error;
            }
            if (creates.some(({ ref }) => stored.has(ref.path))) {
              throw Object.assign(new Error('already exists'), { code: 6 });
            }
            for (const { ref, data } of creates) stored.set(ref.path, data);
          },
        };
      },
      collection: (path: string) => ({
        where: (field: string, _operator: string, value: unknown) => ({
          limit: () => ({
            get: async () => {
              control.queryAttempts += 1;
              if (control.exhaustReads) throw new Error('RESOURCE_EXHAUSTED');
              return {
                docs: [...stored.entries()]
                .filter(([key, data]) => (
                  key.startsWith(`${path}/`) && data[field] === value
                ))
                .map(([key]) => makeSnapshot(key)),
              };
            },
          }),
          get: async () => {
            control.queryAttempts += 1;
            if (control.exhaustReads) throw new Error('RESOURCE_EXHAUSTED');
            return querySnapshot(await (queuedQueries.shift() ?? {
              rows: [],
              readTime: { seconds: Math.floor(Date.now() / 1_000), nanoseconds: 0 },
            }));
          },
        }),
      }),
      runTransaction: async (
        update: (transaction: {
          get: (ref: { path: string }) => Promise<ReturnType<typeof makeSnapshot>>;
          create: (ref: { path: string }, data: Record<string, unknown>) => void;
          update: (ref: { path: string }, data: Record<string, unknown>) => void;
        }) => Promise<unknown>,
      ) => {
        control.transactionAttempts += 1;
        if (control.exhaustReads) throw new Error('RESOURCE_EXHAUSTED');
        return update({
        get: async (ref) => makeSnapshot(ref.path),
        create: (ref, data) => {
          if (stored.has(ref.path)) throw new Error('already exists');
          stored.set(ref.path, data);
        },
        update: (ref, data) => {
          stored.set(ref.path, { ...stored.get(ref.path), ...data });
        },
        });
      },
    },
    firestoreControl: control,
  };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: mockAdminDb }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => ({ serverTimestamp: true }) },
  Timestamp: {
    fromDate: (date: Date) => date,
    now: () => ({ seconds: Math.floor(Date.now() / 1_000), nanoseconds: 0 }),
  },
}));

import {
  SaveCommandAmbiguousError,
  SaveCommandConflictError,
  saveRideCommand,
  saveTripCommand,
} from '@/lib/services/save-command-service';
import { InvalidFirestorePathSegmentError } from '@/lib/server/firestore-path';

const rideCommand = {
  requestId: 'ride-request-durable',
  parkId: 'magic-kingdom',
  attractionId: 'space-mountain',
  parkName: 'Magic Kingdom',
  attractionName: 'Space Mountain',
  rodeAt: '2026-08-17T20:00:00.000Z',
  waitTimeMinutes: 25,
  attractionClosed: false,
  source: 'manual' as const,
  rating: 5,
  notes: '',
  tripId: null,
};

const tripCommand = {
  requestId: 'trip-request-durable',
  name: 'August Trip',
  startDate: '2026-08-17',
  endDate: '2026-08-17',
  parkIds: [],
  parkNames: {},
  status: 'active' as const,
  shareId: null,
  notes: '',
};

describe('durable save commands', () => {
  beforeEach(() => {
    documents.clear();
    queryResults.length = 0;
    vi.useRealTimers();
    firestoreControl.readAttempts = 0;
    firestoreControl.batchCommits = 0;
    firestoreControl.queryAttempts = 0;
    firestoreControl.transactionAttempts = 0;
    firestoreControl.exhaustReads = false;
    firestoreControl.nextBatchError = null;
  });

  it('commits first ride and trip creates atomically without any Firestore read', async () => {
    firestoreControl.exhaustReads = true;

    await expect(saveRideCommand('user-123', rideCommand)).resolves.toMatchObject({
      result: 'created',
    });
    await expect(saveTripCommand('user-123', tripCommand)).resolves.toBe('created');

    expect(firestoreControl.readAttempts).toBe(0);
    expect(firestoreControl.queryAttempts).toBe(0);
    expect(firestoreControl.transactionAttempts).toBe(0);
    expect(firestoreControl.batchCommits).toBe(2);
    expect(documents.has('users/user-123/rideLogs/ride-request-durable')).toBe(true);
    expect(documents.has('users/user-123/rideLogCommands/ride-request-durable')).toBe(true);
    expect(documents.has('users/user-123/trips/trip-request-durable')).toBe(true);
    expect(documents.has('users/user-123/tripCreateCommands/trip-request-durable')).toBe(true);
  });

  it('replays the same ride after reload semantics and after the ride is edited', async () => {
    await expect(saveRideCommand('user-123', rideCommand)).resolves.toMatchObject({
      result: 'created',
    });
    documents.set('users/user-123/rideLogs/ride-request-durable', {
      ...documents.get('users/user-123/rideLogs/ride-request-durable'),
      notes: 'edited later',
      revision: 1,
    });

    await expect(saveRideCommand('user-123', rideCommand)).resolves.toMatchObject({
      result: 'replayed',
    });
  });

  it('rejects the same ride ID with a different business payload', async () => {
    await saveRideCommand('user-123', rideCommand);
    await expect(saveRideCommand('user-123', {
      ...rideCommand,
      notes: 'different command',
    })).rejects.toBeInstanceOf(SaveCommandConflictError);
  });

  it('returns an ambiguous retryable result when replay classification reads are exhausted', async () => {
    await saveRideCommand('user-123', rideCommand);
    firestoreControl.exhaustReads = true;

    await expect(saveRideCommand('user-123', rideCommand))
      .rejects.toBeInstanceOf(SaveCommandAmbiguousError);
  });

  it('does not perform classification reads for a non-ALREADY_EXISTS batch failure', async () => {
    firestoreControl.nextBatchError = Object.assign(new Error('RESOURCE_EXHAUSTED'), { code: 8 });

    await expect(saveRideCommand('user-123', rideCommand))
      .rejects.toBeInstanceOf(SaveCommandAmbiguousError);
    expect(firestoreControl.readAttempts).toBe(0);
    expect(documents.size).toBe(0);
  });

  it('durably replays the same trip and rejects a conflicting trip payload', async () => {
    await expect(saveTripCommand('user-123', tripCommand)).resolves.toBe('created');
    await expect(saveTripCommand('user-123', tripCommand)).resolves.toBe('replayed');
    await expect(saveTripCommand('user-123', {
      ...tripCommand,
      name: 'Different Trip',
    })).rejects.toBeInstanceOf(SaveCommandConflictError);
  });

  it('canonicalizes trip map key order for replay fingerprints', async () => {
    const first = {
      ...tripCommand,
      parkIds: ['epcot', 'magic-kingdom'],
      parkNames: { epcot: 'EPCOT', 'magic-kingdom': 'Magic Kingdom' },
    };
    const reordered = {
      ...first,
      parkNames: { 'magic-kingdom': 'Magic Kingdom', epcot: 'EPCOT' },
    };

    await expect(saveTripCommand('user-123', first)).resolves.toBe('created');
    await expect(saveTripCommand('user-123', reordered)).resolves.toBe('replayed');
  });

  it('normalizes equivalent ride timestamps before fingerprinting', async () => {
    await saveRideCommand('user-123', {
      ...rideCommand,
      rodeAt: '2026-08-17T20:00:00Z',
    });
    await expect(saveRideCommand('user-123', {
      ...rideCommand,
      rodeAt: '2026-08-17T16:00:00-04:00',
    })).resolves.toMatchObject({ result: 'replayed' });
  });

  it.each(['bad/user', 'bad\u0000user', 'x'.repeat(129)])(
    'rejects malicious authenticated UID segment %j before constructing refs',
    async (uid) => {
      await expect(saveRideCommand(uid, rideCommand))
        .rejects.toBeInstanceOf(InvalidFirestorePathSegmentError);
      expect(documents.size).toBe(0);
    },
  );

  it.each(['bad/trip', 'bad\u0001trip', 'x'.repeat(129)])(
    'rejects malicious trip segment %j before constructing refs',
    async (tripId) => {
      await expect(saveRideCommand('user-123', { ...rideCommand, tripId }))
        .rejects.toBeInstanceOf(InvalidFirestorePathSegmentError);
      expect(documents.size).toBe(0);
    },
  );

  it('prevents an older stats snapshot from overwriting a newer total', async () => {
    documents.set('users/user-123/trips/trip-1', { status: 'active' });
    let releaseOlder!: (result: {
      rows: Array<Record<string, unknown>>;
      readTime: { seconds: number; nanoseconds: number };
    }) => void;
    const olderSnapshot = new Promise<{
      rows: Array<Record<string, unknown>>;
      readTime: { seconds: number; nanoseconds: number };
    }>((resolve) => {
      releaseOlder = resolve;
    });
    queryResults.push(
      olderSnapshot,
      {
        readTime: { seconds: 200, nanoseconds: 0 },
        rows: [{
          parkId: 'magic-kingdom',
          parkName: 'Magic Kingdom',
          attractionId: 'space-mountain',
          attractionName: 'Space Mountain',
          waitTimeMinutes: 20,
        },
        {
          parkId: 'epcot',
          parkName: 'EPCOT',
          attractionId: 'test-track',
          attractionName: 'Test Track',
          waitTimeMinutes: 30,
        },
        ],
      },
    );

    const olderSave = saveRideCommand('user-123', { ...rideCommand, tripId: 'trip-1' });
    await Promise.resolve();
    const newerSave = saveRideCommand('user-123', {
      ...rideCommand,
      requestId: 'ride-request-newer',
      attractionId: 'test-track',
      attractionName: 'Test Track',
      tripId: 'trip-1',
    });
    await newerSave;
    releaseOlder({
      readTime: { seconds: 100, nanoseconds: 0 },
      rows: [{
        parkId: 'magic-kingdom',
        parkName: 'Magic Kingdom',
        attractionId: 'space-mountain',
        attractionName: 'Space Mountain',
        waitTimeMinutes: 20,
      }],
    });
    await olderSave;

    expect(documents.get('users/user-123/trips/trip-1')?.stats).toMatchObject({
      totalRides: 2,
      totalWaitMinutes: 50,
    });
  });

  it('orders stats snapshots at nanosecond precision within the same millisecond', async () => {
    documents.set('users/user-123/trips/trip-1', { status: 'active' });
    let releaseOlder!: (result: {
      rows: Array<Record<string, unknown>>;
      readTime: { seconds: number; nanoseconds: number };
    }) => void;
    const olderSnapshot = new Promise<{
      rows: Array<Record<string, unknown>>;
      readTime: { seconds: number; nanoseconds: number };
    }>((resolve) => {
      releaseOlder = resolve;
    });
    queryResults.push(
      olderSnapshot,
      {
        readTime: { seconds: 500, nanoseconds: 900_900 },
        rows: [
          { parkId: 'p1', attractionId: 'a1', attractionName: 'A1', waitTimeMinutes: 10 },
          { parkId: 'p1', attractionId: 'a2', attractionName: 'A2', waitTimeMinutes: 20 },
        ],
      },
    );

    const olderSave = saveRideCommand('user-123', { ...rideCommand, tripId: 'trip-1' });
    await Promise.resolve();
    await saveRideCommand('user-123', {
      ...rideCommand,
      requestId: 'ride-request-nanosecond-newer',
      attractionId: 'a2',
      attractionName: 'A2',
      tripId: 'trip-1',
    });
    releaseOlder({
      readTime: { seconds: 500, nanoseconds: 900_100 },
      rows: [
        { parkId: 'p1', attractionId: 'a1', attractionName: 'A1', waitTimeMinutes: 10 },
      ],
    });
    await olderSave;

    expect(documents.get('users/user-123/trips/trip-1')?.stats).toMatchObject({
      totalRides: 2,
      totalWaitMinutes: 30,
    });
    expect(documents.get('users/user-123/trips/trip-1')?.statsGeneration).toEqual({
      seconds: 500,
      nanoseconds: 900_900,
    });
  });
});
