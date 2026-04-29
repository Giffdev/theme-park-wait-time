/**
 * Tests for ride-log-service.ts
 *
 * Tests CRUD operations on the users/{userId}/rideLogs/{logId} subcollection.
 * Mocks the generic Firestore helpers that the service uses internally.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  getServerTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  timestampNow: vi.fn(() => ({ seconds: 1714400000, nanoseconds: 0 })),
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-123' } },
}));

import {
  addRideLog,
  getRideLogs,
  getRideLog,
  updateRideLog,
  deleteRideLog,
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
    source: 'timer' as const,
    rating: 4,
    notes: 'Great ride!',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // getActiveTrip calls getCollection — default to empty array (no active trip)
    mockGetCollection.mockResolvedValue([]);
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
  });

  describe('deleteRideLog', () => {
    it('removes the document', async () => {
      mockDeleteDocument.mockResolvedValue(undefined);

      await deleteRideLog(userId, 'log-1');

      expect(mockDeleteDocument).toHaveBeenCalledWith(collectionPath, 'log-1');
    });
  });
});
