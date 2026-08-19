import { beforeEach, describe, expect, it, vi } from 'vitest';

const { documents, control, mockAdminDb } = vi.hoisted(() => {
  const stored = new Map<string, Record<string, unknown>>();
  const state = {
    commitAttempts: 0,
    readAttempts: 0,
    queryAttempts: 0,
    exhaustReads: false,
    nextCommitError: null as Error | null,
    lastCommitSpecs: null as null | Array<{
      path: string;
      fields: Record<string, unknown>;
      serverTimestampFields?: string[];
      operation?: 'create' | 'update';
      updateMaskFields?: string[];
    }>,
  };
  const snapshot = (path: string) => {
    const data = stored.get(path);
    return {
      exists: Boolean(data),
      get: (field: string) => data?.[field],
      data: () => data,
    };
  };
  return {
    documents: stored,
    control: state,
    mockAdminDb: {
      doc: (path: string) => ({
        path,
        get: async () => {
          state.readAttempts += 1;
          if (state.exhaustReads) throw Object.assign(new Error('quota'), { code: 8 });
          return snapshot(path);
        },
      }),
      getAll: async (...refs: Array<{ path: string }>) => {
        state.readAttempts += refs.length;
        if (state.exhaustReads) throw Object.assign(new Error('quota'), { code: 8 });
        return refs.map((ref) => snapshot(ref.path));
      },
      collection: (path: string) => ({
        where: (field: string, _operator: string, value: unknown) => ({
          get: async () => ({
            docs: [...stored.entries()]
              .filter(([key, data]) => key.startsWith(`${path}/`) && data[field] === value)
              .map(([key]) => snapshot(key)),
            readTime: { seconds: 1, nanoseconds: 0 },
          }),
          limit: () => ({
            get: async () => ({
              docs: [...stored.entries()]
                .filter(([key, data]) => key.startsWith(`${path}/`) && data[field] === value)
                .map(([key]) => snapshot(key)),
            }),
          }),
        }),
      }),
      runTransaction: async (
        update: (transaction: {
          get: (ref: { path: string }) => Promise<ReturnType<typeof snapshot>>;
          update: (ref: { path: string }, data: Record<string, unknown>) => void;
        }) => Promise<void>,
      ) => update({
        get: async (ref) => snapshot(ref.path),
        update: (ref, data) => stored.set(ref.path, { ...stored.get(ref.path), ...data }),
      }),
    },
  };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: mockAdminDb }));
vi.mock('@/lib/firebase/firestore-rest-commit', () => {
  class FirestoreRestCommitError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly httpStatus?: number,
    ) {
      super(message);
      this.name = 'FirestoreRestCommitError';
    }
  }
  return {
    FIRESTORE_REST_COMMIT_ABORT_MS: 7_000,
    FIRESTORE_REST_READ_ABORT_MS: 5_000,
    FirestoreRestCommitError,
    beginFirestoreTransaction: async () => 'test-transaction',
    commitFirestoreDocuments: async (
      specs: Array<{
        path: string;
        fields: Record<string, unknown>;
        serverTimestampFields?: string[];
      }>,
    ) => {
      control.commitAttempts += 1;
      control.lastCommitSpecs = specs;
      if (control.nextCommitError) {
        const error = control.nextCommitError;
        control.nextCommitError = null;
        throw error;
      }
      if (specs.some(({ path, operation }) => (
        operation === 'update' ? !documents.has(path) : documents.has(path)
      ))) {
        throw new FirestoreRestCommitError('ALREADY_EXISTS', 'already exists', 409);
      }
      for (const spec of specs) {
        documents.set(spec.path, {
          ...(spec.operation === 'update' ? documents.get(spec.path) : {}),
          ...spec.fields,
          ...Object.fromEntries(
            (spec.serverTimestampFields ?? []).map((field) => [
              field,
              { serverTimestamp: true },
            ]),
          ),
        });
      }
      return {
        commitTime: '2026-08-19T01:02:03.000Z',
        writes: specs.map((spec) => ({
          path: spec.path,
          transformResults: Object.fromEntries(
            (spec.serverTimestampFields ?? []).map((field) => [
              field,
              '2026-08-19T01:02:03.000Z',
            ]),
          ),
        })),
      };
    },
    batchGetFirestoreDocuments: async (paths: string[]) => {
      control.readAttempts += 1;
      if (control.exhaustReads) {
        throw new FirestoreRestCommitError('RESOURCE_EXHAUSTED', 'quota', 429);
      }
      return new Map(paths.map((path) => {
        const stored = documents.get(path);
        return [
          path,
          stored ? { path, fields: stored } : null,
        ];
      }));
    },
    runFirestoreEqualityQuery: async (
      query: {
        collectionPath: string;
        field: string;
        value: unknown;
        onDocument?: (document: { path: string; fields: Record<string, unknown> }) => void;
      },
    ) => {
      control.queryAttempts += 1;
      const queryDocuments = [...documents.entries()]
        .filter(([path, data]) => (
          path.startsWith(`${query.collectionPath}/`) && data[query.field] === query.value
        ))
        .map(([path, fields]) => ({ path, fields }));
      queryDocuments.forEach((document) => query.onDocument?.(document));
      return {
        documents: query.onDocument ? [] : queryDocuments,
        readTime: '2026-08-19T00:00:00.000000000Z',
        documentCount: queryDocuments.length,
        decodedBytes: 0,
      };
    },
  };
});
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => ({ serverTimestamp: true }) },
  Timestamp: class MockTimestamp {
    constructor(
      public readonly seconds: number,
      public readonly nanoseconds: number,
    ) {}

    static fromDate(date: Date) {
      return date;
    }

    static now() {
      return { seconds: 1, nanoseconds: 0 };
    }
  },
}));

import {
  COMMIT_DEADLINE_MS,
  CLASSIFICATION_DEADLINE_MS,
  claimTripStatsRefreshSlot,
  getTripCommandStatus,
  refreshTripStats,
  SaveCommandAmbiguousError,
  SaveCommandConflictError,
  SaveCommandDeadlineError,
  SaveCommandConfigurationError,
  TripStatsRateLimitError,
  saveRideCommand,
  saveTripCommand,
} from '@/lib/services/save-command-service';
import { FirestoreRestCommitError } from '@/lib/firebase/firestore-rest-commit';
import { InvalidFirestorePathSegmentError } from '@/lib/server/firestore-path';
import { tripCommandFingerprint } from '@/lib/services/trip-command-fingerprint';

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
  parkIds: [] as string[],
  parkNames: {} as Record<string, string>,
  status: 'active' as const,
  shareId: null,
  notes: '',
};

describe('durable save commands over REST commit transport', () => {
  beforeEach(() => {
    documents.clear();
    control.commitAttempts = 0;
    control.readAttempts = 0;
    control.queryAttempts = 0;
    control.exhaustReads = false;
    control.nextCommitError = null;
    control.lastCommitSpecs = null;
  });

  it('uses a seven-second physical commit abort inside the route budget', () => {
    expect(COMMIT_DEADLINE_MS).toBe(7_000);
    expect(CLASSIFICATION_DEADLINE_MS).toBe(5_000);
    expect(2_000 + COMMIT_DEADLINE_MS + CLASSIFICATION_DEADLINE_MS)
      .toBeLessThan(20_000);
  });

  it('commits ride target and immutable marker atomically without reads', async () => {
    await expect(saveRideCommand('user-123', rideCommand)).resolves.toMatchObject({
      result: 'created',
      statsUpdated: true,
    });

    expect(control.commitAttempts).toBe(1);
    expect(control.readAttempts).toBe(0);
    expect(control.lastCommitSpecs).toEqual([
      expect.objectContaining({
        path: 'users/user-123/rideLogs/ride-request-durable',
        fields: expect.objectContaining({
          rodeAt: new Date(rideCommand.rodeAt),
          revision: 0,
        }),
        serverTimestampFields: ['createdAt', 'updatedAt'],
      }),
      expect.objectContaining({
        path: 'users/user-123/rideLogCommands/ride-request-durable',
        fields: expect.objectContaining({
          targetId: 'ride-request-durable',
          tripId: null,
        }),
        serverTimestampFields: ['createdAt'],
      }),
    ]);
  });

  it('acknowledges a trip ride without waiting for derived stats reads', async () => {
    documents.set('users/user-123/trips/trip-durable', { shareId: null });
    await expect(saveRideCommand('user-123', {
      ...rideCommand,
      tripId: 'trip-durable',
    })).resolves.toEqual({
      result: 'created',
      tripId: 'trip-durable',
      statsUpdated: false,
    });
    expect(control.commitAttempts).toBe(1);
    expect(control.readAttempts).toBe(0);
    expect(control.queryAttempts).toBe(0);

    await expect(refreshTripStats('user-123', 'trip-durable')).resolves.toMatchObject({
      stats: { totalRides: 1, totalWaitMinutes: 25 },
    });
    expect(documents.get('users/user-123/trips/trip-durable')).toMatchObject({
      stats: {
        totalRides: 1,
        totalWaitMinutes: 25,
        parksVisited: 1,
        uniqueAttractions: 1,
        favoriteAttraction: 'Space Mountain',
      },
      parkNames: { 'magic-kingdom': 'Magic Kingdom' },
      statsGeneration: {
        nanoseconds: 0,
      },
    });
  });

  it('overwrites matching shared-trip summary fields with the same aggregate', async () => {
    documents.set('users/user-123/trips/trip-durable', { shareId: 'share-durable' });
    documents.set('sharedTrips/share-durable', {
      userId: 'user-123',
      tripId: 'trip-durable',
      stats: { totalRides: 0 },
    });

    await expect(saveRideCommand('user-123', {
      ...rideCommand,
      tripId: 'trip-durable',
    })).resolves.toMatchObject({ statsUpdated: false });
    await refreshTripStats('user-123', 'trip-durable');

    expect(documents.get('sharedTrips/share-durable')).toMatchObject({
      userId: 'user-123',
      tripId: 'trip-durable',
      stats: {
        totalRides: 1,
        totalWaitMinutes: 25,
        parksVisited: 1,
        uniqueAttractions: 1,
        favoriteAttraction: 'Space Mountain',
      },
    });
  });

  it('keeps replay acknowledgement independent from bounded stats maintenance', async () => {
    documents.set('users/user-123/trips/trip-durable', { shareId: null });
    const timedOutQuery = vi.fn().mockRejectedValue(
      new FirestoreRestCommitError('DEADLINE_EXCEEDED', 'bounded query timeout'),
    );
    await expect(saveRideCommand(
      'user-123',
      { ...rideCommand, tripId: 'trip-durable' },
      { queryDocuments: timedOutQuery },
    )).resolves.toMatchObject({
      result: 'created',
      statsUpdated: false,
    });

    await expect(saveRideCommand(
      'user-123',
      { ...rideCommand, tripId: 'trip-durable' },
    )).resolves.toMatchObject({
      result: 'replayed',
      statsUpdated: false,
    });
    expect(timedOutQuery).not.toHaveBeenCalled();
    await refreshTripStats('user-123', 'trip-durable');
    expect(documents.get('users/user-123/trips/trip-durable')).toMatchObject({
      stats: { totalRides: 1, totalWaitMinutes: 25 },
    });
  });

    it.each([
      new FirestoreRestCommitError('PERMISSION_DENIED', 'stats permission denied', 403),
      new SaveCommandConflictError('share index conflict'),
    ])('never invokes derived stats while acknowledging a confirmed ride with %s', async (failure) => {
      documents.set('users/user-123/trips/trip-durable', { shareId: null });
      const queryDocuments = vi.fn().mockRejectedValue(failure);
      await expect(saveRideCommand(
        'user-123',
        { ...rideCommand, tripId: 'trip-durable' },
        { queryDocuments },
      )).resolves.toEqual({
        result: 'created',
        tripId: 'trip-durable',
        statsUpdated: false,
      });
      expect(queryDocuments).not.toHaveBeenCalled();
      expect(documents.has('users/user-123/rideLogs/ride-request-durable')).toBe(true);
    });

    it('rejects oversized projected summary fields without downgrading the ride save', async () => {
      documents.set('users/user-123/trips/trip-durable', { shareId: null });
      await expect(saveRideCommand(
        'user-123',
        { ...rideCommand, tripId: 'trip-durable' },
        {
          queryDocuments: vi.fn().mockResolvedValue({
            readTime: '2026-08-19T00:00:00Z',
            documents: [{
              path: 'users/user-123/rideLogs/oversized',
              fields: {
                tripId: 'trip-durable',
                parkId: 'park-1',
                parkName: 'Park',
                attractionId: 'ride-1',
                attractionName: 'x'.repeat(257),
                waitTimeMinutes: 10,
              },
            }],
          }),
        },
      )).resolves.toMatchObject({
        result: 'created',
        statsUpdated: false,
      });
      expect(control.queryAttempts).toBe(0);
    });

    it('returns the private stats transform timestamp by path with an optional shared write', async () => {
      const tripPath = 'users/user-123/trips/trip-durable';
      documents.set(tripPath, { shareId: 'share-durable' });
      documents.set('sharedTrips/share-durable', {
        userId: 'user-123',
        tripId: 'trip-durable',
      });
      const commitDocuments = vi.fn(async () => ({
        commitTime: '2026-08-19T01:02:03.000Z',
        writes: [
          {
            path: 'sharedTrips/share-durable',
            transformResults: {
              statsUpdatedAt: '2026-08-19T01:02:03.222222Z',
              updatedAt: '2026-08-19T01:02:03.333333Z',
            },
          },
          {
            path: tripPath,
            transformResults: {
              statsUpdatedAt: '2026-08-19T01:02:03.111111Z',
              updatedAt: '2026-08-19T01:02:03.444444Z',
            },
          },
        ],
      }));

      await expect(refreshTripStats('user-123', 'trip-durable', { commitDocuments }))
        .resolves.toMatchObject({
          statsUpdatedAt: '2026-08-19T01:02:03.111111Z',
        });
    });

    it('treats a missing stats transform timestamp as a partial refresh failure', async () => {
      const tripPath = 'users/user-123/trips/trip-durable';
      documents.set(tripPath, { shareId: null });
      await expect(refreshTripStats('user-123', 'trip-durable', {
        commitDocuments: vi.fn(async () => ({
          commitTime: '2026-08-19T01:02:03.000Z',
          writes: [{ path: tripPath, transformResults: {} }],
        })),
      })).resolves.toBeNull();
    });

    it('uses independent durable per-trip buckets after ownership verification', async () => {
      const dependencies = { now: () => 25_000 };
      documents.set('users/user-123/trips/trip-durable', { name: 'One' });
      documents.set('users/user-123/trips/other-trip', { name: 'Two' });
      await claimTripStatsRefreshSlot('user-123', 'trip-durable', dependencies);
      await expect(claimTripStatsRefreshSlot('user-123', 'trip-durable', dependencies))
        .rejects.toMatchObject<Partial<TripStatsRateLimitError>>({
          name: 'TripStatsRateLimitError',
          retryAfterSeconds: 5,
        });
      await expect(claimTripStatsRefreshSlot(
        'user-123',
        'other-trip',
        dependencies,
      )).resolves.toBeUndefined();
      for (let index = 0; index < 50; index += 1) {
        await expect(claimTripStatsRefreshSlot(
          'user-123',
          `missing-trip-${index}`,
          dependencies,
        )).rejects.toBeInstanceOf(SaveCommandConflictError);
      }
      documents.set('users/other-user/trips/trip-durable', { name: 'Other owner' });
      await expect(claimTripStatsRefreshSlot(
        'other-user',
        'trip-durable',
        dependencies,
      )).resolves.toBeUndefined();
      expect(
        [...documents.keys()].filter((path) => path.startsWith('tripStatsRefreshThrottle/')),
      ).toHaveLength(3);
    });

    it('rejects a deliberately reordered stale aggregate and retries from a newer snapshot', async () => {
      const tripPath = 'users/user-123/trips/trip-durable';
      const ridePath = 'users/user-123/rideLogs/ride-old';
      const rides = new Map<string, Record<string, unknown>>([
        [ridePath, {
          tripId: 'trip-durable',
          parkId: 'park-1',
          parkName: 'Park One',
          attractionId: 'ride-1',
          attractionName: 'Ride One',
          waitTimeMinutes: 10,
        }],
      ]);
      let transactionNumber = 0;
      let releaseOldCommit!: () => void;
      const oldCommitBlocked = new Promise<void>((resolve) => {
        releaseOldCommit = resolve;
      });
      let oldCommitReached!: () => void;
      const oldCommitReady = new Promise<void>((resolve) => {
        oldCommitReached = resolve;
      });
      const committedStats: number[] = [];
      const dependencies = {
        beginTransaction: vi.fn(async () => `tx-${++transactionNumber}`),
        readDocuments: vi.fn(async (paths: string[]) => new Map(
          paths.map((path) => [path, path === tripPath
            ? { path, fields: { shareId: null } }
            : null]),
        )),
        queryDocuments: vi.fn(async (query: { transaction?: string }) => {
          const snapshot = query.transaction === 'tx-1'
            ? [rides.get(ridePath)!]
            : [...rides.values()];
          return {
            documents: snapshot.map((fields, index) => ({
              path: `users/user-123/rideLogs/ride-${index}`,
              fields,
            })),
            readTime: query.transaction === 'tx-1'
              ? '2026-08-19T00:00:00.000000001Z'
              : '2026-08-19T00:00:00.000000002Z',
          };
        }),
        commitDocuments: vi.fn(async (
          specs: Array<{ fields: Record<string, unknown> }>,
          _transport: unknown,
          transaction?: string,
        ) => {
          if (transaction === 'tx-1') {
            oldCommitReached();
            await oldCommitBlocked;
            throw new FirestoreRestCommitError('ABORTED', 'stale transaction', 409);
          }
          committedStats.push(
            (specs[0].fields.stats as { totalRides: number }).totalRides,
          );
          if (transaction === 'tx-2') releaseOldCommit();
          return {
            commitTime: '2026-08-19T01:02:03.000Z',
            writes: specs.map((spec, index) => ({
              path: index === 0 ? tripPath : `write-${index}`,
              transformResults: {
                statsUpdatedAt: '2026-08-19T01:02:03.000Z',
                updatedAt: '2026-08-19T01:02:03.000Z',
              },
            })),
          };
        }),
      };

      const oldRefresh = refreshTripStats('user-123', 'trip-durable', dependencies);
      await oldCommitReady;
      rides.set('users/user-123/rideLogs/ride-new', {
        tripId: 'trip-durable',
        parkId: 'park-1',
        parkName: 'Park One',
        attractionId: 'ride-2',
        attractionName: 'Ride Two',
        waitTimeMinutes: 20,
      });
      await expect(refreshTripStats('user-123', 'trip-durable', dependencies))
        .resolves.toMatchObject({
          stats: { totalRides: 2 },
          statsUpdatedAt: '2026-08-19T01:02:03.000Z',
        });
      await expect(oldRefresh).resolves.toMatchObject({
        stats: { totalRides: 2 },
        statsUpdatedAt: '2026-08-19T01:02:03.000Z',
      });
      expect(committedStats).toEqual([2, 2]);
    });

  it('commits trip target, marker, and optional global share in one request', async () => {
    await expect(saveTripCommand(
      'user-123',
      { ...tripCommand, shareId: 'share-atomic' },
    )).resolves.toBe('created');

    expect(control.commitAttempts).toBe(1);
    expect(control.readAttempts).toBe(0);
    expect(control.lastCommitSpecs).toEqual([
      expect.objectContaining({
        path: 'users/user-123/trips/trip-request-durable',
        serverTimestampFields: ['createdAt', 'updatedAt'],
      }),
      expect.objectContaining({
        path: 'users/user-123/tripCreateCommands/trip-request-durable',
        fields: expect.objectContaining({ shareId: 'share-atomic' }),
        serverTimestampFields: ['createdAt'],
      }),
      expect.objectContaining({
        path: 'sharedTrips/share-atomic',
        fields: { userId: 'user-123', tripId: 'trip-request-durable' },
        serverTimestampFields: ['updatedAt'],
      }),
    ]);
  });

  it('replays exact ride and trip IDs but rejects changed payloads', async () => {
    await saveRideCommand('user-123', rideCommand);
    documents.set('users/user-123/rideLogs/ride-request-durable', {
      ...documents.get('users/user-123/rideLogs/ride-request-durable'),
      notes: 'edited after creation',
    });
    await expect(saveRideCommand('user-123', rideCommand))
      .resolves.toMatchObject({ result: 'replayed' });
    await expect(saveRideCommand('user-123', { ...rideCommand, notes: 'different' }))
      .rejects.toBeInstanceOf(SaveCommandConflictError);

    documents.clear();
    await saveTripCommand('user-123', tripCommand);
    await expect(saveTripCommand('user-123', tripCommand)).resolves.toBe('replayed');
    await expect(saveTripCommand('user-123', { ...tripCommand, name: 'Different' }))
      .rejects.toBeInstanceOf(SaveCommandConflictError);
  });

  it('canonicalizes trip maps and equivalent ride timestamps for replay', async () => {
    const firstTrip = {
      ...tripCommand,
      parkIds: ['epcot', 'magic-kingdom'],
      parkNames: { epcot: 'EPCOT', 'magic-kingdom': 'Magic Kingdom' },
    };
    await saveTripCommand('user-123', firstTrip);
    await expect(saveTripCommand('user-123', {
      ...firstTrip,
      parkNames: { 'magic-kingdom': 'Magic Kingdom', epcot: 'EPCOT' },
    })).resolves.toBe('replayed');

    documents.clear();
    await saveRideCommand('user-123', { ...rideCommand, rodeAt: '2026-08-17T20:00:00Z' });
    await expect(saveRideCommand('user-123', {
      ...rideCommand,
      rodeAt: '2026-08-17T16:00:00-04:00',
    })).resolves.toMatchObject({ result: 'replayed' });
  });

  it('classifies structural states and exact committed trip status', async () => {
    const fingerprint = await tripCommandFingerprint(tripCommand);
    expect(await getTripCommandStatus('user-123', tripCommand.requestId, fingerprint))
      .toBe('not-found');

    documents.set('users/user-123/trips/trip-request-durable', { name: 'trip' });
    expect(await getTripCommandStatus('user-123', tripCommand.requestId, fingerprint))
      .toBe('target-only');

    documents.clear();
    documents.set('users/user-123/tripCreateCommands/trip-request-durable', {
      targetId: tripCommand.requestId,
      fingerprint,
    });
    expect(await getTripCommandStatus('user-123', tripCommand.requestId, fingerprint))
      .toBe('command-only');

    documents.set('users/user-123/trips/trip-request-durable', { name: 'trip' });
    expect(await getTripCommandStatus('user-123', tripCommand.requestId, fingerprint))
      .toBe('committed');
    expect(await getTripCommandStatus(
      'user-123',
      tripCommand.requestId,
      await tripCommandFingerprint({ ...tripCommand, name: 'Different' }),
    )).toBe('payload-conflict');
  });

  it('treats one-document states and global share collisions as conflicts', async () => {
    documents.set('users/user-123/trips/trip-request-durable', { name: 'orphan' });
    await expect(saveTripCommand('user-123', tripCommand))
      .rejects.toBeInstanceOf(SaveCommandConflictError);

    documents.clear();
    documents.set('sharedTrips/share-collision', { userId: 'other', tripId: 'other' });
    await expect(saveTripCommand(
      'user-123',
      { ...tripCommand, shareId: 'share-collision' },
    )).rejects.toBeInstanceOf(SaveCommandConflictError);
    expect(documents.has('users/user-123/trips/trip-request-durable')).toBe(false);
    expect(documents.has('users/user-123/tripCreateCommands/trip-request-durable')).toBe(false);
  });

  it('requires an exact matching global share document before replaying', async () => {
    const sharedCommand = { ...tripCommand, shareId: 'share-durable' };
    await saveTripCommand('user-123', sharedCommand);

    await expect(saveTripCommand('user-123', sharedCommand)).resolves.toBe('replayed');

    documents.delete('sharedTrips/share-durable');
    await expect(saveTripCommand('user-123', sharedCommand))
      .rejects.toBeInstanceOf(SaveCommandConflictError);

    documents.set('sharedTrips/share-durable', {
      userId: 'other-user',
      tripId: sharedCommand.requestId,
    });
    await expect(saveTripCommand('user-123', sharedCommand))
      .rejects.toBeInstanceOf(SaveCommandConflictError);

    documents.set('sharedTrips/share-durable', {
      userId: 'user-123',
      tripId: 'other-trip',
    });
    await expect(saveTripCommand('user-123', sharedCommand))
      .rejects.toBeInstanceOf(SaveCommandConflictError);
  });

  it('includes and verifies the expected share in status classification', async () => {
    const sharedCommand = { ...tripCommand, shareId: 'share-durable' };
    const fingerprint = await tripCommandFingerprint(sharedCommand);
    await saveTripCommand('user-123', sharedCommand);

    await expect(getTripCommandStatus(
      'user-123',
      sharedCommand.requestId,
      fingerprint,
      sharedCommand.shareId,
    )).resolves.toBe('committed');

    documents.delete('sharedTrips/share-durable');
    await expect(getTripCommandStatus(
      'user-123',
      sharedCommand.requestId,
      fingerprint,
      sharedCommand.shareId,
    )).resolves.toBe('payload-conflict');
  });

  it('classifies share-only state as a structural payload conflict', async () => {
    const sharedCommand = { ...tripCommand, shareId: 'share-only' };
    const fingerprint = await tripCommandFingerprint(sharedCommand);
    documents.set('sharedTrips/share-only', {
      userId: 'user-123',
      tripId: sharedCommand.requestId,
    });
    await expect(getTripCommandStatus(
      'user-123',
      sharedCommand.requestId,
      fingerprint,
      sharedCommand.shareId,
    )).resolves.toBe('payload-conflict');

    documents.set('sharedTrips/share-only', {
      userId: 'other-user',
      tripId: 'other-trip',
    });
    await expect(getTripCommandStatus(
      'user-123',
      sharedCommand.requestId,
      fingerprint,
      sharedCommand.shareId,
    )).resolves.toBe('payload-conflict');
  });

  it('keeps classification read failures ambiguous and never fabricates replay', async () => {
    await saveTripCommand('user-123', tripCommand);
    control.exhaustReads = true;
    await expect(saveTripCommand('user-123', tripCommand))
      .rejects.toBeInstanceOf(SaveCommandAmbiguousError);
    await expect(getTripCommandStatus(
      'user-123',
      tripCommand.requestId,
      await tripCommandFingerprint(tripCommand),
    )).rejects.toMatchObject({ code: 'RESOURCE_EXHAUSTED' });
  });

  it('does not classify non-ALREADY_EXISTS transport failures', async () => {
    control.nextCommitError = new FirestoreRestCommitError(
      'RESOURCE_EXHAUSTED',
      'private quota detail',
      429,
    );
    await expect(saveRideCommand('user-123', rideCommand))
      .rejects.toBeInstanceOf(SaveCommandAmbiguousError);
    expect(control.readAttempts).toBe(0);
    expect(documents.size).toBe(0);
  });

  it.each([
    'FAILED_PRECONDITION',
    'INVALID_ARGUMENT',
    'UNAUTHENTICATED',
    'PERMISSION_DENIED',
  ])('preserves permanent transport code %s as configuration failure', async (code) => {
    control.nextCommitError = new FirestoreRestCommitError(code, 'private credential detail', 400);
    await expect(saveTripCommand('user-123', tripCommand))
      .rejects.toBeInstanceOf(SaveCommandConfigurationError);
    expect(control.readAttempts).toBe(0);
  });

  it('maps abort to an ambiguous deadline and logs no private context', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const commitDocuments = vi.fn().mockRejectedValue(
      new FirestoreRestCommitError('DEADLINE_EXCEEDED', 'private transport detail'),
    );
    try {
      const error = await saveTripCommand(
        'user-123',
        tripCommand,
        { commitDocuments },
      ).catch((caught) => caught);
      expect(error).toBeInstanceOf(SaveCommandAmbiguousError);
      expect(error.cause).toBeInstanceOf(SaveCommandDeadlineError);
      expect(commitDocuments).toHaveBeenCalledTimes(1);

      const logs = JSON.stringify(logSpy.mock.calls);
      expect(logs).not.toContain('user-123');
      expect(logs).not.toContain('trip-request-durable');
      expect(logs).not.toContain('private transport detail');
      expect(logs).not.toContain('fingerprint');
      expect(logs).not.toContain('users/');
    } finally {
      logSpy.mockRestore();
    }
  });

  it.each(['bad/user', 'bad\u0000user', 'x'.repeat(129)])(
    'rejects invalid UID segment %j before transport',
    async (uid) => {
      await expect(saveRideCommand(uid, rideCommand))
        .rejects.toBeInstanceOf(InvalidFirestorePathSegmentError);
      expect(control.commitAttempts).toBe(0);
    },
  );

  it.each(['bad/trip', 'bad\u0001trip', 'x'.repeat(129)])(
    'rejects invalid trip segment %j before transport',
    async (tripId) => {
      await expect(saveRideCommand('user-123', { ...rideCommand, tripId }))
        .rejects.toBeInstanceOf(InvalidFirestorePathSegmentError);
      expect(control.commitAttempts).toBe(0);
    },
  );
});
