/**
 * Tests for trip-service.ts
 *
 * Tests CRUD operations, active trip management, stats computation,
 * sharing, and edge cases for the Trip feature.
 * The service uses generic Firestore helpers internally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  auth: { currentUser: { uid: 'user-123' } },
}));

import {
  createTrip,
  getTrips,
  getTrip,
  updateTrip,
  deleteTrip,
  getActiveTrip,
  activateTrip,
  completeTrip,
  getTripRideLogs,
  getSharedTrip,
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

    it('computes stats correctly from ride logs', async () => {
      const rideLogs = [
        { id: 'log-1', parkId: 'magic-kingdom', attractionId: 'space-mountain', attractionName: 'Space Mountain', waitTimeMinutes: 45 },
        { id: 'log-2', parkId: 'magic-kingdom', attractionId: 'space-mountain', attractionName: 'Space Mountain', waitTimeMinutes: 30 },
        { id: 'log-3', parkId: 'epcot', attractionId: 'test-track', attractionName: 'Test Track', waitTimeMinutes: 60 },
        { id: 'log-4', parkId: 'epcot', attractionId: 'frozen', attractionName: 'Frozen Ever After', waitTimeMinutes: 55 },
      ];
      mockGetCollection.mockResolvedValue(rideLogs);
      mockUpdateDocument.mockResolvedValue(undefined);

      await completeTrip(userId, 'trip-1');

      // updateTripStats writes stats, then completeTrip writes status
      expect(mockUpdateDocument).toHaveBeenCalledWith(
        collectionPath,
        'trip-1',
        expect.objectContaining({
          stats: expect.objectContaining({
            totalRides: 4,
            totalWaitMinutes: 190,
            parksVisited: 2,
            uniqueAttractions: 3,
            favoriteAttraction: 'Space Mountain',
          }),
        }),
      );
    });

    it('handles trip with no rides gracefully', async () => {
      mockGetCollection.mockResolvedValue([]);
      mockUpdateDocument.mockResolvedValue(undefined);

      await completeTrip(userId, 'trip-1');

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        collectionPath,
        'trip-1',
        expect.objectContaining({
          stats: expect.objectContaining({
            totalRides: 0,
            totalWaitMinutes: 0,
            parksVisited: 0,
            uniqueAttractions: 0,
            favoriteAttraction: null,
          }),
        }),
      );
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

  describe('getSharedTrip', () => {
    it('retrieves trip by shareId via shared index lookup', async () => {
      // First call: look up share index doc
      mockGetDocument
        .mockResolvedValueOnce({ userId: 'owner-user', tripId: 'trip-shared' })
        // Second call: get actual trip
        .mockResolvedValueOnce({ ...mockTrip, id: 'trip-shared', shareId: 'share-abc123' });

      const result = await getSharedTrip('share-abc123');

      // Looks up in sharedTrips collection
      expect(mockGetDocument).toHaveBeenCalledWith('sharedTrips', 'share-abc123');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('trip-shared');
    });

    it('returns null for invalid shareId', async () => {
      mockGetDocument.mockResolvedValue(null);

      const result = await getSharedTrip('invalid-share-id');

      expect(result).toBeNull();
    });
  });

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
