/**
 * Tests for trip-service.ts — Trip Logging Redesign additions
 *
 * Tests the new functions added for Phase 1 of the logging redesign:
 * - quickCreateTrip: minimal trip creation (name + status only)
 * - getActiveTrip: additional edge cases for redesign
 *
 * These supplement the existing trip-service.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock Firestore helpers ---
const mockAddDocument = vi.fn();
const mockGetDocument = vi.fn();
const mockGetCollection = vi.fn();
const mockUpdateDocument = vi.fn();
const mockSetDocument = vi.fn();
const mockWhereConstraint = vi.fn((...args) => ({ type: 'where', args }));
const mockOrderByConstraint = vi.fn((...args) => ({ type: 'orderBy', args }));
const mockLimitConstraint = vi.fn((...args) => ({ type: 'limit', args }));

vi.mock('@/lib/firebase/firestore', () => ({
  addDocument: (...args: unknown[]) => mockAddDocument(...args),
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  updateDocument: (...args: unknown[]) => mockUpdateDocument(...args),
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

// Import existing functions we can test against right now
import { getActiveTrip } from '@/lib/services/trip-service';

// quickCreateTrip will be added to trip-service.ts as part of the redesign.
// We test getActiveTrip (already exists) with redesign-specific scenarios,
// and define quickCreateTrip contract as todos until it lands.

describe('trip-service (redesign additions)', () => {
  const userId = 'user-123';
  const collectionPath = `users/${userId}/trips`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // getActiveTrip — redesign-specific edge cases
  // ===========================================================================

  describe('getActiveTrip', () => {
    it('returns the active trip when one exists', async () => {
      const activeTrip = {
        id: 'trip-active',
        name: 'Spring Break 2026',
        status: 'active',
        startDate: '2026-04-14',
        endDate: '2026-04-18',
      };
      mockGetCollection.mockResolvedValue([activeTrip]);

      const result = await getActiveTrip(userId);

      expect(result).toEqual(activeTrip);
      expect(mockWhereConstraint).toHaveBeenCalledWith('status', '==', 'active');
      expect(mockLimitConstraint).toHaveBeenCalledWith(1);
    });

    it('returns null when no active trip exists', async () => {
      mockGetCollection.mockResolvedValue([]);

      const result = await getActiveTrip(userId);

      expect(result).toBeNull();
    });

    it('returns only status=active (not completed)', async () => {
      // Even if there are completed trips, getActiveTrip should not return them
      mockGetCollection.mockResolvedValue([]);

      const result = await getActiveTrip(userId);

      // Verify it queries specifically for 'active' status
      expect(mockWhereConstraint).toHaveBeenCalledWith('status', '==', 'active');
      expect(mockWhereConstraint).not.toHaveBeenCalledWith('status', '==', 'completed');
      expect(result).toBeNull();
    });

    it('returns only status=active (not planning — legacy status)', async () => {
      // The redesign removes 'planning' status, but if legacy data exists,
      // getActiveTrip must not return it
      mockGetCollection.mockResolvedValue([]);

      const result = await getActiveTrip(userId);

      expect(mockWhereConstraint).toHaveBeenCalledWith('status', '==', 'active');
      expect(mockWhereConstraint).not.toHaveBeenCalledWith('status', '==', 'planning');
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // quickCreateTrip — new function for redesign
  // ===========================================================================

  describe('quickCreateTrip', () => {
    test.todo('creates trip with minimal fields (name only)', async () => {
      // Contract:
      // - Takes userId and { name } as minimum input
      // - Omits startDate/endDate (they'll be derived from TripDays)
      // - Returns the new trip ID
      mockAddDocument.mockResolvedValue({ id: 'trip-quick-1' });

      // const result = await quickCreateTrip(userId, { name: 'Magic Kingdom · Apr 2026' });

      // expect(mockAddDocument).toHaveBeenCalledWith(
      //   collectionPath,
      //   expect.objectContaining({
      //     name: 'Magic Kingdom · Apr 2026',
      //     status: 'active',
      //   }),
      // );
      // expect(result).toBe('trip-quick-1');
    });

    test.todo('sets status to active by default', async () => {
      // Contract:
      // - quickCreateTrip always creates with status: 'active'
      // - No 'planning' state — this is the redesign principle
      mockAddDocument.mockResolvedValue({ id: 'trip-quick-2' });

      // const result = await quickCreateTrip(userId, { name: 'Day Trip' });

      // const writtenData = mockAddDocument.mock.calls[0][1];
      // expect(writtenData.status).toBe('active');
    });

    test.todo('initializes with empty stats', async () => {
      mockAddDocument.mockResolvedValue({ id: 'trip-quick-3' });

      // await quickCreateTrip(userId, { name: 'Quick Trip' });

      // const writtenData = mockAddDocument.mock.calls[0][1];
      // expect(writtenData.stats).toEqual({
      //   totalRides: 0,
      //   totalWaitMinutes: 0,
      //   parksVisited: 0,
      //   uniqueAttractions: 0,
      //   favoriteAttraction: null,
      // });
    });

    test.todo('deactivates existing active trip before creating new one', async () => {
      // Contract:
      // - If there's an existing active trip, quickCreateTrip should deactivate it first
      // - Similar to activateTrip behavior
      const existingActive = { id: 'trip-old', status: 'active', name: 'Old Trip' };
      mockGetCollection.mockResolvedValue([existingActive]);
      mockUpdateDocument.mockResolvedValue(undefined);
      mockAddDocument.mockResolvedValue({ id: 'trip-new' });

      // await quickCreateTrip(userId, { name: 'New Quick Trip' });

      // expect(mockUpdateDocument).toHaveBeenCalledWith(
      //   collectionPath,
      //   'trip-old',
      //   expect.objectContaining({ status: 'completed' }),
      // );
    });

    test.todo('accepts optional startDate', async () => {
      mockAddDocument.mockResolvedValue({ id: 'trip-dated' });

      // await quickCreateTrip(userId, { name: 'Dated Trip', startDate: '2026-04-14' });

      // const writtenData = mockAddDocument.mock.calls[0][1];
      // expect(writtenData.startDate).toBe('2026-04-14');
    });
  });
});
