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
const mockSetDoc = vi.fn();
const mockIncrement = vi.fn((amount: number) => ({ increment: amount }));
const mockClientTimestamp = { seconds: 1714400000, nanoseconds: 0 };
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
  timestampNow: vi.fn(() => mockClientTimestamp),
}));

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockFirestoreDoc(...args),
  increment: (amount: number) => mockIncrement(amount),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
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
    mockSetDoc.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        requestId: string;
        tripId?: string | null;
      };
      return {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: request.requestId,
          tripId: request.tripId ?? null,
        }),
      };
    }));
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

    it('sends stable saves to the authenticated server endpoint', async () => {
      const fetchMock = vi.mocked(fetch);
      const result = await addRideLog(
        userId,
        mockRideLogInput,
        null,
        { requestId: 'ride-request-1234' },
      );

      expect(fetchMock).toHaveBeenCalledWith('/api/ride-logs', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"requestId":"ride-request-1234"'),
      }));
      expect(mockAddDocument).not.toHaveBeenCalled();
      expect(result).toBe('ride-request-1234');
    });

    it('writes first when read dependencies reject or never resolve', async () => {
      const exhausted = Object.assign(new Error('RESOURCE_EXHAUSTED'), {
        code: 'resource-exhausted',
      });
      mockGetDocument.mockRejectedValue(exhausted);
      mockGetActiveTrip.mockReturnValue(new Promise(() => {}));
      await expect(addRideLog(
        userId,
        mockRideLogInput,
        'trip-original',
        {
          requestId: 'ride-request-read-exhausted',
        },
      )).resolves.toBe('ride-request-read-exhausted');

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mockGetDocument).not.toHaveBeenCalled();
      expect(mockGetActiveTrip).not.toHaveBeenCalled();
    });

    it('rejects a different payload under the same stable request ID', async () => {
      const requestId = 'ride-request-conflict';
      await addRideLog(
        userId,
        mockRideLogInput,
        'trip-original',
        { requestId },
      );
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: vi.fn().mockResolvedValue({ error: 'different payload' }),
      } as unknown as Response);

      await expect(addRideLog(
        userId,
        { ...mockRideLogInput, notes: 'Changed replay' },
        'trip-original',
        { requestId },
      )).rejects.toMatchObject({
        code: 'conflicting-replay',
        outcome: 'definitive-non-commit',
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('coalesces duplicate in-flight saves with the same request ID', async () => {
      let resolveWrite!: () => void;
      vi.mocked(fetch).mockImplementation(() => new Promise<Response>((resolve) => {
        resolveWrite = () => resolve({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ id: 'ride-request-duplicate', tripId: null }),
        } as unknown as Response);
      }));

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

      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      resolveWrite();
      await expect(Promise.all([first, second])).resolves.toEqual([
        'ride-request-duplicate',
        'ride-request-duplicate',
      ]);
    });

    it('bounds token acquisition and clears coalescing so retry can reconcile', async () => {
      vi.useFakeTimers();
      mockAuth.currentUser!.getIdToken.mockReturnValueOnce(new Promise(() => {}));

      const first = addRideLog(
        userId,
        mockRideLogInput,
        null,
        { requestId: 'ride-request-token-timeout', timeoutMs: 50 },
      );
      const rejection = expect(first).rejects.toMatchObject({
        code: 'timeout',
        outcome: 'ambiguous',
      });
      await vi.advanceTimersByTimeAsync(51);
      await rejection;

      mockAuth.currentUser!.getIdToken.mockResolvedValueOnce('retry-token');
      await expect(addRideLog(
        userId,
        mockRideLogInput,
        null,
        { requestId: 'ride-request-token-timeout', timeoutMs: 50 },
      )).resolves.toBe('ride-request-token-timeout');
      expect(fetch).toHaveBeenCalledTimes(1);
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
      expect(mockSetDoc).not.toHaveBeenCalled();
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
        expect(mockSetDoc).not.toHaveBeenCalled();
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
      vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));

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

    it('does not invoke legacy client trip stats after a confirmed ride write', async () => {
      mockGetActiveTrip.mockResolvedValue({ id: 'trip-active', status: 'active' });
      mockAddDocument.mockResolvedValue({ id: 'log-confirmed' });

      await expect(addRideLog(userId, mockRideLogInput)).resolves.toBe('log-confirmed');

      expect(mockAddDocument).toHaveBeenCalledTimes(1);
      expect(mockUpdateTripStats).not.toHaveBeenCalled();
    });

    it('reports explicit partial success when the server stats refresh fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: 'ride-request-partial',
          tripId: 'trip-active',
          statsUpdated: false,
        }),
      } as unknown as Response);

      await expect(addRideLog(
        userId,
        mockRideLogInput,
        'trip-active',
        {
          requestId: 'ride-request-partial',
          waitForTripStats: true,
        },
      )).rejects.toMatchObject({
        code: 'post-write-refresh-failed',
        savedLogId: 'ride-request-partial',
        message: expect.stringMatching(/Ride saved/i),
      });

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mockUpdateTripStats).not.toHaveBeenCalled();
    });

    it('reuses one write for a same-payload retry after an ambiguous timeout', async () => {
      vi.useFakeTimers();
      let resolveWrite!: () => void;
      vi.mocked(fetch).mockImplementation(() => new Promise<Response>((resolve) => {
        resolveWrite = () => resolve({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            id: 'ride-request-timeout-replay',
            tripId: 'trip-original',
          }),
        } as unknown as Response);
      }));

      const first = addRideLog(
        userId,
        mockRideLogInput,
        'trip-original',
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

      const retry = addRideLog(
        userId,
        mockRideLogInput,
        'trip-original',
        {
          requestId: 'ride-request-timeout-replay',
          timeoutMs: 50,
          waitForTripStats: true,
        },
      );

      await Promise.resolve();
      await Promise.resolve();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(mockGetActiveTrip).not.toHaveBeenCalled();
      resolveWrite();

      await expect(retry).resolves.toBe('ride-request-timeout-replay');
      expect(mockUpdateTripStats).not.toHaveBeenCalled();
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
        expect.objectContaining({
          rating: 5,
          notes: 'Updated notes',
          revision: { increment: 1 },
        }),
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
