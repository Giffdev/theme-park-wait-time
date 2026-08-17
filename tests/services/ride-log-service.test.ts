/**
 * Tests for ride-log-service.ts
 *
 * Tests CRUD operations on the users/{userId}/rideLogs/{logId} subcollection.
 * Mocks the generic Firestore helpers that the service uses internally.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Firestore helpers at the module level
const mockAddDocument = vi.fn();
const mockGetDocument = vi.fn();
const mockGetCollection = vi.fn();
const mockUpdateDocument = vi.fn();
const mockDeleteDocument = vi.fn();
const mockWhereConstraint = vi.fn((...args) => ({ type: 'where', args }));
const mockOrderByConstraint = vi.fn((...args) => ({ type: 'orderBy', args }));
const mockLimitConstraint = vi.fn((...args) => ({ type: 'limit', args }));
const mockDateToTimestamp = vi.fn((d) => d);
const mockServerTimestamp = { _type: 'serverTimestamp' };
const mockGetActiveTrip = vi.fn();
const mockUpdateTripStats = vi.fn();
const mockFirestoreDoc = vi.fn((...path: unknown[]) => ({ path }));
const mockTransactionGet = vi.fn();
const mockTransactionSet = vi.fn();
const mockRunTransaction = vi.fn();
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: {
    currentUser: {
      uid: 'user-123',
      getIdToken: vi.fn().mockResolvedValue('test-token'),
    } as { uid: string; getIdToken: ReturnType<typeof vi.fn> } | null,
  },
}));

vi.mock('@/lib/firebase/firestore', () => ({
  addDocument: (...args: unknown[]) => mockAddDocument(...args),
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  updateDocument: (...args: unknown[]) => mockUpdateDocument(...args),
  deleteDocument: (...args: unknown[]) => mockDeleteDocument(...args),
  whereConstraint: (...args: unknown[]) => mockWhereConstraint(...args),
  orderByConstraint: (...args: unknown[]) => mockOrderByConstraint(...args),
  limitConstraint: (...args: unknown[]) => mockLimitConstraint(...args),
  dateToTimestamp: (d: unknown) => mockDateToTimestamp(d),
  getServerTimestamp: vi.fn(() => mockServerTimestamp),
  timestampNow: vi.fn(() => ({ seconds: 1714400000, nanoseconds: 0 })),
}));

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockFirestoreDoc(...args),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: mockAuth,
}));

vi.mock('@/lib/services/trip-service', () => ({
  getActiveTrip: (...args: unknown[]) => mockGetActiveTrip(...args),
  updateTripStats: (...args: unknown[]) => mockUpdateTripStats(...args),
}));

import {
  addRideLog,
  RideLogSaveError,
  getRideLogs,
  getRideLog,
  updateRideLog,
  deleteRideLog,
  submitCrowdReport,
} from '@/lib/services/ride-log-service';

describe('ride-log-service', () => {
  const userId = 'user-123';
  const collectionPath = `users/${userId}/rideLogs`;

  const mockRideLogInput = {
    parkId: 'magic-kingdom',
    attractionId: 'space-mountain',
    parkName: 'Magic Kingdom',
    attractionName: 'Space Mountain',
    rodeAt: new Date('2026-04-29T12:00:00Z'),
    waitTimeMinutes: 35,
    attractionClosed: false,
    source: 'timer' as const,
    rating: 4,
    notes: 'Great ride!',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = {
      uid: 'user-123',
      getIdToken: vi.fn().mockResolvedValue('test-token'),
    };
    mockGetActiveTrip.mockResolvedValue(null);
    mockUpdateTripStats.mockResolvedValue(undefined);
    mockGetDocument.mockResolvedValue(null);
    mockGetCollection.mockResolvedValue([]);
    mockTransactionGet.mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    });
    mockRunTransaction.mockImplementation(
      async (
        _db: unknown,
        update: (transaction: {
          get: typeof mockTransactionGet;
          set: typeof mockTransactionSet;
        }) => Promise<unknown>,
      ) => update({
        get: mockTransactionGet,
        set: mockTransactionSet,
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('addRideLog', () => {
    it('creates a doc in the correct subcollection path', async () => {
      const mockRef = { id: 'log-abc' };
      mockAddDocument.mockResolvedValue(mockRef);

      const result = await addRideLog(userId, mockRideLogInput);

      expect(mockAddDocument).toHaveBeenCalledWith(
        collectionPath,
        expect.objectContaining({
          parkId: 'magic-kingdom',
          attractionId: 'space-mountain',
          parkName: 'Magic Kingdom',
          attractionName: 'Space Mountain',
          waitTimeMinutes: 35,
          source: 'timer',
          rating: 4,
          notes: 'Great ride!',
        }),
      );
      expect(result).toBe('log-abc');
    });

    it('converts rodeAt through dateToTimestamp before writing', async () => {
      mockAddDocument.mockResolvedValue({ id: 'log-xyz' });

      await addRideLog(userId, mockRideLogInput);

      expect(mockDateToTimestamp).toHaveBeenCalledWith(mockRideLogInput.rodeAt);
    });

    it('creates a stable document once for retry-safe saves', async () => {
      const result = await addRideLog(
        userId,
        mockRideLogInput,
        null,
        { requestId: 'ride-request-1234' },
      );

      expect(mockFirestoreDoc).toHaveBeenCalledWith(
        {},
        collectionPath,
        'ride-request-1234',
      );
      expect(mockTransactionSet).toHaveBeenCalledWith(
        expect.objectContaining({
          path: [{}, collectionPath, 'ride-request-1234'],
        }),
        expect.objectContaining({
          parkId: 'magic-kingdom',
          clientRequestId: 'ride-request-1234',
          createdAt: mockServerTimestamp,
          updatedAt: mockServerTimestamp,
        }),
      );
      expect(mockAddDocument).not.toHaveBeenCalled();
      expect(result).toBe('ride-request-1234');
    });

    it('confirms an existing request without overwriting it or resolving a new trip', async () => {
      mockGetDocument.mockResolvedValue({
        id: 'ride-request-existing',
        tripId: 'trip-original',
        parkId: 'magic-kingdom',
        attractionId: 'space-mountain',
      });

      await expect(addRideLog(
        userId,
        {
          ...mockRideLogInput,
          rodeAt: new Date('2026-04-30T18:00:00Z'),
          rating: 1,
          notes: 'Changed replay',
        },
        undefined,
        {
          requestId: 'ride-request-existing',
          waitForTripStats: true,
        },
      )).resolves.toBe('ride-request-existing');

      expect(mockGetActiveTrip).not.toHaveBeenCalled();
      expect(mockRunTransaction).not.toHaveBeenCalled();
      expect(mockTransactionSet).not.toHaveBeenCalled();
      expect(mockUpdateTripStats).toHaveBeenCalledWith(userId, 'trip-original');
    });

    it('preserves a concurrent winner when Firestore retries the transaction callback', async () => {
      const requestId = 'ride-request-raced-confirmation';
      const winningStoredPayload = {
        parkId: 'epcot',
        attractionId: 'guardians-of-the-galaxy',
        parkName: 'EPCOT',
        attractionName: 'Guardians of the Galaxy',
        rodeAt: new Date('2026-04-28T16:15:00Z'),
        waitTimeMinutes: 20,
        attractionClosed: false,
        source: 'manual',
        rating: 5,
        notes: 'Immutable winning payload',
        tripId: 'trip-winning',
        clientRequestId: requestId,
        createdAt: { _type: 'winning-created-at' },
        updatedAt: { _type: 'winning-updated-at' },
      };
      const attemptReadStates: string[] = [];
      const transactionAttempts: Array<Array<{
        reference: unknown;
        data: Record<string, unknown>;
      }>> = [];
      let storedPayload: Record<string, unknown> | undefined;

      mockGetDocument.mockResolvedValue(null);
      mockGetActiveTrip.mockResolvedValue({ id: 'trip-losing', status: 'active' });
      mockRunTransaction.mockImplementation(
        async (
          _db: unknown,
          update: (transaction: {
            get: typeof mockTransactionGet;
            set: typeof mockTransactionSet;
          }) => Promise<unknown>,
        ) => {
          const runAttempt = async (
            readState: string,
            snapshot: {
              exists: () => boolean;
              data: () => Record<string, unknown> | undefined;
            },
          ) => {
            const writes: Array<{
              reference: unknown;
              data: Record<string, unknown>;
            }> = [];
            attemptReadStates.push(readState);
            const result = await update({
              get: vi.fn().mockResolvedValue(snapshot),
              set: vi.fn((reference: unknown, data: Record<string, unknown>) => {
                writes.push({ reference, data });
                mockTransactionSet(reference, data);
              }),
            });
            transactionAttempts.push(writes);
            return result;
          };

          await runAttempt('absent', {
            exists: () => false,
            data: () => undefined,
          });

          // A competing transaction commits before this attempt can commit, so
          // Firestore discards its queued set and retries the callback.
          storedPayload = winningStoredPayload;
          const retryResult = await runAttempt('winner', {
            exists: () => true,
            data: () => storedPayload,
          });

          const retryWrites = transactionAttempts[1];
          if (retryWrites.length > 0) {
            storedPayload = retryWrites[retryWrites.length - 1].data;
          }
          return retryResult;
        },
      );

      await expect(addRideLog(
        userId,
        {
          ...mockRideLogInput,
          rodeAt: new Date('2026-04-30T18:00:00Z'),
          rating: 1,
          notes: 'Losing payload must not overwrite',
        },
        undefined,
        {
          requestId,
          waitForTripStats: true,
        },
      )).resolves.toBe(requestId);

      expect(mockGetDocument).toHaveBeenCalledWith(collectionPath, requestId);
      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(attemptReadStates).toEqual(['absent', 'winner']);
      expect(transactionAttempts).toHaveLength(2);
      expect(transactionAttempts[0]).toHaveLength(1);
      expect(transactionAttempts[0][0].data).toEqual(expect.objectContaining({
        tripId: 'trip-losing',
        rating: 1,
        notes: 'Losing payload must not overwrite',
        createdAt: mockServerTimestamp,
        updatedAt: mockServerTimestamp,
      }));
      expect(transactionAttempts[1]).toHaveLength(0);
      expect(storedPayload).toEqual(winningStoredPayload);
      expect(mockUpdateTripStats).toHaveBeenCalledWith(userId, 'trip-winning');
    });

    it('coalesces duplicate in-flight saves with the same request ID', async () => {
      let resolveWrite!: () => void;
      mockRunTransaction.mockImplementation(
        async (
          _db: unknown,
          update: (transaction: {
            get: typeof mockTransactionGet;
            set: typeof mockTransactionSet;
          }) => Promise<unknown>,
        ) => {
          const result = await update({
            get: mockTransactionGet,
            set: mockTransactionSet,
          });
          await new Promise<void>((resolve) => {
            resolveWrite = resolve;
          });
          return result;
        },
      );

      const first = addRideLog(
        userId,
        mockRideLogInput,
        null,
        { requestId: 'ride-request-duplicate' },
      );
      const second = addRideLog(
        userId,
        mockRideLogInput,
        null,
        { requestId: 'ride-request-duplicate' },
      );

      await vi.waitFor(() => expect(mockRunTransaction).toHaveBeenCalledTimes(1));
      resolveWrite();
      await expect(Promise.all([first, second])).resolves.toEqual([
        'ride-request-duplicate',
        'ride-request-duplicate',
      ]);
    });

    it('times out a hanging active-trip lookup before any write starts', async () => {
      vi.useFakeTimers();
      mockGetActiveTrip.mockReturnValue(new Promise(() => {}));

      const save = addRideLog(
        userId,
        mockRideLogInput,
        undefined,
        { timeoutMs: 50 },
      );
      const rejection = expect(save).rejects.toMatchObject({
        code: 'timeout',
      });

      await vi.advanceTimersByTimeAsync(51);

      await rejection;
      expect(mockAddDocument).not.toHaveBeenCalled();
      expect(mockTransactionSet).not.toHaveBeenCalled();
      await expect(save).rejects.toMatchObject({
        outcome: 'definitive-non-commit',
      });
    });

    it('fails immediately when authentication is lost', async () => {
      mockAuth.currentUser = null;

      await expect(addRideLog(userId, mockRideLogInput)).rejects.toMatchObject({
        code: 'auth-required',
      });
      expect(mockAddDocument).not.toHaveBeenCalled();
    });

    it.each([null, 0, 2, 180])('accepts ride wait boundary %s', async (waitTimeMinutes) => {
      mockAddDocument.mockResolvedValue({ id: 'boundary-log' });
      await expect(addRideLog(userId, {
        ...mockRideLogInput,
        waitTimeMinutes,
      }, null)).resolves.toBe('boundary-log');
    });

    it.each([-1, 1, 181, 12.5, Number.NaN])(
      'rejects invalid ride wait %s before writing',
      async (waitTimeMinutes) => {
        await expect(addRideLog(userId, {
          ...mockRideLogInput,
          waitTimeMinutes,
        }, null)).rejects.toMatchObject({
          code: 'invalid-data',
          outcome: 'definitive-non-commit',
        });
        expect(mockAddDocument).not.toHaveBeenCalled();
        expect(mockTransactionSet).not.toHaveBeenCalled();
      },
    );

    it('preserves closed and unknown null semantics', async () => {
      mockAddDocument.mockResolvedValue({ id: 'null-log' });
      await expect(addRideLog(userId, {
        ...mockRideLogInput,
        waitTimeMinutes: null,
        attractionClosed: true,
      }, null)).resolves.toBe('null-log');
      await expect(addRideLog(userId, {
        ...mockRideLogInput,
        waitTimeMinutes: 20,
        attractionClosed: true,
      }, null)).rejects.toMatchObject({ code: 'invalid-data' });
    });

    it('surfaces Firestore write rejection without reporting success', async () => {
      mockAddDocument.mockRejectedValue(Object.assign(new Error('permission-denied'), {
        code: 'permission-denied',
      }));

      await expect(addRideLog(userId, mockRideLogInput)).rejects.toMatchObject({
        code: 'write-failed',
        outcome: 'definitive-non-commit',
      });
    });

    it('classifies an unavailable write as ambiguous and keeps the request identity retryable', async () => {
      mockRunTransaction.mockRejectedValueOnce(Object.assign(new Error('offline'), {
        code: 'unavailable',
      }));

      await expect(addRideLog(
        userId,
        mockRideLogInput,
        null,
        { requestId: 'ride-request-offline' },
      )).rejects.toMatchObject({
        code: 'write-failed',
        outcome: 'ambiguous',
      });
    });

    it('does not turn a confirmed ride write into failure when trip stats hang', async () => {
      vi.useFakeTimers();
      mockGetActiveTrip.mockResolvedValue({ id: 'trip-active', status: 'active' });
      mockUpdateTripStats.mockReturnValue(new Promise(() => {}));
      mockAddDocument.mockResolvedValue({ id: 'log-confirmed' });

      await expect(addRideLog(userId, mockRideLogInput)).resolves.toBe('log-confirmed');

      expect(mockAddDocument).toHaveBeenCalledTimes(1);
      expect(mockUpdateTripStats).toHaveBeenCalledWith(userId, 'trip-active');
      await vi.advanceTimersByTimeAsync(5_001);
    });

    it('reports bounded partial success when an awaited trip-stat refresh hangs', async () => {
      vi.useFakeTimers();
      mockGetActiveTrip.mockResolvedValue({ id: 'trip-active', status: 'active' });
      mockUpdateTripStats.mockReturnValue(new Promise(() => {}));

      const save = addRideLog(
        userId,
        mockRideLogInput,
        undefined,
        {
          requestId: 'ride-request-partial',
          waitForTripStats: true,
        },
      );
      const rejection = expect(save).rejects.toMatchObject({
        code: 'post-write-refresh-failed',
        savedLogId: 'ride-request-partial',
        message: expect.stringMatching(/Ride saved/i),
      });

      await vi.advanceTimersByTimeAsync(5_001);

      await rejection;
      expect(mockTransactionSet).toHaveBeenCalledTimes(1);
    });

    it('replays the immutable first command after an ambiguous timeout', async () => {
      vi.useFakeTimers();
      let resolveWrite!: () => void;
      mockGetActiveTrip.mockResolvedValue({ id: 'trip-original', status: 'active' });
      mockRunTransaction.mockImplementation(
        async (
          _db: unknown,
          update: (transaction: {
            get: typeof mockTransactionGet;
            set: typeof mockTransactionSet;
          }) => Promise<unknown>,
        ) => {
          const result = await update({
            get: mockTransactionGet,
            set: mockTransactionSet,
          });
          await new Promise<void>((resolve) => {
            resolveWrite = resolve;
          });
          return result;
        },
      );

      const first = addRideLog(
        userId,
        mockRideLogInput,
        undefined,
        {
          requestId: 'ride-request-timeout-replay',
          timeoutMs: 50,
          waitForTripStats: true,
        },
      );
      const firstRejection = expect(first).rejects.toMatchObject({
        code: 'timeout',
      });
      await vi.advanceTimersByTimeAsync(51);
      await firstRejection;

      mockGetActiveTrip.mockResolvedValue({ id: 'trip-changed', status: 'active' });
      const retry = addRideLog(
        userId,
        {
          ...mockRideLogInput,
          rodeAt: new Date('2026-05-01T09:30:00Z'),
          rating: 1,
          notes: 'Changed after timeout',
        },
        undefined,
        {
          requestId: 'ride-request-timeout-replay',
          timeoutMs: 50,
          waitForTripStats: true,
        },
      );

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockGetActiveTrip).toHaveBeenCalledTimes(1);
      resolveWrite();

      await expect(retry).resolves.toBe('ride-request-timeout-replay');
      expect(mockTransactionSet).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          rodeAt: mockRideLogInput.rodeAt,
          tripId: 'trip-original',
          rating: 4,
          notes: 'Great ride!',
          createdAt: mockServerTimestamp,
          updatedAt: mockServerTimestamp,
        }),
      );
      expect(mockUpdateTripStats).toHaveBeenCalledWith(userId, 'trip-original');
    });

    it('exposes typed save errors for callers', () => {
      const error = new RideLogSaveError('timeout', 'Timed out');
      expect(error).toMatchObject({
        name: 'RideLogSaveError',
        code: 'timeout',
        outcome: 'ambiguous',
      });
    });
  });

  describe('getRideLogs', () => {
    it('returns logs sorted by rodeAt DESC', async () => {
      const logs = [
        { id: 'log-1', ...mockRideLogInput },
        { id: 'log-2', ...mockRideLogInput },
      ];
      mockGetCollection.mockResolvedValue(logs);

      const result = await getRideLogs(userId);

      expect(mockOrderByConstraint).toHaveBeenCalledWith('rodeAt', 'desc');
      expect(mockGetCollection).toHaveBeenCalledWith(collectionPath, expect.any(Array));
      expect(result).toEqual(logs);
    });

    it('filters by parkId when provided', async () => {
      const logs = [{ id: 'log-1', ...mockRideLogInput }];
      mockGetCollection.mockResolvedValue(logs);

      const result = await getRideLogs(userId, { parkId: 'magic-kingdom' });

      expect(mockWhereConstraint).toHaveBeenCalledWith('parkId', '==', 'magic-kingdom');
      expect(result).toHaveLength(1);
    });

    it('filters by attractionId when provided', async () => {
      mockGetCollection.mockResolvedValue([]);

      await getRideLogs(userId, { attractionId: 'space-mountain' });

      expect(mockWhereConstraint).toHaveBeenCalledWith('attractionId', '==', 'space-mountain');
    });

    it('applies limit constraint when provided', async () => {
      mockGetCollection.mockResolvedValue([]);

      await getRideLogs(userId, { limit: 10 });

      expect(mockLimitConstraint).toHaveBeenCalledWith(10);
    });

    it('returns empty array when user has no ride logs', async () => {
      mockGetCollection.mockResolvedValue([]);

      const result = await getRideLogs(userId);

      expect(result).toEqual([]);
    });
  });

  describe('getRideLog', () => {
    it('returns a single ride log by ID', async () => {
      const log = { id: 'log-1', ...mockRideLogInput };
      mockGetDocument.mockResolvedValue(log);

      const result = await getRideLog(userId, 'log-1');

      expect(mockGetDocument).toHaveBeenCalledWith(collectionPath, 'log-1');
      expect(result).toEqual(log);
    });

    it('returns null for non-existent ID', async () => {
      mockGetDocument.mockResolvedValue(null);

      const result = await getRideLog(userId, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateRideLog', () => {
    it('performs partial update on the ride log', async () => {
      mockUpdateDocument.mockResolvedValue(undefined);

      await updateRideLog(userId, 'log-1', { rating: 5, notes: 'Updated notes' });

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        collectionPath,
        'log-1',
        expect.objectContaining({ rating: 5, notes: 'Updated notes' }),
      );
    });

    it('converts rodeAt through dateToTimestamp when updating date', async () => {
      mockUpdateDocument.mockResolvedValue(undefined);
      const newDate = new Date('2026-04-30T10:00:00Z');

      await updateRideLog(userId, 'log-1', { rodeAt: newDate });

      expect(mockDateToTimestamp).toHaveBeenCalledWith(newDate);
    });

    it.each([null, 0, 2, 180])('accepts update wait boundary %s', async (waitTimeMinutes) => {
      mockUpdateDocument.mockResolvedValue(undefined);
      await updateRideLog(userId, 'log-1', {
        waitTimeMinutes,
        attractionClosed: waitTimeMinutes === null,
      });
      expect(mockUpdateDocument).toHaveBeenCalled();
    });

    it.each([-1, 1, 181, 12.5, Number.NaN])(
      'rejects invalid update wait %s before writing',
      async (waitTimeMinutes) => {
        await expect(updateRideLog(userId, 'log-1', {
          waitTimeMinutes,
          attractionClosed: false,
        })).rejects.toMatchObject({ code: 'invalid-data' });
        expect(mockUpdateDocument).not.toHaveBeenCalled();
      },
    );

    it('requires wait and closed state to update together', async () => {
      await expect(updateRideLog(userId, 'log-1', {
        waitTimeMinutes: 20,
      })).rejects.toMatchObject({ code: 'invalid-data' });
      expect(mockUpdateDocument).not.toHaveBeenCalled();
    });
  });

  describe('deleteRideLog', () => {
    it('removes the document', async () => {
      mockDeleteDocument.mockResolvedValue(undefined);

      await deleteRideLog(userId, 'log-1');

      expect(mockDeleteDocument).toHaveBeenCalledWith(collectionPath, 'log-1');
    });
  });

  describe('submitCrowdReport', () => {
    it('authenticates the queue-report API request and checks success', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', fetchMock);

      await submitCrowdReport({
        parkId: 'magic-kingdom',
        attractionId: 'space-mountain',
        waitTimeMinutes: 35,
      });

      expect(mockAuth.currentUser?.getIdToken).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/queue-report',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it.each([-1, 0, 2, 180])('accepts report wait boundary %s', async (waitTimeMinutes) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
      await expect(submitCrowdReport({
        parkId: 'magic-kingdom',
        attractionId: 'space-mountain',
        waitTimeMinutes,
      })).resolves.toBeUndefined();
    });

    it.each([1, 181, 12.5, Number.NaN])(
      'rejects report wait boundary %s before fetching',
      async (waitTimeMinutes) => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await expect(submitCrowdReport({
          parkId: 'magic-kingdom',
          attractionId: 'space-mountain',
          waitTimeMinutes,
        })).rejects.toMatchObject({ code: 'invalid-data' });
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it('rejects an unsuccessful queue-report API response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

      await expect(submitCrowdReport({
        parkId: 'magic-kingdom',
        attractionId: 'space-mountain',
        waitTimeMinutes: 35,
      })).rejects.toThrow(/status 401/);
    });
  });
});
