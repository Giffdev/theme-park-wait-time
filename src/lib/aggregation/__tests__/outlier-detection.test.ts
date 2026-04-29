import { describe, it, expect } from 'vitest';
import { filterOutliers } from '../outlier-detection';
import type { CrowdReport } from '@/types/ride-log';

function makeReport(overrides: Partial<CrowdReport> = {}): CrowdReport {
  return {
    id: 'report-1',
    attractionId: 'attraction-1',
    waitTimeMinutes: 30,
    reportedAt: new Date('2026-04-29T10:00:00'),
    dayOfWeek: 3,
    hourOfDay: 10,
    createdAt: new Date('2026-04-29T10:00:00'),
    ...overrides,
  };
}

describe('filterOutliers', () => {
  describe('hard bounds', () => {
    it('rejects reports below minimum (< 2 min)', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 1 }),
        makeReport({ id: 'r2', waitTimeMinutes: 30 }),
      ];
      const result = filterOutliers(reports);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('r2');
    });

    it('rejects reports above maximum (> 180 min)', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 181 }),
        makeReport({ id: 'r2', waitTimeMinutes: 30 }),
      ];
      const result = filterOutliers(reports);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('r2');
    });

    it('keeps reports at exact boundaries (2 min and 180 min)', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 2 }),
        makeReport({ id: 'r2', waitTimeMinutes: 180 }),
      ];
      const result = filterOutliers(reports);
      expect(result).toHaveLength(2);
    });

    it('rejects all reports outside bounds', () => {
      const reports = [
        makeReport({ waitTimeMinutes: 0 }),
        makeReport({ waitTimeMinutes: 200 }),
      ];
      const result = filterOutliers(reports);
      expect(result).toHaveLength(0);
    });

    it('respects custom min/max bounds', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 5 }),
        makeReport({ id: 'r2', waitTimeMinutes: 50 }),
      ];
      const result = filterOutliers(reports, undefined, {
        minWaitMinutes: 10,
        maxWaitMinutes: 40,
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('statistical outlier detection', () => {
    it('does not apply statistical filter with fewer than 5 reports', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 30 }),
        makeReport({ id: 'r2', waitTimeMinutes: 30 }),
        makeReport({ id: 'r3', waitTimeMinutes: 30 }),
        makeReport({ id: 'r4', waitTimeMinutes: 100 }), // outlier but only 4 reports
      ];
      const result = filterOutliers(reports);
      expect(result).toHaveLength(4);
    });

    it('rejects statistical outliers when >= 5 reports', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 30 }),
        makeReport({ id: 'r2', waitTimeMinutes: 32 }),
        makeReport({ id: 'r3', waitTimeMinutes: 28 }),
        makeReport({ id: 'r4', waitTimeMinutes: 31 }),
        makeReport({ id: 'r5', waitTimeMinutes: 29 }),
        makeReport({ id: 'r6', waitTimeMinutes: 120 }), // clear outlier
      ];
      const result = filterOutliers(reports);
      // The 120 value should be > 2 std deviations from the mean (~30)
      const hasOutlier = result.some((r) => r.waitTimeMinutes === 120);
      expect(hasOutlier).toBe(false);
      expect(result.length).toBeLessThan(6);
    });

    it('keeps values within 2 standard deviations', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 28 }),
        makeReport({ id: 'r2', waitTimeMinutes: 30 }),
        makeReport({ id: 'r3', waitTimeMinutes: 32 }),
        makeReport({ id: 'r4', waitTimeMinutes: 29 }),
        makeReport({ id: 'r5', waitTimeMinutes: 31 }),
      ];
      const result = filterOutliers(reports);
      expect(result).toHaveLength(5);
    });

    it('handles all-same-value reports (stdDev = 0)', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 30 }),
        makeReport({ id: 'r2', waitTimeMinutes: 30 }),
        makeReport({ id: 'r3', waitTimeMinutes: 30 }),
        makeReport({ id: 'r4', waitTimeMinutes: 30 }),
        makeReport({ id: 'r5', waitTimeMinutes: 30 }),
      ];
      const result = filterOutliers(reports);
      expect(result).toHaveLength(5);
    });
  });

  describe('velocity check', () => {
    it('applies velocity penalty when report differs from estimate by > 60 min', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 100 }), // 70 min above estimate of 30
      ];
      const result = filterOutliers(reports, 30);
      expect(result).toHaveLength(1);
      expect(result[0].weightModifier).toBe(0.5);
    });

    it('does not apply velocity penalty when delta is <= 60 min', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 80 }), // 50 min above estimate of 30
      ];
      const result = filterOutliers(reports, 30);
      expect(result).toHaveLength(1);
      expect(result[0].weightModifier).toBe(1.0);
    });

    it('applies velocity penalty for sudden drops too', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 5 }), // 85 min below estimate of 90
      ];
      const result = filterOutliers(reports, 90);
      expect(result).toHaveLength(1);
      expect(result[0].weightModifier).toBe(0.5);
    });

    it('does not apply velocity check when no current estimate is provided', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 150 }),
      ];
      const result = filterOutliers(reports);
      expect(result).toHaveLength(1);
      expect(result[0].weightModifier).toBe(1.0);
    });

    it('respects custom velocity threshold', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 60 }), // 30 min above estimate
      ];
      const result = filterOutliers(reports, 30, { velocityThresholdMinutes: 20 });
      expect(result[0].weightModifier).toBe(0.5);
    });
  });

  describe('combined filters', () => {
    it('applies hard bounds before statistical filter', () => {
      const reports = [
        makeReport({ id: 'r1', waitTimeMinutes: 0 }),   // rejected by bounds
        makeReport({ id: 'r2', waitTimeMinutes: 200 }), // rejected by bounds
        makeReport({ id: 'r3', waitTimeMinutes: 30 }),
        makeReport({ id: 'r4', waitTimeMinutes: 31 }),
        makeReport({ id: 'r5', waitTimeMinutes: 29 }),
      ];
      const result = filterOutliers(reports);
      // Only 3 valid reports after bounds, so stats don't apply
      expect(result).toHaveLength(3);
    });

    it('returns empty array when all reports are invalid', () => {
      const reports = [
        makeReport({ waitTimeMinutes: 0 }),
        makeReport({ waitTimeMinutes: -5 }),
        makeReport({ waitTimeMinutes: 300 }),
      ];
      const result = filterOutliers(reports);
      expect(result).toHaveLength(0);
    });
  });
});
