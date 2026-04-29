/**
 * Integration tests for Trip + Ride Log interaction.
 *
 * Tests the contract between trip-service and ride-log-service:
 * - Active trip provides tripId that gets stamped on new ride logs
 * - No active trip → tripId is null
 * - Trip stats update correctly after adding rides
 *
 * Uses module-level mocking of Firestore to simulate both services
 * interacting with the same data layer.
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
const mockDateToTimestamp = vi.fn((d) => d);

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
  dateToTimestamp: (d: unknown) => mockDateToTimestamp(d),
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-123' } },
}));

import { addRideLog } from '@/lib/services/ride-log-service';
import {
  getActiveTrip,
  activateTrip,
  completeTrip,
  getTripRideLogs,
  updateTripStats,
} from '@/lib/services/trip-service';

describe('trip + ride log integration', () => {
  const userId = 'user-123';

  const mockRideLogInput = {
    parkId: 'magic-kingdom',
    attractionId: 'space-mountain',
    parkName: 'Magic Kingdom',
    attractionName: 'Space Mountain',
    rodeAt: new Date('2026-06-16T14:30:00Z'),
    waitTimeMinutes: 45,
    source: 'timer' as const,
    rating: 5,
    notes: 'Best ride ever',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: getCollection returns empty array (no active trip, no ride logs)
    mockGetCollection.mockResolvedValue([]);
  });

  // =========================================================================
  // Ride Log + Active Trip stamping
  // =========================================================================

  describe('ride log tripId stamping', () => {
    it('stamps tripId on ride log when caller passes active trip ID', async () => {
      mockAddDocument.mockResolvedValue({ id: 'log-1' });

      // Caller gets active trip, then passes tripId to addRideLog
      await addRideLog(userId, mockRideLogInput, 'trip-active');

      expect(mockAddDocument).toHaveBeenCalledWith(
        `users/${userId}/rideLogs`,
        expect.objectContaining({
          tripId: 'trip-active',
          parkId: 'magic-kingdom',
          attractionId: 'space-mountain',
        }),
      );
    });

    it('sets tripId to null when no tripId is passed', async () => {
      mockAddDocument.mockResolvedValue({ id: 'log-2' });

      await addRideLog(userId, mockRideLogInput);

      expect(mockAddDocument).toHaveBeenCalledWith(
        `users/${userId}/rideLogs`,
        expect.objectContaining({
          tripId: null,
        }),
      );
    });

    it('sets tripId to null when explicitly passed null', async () => {
      mockAddDocument.mockResolvedValue({ id: 'log-3' });

      await addRideLog(userId, mockRideLogInput, null);

      expect(mockAddDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tripId: null }),
      );
    });

    it('getActiveTrip returns active trip whose ID can be passed to addRideLog', async () => {
      // Simulate the full flow: get active trip → pass its ID to ride log
      const activeTrip = { id: 'trip-B', name: 'Active Trip', status: 'active' };
      mockGetCollection.mockResolvedValueOnce([activeTrip]);

      const trip = await getActiveTrip(userId);
      expect(trip).not.toBeNull();
      expect(trip!.id).toBe('trip-B');

      // Now use that ID when creating a ride log
      mockAddDocument.mockResolvedValue({ id: 'log-4' });
      await addRideLog(userId, mockRideLogInput, trip!.id);

      expect(mockAddDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tripId: 'trip-B' }),
      );
    });

    it('getActiveTrip returns null when no trip is active — ride log gets null tripId', async () => {
      mockGetCollection.mockResolvedValue([]);

      const trip = await getActiveTrip(userId);
      expect(trip).toBeNull();

      // Caller passes undefined (no trip) — addRideLog will also call getActiveTrip internally
      mockAddDocument.mockResolvedValue({ id: 'log-5' });
      await addRideLog(userId, mockRideLogInput);

      expect(mockAddDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tripId: null }),
      );
    });
  });

  // =========================================================================
  // Trip Stats Computation
  // =========================================================================

  describe('trip stats after adding rides', () => {
    it('updateTripStats computes correct totals from ride logs', async () => {
      const rideLogs = [
        { id: 'log-1', tripId: 'trip-1', parkId: 'magic-kingdom', attractionId: 'space-mountain', attractionName: 'Space Mountain', waitTimeMinutes: 45 },
        { id: 'log-2', tripId: 'trip-1', parkId: 'magic-kingdom', attractionId: 'thunder-mountain', attractionName: 'Thunder Mountain', waitTimeMinutes: 30 },
        { id: 'log-3', tripId: 'trip-1', parkId: 'epcot', attractionId: 'test-track', attractionName: 'Test Track', waitTimeMinutes: 60 },
      ];
      mockGetCollection.mockResolvedValue(rideLogs);
      mockUpdateDocument.mockResolvedValue(undefined);

      await updateTripStats(userId, 'trip-1');

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        `users/${userId}/trips`,
        'trip-1',
        expect.objectContaining({
          stats: expect.objectContaining({
            totalRides: 3,
            totalWaitMinutes: 135,
            parksVisited: 2,
            uniqueAttractions: 3,
          }),
        }),
      );
    });

    it('stats reflect favoriteAttraction as most-ridden attraction', async () => {
      const rideLogs = [
        { id: 'log-1', tripId: 'trip-1', parkId: 'mk', attractionId: 'space', attractionName: 'Space Mountain', waitTimeMinutes: 40 },
        { id: 'log-2', tripId: 'trip-1', parkId: 'mk', attractionId: 'space', attractionName: 'Space Mountain', waitTimeMinutes: 35 },
        { id: 'log-3', tripId: 'trip-1', parkId: 'mk', attractionId: 'space', attractionName: 'Space Mountain', waitTimeMinutes: 50 },
        { id: 'log-4', tripId: 'trip-1', parkId: 'mk', attractionId: 'thunder', attractionName: 'Thunder Mountain', waitTimeMinutes: 25 },
      ];
      mockGetCollection.mockResolvedValue(rideLogs);
      mockUpdateDocument.mockResolvedValue(undefined);

      await updateTripStats(userId, 'trip-1');

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        expect.any(String),
        'trip-1',
        expect.objectContaining({
          stats: expect.objectContaining({
            favoriteAttraction: 'Space Mountain',
          }),
        }),
      );
    });

    it('stats handle null waitTimeMinutes gracefully', async () => {
      const rideLogs = [
        { id: 'log-1', tripId: 'trip-1', parkId: 'mk', attractionId: 'space', attractionName: 'Space Mountain', waitTimeMinutes: 30 },
        { id: 'log-2', tripId: 'trip-1', parkId: 'mk', attractionId: 'thunder', attractionName: 'Thunder Mountain', waitTimeMinutes: null },
      ];
      mockGetCollection.mockResolvedValue(rideLogs);
      mockUpdateDocument.mockResolvedValue(undefined);

      await updateTripStats(userId, 'trip-1');

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        expect.any(String),
        'trip-1',
        expect.objectContaining({
          stats: expect.objectContaining({
            totalRides: 2,
            totalWaitMinutes: 30,
          }),
        }),
      );
    });

    it('stats are zero for a trip with no ride logs', async () => {
      mockGetCollection.mockResolvedValue([]);
      mockUpdateDocument.mockResolvedValue(undefined);

      await updateTripStats(userId, 'trip-empty');

      expect(mockUpdateDocument).toHaveBeenCalledWith(
        expect.any(String),
        'trip-empty',
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
  // End-to-end: Complete Trip Flow
  // =========================================================================

  describe('complete trip flow', () => {
    it('completeTrip computes final stats from ride logs with tripId', async () => {
      const rideLogs = [
        { id: 'log-1', tripId: 'trip-1', parkId: 'epcot', attractionId: 'frozen', attractionName: 'Frozen', waitTimeMinutes: 55 },
        { id: 'log-2', tripId: 'trip-1', parkId: 'epcot', attractionId: 'soarin', attractionName: 'Soarin', waitTimeMinutes: 40 },
      ];
      mockGetCollection.mockResolvedValue(rideLogs);
      mockUpdateDocument.mockResolvedValue(undefined);

      await completeTrip(userId, 'trip-1');

      // completeTrip calls updateTripStats (writes stats) then writes status
      expect(mockUpdateDocument).toHaveBeenCalledWith(
        `users/${userId}/trips`,
        'trip-1',
        expect.objectContaining({
          stats: expect.objectContaining({
            totalRides: 2,
            totalWaitMinutes: 95,
            parksVisited: 1,
            uniqueAttractions: 2,
          }),
        }),
      );
      expect(mockUpdateDocument).toHaveBeenCalledWith(
        `users/${userId}/trips`,
        'trip-1',
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('completing a trip queries ride logs filtered by tripId', async () => {
      mockGetCollection.mockResolvedValue([
        { id: 'log-1', tripId: 'trip-1', parkId: 'mk', attractionId: 'space', attractionName: 'Space Mountain', waitTimeMinutes: 45 },
      ]);
      mockUpdateDocument.mockResolvedValue(undefined);

      await completeTrip(userId, 'trip-1');

      expect(mockWhereConstraint).toHaveBeenCalledWith('tripId', '==', 'trip-1');
    });

    it('getTripRideLogs only returns logs for the specified trip', async () => {
      const tripLogs = [
        { id: 'log-1', tripId: 'trip-1', attractionName: 'Space Mountain' },
        { id: 'log-2', tripId: 'trip-1', attractionName: 'Thunder Mountain' },
      ];
      mockGetCollection.mockResolvedValue(tripLogs);

      const result = await getTripRideLogs(userId, 'trip-1');

      expect(mockWhereConstraint).toHaveBeenCalledWith('tripId', '==', 'trip-1');
      expect(result).toHaveLength(2);
    });

    it('getTripRideLogs returns empty array for trip with no logs', async () => {
      mockGetCollection.mockResolvedValue([]);

      const result = await getTripRideLogs(userId, 'trip-no-logs');

      expect(result).toEqual([]);
    });
  });
});
