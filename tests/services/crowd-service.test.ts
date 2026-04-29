/**
 * Tests for crowd-service.ts
 *
 * Tests read operations for crowdsourced wait time aggregates.
 * The crowd service uses Firebase Admin SDK (adminDb) directly.
 * Path: crowdsourcedWaitTimes/{parkId}/aggregates/{attractionId}
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Admin SDK
const mockDocGet = vi.fn();
const mockCollectionGet = vi.fn();
const mockDoc = vi.fn();
const mockCollection = vi.fn();
const mockCollectionAdd = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockQueryGet = vi.fn();
const mockSet = vi.fn();

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    doc: (...args: unknown[]) => mockDoc(...args),
    collection: (...args: unknown[]) => mockCollection(...args),
  },
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ _type: 'serverTimestamp' }),
  },
  Timestamp: {
    fromDate: (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 }),
  },
}));

import {
  getCrowdAggregate,
  getCrowdAggregatesForPark,
} from '@/lib/services/crowd-service';

describe('crowd-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default doc mock chain
    mockDoc.mockReturnValue({ get: mockDocGet, set: mockSet });
    mockCollection.mockReturnValue({
      get: mockCollectionGet,
      add: mockCollectionAdd,
      where: mockWhere,
    });
    mockWhere.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ get: mockQueryGet });
  });

  describe('getCrowdAggregate', () => {
    it('returns aggregate data for an attraction', async () => {
      const aggregateData = {
        parkId: 'magic-kingdom',
        currentEstimateMinutes: 35,
        reportCount: 7,
        lastReportedAt: { seconds: 1714400000, nanoseconds: 0 },
        confidence: 'high',
        updatedAt: { seconds: 1714400000, nanoseconds: 0 },
      };
      mockDocGet.mockResolvedValue({
        exists: true,
        id: 'space-mountain',
        data: () => aggregateData,
      });

      const result = await getCrowdAggregate('magic-kingdom', 'space-mountain');

      expect(mockDoc).toHaveBeenCalledWith(
        'crowdsourcedWaitTimes/magic-kingdom/aggregates/space-mountain',
      );
      expect(result).not.toBeNull();
      expect(result!.currentEstimateMinutes).toBe(35);
      expect(result!.confidence).toBe('high');
      expect(result!.attractionId).toBe('space-mountain');
    });

    it('returns null for non-existent attraction', async () => {
      mockDocGet.mockResolvedValue({
        exists: false,
        id: 'non-existent',
        data: () => null,
      });

      const result = await getCrowdAggregate('magic-kingdom', 'non-existent-ride');

      expect(result).toBeNull();
    });
  });

  describe('getCrowdAggregatesForPark', () => {
    it('returns all aggregates for a park', async () => {
      mockCollectionGet.mockResolvedValue({
        docs: [
          {
            id: 'space-mountain',
            data: () => ({
              parkId: 'magic-kingdom',
              currentEstimateMinutes: 35,
              reportCount: 7,
              confidence: 'high',
            }),
          },
          {
            id: 'thunder-mountain',
            data: () => ({
              parkId: 'magic-kingdom',
              currentEstimateMinutes: 20,
              reportCount: 3,
              confidence: 'medium',
            }),
          },
        ],
      });

      const result = await getCrowdAggregatesForPark('magic-kingdom');

      expect(mockCollection).toHaveBeenCalledWith(
        'crowdsourcedWaitTimes/magic-kingdom/aggregates',
      );
      expect(result).toHaveLength(2);
      expect(result[0].attractionId).toBe('space-mountain');
      expect(result[1].attractionId).toBe('thunder-mountain');
    });

    it('returns empty array when no aggregates exist for park', async () => {
      mockCollectionGet.mockResolvedValue({ docs: [] });

      const result = await getCrowdAggregatesForPark('empty-park');

      expect(result).toEqual([]);
    });
  });
});
