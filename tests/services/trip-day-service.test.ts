/**
 * Tests for trip-day-service.ts
 *
 * Tests CRUD operations on the users/{userId}/trips/{tripId}/days/{date} subcollection.
 * TripDay is the new explicit entity for per-day park tracking within trips.
 *
 * The service file (src/lib/services/trip-day-service.ts) is being built in parallel.
 * These tests define the contract — they'll light up when the implementation lands.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock Firestore helpers ---
const mockGetDocument = vi.fn();
const mockGetCollection = vi.fn();
const mockSetDocument = vi.fn();
const mockDeleteDocument = vi.fn();
const mockOrderByConstraint = vi.fn((...args) => ({ type: 'orderBy', args }));

vi.mock('@/lib/firebase/firestore', () => ({
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  setDocument: (...args: unknown[]) => mockSetDocument(...args),
  deleteDocument: (...args: unknown[]) => mockDeleteDocument(...args),
  orderByConstraint: (...args: unknown[]) => mockOrderByConstraint(...args),
  getServerTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-123' } },
}));

// The service will be imported once it exists. For now, use test.todo for those
// that need the real import, and define the contract expectations.

// NOTE: When trip-day-service.ts lands, uncomment the import below:
// import {
//   createOrUpdateTripDay,
//   getTripDays,
//   getTripDay,
//   deleteTripDay,
//   ensureTripDayForLog,
// } from '@/lib/services/trip-day-service';

describe('trip-day-service', () => {
  const userId = 'user-123';
  const tripId = 'trip-abc';
  const daysPath = `users/${userId}/trips/${tripId}/days`;

  const mockTripDay = {
    date: '2026-04-14',
    parkIds: ['magic-kingdom'],
    parkNames: { 'magic-kingdom': 'Magic Kingdom' },
    notes: '',
    createdAt: new Date('2026-04-14T09:00:00Z'),
    updatedAt: new Date('2026-04-14T09:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // createOrUpdateTripDay
  // ===========================================================================

  describe('createOrUpdateTripDay', () => {
    test.todo('creates new TripDay with correct fields when day does not exist', async () => {
      // Contract:
      // - Calls setDocument with path = users/{uid}/trips/{tripId}/days/{date}
      // - Doc ID = date string (YYYY-MM-DD)
      // - Sets parkIds = [parkId], parkNames = { parkId: parkName }
      // - Sets createdAt and updatedAt
      mockGetDocument.mockResolvedValue(null); // day doesn't exist
      mockSetDocument.mockResolvedValue(undefined);

      // await createOrUpdateTripDay(userId, tripId, {
      //   date: '2026-04-14',
      //   parkId: 'magic-kingdom',
      //   parkName: 'Magic Kingdom',
      // });

      // expect(mockSetDocument).toHaveBeenCalledWith(
      //   daysPath,
      //   '2026-04-14',
      //   expect.objectContaining({
      //     date: '2026-04-14',
      //     parkIds: ['magic-kingdom'],
      //     parkNames: { 'magic-kingdom': 'Magic Kingdom' },
      //   }),
      // );
    });

    test.todo('adds parkId to existing TripDay without duplicating', async () => {
      // Contract:
      // - If day already exists with parkIds: ['magic-kingdom']
      // - And we call with parkId: 'epcot'
      // - Result should be parkIds: ['magic-kingdom', 'epcot']
      mockGetDocument.mockResolvedValue({
        ...mockTripDay,
        parkIds: ['magic-kingdom'],
        parkNames: { 'magic-kingdom': 'Magic Kingdom' },
      });
      mockSetDocument.mockResolvedValue(undefined);

      // await createOrUpdateTripDay(userId, tripId, {
      //   date: '2026-04-14',
      //   parkId: 'epcot',
      //   parkName: 'EPCOT',
      // });

      // const written = mockSetDocument.mock.calls[0][2];
      // expect(written.parkIds).toEqual(['magic-kingdom', 'epcot']);
      // expect(written.parkNames).toEqual({
      //   'magic-kingdom': 'Magic Kingdom',
      //   'epcot': 'EPCOT',
      // });
    });

    test.todo('preserves existing parks when adding new one (no duplication)', async () => {
      // Contract:
      // - If day already has parkIds: ['magic-kingdom', 'epcot']
      // - And we call with parkId: 'magic-kingdom' (already exists)
      // - Result should still be parkIds: ['magic-kingdom', 'epcot'] (no duplicate)
      mockGetDocument.mockResolvedValue({
        ...mockTripDay,
        parkIds: ['magic-kingdom', 'epcot'],
        parkNames: { 'magic-kingdom': 'Magic Kingdom', 'epcot': 'EPCOT' },
      });
      mockSetDocument.mockResolvedValue(undefined);

      // await createOrUpdateTripDay(userId, tripId, {
      //   date: '2026-04-14',
      //   parkId: 'magic-kingdom',
      //   parkName: 'Magic Kingdom',
      // });

      // const written = mockSetDocument.mock.calls[0][2];
      // expect(written.parkIds).toEqual(['magic-kingdom', 'epcot']);
      // expect(written.parkIds).toHaveLength(2); // no duplication
    });
  });

  // ===========================================================================
  // getTripDays
  // ===========================================================================

  describe('getTripDays', () => {
    test.todo('returns all days sorted by date', async () => {
      const days = [
        { ...mockTripDay, date: '2026-04-14' },
        { ...mockTripDay, date: '2026-04-15' },
        { ...mockTripDay, date: '2026-04-16' },
      ];
      mockGetCollection.mockResolvedValue(days);

      // const result = await getTripDays(userId, tripId);

      // expect(mockGetCollection).toHaveBeenCalledWith(daysPath, expect.any(Array));
      // expect(mockOrderByConstraint).toHaveBeenCalledWith('date', 'asc');
      // expect(result).toEqual(days);
      // expect(result[0].date).toBe('2026-04-14');
      // expect(result[2].date).toBe('2026-04-16');
    });

    test.todo('returns empty array when trip has no days', async () => {
      mockGetCollection.mockResolvedValue([]);

      // const result = await getTripDays(userId, tripId);
      // expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // getTripDay
  // ===========================================================================

  describe('getTripDay', () => {
    test.todo('returns a single day by date', async () => {
      mockGetDocument.mockResolvedValue(mockTripDay);

      // const result = await getTripDay(userId, tripId, '2026-04-14');

      // expect(mockGetDocument).toHaveBeenCalledWith(daysPath, '2026-04-14');
      // expect(result).toEqual(mockTripDay);
    });

    test.todo('returns null for non-existent day', async () => {
      mockGetDocument.mockResolvedValue(null);

      // const result = await getTripDay(userId, tripId, '2099-01-01');
      // expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // deleteTripDay
  // ===========================================================================

  describe('deleteTripDay', () => {
    test.todo('removes the day document', async () => {
      mockDeleteDocument.mockResolvedValue(undefined);

      // await deleteTripDay(userId, tripId, '2026-04-14');

      // expect(mockDeleteDocument).toHaveBeenCalledWith(daysPath, '2026-04-14');
    });
  });

  // ===========================================================================
  // ensureTripDayForLog
  // ===========================================================================

  describe('ensureTripDayForLog', () => {
    test.todo('creates TripDay from ride log rodeAt date', async () => {
      // Contract:
      // - Given a ride log with rodeAt: 2026-04-14T14:30:00Z, parkId: 'magic-kingdom'
      // - Should call createOrUpdateTripDay with date='2026-04-14', parkId='magic-kingdom'
      mockGetDocument.mockResolvedValue(null);
      mockSetDocument.mockResolvedValue(undefined);

      // const rideLog = {
      //   rodeAt: new Date('2026-04-14T14:30:00Z'),
      //   parkId: 'magic-kingdom',
      //   parkName: 'Magic Kingdom',
      // };
      // await ensureTripDayForLog(userId, tripId, rideLog);

      // expect(mockSetDocument).toHaveBeenCalledWith(
      //   daysPath,
      //   '2026-04-14',
      //   expect.objectContaining({
      //     parkIds: expect.arrayContaining(['magic-kingdom']),
      //   }),
      // );
    });

    test.todo('handles timezone edge cases — ride at 11:55 PM should use local date', async () => {
      // Contract:
      // - A ride at 11:55 PM Eastern (2026-04-14T23:55:00-04:00) → date should be 2026-04-14 (local)
      // - NOT 2026-04-15 (UTC date)
      // - The service must use the LOCAL date of rodeAt, not UTC date
      mockGetDocument.mockResolvedValue(null);
      mockSetDocument.mockResolvedValue(undefined);

      // The date used for the TripDay doc ID should reflect the user's local date
      // This is a critical edge case — late-night rides must land on the correct day

      // const lateNightRide = {
      //   rodeAt: new Date('2026-04-15T03:55:00Z'), // 11:55 PM ET (UTC-4)
      //   parkId: 'magic-kingdom',
      //   parkName: 'Magic Kingdom',
      // };
      // await ensureTripDayForLog(userId, tripId, lateNightRide, 'America/New_York');

      // The doc should be for 2026-04-14 (the local date), not 2026-04-15 (UTC)
      // expect(mockSetDocument).toHaveBeenCalledWith(
      //   daysPath,
      //   '2026-04-14',
      //   expect.anything(),
      // );
    });
  });
});
