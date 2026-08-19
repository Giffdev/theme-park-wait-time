/**
 * Tests for trip-service.ts
 *
 * Tests CRUD operations, active trip management, stats computation,
 * sharing, and edge cases for the Trip feature.
 * The service uses generic Firestore helpers internally.
 */
import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock Firestore helpers ---
const mockAddDocument = vi.fn();
const mockGetDocument = vi.fn();
const mockGetCollection = vi.fn();
const mockUpdateDocument = vi.fn();
const mockDeleteDocument = vi.fn();
const mockSetDocument = vi.fn();
const mockWhereConstraint = vi.fn((...args) => ({ type: 'where', args }));
const mockOrderByConstraint = vi.fn((...args) => ({ type: 'orderBy', args }));
const mockLimitConstraint = vi.fn((...args) => ({ type: 'limit', args }));
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
  setDocument: (...args: unknown[]) => mockSetDocument(...args),
  whereConstraint: (...args: unknown[]) => mockWhereConstraint(...args),
  orderByConstraint: (...args: unknown[]) => mockOrderByConstraint(...args),
  limitConstraint: (...args: unknown[]) => mockLimitConstraint(...args),
  getServerTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  timestampNow: vi.fn(() => ({ seconds: 1714400000, nanoseconds: 0 })),
  dateToTimestamp: vi.fn((d) => d),
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: mockAuth,
}));

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockFirestoreDoc(...args),
  runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
}));

import {
  createTrip,
  getTripCreationStatus,
  reconcileTripCreation,
  getTrips,
  getTrip,
  updateTrip,
  deleteTrip,
  getActiveTrip,
  activateTrip,
  completeTrip,
  updateTripStats,
  getTripRideLogs,
  generateShareId,
} from '@/lib/services/trip-service';

describe('trip-service', () => {
  const userId = 'user-123';
  const collectionPath = `users/${userId}/trips`;

  const mockTripInput = {
    name: 'Summer Vacation 2026',
    startDate: '2026-06-15',
    endDate: '2026-06-18',
    parkIds: ['magic-kingdom', 'epcot'],
    parkNames: { 'magic-kingdom': 'Magic Kingdom', 'epcot': 'EPCOT' },
    status: 'planning' as const,
    notes: 'Family trip!',
  };

  const mockTrip = {
    id: 'trip-1',
    ...mockTripInput,
    shareId: null,
    stats: {
      totalRides: 0,
      totalWaitMinutes: 0,
      parksVisited: 0,
      uniqueAttractions: 0,
      favoriteAttraction: null,
    },
    createdAt: { seconds: 1714400000, nanoseconds: 0 },
    updatedAt: { seconds: 1714400000, nanoseconds: 0 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = {
      uid: userId,
      getIdToken: vi.fn().mockResolvedValue('test-token'),
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { requestId: string };
      return {
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ id: request.requestId, result: 'created' }),
      };
    }));
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

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  describe('createTrip', () => {
    it('creates a trip in the correct subcollection path', async () => {
      mockAddDocument.mockResolvedValue({ id: 'trip-new' });

      const result = await createTrip(userId, mockTripInput);

      expect(mockAddDocument).toHaveBeenCalledWith(
        collectionPath,
        expect.objectContaining({
          name: 'Summer Vacation 2026',
          startDate: '2026-06-15',
          endDate: '2026-06-18',
          parkIds: ['magic-kingdom', 'epcot'],
          status: 'planning',
        }),
      );
      expect(result).toBe('trip-new');
    });

    it('preserves the status from input data', async () => {
      mockAddDocument.mockResolvedValue({ id: 'trip-new' });

      await createTrip(userId, { ...mockTripInput, status: 'active' });

      const writtenData = mockAddDocument.mock.calls[0][1];
      expect(writtenData.status).toBe('active');
    });

    it('initializes stats with zeros', async () => {
      mockAddDocument.mockResolvedValue({ id: 'trip-new' });

      await createTrip(userId, mockTripInput);

      const writtenData = mockAddDocument.mock.calls[0][1];
      expect(writtenData.stats).toEqual({
        totalRides: 0,
        totalWaitMinutes: 0,
        parksVisited: 0,
        uniqueAttractions: 0,
        favoriteAttraction: null,
      });
    });

    it('sets shareId to null when not provided', async () => {
      mockAddDocument.mockResolvedValue({ id: 'trip-new' });

      await createTrip(userId, mockTripInput);

      const writtenData = mockAddDocument.mock.calls[0][1];
      expect(writtenData.shareId).toBeNull();
    });

    it('indexes in sharedTrips collection when shareId is provided', async () => {
      mockAddDocument.mockResolvedValue({ id: 'trip-shared' });
      mockSetDocument.mockResolvedValue(undefined);

      await createTrip(userId, { ...mockTripInput, shareId: 'share-xyz' });

      expect(mockSetDocument).toHaveBeenCalledWith(
        'sharedTrips',
        'share-xyz',
        expect.objectContaining({ userId, tripId: 'trip-shared' }),
      );
    });

    it('uses the authenticated command endpoint for retry-safe creation', async () => {
      await expect(createTrip(userId, mockTripInput, {
        requestId: 'trip-request-1234',
      })).resolves.toBe('trip-request-1234');
    });

    it('freezes retry when trip creation returns non-retryable 412', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 412,
        json: vi.fn().mockResolvedValue({
          error: 'Trip creation is not configured',
          retryable: false,
        }),
      } as unknown as Response);

      await expect(createTrip(userId, mockTripInput, {
        requestId: 'trip-request-config',
      })).rejects.toMatchObject({
        code: 'configuration-error',
        outcome: 'definitive-non-commit',
        message: 'Trip creation is not configured',
      });

      expect(fetch).toHaveBeenCalledWith('/api/trip-commands', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"requestId":"trip-request-config"'),
      }));
      expect(mockAddDocument).not.toHaveBeenCalled();
    });

    it.each([
      ['missing ID', { result: 'created' }],
      ['mismatched ID', { id: 'different-trip-id', result: 'created' }],
      ['wrong result', { id: 'trip-request-invalid-success', result: 'pending' }],
    ])('keeps a 200 POST with %s ambiguous for status reconciliation', async (_label, body) => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(body),
      } as unknown as Response);

      await expect(createTrip(userId, mockTripInput, {
        requestId: 'trip-request-invalid-success',
      })).rejects.toMatchObject({
        code: 'write-failed',
        outcome: 'ambiguous',
      });
    });

    it('keeps malformed POST success JSON ambiguous for status reconciliation', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError('invalid JSON')),
      } as unknown as Response);

      await expect(createTrip(userId, mockTripInput, {
        requestId: 'trip-request-malformed-success',
      })).rejects.toMatchObject({
        code: 'write-failed',
        outcome: 'ambiguous',
      });
    });

    it('does not accept a well-formed success body under an arbitrary 2xx status', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({
          id: 'trip-request-wrong-status',
          result: 'created',
        }),
      } as unknown as Response);

      await expect(createTrip(userId, mockTripInput, {
        requestId: 'trip-request-wrong-status',
      })).rejects.toMatchObject({
        code: 'write-failed',
        outcome: 'ambiguous',
      });
    });

    it('bounds a never-resolving trip transaction with an ambiguous outcome', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockReturnValue(new Promise(() => {}));

      const first = createTrip(userId, mockTripInput, {
        requestId: 'trip-request-hanging',
        timeoutMs: 50,
      });

      const rejection = expect(first).rejects.toMatchObject({
        code: 'timeout',
        outcome: 'ambiguous',
      });

      await vi.advanceTimersByTimeAsync(51);
      await rejection;
    });

    it('forces an auth refresh when cached token acquisition stalls', async () => {
      vi.useFakeTimers();
      mockAuth.currentUser!.getIdToken.mockReturnValueOnce(new Promise(() => {}));

      const create = createTrip(userId, mockTripInput, {
        requestId: 'trip-request-token-timeout',
        timeoutMs: 50,
      });
      await vi.advanceTimersByTimeAsync(26);
      await expect(create).resolves.toBe('trip-request-token-timeout');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mockAuth.currentUser!.getIdToken).toHaveBeenNthCalledWith(2, true);
    });

    it('refreshes an expired token and safely replays the initial POST', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: vi.fn().mockResolvedValue({ error: 'expired' }),
        } as unknown as Response)
        .mockImplementationOnce(async (_input, init) => {
          const request = JSON.parse(String(init?.body)) as { requestId: string };
          return {
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({ id: request.requestId, result: 'created' }),
          } as unknown as Response;
        });

      await expect(createTrip(userId, mockTripInput, {
        requestId: 'trip-request-post-auth-refresh',
      })).resolves.toBe('trip-request-post-auth-refresh');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(mockAuth.currentUser!.getIdToken).toHaveBeenLastCalledWith(true);
      expect(fetch).toHaveBeenLastCalledWith('/api/trip-commands', expect.objectContaining({
        body: expect.stringContaining('"requestId":"trip-request-post-auth-refresh"'),
      }));
    });

    it('bounds a never-settling forced refresh after POST 401 and clears in-flight state', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: vi.fn().mockResolvedValue({ error: 'expired' }),
        } as unknown as Response)
        .mockImplementationOnce(async (_input, init) => {
          const request = JSON.parse(String(init?.body)) as { requestId: string };
          return {
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({ id: request.requestId, result: 'created' }),
          } as unknown as Response;
        });
      mockAuth.currentUser!.getIdToken
        .mockResolvedValueOnce('cached-token')
        .mockReturnValueOnce(new Promise(() => {}))
        .mockResolvedValueOnce('fresh-cached-token');

      const first = createTrip(userId, mockTripInput, {
        requestId: 'trip-request-refresh-deadline',
        timeoutMs: 50,
      });
      const rejection = expect(first).rejects.toMatchObject({
        code: 'timeout',
        outcome: 'ambiguous',
      });
      await vi.advanceTimersByTimeAsync(51);
      await rejection;

      await expect(createTrip(userId, mockTripInput, {
        requestId: 'trip-request-refresh-deadline',
        timeoutMs: 50,
      })).resolves.toBe('trip-request-refresh-deadline');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('rejects a conflicting payload under the same durable trip request ID', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch)
        .mockImplementationOnce(() => new Promise(() => {}))
        .mockResolvedValueOnce({
          ok: false,
          status: 409,
          json: vi.fn().mockResolvedValue({ error: 'different payload' }),
        } as unknown as Response);

      const first = createTrip(userId, mockTripInput, {
        requestId: 'trip-request-reconcile',
        timeoutMs: 50,
      });
      const rejection = expect(first).rejects.toMatchObject({
        code: 'timeout',
        outcome: 'ambiguous',
      });
      await vi.advanceTimersByTimeAsync(51);
      await rejection;

      await expect(createTrip(userId, {
        ...mockTripInput,
        name: 'Changed after timeout',
      }, {
        requestId: 'trip-request-reconcile',
        timeoutMs: 50,
      })).rejects.toMatchObject({
        code: 'conflicting-replay',
        outcome: 'ambiguous',
      });
    });

    it('replays the same trip payload after an ambiguous timeout', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch)
        .mockImplementationOnce(() => new Promise(() => {}))
        .mockImplementationOnce(async (_input, init) => {
          const request = JSON.parse(String(init?.body)) as { requestId: string };
          return {
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({ id: request.requestId, result: 'replayed' }),
          } as unknown as Response;
        });

      const first = createTrip(userId, mockTripInput, {
        requestId: 'trip-request-immutable',
        timeoutMs: 50,
      });
      const rejection = expect(first).rejects.toMatchObject({ code: 'timeout' });
      await vi.advanceTimersByTimeAsync(51);
      await rejection;

      await expect(createTrip(userId, mockTripInput, {
        requestId: 'trip-request-immutable',
        timeoutMs: 50,
      })).resolves.toBe('trip-request-immutable');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('fails definitively before writing when authentication is lost', async () => {
      mockAuth.currentUser = null;

      await expect(createTrip(userId, mockTripInput, {
        requestId: 'trip-request-auth',
      })).rejects.toMatchObject({
        code: 'auth-required',
        outcome: 'definitive-non-commit',
      });
      expect(mockRunTransaction).not.toHaveBeenCalled();
    });

    it('confirms an exact committed request ID without replaying the POST', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          status: 'committed',
          id: 'trip-request-committed',
        }),
      } as unknown as Response);

      await expect(reconcileTripCreation(
        userId,
        mockTripInput,
        'trip-request-committed',
      )).resolves.toBe('trip-request-committed');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('requestId=trip-request-committed'),
        expect.objectContaining({ method: 'GET' }),
      );
      const statusUrl = new URL(String(vi.mocked(fetch).mock.calls[0][0]), 'http://localhost');
      expect([...statusUrl.searchParams.keys()].sort()).toEqual(['fingerprint', 'requestId']);
      expect(statusUrl.searchParams.get('fingerprint')).toMatch(/^[a-f0-9]{64}$/);
    });

    it.each([
      ['missing ID', undefined],
      ['mismatched ID', 'trip-request-different'],
      ['malformed numeric ID', 42],
      ['malformed object ID', { requestId: 'trip-request-committed-invalid' }],
    ])('keeps committed status with %s ambiguous and does not replay', async (_label, id) => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(
          id === undefined ? { status: 'committed' } : { status: 'committed', id },
        ),
      } as unknown as Response);

      await expect(reconcileTripCreation(
        userId,
        mockTripInput,
        'trip-request-committed-invalid',
      )).rejects.toMatchObject({
        code: 'write-failed',
        outcome: 'ambiguous',
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('replays the same ID after a definitive not-found status', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ status: 'not-found' }),
        } as unknown as Response)
        .mockImplementationOnce(async (_input, init) => {
          const request = JSON.parse(String(init?.body)) as { requestId: string };
          return {
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({ id: request.requestId, result: 'created' }),
          } as unknown as Response;
        });

      await expect(reconcileTripCreation(
        userId,
        mockTripInput,
        'trip-request-not-found',
      )).resolves.toBe('trip-request-not-found');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch).toHaveBeenLastCalledWith('/api/trip-commands', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"requestId":"trip-request-not-found"'),
      }));
    });

    it('keeps pending and read-quota status outcomes retryable', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: vi.fn().mockResolvedValue({ status: 'pending', retryable: true }),
      } as unknown as Response);

      await expect(reconcileTripCreation(
        userId,
        mockTripInput,
        'trip-request-read-quota',
      )).rejects.toMatchObject({
        outcome: 'ambiguous',
      });

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('freezes status reconciliation on non-retryable 412', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 412,
        json: vi.fn().mockResolvedValue({
          error: 'Trip creation status is not configured',
          retryable: false,
        }),
      } as unknown as Response);

      await expect(getTripCreationStatus(
        userId,
        mockTripInput,
        'trip-request-status-config',
      )).rejects.toMatchObject({
        code: 'configuration-error',
        outcome: 'definitive-non-commit',
      });
    });

    it.each([
      ['malformed 200', 200, {}],
      ['redirect', 302, { status: 'not-found' }],
      ['proxy 403', 403, { error: 'forbidden' }],
      ['stale deployment 404', 404, { error: 'missing route' }],
      ['unexpected 418', 418, { error: 'teapot' }],
      ['unexpected 500', 500, { error: 'failure' }],
    ])('keeps %s status response ambiguous', async (_label, status, body) => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: vi.fn().mockResolvedValue(body),
      } as unknown as Response);

      await expect(reconcileTripCreation(
        userId,
        mockTripInput,
        `trip-request-unexpected-${status}`,
      )).rejects.toMatchObject({
        outcome: 'ambiguous',
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('bounds a never-settling malformed status body as ambiguous', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockReturnValue(new Promise(() => {})),
      } as unknown as Response);

      const reconciliation = reconcileTripCreation(
        userId,
        mockTripInput,
        'trip-request-hanging-status-body',
        50,
      );
      const rejection = expect(reconciliation).rejects.toMatchObject({
        code: 'timeout',
        outcome: 'ambiguous',
      });
      await vi.advanceTimersByTimeAsync(51);
      await rejection;
    });

    it.each(['target-only', 'command-only', 'payload-conflict'] as const)(
      'keeps %s status unsafe without replaying or permitting discard',
      async (status) => {
        vi.mocked(fetch).mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ status }),
        } as unknown as Response);

        await expect(reconcileTripCreation(
          userId,
          mockTripInput,
          `trip-request-${status}`,
        )).rejects.toMatchObject({
          code: 'conflicting-replay',
          outcome: 'ambiguous',
          message: expect.stringMatching(/contact support/i),
        });
        expect(fetch).toHaveBeenCalledTimes(1);
      },
    );

    it('refreshes an expired token while checking status', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: vi.fn().mockResolvedValue({ error: 'expired' }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({
            status: 'committed',
            id: 'trip-request-auth-refresh',
          }),
        } as unknown as Response);

      await expect(getTripCreationStatus(
        userId,
        mockTripInput,
        'trip-request-auth-refresh',
      )).resolves.toBe('committed');
      expect(mockAuth.currentUser!.getIdToken).toHaveBeenLastCalledWith(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTrips', () => {
    it('returns all trips for a user sorted by createdAt DESC', async () => {
      const trips = [mockTrip, { ...mockTrip, id: 'trip-2', name: 'Winter Trip' }];
      mockGetCollection.mockResolvedValue(trips);

      const result = await getTrips(userId);

      expect(mockGetCollection).toHaveBeenCalledWith(collectionPath, expect.any(Array));
      expect(mockOrderByConstraint).toHaveBeenCalledWith('createdAt', 'desc');
      expect(result).toEqual(trips);
    });

    it('filters by status when option provided', async () => {
      mockGetCollection.mockResolvedValue([mockTrip]);

      await getTrips(userId, { status: 'planning' });

      expect(mockWhereConstraint).toHaveBeenCalledWith('status', '==', 'planning');
    });

    it('applies limit when option provided', async () => {
      mockGetCollection.mockResolvedValue([]);

      await getTrips(userId, { limit: 5 });

      expect(mockLimitConstraint).toHaveBeenCalledWith(5);
    });

    it('returns empty array when user has no trips', async () => {
      mockGetCollection.mockResolvedValue([]);

      const result = await getTrips(userId);

      expect(result).toEqual([]);
    });

    it('uses persisted summaries without downloading the account ride-log collection', async () => {
      const staleTrip = {
        ...mockTrip,
        stats: {
          totalRides: 2,
          totalWaitMinutes: 30,
          parksVisited: 1,
          uniqueAttractions: 2,
          favoriteAttraction: 'Ride One',
        },
        statsUpdatedAt: new Date('2026-08-19T01:00:00Z'),
      };
      mockGetCollection.mockResolvedValueOnce([staleTrip]);

      const [result] = await getTrips(userId);
      expect(result).toEqual(staleTrip);
      expect(mockGetCollection).toHaveBeenCalledTimes(1);
    });
  });

  describe('getTrip', () => {
    it('returns a single trip by ID', async () => {
      mockGetDocument.mockResolvedValue(mockTrip);

      const result = await getTrip(userId, 'trip-1');

      expect(mockGetDocument).toHaveBeenCalledWith(collectionPath, 'trip-1');
      expect(result).toEqual(mockTrip);
    });

    it('returns null for non-existent trip', async () => {
      mockGetDocument.mockResolvedValue(null);

      const result = await getTrip(userId, 'non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateTrip', () => {
    it('performs partial update on a trip', async () => {
      mockUpdateDocument.mockResolvedValue(undefined);
      mockGetDocument.mockResolvedValue(null); // for shareId check

      await updateTrip(userId, 'trip-1', { name: 'Updated Name', notes: 'New notes' });

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        collectionPath,
        'trip-1',
        expect.objectContaining({ name: 'Updated Name', notes: 'New notes' }),
      );
    });

    it('updates parkIds and parkNames together', async () => {
      mockUpdateDocument.mockResolvedValue(undefined);
      mockGetDocument.mockResolvedValue(null);

      await updateTrip(userId, 'trip-1', {
        parkIds: ['hollywood-studios'],
        parkNames: { 'hollywood-studios': "Hollywood Studios" },
      });

      const writtenData = mockUpdateDocument.mock.calls[0][2];
      expect(writtenData.parkIds).toEqual(['hollywood-studios']);
      expect(writtenData.parkNames).toEqual({ 'hollywood-studios': "Hollywood Studios" });
    });

    it('updates shared index when shareId is added', async () => {
      mockUpdateDocument.mockResolvedValue(undefined);
      mockGetDocument.mockResolvedValue({ ...mockTrip, shareId: 'new-share' });
      mockSetDocument.mockResolvedValue(undefined);

      await updateTrip(userId, 'trip-1', { shareId: 'new-share' });

      expect(mockSetDocument).toHaveBeenCalledWith(
        'sharedTrips',
        'new-share',
        expect.objectContaining({ userId, tripId: 'trip-1' }),
      );
    });
  });

  describe('deleteTrip', () => {
    it('removes the trip document', async () => {
      mockGetDocument.mockResolvedValue({ ...mockTrip, shareId: null });
      mockDeleteDocument.mockResolvedValue(undefined);

      await deleteTrip(userId, 'trip-1');

      expect(mockDeleteDocument).toHaveBeenCalledWith(collectionPath, 'trip-1');
    });

    it('cleans up shared index when trip has shareId', async () => {
      mockGetDocument.mockResolvedValue({ ...mockTrip, shareId: 'share-to-clean' });
      mockDeleteDocument.mockResolvedValue(undefined);

      await deleteTrip(userId, 'trip-1');

      expect(mockDeleteDocument).toHaveBeenCalledWith('sharedTrips', 'share-to-clean');
    });
  });

  // =========================================================================
  // Active Trip Management
  // =========================================================================

  describe('getActiveTrip', () => {
    it('returns the trip with status "active"', async () => {
      const activeTrip = { ...mockTrip, status: 'active' };
      mockGetCollection.mockResolvedValue([activeTrip]);

      const result = await getActiveTrip(userId);

      expect(mockWhereConstraint).toHaveBeenCalledWith('status', '==', 'active');
      expect(mockLimitConstraint).toHaveBeenCalledWith(1);
      expect(result).toEqual(activeTrip);
    });

    it('returns null when no trip is active', async () => {
      mockGetCollection.mockResolvedValue([]);

      const result = await getActiveTrip(userId);

      expect(result).toBeNull();
    });
  });

  describe('activateTrip', () => {
    it('deactivates existing active trip (sets to completed) before activating new one', async () => {
      const currentActive = { ...mockTrip, id: 'trip-old', status: 'active' };
      mockGetCollection.mockResolvedValue([currentActive]);
      mockUpdateDocument.mockResolvedValue(undefined);

      await activateTrip(userId, 'trip-new');

      // First: deactivate the old trip (set to completed)
      expect(mockUpdateDocument).toHaveBeenCalledWith(
        collectionPath,
        'trip-old',
        expect.objectContaining({ status: 'completed' }),
      );
      // Second: activate the new trip
      expect(mockUpdateDocument).toHaveBeenCalledWith(
        collectionPath,
        'trip-new',
        expect.objectContaining({ status: 'active' }),
      );
    });

    it('activates a trip when no other trip is active', async () => {
      mockGetCollection.mockResolvedValue([]);
      mockUpdateDocument.mockResolvedValue(undefined);

      await activateTrip(userId, 'trip-1');

      expect(mockUpdateDocument).toHaveBeenCalledTimes(1);
      expect(mockUpdateDocument).toHaveBeenCalledWith(
        collectionPath,
        'trip-1',
        expect.objectContaining({ status: 'active' }),
      );
    });

    it('does not deactivate the same trip if re-activating it', async () => {
      const sameTrip = { ...mockTrip, id: 'trip-1', status: 'active' };
      mockGetCollection.mockResolvedValue([sameTrip]);
      mockUpdateDocument.mockResolvedValue(undefined);

      await activateTrip(userId, 'trip-1');

      // Should only be called once (the activation), no deactivation of self
      const deactivateCalls = mockUpdateDocument.mock.calls.filter(
        (call) => call[2]?.status === 'completed' && call[1] === 'trip-1',
      );
      // No deactivation call for the same trip
      expect(deactivateCalls).toHaveLength(0);
    });
  });

  describe('completeTrip', () => {
    it('sets trip status to completed', async () => {
      mockGetCollection.mockResolvedValue([]);
      mockUpdateDocument.mockResolvedValue(undefined);

      await completeTrip(userId, 'trip-1');

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        collectionPath,
        'trip-1',
        expect.objectContaining({ status: 'completed' }),
      );
    });

    describe('updateTripStats', () => {
      it('never overwrites totals when ride-log reads fail', async () => {
        const exhausted = Object.assign(new Error('RESOURCE_EXHAUSTED'), {
          code: 'resource-exhausted',
        });
        mockGetCollection.mockRejectedValue(exhausted);

        await expect(updateTripStats(userId, 'trip-1')).rejects.toBe(exhausted);
        expect(mockUpdateDocument).not.toHaveBeenCalled();
      });
    });

    it('leaves derived stats to the server when completing a trip', async () => {
      mockUpdateDocument.mockResolvedValue(undefined);

      await completeTrip(userId, 'trip-1');

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        collectionPath,
        'trip-1',
        { status: 'completed' },
      );
      expect(mockGetCollection).not.toHaveBeenCalled();
    });

    it('completes a trip without reading ride logs', async () => {
      mockUpdateDocument.mockResolvedValue(undefined);

      await completeTrip(userId, 'trip-1');

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        collectionPath,
        'trip-1',
        { status: 'completed' },
      );
      expect(mockGetCollection).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Trip Ride Logs
  // =========================================================================

  describe('getTripRideLogs', () => {
    it('filters ride logs by tripId', async () => {
      const logs = [
        { id: 'log-1', tripId: 'trip-1', attractionName: 'Space Mountain' },
        { id: 'log-2', tripId: 'trip-1', attractionName: 'Thunder Mountain' },
      ];
      mockGetCollection.mockResolvedValue(logs);

      const result = await getTripRideLogs(userId, 'trip-1');

      expect(mockWhereConstraint).toHaveBeenCalledWith('tripId', '==', 'trip-1');
      expect(result).toEqual(logs);
    });

    it('sorts ride logs by rodeAt DESC', async () => {
      mockGetCollection.mockResolvedValue([]);

      await getTripRideLogs(userId, 'trip-1');

      expect(mockOrderByConstraint).toHaveBeenCalledWith('rodeAt', 'desc');
    });

    it('returns empty array for trip with no ride logs', async () => {
      mockGetCollection.mockResolvedValue([]);

      const result = await getTripRideLogs(userId, 'trip-empty');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // Sharing
  // =========================================================================

  describe('generateShareId', () => {
    it('generates a string ID', () => {
      const shareId = generateShareId();

      expect(typeof shareId).toBe('string');
      expect(shareId.length).toBeGreaterThan(0);
    });

    it('generates URL-safe characters (no +, /, or =)', () => {
      const shareId = generateShareId();

      expect(shareId).not.toMatch(/[+/=]/);
    });

    it('generates unique IDs on subsequent calls', () => {
      const shareId1 = generateShareId();
      const shareId2 = generateShareId();

      expect(shareId1).not.toBe(shareId2);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================

  describe('edge cases', () => {
    it('handles trip with empty parkIds array', async () => {
      mockAddDocument.mockResolvedValue({ id: 'trip-empty-parks' });

      const result = await createTrip(userId, {
        ...mockTripInput,
        parkIds: [],
        parkNames: {},
      });

      expect(result).toBe('trip-empty-parks');
      const writtenData = mockAddDocument.mock.calls[0][1];
      expect(writtenData.parkIds).toEqual([]);
    });

    it('handles trip with single-day date range', async () => {
      mockAddDocument.mockResolvedValue({ id: 'trip-single-day' });

      await createTrip(userId, {
        ...mockTripInput,
        startDate: '2026-07-04',
        endDate: '2026-07-04',
      });

      const writtenData = mockAddDocument.mock.calls[0][1];
      expect(writtenData.startDate).toBe('2026-07-04');
      expect(writtenData.endDate).toBe('2026-07-04');
    });

    it('handles trip with empty notes', async () => {
      mockAddDocument.mockResolvedValue({ id: 'trip-no-notes' });

      await createTrip(userId, {
        ...mockTripInput,
        notes: '',
      });

      const writtenData = mockAddDocument.mock.calls[0][1];
      expect(writtenData.notes).toBe('');
    });

    it('handles multiple trips — only one can be active at a time', async () => {
      const activeTrip = { ...mockTrip, id: 'trip-old', status: 'active' };
      mockGetCollection.mockResolvedValue([activeTrip]);
      mockUpdateDocument.mockResolvedValue(undefined);

      await activateTrip(userId, 'trip-new');

      // Verify old trip was completed (deactivated)
      expect(mockUpdateDocument).toHaveBeenCalledWith(
        collectionPath,
        'trip-old',
        expect.objectContaining({ status: 'completed' }),
      );
    });
  });
});
