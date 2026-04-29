/**
 * Tests for timer-service.ts
 *
 * Tests the active timer lifecycle: start → stop/abandon.
 * The timer service uses firebase/firestore SDK directly (doc, setDoc, getDoc, deleteDoc).
 * Path: users/{userId}/activeTimer/current (single document)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Firebase SDK functions used by timer-service
const mockSetDoc = vi.fn();
const mockGetDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockDoc = vi.fn();
const mockOnSnapshot = vi.fn();

// Timestamp must be a class for instanceof checks — use vi.hoisted to avoid hoisting issues
const MockTimestamp = vi.hoisted(() => {
  class _MockTimestamp {
    seconds: number;
    nanoseconds: number;
    constructor(seconds: number, nanoseconds: number) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    toDate() {
      return new Date(this.seconds * 1000);
    }
    static now() {
      return new _MockTimestamp(Math.floor(Date.now() / 1000), 0);
    }
    static fromDate(d: Date) {
      return new _MockTimestamp(Math.floor(d.getTime() / 1000), 0);
    }
  }
  return _MockTimestamp;
});

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => mockDoc(...args),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  deleteDoc: (...args: unknown[]) => mockDeleteDoc(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  Timestamp: MockTimestamp,
}));

vi.mock('@/lib/firebase/config', () => ({
  db: { type: 'mock-firestore' },
  auth: { currentUser: { uid: 'user-123' } },
}));

import {
  startTimer,
  getActiveTimer,
  stopTimer,
  abandonTimer,
  checkForAbandonedTimer,
} from '@/lib/services/timer-service';

describe('timer-service', () => {
  const userId = 'user-123';

  const mockTimerInput = {
    parkId: 'magic-kingdom',
    attractionId: 'space-mountain',
    parkName: 'Magic Kingdom',
    attractionName: 'Space Mountain',
    clientStartedAt: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T12:00:00Z'));
    mockDoc.mockReturnValue({ id: 'current', path: `users/${userId}/activeTimer/current` });
    mockSetDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('startTimer', () => {
    it('writes activeTimer doc with correct fields', async () => {
      await startTimer(userId, mockTimerInput);

      expect(mockDoc).toHaveBeenCalledWith(
        expect.anything(), // db
        `users/${userId}/activeTimer`,
        'current',
      );
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.anything(), // docRef
        expect.objectContaining({
          parkId: 'magic-kingdom',
          attractionId: 'space-mountain',
          parkName: 'Magic Kingdom',
          attractionName: 'Space Mountain',
          status: 'active',
        }),
      );
    });

    it('includes clientStartedAt with the provided epoch ms', async () => {
      const now = Date.now();
      await startTimer(userId, { ...mockTimerInput, clientStartedAt: now });

      const writtenData = mockSetDoc.mock.calls[0][1];
      expect(writtenData.clientStartedAt).toBe(now);
    });

    it('overwrites existing timer (overwrite semantics)', async () => {
      await startTimer(userId, mockTimerInput);
      await startTimer(userId, {
        ...mockTimerInput,
        attractionId: 'thunder-mountain',
        attractionName: 'Thunder Mountain',
      });

      expect(mockSetDoc).toHaveBeenCalledTimes(2);
      const secondCall = mockSetDoc.mock.calls[1][1];
      expect(secondCall.attractionId).toBe('thunder-mountain');
    });
  });

  describe('getActiveTimer', () => {
    it('returns timer data if one exists', async () => {
      const startedAt = new Date('2026-04-29T11:00:00Z');
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          parkId: 'magic-kingdom',
          attractionId: 'space-mountain',
          parkName: 'Magic Kingdom',
          attractionName: 'Space Mountain',
          startedAt: new MockTimestamp(Math.floor(startedAt.getTime() / 1000), 0),
          clientStartedAt: startedAt.getTime(),
          status: 'active',
          updatedAt: new MockTimestamp(Math.floor(startedAt.getTime() / 1000), 0),
        }),
      });

      const result = await getActiveTimer(userId);

      expect(result).not.toBeNull();
      expect(result!.parkId).toBe('magic-kingdom');
      expect(result!.attractionId).toBe('space-mountain');
      expect(result!.status).toBe('active');
    });

    it('returns null if no active timer exists', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => false,
        data: () => null,
      });

      const result = await getActiveTimer(userId);

      expect(result).toBeNull();
    });
  });

  describe('stopTimer', () => {
    it('returns elapsed minutes and deletes timer doc', async () => {
      // Timer started 45 minutes ago
      const startTime = Date.now() - 45 * 60 * 1000;
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          parkId: 'magic-kingdom',
          attractionId: 'space-mountain',
          parkName: 'Magic Kingdom',
          attractionName: 'Space Mountain',
          startedAt: new MockTimestamp(Math.floor(startTime / 1000), 0),
          clientStartedAt: startTime,
          status: 'active',
          updatedAt: new MockTimestamp(Math.floor(startTime / 1000), 0),
        }),
      });

      const result = await stopTimer(userId);

      expect(result).not.toBeNull();
      expect(result!.elapsedMinutes).toBe(45);
      expect(mockDeleteDoc).toHaveBeenCalled();
    });

    it('handles gracefully when no active timer exists', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => false,
        data: () => null,
      });

      const result = await stopTimer(userId);

      expect(result).toBeNull();
      expect(mockDeleteDoc).not.toHaveBeenCalled();
    });
  });

  describe('abandonTimer', () => {
    it('deletes the timer doc', async () => {
      await abandonTimer(userId);

      expect(mockDeleteDoc).toHaveBeenCalled();
    });
  });

  describe('checkForAbandonedTimer', () => {
    it('returns timer if it has been active > 4 hours', async () => {
      const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          parkId: 'magic-kingdom',
          attractionId: 'space-mountain',
          parkName: 'Magic Kingdom',
          attractionName: 'Space Mountain',
          startedAt: new MockTimestamp(Math.floor(fiveHoursAgo / 1000), 0),
          clientStartedAt: fiveHoursAgo,
          status: 'active',
          updatedAt: new MockTimestamp(Math.floor(fiveHoursAgo / 1000), 0),
        }),
      });

      const result = await checkForAbandonedTimer(userId);

      expect(result).not.toBeNull();
      expect(result!.attractionId).toBe('space-mountain');
    });

    it('returns null if timer is less than 4 hours old', async () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          parkId: 'magic-kingdom',
          attractionId: 'space-mountain',
          parkName: 'Magic Kingdom',
          attractionName: 'Space Mountain',
          startedAt: new MockTimestamp(Math.floor(twoHoursAgo / 1000), 0),
          clientStartedAt: twoHoursAgo,
          status: 'active',
          updatedAt: new MockTimestamp(Math.floor(twoHoursAgo / 1000), 0),
        }),
      });

      const result = await checkForAbandonedTimer(userId);

      expect(result).toBeNull();
    });

    it('returns null if no timer exists', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => false,
        data: () => null,
      });

      const result = await checkForAbandonedTimer(userId);

      expect(result).toBeNull();
    });

    it('handles timer exactly at 4-hour boundary (not abandoned)', async () => {
      const exactlyFourHours = Date.now() - 4 * 60 * 60 * 1000;
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({
          parkId: 'magic-kingdom',
          attractionId: 'space-mountain',
          parkName: 'Magic Kingdom',
          attractionName: 'Space Mountain',
          startedAt: new MockTimestamp(Math.floor(exactlyFourHours / 1000), 0),
          clientStartedAt: exactlyFourHours,
          status: 'active',
          updatedAt: new MockTimestamp(Math.floor(exactlyFourHours / 1000), 0),
        }),
      });

      const result = await checkForAbandonedTimer(userId);

      // At exactly 4 hours, elapsed == threshold, condition is > so not abandoned
      expect(result).toBeNull();
    });
  });
});
