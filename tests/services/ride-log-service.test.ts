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
  refreshTripStatsAfterMutation,
  submitCrowdReport,
} from '@/lib/services/ride-log-service';

const refreshedStats = {
  status: 'updated' as const,
  stats: {
    totalRides: 3,
    totalWaitMinutes: 45,
    parksVisited: 2,
    uniqueAttractions: 3,
    favoriteAttraction: 'Space Mountain',
  },
  statsUpdatedAt: '2026-08-19T01:02:03.000Z',
};

function refreshResponse(status = 200, body: unknown = {
  updated: true,
  stats: refreshedStats.stats,
  statsUpdatedAt: refreshedStats.statsUpdatedAt,
}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

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
      if (String(_input) === '/api/trip-stats') return refreshResponse();
      return {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          id: request.requestId,
          result: 'created',
          tripId: request.tripId ?? null,
          statsUpdated: true,
        }),
      };
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('honors bounded Retry-After and leaves no lifecycle timer behind', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('{}', {
        status: 429,
        headers: { 'Retry-After': '1' },
      }))
      .mockResolvedValueOnce(refreshResponse());

    const pending = refreshTripStatsAfterMutation('trip-retry');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toEqual(refreshedStats);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lets one subscriber abort while a coalesced subscriber still succeeds', async () => {
    let resolveFetch!: (response: Response) => void;
    let transportSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementationOnce((_input, init) => {
      transportSignal = init?.signal as AbortSignal;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    });
    const first = new AbortController();
    const second = new AbortController();

    const firstResult = refreshTripStatsAfterMutation('trip-shared', first.signal);
    const secondResult = refreshTripStatsAfterMutation('trip-shared', second.signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    first.abort();

    await expect(firstResult).resolves.toBe('stale');
    expect(transportSignal?.aborted).toBe(false);
    resolveFetch(refreshResponse());
    await expect(secondResult).resolves.toEqual(refreshedStats);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('evicts an abandoned transport before an immediate manual retry', async () => {
    const signals: AbortSignal[] = [];
    vi.mocked(fetch)
      .mockImplementationOnce((_input, init) => {
        const signal = init?.signal as AbortSignal;
        signals.push(signal);
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        });
      })
      .mockImplementationOnce((_input, init) => {
        signals.push(init?.signal as AbortSignal);
        return Promise.resolve(refreshResponse());
      });
    const abandoned = new AbortController();

    const first = refreshTripStatsAfterMutation('trip-abandoned', abandoned.signal);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    abandoned.abort();
    await expect(first).resolves.toBe('stale');
    await expect(refreshTripStatsAfterMutation('trip-abandoned')).resolves.toEqual(refreshedStats);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1]).not.toBe(signals[0]);
  });

  it('keeps simultaneous trips on independent transports', async () => {
    const resolvers = new Map<string, (response: Response) => void>();
    vi.mocked(fetch).mockImplementation((_input, init) => {
      const { tripId } = JSON.parse(String(init?.body)) as { tripId: string };
      return new Promise<Response>((resolve) => {
        resolvers.set(tripId, resolve);
      });
    });

    const first = refreshTripStatsAfterMutation('trip-one');
    const second = refreshTripStatsAfterMutation('trip-two');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    resolvers.get('trip-two')!(refreshResponse());
    await expect(second).resolves.toEqual(refreshedStats);
    resolvers.get('trip-one')!(refreshResponse());
    await expect(first).resolves.toEqual(refreshedStats);
  });

  it.each([
    ['delta seconds', '10'],
    ['HTTP date', new Date('2026-08-19T00:00:10Z').toUTCString()],
  ])('honors a ten-second Retry-After expressed as %s', async (_label, retryAfter) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T00:00:00Z'));
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('{}', {
        status: 429,
        headers: { 'Retry-After': retryAfter },
      }))
      .mockResolvedValueOnce(refreshResponse());

    const pending = refreshTripStatsAfterMutation(`trip-${_label}`);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual(refreshedStats);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns a terminal throttled result when Retry-After exceeds the refresh deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T00:00:00Z'));
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', {
      status: 429,
      headers: { 'Retry-After': '20' },
    }));

    await expect(refreshTripStatsAfterMutation('trip-throttled')).resolves.toEqual({
      status: 'throttled',
      retryAt: Date.parse('2026-08-19T00:00:20Z'),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts only a valid authoritative 200 refresh payload', async () => {
    const exactTimestamp = '2026-08-19T01:02:03.123456789Z';
    vi.mocked(fetch).mockResolvedValueOnce(refreshResponse(200, {
      updated: true,
      stats: refreshedStats.stats,
      statsUpdatedAt: exactTimestamp,
    }));
    await expect(refreshTripStatsAfterMutation('trip-valid')).resolves.toEqual({
      ...refreshedStats,
      statsUpdatedAt: exactTimestamp,
    });
  });

  it('keeps a malformed 200 refresh stale', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(refreshResponse(200, {
      updated: true,
      stats: { ...refreshedStats.stats, totalRides: '3' },
      statsUpdatedAt: refreshedStats.statsUpdatedAt,
    }));
    await expect(refreshTripStatsAfterMutation('trip-malformed')).resolves.toBe('stale');
  });

  it.each([
    '2026-08-19T01:02:03.1234567890Z',
    '2026-08-19T01:02:03.123456+24:00',
    '2026-02-30T01:02:03Z',
  ])('keeps malformed authoritative timestamp %s stale', async (statsUpdatedAt) => {
    vi.mocked(fetch).mockResolvedValueOnce(refreshResponse(200, {
      updated: true,
      stats: refreshedStats.stats,
      statsUpdatedAt,
    }));
    await expect(refreshTripStatsAfterMutation(`trip-malformed-${statsUpdatedAt}`))
      .resolves.toBe('stale');
  });

  it('keeps an actual 202 updated-false refresh stale', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(refreshResponse(202, { updated: false }));
    await expect(refreshTripStatsAfterMutation('trip-pending')).resolves.toBe('stale');
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

    it.each([
      ['missing ID', { result: 'created', tripId: null, statsUpdated: true }],
      ['mismatched ID', {
        id: 'different-ride-id',
        result: 'created',
        tripId: null,
        statsUpdated: true,
      }],
      ['missing result', {
        id: 'ride-request-invalid-success',
        tripId: null,
        statsUpdated: true,
      }],
      ['mismatched trip', {
        id: 'ride-request-invalid-success',
        result: 'created',
        tripId: 'different-trip',
        statsUpdated: true,
      }],
      ['missing stats outcome', {
        id: 'ride-request-invalid-success',
        result: 'created',
        tripId: null,
      }],
    ])('keeps a 200 ride response with %s ambiguous for retry', async (_label, body) => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(body),
      } as unknown as Response);

      await expect(addRideLog(
        userId,
        mockRideLogInput,
        null,
        { requestId: 'ride-request-invalid-success' },
      )).rejects.toMatchObject({
        code: 'write-failed',
        outcome: 'ambiguous',
      });
    });

    it('keeps malformed ride success JSON ambiguous for retry', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError('invalid JSON')),
      } as unknown as Response);

      await expect(addRideLog(
        userId,
        mockRideLogInput,
        null,
        { requestId: 'ride-request-malformed-success' },
      )).rejects.toMatchObject({
        code: 'write-failed',
        outcome: 'ambiguous',
      });
    });

    it('does not accept a well-formed ride success under an arbitrary 2xx status', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({
          id: 'ride-request-wrong-status',
          result: 'created',
          tripId: null,
          statsUpdated: true,
        }),
      } as unknown as Response);

      await expect(addRideLog(
        userId,
        mockRideLogInput,
        null,
        { requestId: 'ride-request-wrong-status' },
      )).rejects.toMatchObject({
        code: 'write-failed',
        outcome: 'ambiguous',
      });
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
          json: vi.fn().mockResolvedValue({
            id: 'ride-request-duplicate',
            result: 'created',
            tripId: null,
            statsUpdated: true,
          }),
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
          result: 'created',
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

      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      expect(fetch).toHaveBeenLastCalledWith('/api/trip-stats', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ tripId: 'trip-active' }),
      }));
      expect(mockUpdateTripStats).not.toHaveBeenCalled();
    });

    it.each(['created', 'replayed'] as const)(
      'acknowledges a confirmed %s ride before its automatic stats refresh completes',
      async (result) => {
        let resolveRefresh!: (response: Response) => void;
        let refreshCompleted = false;
        vi.mocked(fetch)
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({
              id: 'ride-request-acknowledged',
              result,
              tripId: 'trip-active',
              statsUpdated: false,
            }),
          } as unknown as Response)
          .mockImplementationOnce(() => new Promise<Response>((resolve) => {
            resolveRefresh = (response) => {
              refreshCompleted = true;
              resolve(response);
            };
          }));

        await expect(addRideLog(
          userId,
          mockRideLogInput,
          'trip-active',
          { requestId: 'ride-request-acknowledged' },
        )).resolves.toBe('ride-request-acknowledged');

        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
        expect(refreshCompleted).toBe(false);
        expect(fetch).toHaveBeenLastCalledWith('/api/trip-stats', expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ tripId: 'trip-active' }),
        }));

        resolveRefresh(refreshResponse());
        await vi.waitFor(() => expect(refreshCompleted).toBe(true));
      },
    );

    it('keeps a confirmed ride acknowledgement when automatic stats refresh fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            id: 'ride-request-refresh-failure',
            result: 'created',
            tripId: 'trip-refresh-failure',
            statsUpdated: false,
          }),
        } as unknown as Response)
        .mockRejectedValueOnce(new Error('offline'))
        .mockRejectedValueOnce(new Error('still offline'));

      await expect(addRideLog(
        userId,
        mockRideLogInput,
        'trip-refresh-failure',
        { requestId: 'ride-request-refresh-failure' },
      )).resolves.toBe('ride-request-refresh-failure');

      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(
        '[ride-log-service] Background trip summary refresh did not confirm an update.',
      ));
    });

    it('freezes retry for a permanent server configuration failure', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 412,
        json: vi.fn().mockResolvedValue({
          error: 'Ride saving is not configured',
          retryable: false,
        }),
      } as unknown as Response);

      await expect(addRideLog(
        userId,
        mockRideLogInput,
        null,
        { requestId: 'ride-request-config' },
      )).rejects.toMatchObject({
        code: 'configuration-error',
        outcome: 'definitive-non-commit',
        message: 'Ride saving is not configured',
      });
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
            result: 'replayed',
            tripId: 'trip-original',
            statsUpdated: true,
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

    it('returns from a trip ride edit before its bounded stats refresh completes', async () => {
      mockGetDocument.mockResolvedValue({ id: 'log-1', tripId: 'trip-1' });
      mockUpdateDocument.mockResolvedValue(undefined);
      let resolveRefresh!: (response: Response) => void;
      let refreshCompleted = false;
      vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveRefresh = (response) => {
          refreshCompleted = true;
          resolve(response);
        };
      }));

      await expect(updateRideLog(userId, 'log-1', { rating: 4 }))
        .resolves.toBeUndefined();

      await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith(
        '/api/trip-stats',
        expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ tripId: 'trip-1' }),
        }),
      ));
      expect(refreshCompleted).toBe(false);

      resolveRefresh(refreshResponse());
      await vi.waitFor(() => expect(refreshCompleted).toBe(true));
    });

    it('keeps separate trips independent and retries a 429 once', async () => {
      mockGetDocument.mockImplementation(async (_path, id) => ({
        id,
        tripId: id === 'log-1' ? 'trip-1' : 'trip-2',
      }));
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response('{}', {
          status: 429,
          headers: { 'Retry-After': '0' },
        }))
        .mockResolvedValueOnce(new Response('{}', { status: 200 }))
        .mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await Promise.all([
        updateRideLog(userId, 'log-1', { rating: 4 }),
        updateRideLog(userId, 'log-2', { rating: 5 }),
      ]);

      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
      expect(vi.mocked(fetch).mock.calls.map(([, init]) => String(init?.body))).toEqual(
        expect.arrayContaining([
          JSON.stringify({ tripId: 'trip-1' }),
          JSON.stringify({ tripId: 'trip-2' }),
        ]),
      );
    });

    it('does not downgrade an edit when refresh reaches a terminal error', async () => {
      mockGetDocument.mockResolvedValue({ id: 'log-1', tripId: 'trip-1' });
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(fetch).mockRejectedValue(new Error('offline'));

      await expect(updateRideLog(userId, 'log-1', { rating: 4 }))
        .resolves.toBeUndefined();
      expect(mockUpdateDocument).toHaveBeenCalled();
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(
        '[ride-log-service] Background trip summary refresh did not confirm an update.',
      ));
    });

    it('does not await or surface a failed stats metadata lookup', async () => {
      let rejectLookup!: (reason?: unknown) => void;
      mockGetDocument.mockReturnValue(new Promise((_resolve, reject) => {
        rejectLookup = reject;
      }));
      mockUpdateDocument.mockResolvedValue(undefined);

      const operation = updateRideLog(userId, 'log-1', { rating: 4 });

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        collectionPath,
        'log-1',
        expect.objectContaining({ rating: 4 }),
      );
      rejectLookup(new Error('metadata unavailable'));
      await expect(operation).resolves.toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('deleteRideLog', () => {
    it('removes the document', async () => {
      mockDeleteDocument.mockResolvedValue(undefined);

      await deleteRideLog(userId, 'log-1');

      expect(mockDeleteDocument).toHaveBeenCalledWith(collectionPath, 'log-1');
    });

    it('returns from a trip ride delete before its bounded stats refresh completes', async () => {
      mockGetDocument.mockResolvedValue({ id: 'log-1', tripId: 'trip-1' });
      mockDeleteDocument.mockResolvedValue(undefined);
      let resolveRefresh!: (response: Response) => void;
      let refreshCompleted = false;
      vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => {
        resolveRefresh = (response) => {
          refreshCompleted = true;
          resolve(response);
        };
      }));

      await expect(deleteRideLog(userId, 'log-1')).resolves.toBeUndefined();

      await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith(
        '/api/trip-stats',
        expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ tripId: 'trip-1' }),
        }),
      ));
      expect(refreshCompleted).toBe(false);

      resolveRefresh(refreshResponse());
      await vi.waitFor(() => expect(refreshCompleted).toBe(true));
    });

    it('does not downgrade a delete when background refresh fails', async () => {
      mockGetDocument.mockResolvedValue({ id: 'log-1', tripId: 'trip-delete-failure' });
      mockDeleteDocument.mockResolvedValue(undefined);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(fetch).mockRejectedValue(new Error('offline'));

      await expect(deleteRideLog(userId, 'log-1')).resolves.toBeUndefined();
      expect(mockDeleteDocument).toHaveBeenCalled();
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(
        '[ride-log-service] Background trip summary refresh did not confirm an update.',
      ));
    });

    it('does not await or surface a failed stats metadata lookup', async () => {
      let rejectLookup!: (reason?: unknown) => void;
      mockGetDocument.mockReturnValue(new Promise((_resolve, reject) => {
        rejectLookup = reject;
      }));
      mockDeleteDocument.mockResolvedValue(undefined);

      const operation = deleteRideLog(userId, 'log-1');

      expect(mockDeleteDocument).toHaveBeenCalledWith(collectionPath, 'log-1');
      rejectLookup(new Error('metadata unavailable'));
      await expect(operation).resolves.toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
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
