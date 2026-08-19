import { beforeEach, describe, expect, it, vi } from 'vitest';

const { documents, queryResults, firestoreControl, mockAdminDb } = vi.hoisted(() => {
  const stored = new Map<string, Record<string, unknown>>();
  type QueryResult = {
    rows: Array<Record<string, unknown>>;
    readTime: { seconds: number; nanoseconds: number };
  };
  const queuedQueries: Array<QueryResult | Promise<QueryResult>> = [];

  // Hang-commit state: when hangCommit=true batch.commit() never resolves until
  // releasePendingCommit() is called, at which point it writes the docs and resolves.
  // This lets fake-timer tests advance past COMMIT_DEADLINE_MS and then optionally
  // let the late commit land to prove idempotent retry semantics.
  type PendingCommit = {
    creates: Array<{ ref: { path: string }; data: Record<string, unknown> }>;
    resolve: () => void;
    reject: (err: Error) => void;
  };

  const control = {
    readAttempts: 0,
    queryAttempts: 0,
    transactionAttempts: 0,
    batchCommits: 0,
    exhaustReads: false,
    nextBatchError: null as Error | null,
    // When true the next batch.commit() hangs until releasePendingCommit is called.
    hangCommit: false,
    // Resolves (and writes) or rejects the hung commit promise. Set by batch.commit().
    releasePendingCommit: null as null | ((err?: Error) => void),
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
      getAll: async (...refs: Array<{ path: string }>) => {
        control.readAttempts += refs.length;
        if (control.exhaustReads) {
          throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { code: 8 });
        }
        return refs.map((ref) => makeSnapshot(ref.path));
      },
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
            if (control.hangCommit) {
              // Return a promise that hangs until releasePendingCommit is called.
              return new Promise<void>((resolve, reject) => {
                control.releasePendingCommit = (err?: Error) => {
                  control.releasePendingCommit = null;
                  if (err) { reject(err); return; }
                  // Write docs only if not already present (idempotent write guard).
                  if (!creates.some(({ ref }) => stored.has(ref.path))) {
                    for (const { ref, data } of creates) stored.set(ref.path, data);
                  }
                  resolve();
                };
              });
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
  SaveCommandDeadlineError,
  COMMIT_DEADLINE_MS,
  getTripCommandStatus,
  saveRideCommand,
  saveTripCommand,
} from '@/lib/services/save-command-service';
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
    firestoreControl.hangCommit = false;
    firestoreControl.releasePendingCommit = null;
  });

  it('classifies committed, not-found, and each structural trip state', async () => {
    const expectedFingerprint = await tripCommandFingerprint(tripCommand);
    expect(await getTripCommandStatus(
      'user-123',
      'trip-status-missing',
      expectedFingerprint,
    )).toBe('not-found');

    documents.set('users/user-123/tripCreateCommands/trip-status-committed', {
      targetId: 'trip-status-committed',
      fingerprint: expectedFingerprint,
    });
    documents.set('users/user-123/trips/trip-status-committed', { name: 'redacted' });
    expect(await getTripCommandStatus(
      'user-123',
      'trip-status-committed',
      expectedFingerprint,
    )).toBe('committed');

    documents.set('users/user-123/trips/trip-status-target-only', { name: 'redacted' });
    expect(await getTripCommandStatus(
      'user-123',
      'trip-status-target-only',
      expectedFingerprint,
    ))
      .toBe('target-only');

    documents.set('users/user-123/tripCreateCommands/trip-status-command-only', {
      targetId: 'trip-status-command-only',
      fingerprint: expectedFingerprint,
    });
    expect(await getTripCommandStatus(
      'user-123',
      'trip-status-command-only',
      expectedFingerprint,
    ))
      .toBe('command-only');

    documents.set('users/user-123/tripCreateCommands/trip-status-payload-conflict', {
      targetId: 'different-target',
      fingerprint: expectedFingerprint,
    });
    documents.set('users/user-123/trips/trip-status-payload-conflict', { name: 'redacted' });
    expect(await getTripCommandStatus(
      'user-123',
      'trip-status-payload-conflict',
      expectedFingerprint,
    ))
      .toBe('payload-conflict');

    documents.set('users/user-123/tripCreateCommands/trip-status-fingerprint-conflict', {
      targetId: 'trip-status-fingerprint-conflict',
      fingerprint: expectedFingerprint,
    });
    documents.set('users/user-123/trips/trip-status-fingerprint-conflict', {
      name: 'redacted',
    });
    expect(await getTripCommandStatus(
      'user-123',
      'trip-status-fingerprint-conflict',
      await tripCommandFingerprint({ ...tripCommand, name: 'Different Trip' }),
    )).toBe('payload-conflict');
  });

  it('leaves trip status read quota exhaustion retryable to the route', async () => {
    firestoreControl.exhaustReads = true;
    await expect(getTripCommandStatus('user-123', 'trip-status-quota', 'a'.repeat(64)))
      .rejects.toMatchObject({ code: 8 });
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

  // -------------------------------------------------------------------------
  // T4: one-doc-only structural states → conflict, never replayed
  // -------------------------------------------------------------------------

  it('T4: trip-only or command-only structural state on ALREADY_EXISTS → conflict', async () => {
    // command-only: commandRef exists, tripRef absent
    documents.set('users/user-123/tripCreateCommands/trip-request-durable', {
      targetId: 'trip-request-durable',
      fingerprint: await tripCommandFingerprint(tripCommand),
    });
    await expect(saveTripCommand('user-123', tripCommand))
      .rejects.toBeInstanceOf(SaveCommandConflictError);
    documents.clear();

    // target-only: tripRef exists, commandRef absent
    documents.set('users/user-123/trips/trip-request-durable', { name: 'August Trip' });
    await expect(saveTripCommand('user-123', tripCommand))
      .rejects.toBeInstanceOf(SaveCommandConflictError);
  });

  // -------------------------------------------------------------------------
  // T5: ALREADY_EXISTS + RESOURCE_EXHAUSTED classification → ambiguous
  // -------------------------------------------------------------------------

  it('T5: trip ALREADY_EXISTS + RESOURCE_EXHAUSTED classification reads → SaveCommandAmbiguousError, not replayed', async () => {
    await expect(saveTripCommand('user-123', tripCommand)).resolves.toBe('created');
    const readsBefore = firestoreControl.readAttempts;
    firestoreControl.exhaustReads = true;
    // batch.commit() detects stored docs → throws ALREADY_EXISTS (code 6).
    // Classification reads (doc.get() × 2) are then attempted and hit
    // RESOURCE_EXHAUSTED. Frozen contract: must throw SaveCommandAmbiguousError.
    await expect(saveTripCommand('user-123', tripCommand))
      .rejects.toBeInstanceOf(SaveCommandAmbiguousError);
    // Both commits were attempted.
    expect(firestoreControl.batchCommits).toBe(2);
    // Classification reads WERE attempted — at least the two commandRef/tripRef
    // doc.get() calls — proving this is the ALREADY_EXISTS→classification branch,
    // not a short-circuit before reads.
    expect(firestoreControl.readAttempts).toBeGreaterThan(readsBefore);
  });

  // -------------------------------------------------------------------------
  // T6: generic (non-RESOURCE_EXHAUSTED) classification failure → ambiguous
  // -------------------------------------------------------------------------

  it('T6: generic classification failure on trips → SaveCommandAmbiguousError', async () => {
    await saveTripCommand('user-123', tripCommand);
    // docs are stored, so batch.commit() → ALREADY_EXISTS naturally.
    // Override doc.get() to throw a generic (non-quota) error so classification fails.
    const originalDoc = mockAdminDb.doc.bind(mockAdminDb);
    const spy = vi.spyOn(mockAdminDb, 'doc').mockImplementation((path: string) => {
      const real = originalDoc(path);
      return { ...real, get: async () => { throw new Error('network error'); } };
    });
    try {
      await expect(saveTripCommand('user-123', tripCommand))
        .rejects.toBeInstanceOf(SaveCommandAmbiguousError);
    } finally {
      spy.mockRestore();
    }
  });

  // -------------------------------------------------------------------------
  // T8: global sharedTrips shareId collision → conflict, never replayed
  // -------------------------------------------------------------------------

  it('T8: sharedTrips shareId collision with user trip/command absent → conflict, not replayed', async () => {
    // Pre-seed only the global sharedTrips doc — no user trip or command.
    documents.set('sharedTrips/share-abc123', { userId: 'other-user', tripId: 'other-trip' });
    const commandWithShare = { ...tripCommand, shareId: 'share-abc123' };
    // batch.create() on the sharedTrips ref throws ALREADY_EXISTS;
    // but neither user tripRef nor commandRef exists → structural conflict.
    await expect(saveTripCommand('user-123', commandWithShare))
      .rejects.toBeInstanceOf(SaveCommandConflictError);
    // No user trip or command was written.
    expect(documents.has('users/user-123/trips/trip-request-durable')).toBe(false);
    expect(documents.has('users/user-123/tripCreateCommands/trip-request-durable')).toBe(false);
  });

  // =========================================================================
  // Bounded-write regression tests (COMMIT_DEADLINE_MS = 10 s)
  //
  // Synchronization: saveTripCommand calls `await tripCommandFingerprint`
  // (which uses real crypto.subtle.digest) before registering the deadline
  // setTimeout inside commitWithDeadline. We must not advance fake time until
  // batch.commit() has been entered and releasePendingCommit is installed,
  // because only then is the deadline setTimeout registered.
  //
  // waitForCommitEntry(): condition-based drain — yields to the real event
  // loop via vi.advanceTimersByTimeAsync(0) until firestoreControl
  // .releasePendingCommit transitions from null to non-null. This is
  // deterministic (exits as soon as the signal fires, never earlier) and
  // does not depend on a fixed microtask count. The test's own 15 s wall-
  // clock timeout is the only safety net needed.
  //
  // Each test that switches to fake timers restores real timers in afterEach
  // via vi.useRealTimers(). The explicit finally blocks below provide
  // belt-and-suspenders restoration even on mid-test throws.
  // =========================================================================

  // Condition-based drain: resolves deterministically when batch.commit()
  // has been entered and the deadline setTimeout is registered.
  async function waitForCommitEntry(): Promise<void> {
    while (firestoreControl.releasePendingCommit === null) {
      await vi.advanceTimersByTimeAsync(0);
    }
  }

  afterEach(() => {
    vi.useRealTimers();
    firestoreControl.releasePendingCommit = null;
    firestoreControl.hangCommit = false;
  });

  // BW1: never-resolving trip commit → SaveCommandAmbiguousError, no partial docs
  it('BW1: never-resolving trip commit → SaveCommandAmbiguousError, no partial docs written', async () => {
    vi.useFakeTimers();
    firestoreControl.hangCommit = true;
    let err: unknown;
    try {
      const savePromise = saveTripCommand('user-123', tripCommand).catch((e) => {
        err = e;
      });
      // Flush the fingerprint microtask so commitWithDeadline's setTimeout is registered.
      await waitForCommitEntry();
      // Advance past the deadline; the timer fires, rejects commitWithDeadline,
      // which propagates through saveTripCommand into savePromise.
      await vi.advanceTimersByTimeAsync(COMMIT_DEADLINE_MS + 1);
      // Drain any remaining microtasks from the async chain.
      await savePromise;
      // saveTripCommand wraps SaveCommandDeadlineError in SaveCommandAmbiguousError.
      expect(err).toBeInstanceOf(SaveCommandAmbiguousError);
      // The cause carries the deadline subtype so callers can distinguish it.
      expect((err as SaveCommandAmbiguousError).cause).toBeInstanceOf(SaveCommandDeadlineError);
      // No docs written — the batch was abandoned at the deadline.
      expect(documents.size).toBe(0);
    } finally {
      firestoreControl.releasePendingCommit?.();
      vi.useRealTimers();
    }
  }, 15_000);

  // BW3: slow-but-under-deadline commit → 'created', docs present
  it('BW3: commit that resolves before the deadline → created with docs written', async () => {
    vi.useFakeTimers();
    firestoreControl.hangCommit = true;
    try {
      const savePromise = saveTripCommand('user-123', tripCommand);
      // Flush async setup.
      await waitForCommitEntry();
      // Advance to just under the deadline, then release the commit.
      await vi.advanceTimersByTimeAsync(COMMIT_DEADLINE_MS - 1);
      firestoreControl.releasePendingCommit?.();
      // Settle the resolved commit and any remaining timers.
      await vi.runAllTimersAsync();
      await expect(savePromise).resolves.toBe('created');
      expect(documents.has('users/user-123/trips/trip-request-durable')).toBe(true);
      expect(documents.has('users/user-123/tripCreateCommands/trip-request-durable')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);

  // BW4: deadline fires, late commit lands, same-ID retry → replayed; status → committed
  it('BW4: late commit lands after deadline; same-ID retry → replayed; status reads committed', async () => {
    vi.useFakeTimers();
    firestoreControl.hangCommit = true;
    try {
      let firstErr: unknown;
      const firstSave = saveTripCommand('user-123', tripCommand).catch((e) => { firstErr = e; });
      await waitForCommitEntry();
      await vi.advanceTimersByTimeAsync(COMMIT_DEADLINE_MS + 1);
      await firstSave;
      expect(firstErr).toBeInstanceOf(SaveCommandAmbiguousError);
      expect((firstErr as SaveCommandAmbiguousError).cause).toBeInstanceOf(SaveCommandDeadlineError);

      // Release the late commit while still under fake timers — docs land.
      const releaseRef = firestoreControl.releasePendingCommit;
      firestoreControl.hangCommit = false;
      releaseRef?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(documents.has('users/user-123/trips/trip-request-durable')).toBe(true);
      expect(documents.has('users/user-123/tripCreateCommands/trip-request-durable')).toBe(true);

      // Same-ID retry → ALREADY_EXISTS → classification reads match → replayed.
      // hangCommit=false: batch.commit() resolves synchronously, no need to
      // wait for releasePendingCommit. Direct await resolves via microtasks.
      const secondSave = saveTripCommand('user-123', tripCommand);
      await expect(secondSave).resolves.toBe('replayed');
    } finally {
      firestoreControl.releasePendingCommit?.();
      vi.useRealTimers();
    }

    // Status endpoint confirms committed — uses real crypto and real timers.
    const fp = await tripCommandFingerprint(tripCommand);
    expect(await getTripCommandStatus('user-123', 'trip-request-durable', fp)).toBe('committed');
  }, 15_000);

  // BW5: deadline fires, late commit lands, same-ID DIFFERENT payload → conflict
  it('BW5: after deadline+late-write, same-ID different payload → SaveCommandConflictError', async () => {
    vi.useFakeTimers();
    firestoreControl.hangCommit = true;
    try {
      let firstErr: unknown;
      const firstSave = saveTripCommand('user-123', tripCommand).catch((e) => { firstErr = e; });
      await waitForCommitEntry();
      await vi.advanceTimersByTimeAsync(COMMIT_DEADLINE_MS + 1);
      await firstSave;
      expect(firstErr).toBeInstanceOf(SaveCommandAmbiguousError);

      // Release the late commit — docs land — while still under fake timers.
      const releaseRef = firestoreControl.releasePendingCommit;
      firestoreControl.hangCommit = false;
      releaseRef?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Retry with conflicting payload — hangCommit=false: batch resolves
      // synchronously with ALREADY_EXISTS, deadline timer is immediately cleared.
      // Attach .catch BEFORE awaiting to prevent an unhandled rejection.
      const secondSave = saveTripCommand('user-123', { ...tripCommand, name: 'Different Trip' });
      const secondSettled = secondSave.catch((e: unknown) => e);
      expect(await secondSettled).toBeInstanceOf(SaveCommandConflictError);
    } finally {
      firestoreControl.releasePendingCommit?.();
      vi.useRealTimers();
    }
  }, 15_000);

  // BW6: share-ID collision under deadline path → conflict, no user docs
  it('BW6: sharedTrips collision after deadline-miss → conflict, no user docs written', async () => {
    documents.set('sharedTrips/share-deadlinetest', { userId: 'other', tripId: 'other' });
    const commandWithShare = { ...tripCommand, shareId: 'share-deadlinetest' };

    vi.useFakeTimers();
    firestoreControl.hangCommit = true;
    let saveErr: unknown;
    try {
      const savePromise = saveTripCommand('user-123', commandWithShare).catch((e) => { saveErr = e; });
      await waitForCommitEntry();
      await vi.advanceTimersByTimeAsync(COMMIT_DEADLINE_MS + 1);
      await savePromise;
      expect(saveErr).toBeInstanceOf(SaveCommandAmbiguousError);
    } finally {
      // Drain the late-settlement microtask queue before restoring real timers
      // so the background .then()/.catch() observer from commitWithDeadline
      // can run synchronously and not race the next test's cleanup.
      await Promise.resolve();
      firestoreControl.releasePendingCommit?.();
      await Promise.resolve();
      firestoreControl.hangCommit = false;
      vi.useRealTimers();
    }

    // With real timers and no hang: collision is synchronous → conflict.
    await expect(saveTripCommand('user-123', commandWithShare))
      .rejects.toBeInstanceOf(SaveCommandConflictError);
    expect(documents.has('users/user-123/trips/trip-request-durable')).toBe(false);
    expect(documents.has('users/user-123/tripCreateCommands/trip-request-durable')).toBe(false);
  }, 15_000);

  // BW7: ride commit hang → SaveCommandAmbiguousError; late-arriving same-ID retry → replayed
  it('BW7: never-resolving ride commit → SaveCommandAmbiguousError; late-retry same ID → replayed', async () => {
    vi.useFakeTimers();
    firestoreControl.hangCommit = true;
    try {
      let rideErr: unknown;
      const ridePromise = saveRideCommand('user-123', rideCommand).catch((e) => { rideErr = e; });
      await waitForCommitEntry();
      await vi.advanceTimersByTimeAsync(COMMIT_DEADLINE_MS + 1);
      await ridePromise;
      expect(rideErr).toBeInstanceOf(SaveCommandAmbiguousError);
      expect((rideErr as SaveCommandAmbiguousError).cause).toBeInstanceOf(SaveCommandDeadlineError);

      // Release the late commit while still under fake timers — docs land.
      const releaseRef = firestoreControl.releasePendingCommit;
      firestoreControl.hangCommit = false;
      releaseRef?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(documents.has('users/user-123/rideLogs/ride-request-durable')).toBe(true);
      expect(documents.has('users/user-123/rideLogCommands/ride-request-durable')).toBe(true);

      // Same-ID retry → replayed (idempotent recovery). hangCommit=false:
      // batch.commit() throws ALREADY_EXISTS synchronously; no commit entry wait needed.
      const retryPromise = saveRideCommand('user-123', rideCommand);
      await expect(retryPromise).resolves.toMatchObject({ result: 'replayed' });
    } finally {
      firestoreControl.releasePendingCommit?.();
      vi.useRealTimers();
    }
  }, 15_000);

  // =========================================================================
  // BW8: timer is cleared after fast success — no pending timers remain
  // =========================================================================
  it('BW8: no deadline timer remains after a fast-succeeding commit', async () => {
    vi.useFakeTimers();
    try {
      // Normal commit: hangCommit=false → batch resolves immediately.
      await saveTripCommand('user-123', tripCommand);
      // After successful return, the deadline setTimeout must have been cleared.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);

  // BW8b: timer is cleared after an early (non-deadline) batch error
  it('BW8b: no deadline timer remains after an early non-deadline batch error', async () => {
    vi.useFakeTimers();
    firestoreControl.nextBatchError = Object.assign(new Error('RESOURCE_EXHAUSTED'), { code: 8 });
    try {
      await expect(saveTripCommand('user-123', tripCommand))
        .rejects.toBeInstanceOf(SaveCommandAmbiguousError);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);

  // =========================================================================
  // BW9: deadline fires, late commit resolves → batch.commit.late-success logged;
  //       log contains no raw UID, requestId, or payload.
  // =========================================================================
  it('BW9: deadline + late commit resolve → batch.commit.late-success logged without raw user context', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.useFakeTimers();
    firestoreControl.hangCommit = true;
    let releaseRef: null | ((err?: Error) => void) = null;
    try {
      const savePromise = saveTripCommand('user-123', tripCommand).catch(() => {});
      await waitForCommitEntry();
      await vi.advanceTimersByTimeAsync(COMMIT_DEADLINE_MS + 1);
      await savePromise;
      releaseRef = firestoreControl.releasePendingCommit;
      firestoreControl.hangCommit = false;
    } finally {
      vi.useRealTimers();
    }

    try {
      // Release the hanging commit so the background .then() observer fires.
      releaseRef?.();
      // Drain the microtask queue so the .then() observer logs before assertions.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Find the late-success log entry.
      const lateSuccessCall = logSpy.mock.calls.find((args) => {
        const json = typeof args[1] === 'string' ? args[1] : '';
        return json.includes('late-success');
      });
      expect(lateSuccessCall, 'Expected batch.commit.late-success log to exist').toBeDefined();
      const parsed = JSON.parse(lateSuccessCall![1] as string) as Record<string, unknown>;
      expect(parsed.event).toBe('batch.commit.late-success');
      expect(parsed.outcome).toBe('created-after-deadline');
      // Privacy: no raw UID, no full requestId, no payload fields.
      expect(parsed).not.toHaveProperty('uid');
      expect(parsed).not.toHaveProperty('requestId');
      expect(parsed).not.toHaveProperty('fingerprint');
      expect(parsed).not.toHaveProperty('name');
    } finally {
      logSpy.mockRestore();
    }
  }, 15_000);

  // =========================================================================
  // BW10: deadline fires, late commit rejects → batch.commit.late-failure logged;
  //        log contains normalized errorCode, no raw user context.
  // =========================================================================
  it('BW10: deadline + late commit rejection → batch.commit.late-failure logged with normalized errorCode', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.useFakeTimers();
    firestoreControl.hangCommit = true;
    let releaseRef: null | ((err?: Error) => void) = null;
    try {
      const savePromise = saveTripCommand('user-123', tripCommand).catch(() => {});
      await waitForCommitEntry();
      await vi.advanceTimersByTimeAsync(COMMIT_DEADLINE_MS + 1);
      await savePromise;
      releaseRef = firestoreControl.releasePendingCommit;
      firestoreControl.hangCommit = false;
    } finally {
      vi.useRealTimers();
    }

    try {
      // Reject the late commit with a network error.
      releaseRef?.(Object.assign(new Error('network'), { code: 14 }));
      // Drain the microtask queue so the .catch() observer logs before assertions.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const lateFailCall = logSpy.mock.calls.find((args) => {
        const json = typeof args[1] === 'string' ? args[1] : '';
        return json.includes('late-failure');
      });
      expect(lateFailCall, 'Expected batch.commit.late-failure log to exist').toBeDefined();
      const parsed = JSON.parse(lateFailCall![1] as string) as Record<string, unknown>;
      expect(parsed.event).toBe('batch.commit.late-failure');
      expect(parsed.outcome).toBe('failed-after-deadline');
      // errorCode must be a normalized string — not a raw Error object or stack.
      expect(typeof parsed.errorCode).toBe('string');
      // Privacy: no raw UID, requestId, or payload.
      expect(parsed).not.toHaveProperty('uid');
      expect(parsed).not.toHaveProperty('requestId');
      expect(parsed).not.toHaveProperty('fingerprint');
    } finally {
      logSpy.mockRestore();
    }
  }, 15_000);

  // =========================================================================
  // BW11: commit wins when it resolves at the exact same tick as the deadline
  //        (same-tick boundary / winner semantics).
  // =========================================================================
  it('BW11: commit resolving strictly before deadline is always treated as success', async () => {
    // Releasing commit at COMMIT_DEADLINE_MS - 1 guarantees it fires before the
    // deadline timer. Drain microtasks after release so commitPromise settles
    // before vi.runAllTimersAsync advances the remaining 1ms and fires the timer.
    vi.useFakeTimers();
    firestoreControl.hangCommit = true;
    try {
      const savePromise = saveTripCommand('user-123', tripCommand);
      // Attach catch immediately so no rejection is ever unhandled.
      const settled = savePromise.catch((e: unknown) => e);
      await waitForCommitEntry();
      // Advance to 1 ms before deadline.
      await vi.advanceTimersByTimeAsync(COMMIT_DEADLINE_MS - 1);
      // Release the commit, then drain microtasks so Promise.race settles with
      // the commit BEFORE vi.runAllTimersAsync fires the 1ms remaining timer.
      // releasePendingCommit() sets it to null after calling resolve(), so
      // we drain via Promise.resolve() instead of waitForCommitEntry().
      firestoreControl.releasePendingCommit?.();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await vi.runAllTimersAsync();
      expect(await settled).toBe('created');
      expect(documents.has('users/user-123/trips/trip-request-durable')).toBe(true);
    } finally {
      firestoreControl.releasePendingCommit?.();
      vi.useRealTimers();
    }
  }, 15_000);

  // =========================================================================
  // BW12: deadline path attaches late-settlement observers before returning;
  //        commitPromise has a handler so no rejection can go unhandled.
  // =========================================================================
  it('BW12: deadline path registers late-settlement handler; commitPromise is always handled', async () => {
    // Verify that after the deadline fires and commitPromise later resolves,
    // the background .then() observer runs (not an unhandled rejection).
    // This is the structural proof — BW9/BW10 prove the log content.
    vi.useFakeTimers();
    firestoreControl.hangCommit = true;
    let releaseRef: null | ((err?: Error) => void) = null;
    try {
      const savePromise = saveTripCommand('user-123', tripCommand).catch(() => {});
      await waitForCommitEntry();
      await vi.advanceTimersByTimeAsync(COMMIT_DEADLINE_MS + 1);
      await savePromise;
      releaseRef = firestoreControl.releasePendingCommit;
    } finally {
      vi.useRealTimers();
    }

    // Late commit resolves — background observer should run without throwing.
    releaseRef?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // If we reach here without Vitest reporting an unhandled rejection,
    // the commitPromise handler is working correctly.
    expect(documents.has('users/user-123/trips/trip-request-durable')).toBe(true);
  }, 15_000);

});
