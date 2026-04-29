import { describe, it, expect } from 'vitest';
import { aggregateWaitTime } from '../index';
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

describe('aggregateWaitTime', () => {
  const now = new Date('2026-04-29T10:30:00');

  it('returns null for empty reports', () => {
    expect(aggregateWaitTime([], now)).toBeNull();
  });

  it('returns null when all reports are out of bounds', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 0 }),
      makeReport({ waitTimeMinutes: 200 }),
    ];
    expect(aggregateWaitTime(reports, now)).toBeNull();
  });

  it('returns aggregate for a single valid report', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 45, reportedAt: new Date('2026-04-29T10:15:00') }),
    ];
    const result = aggregateWaitTime(reports, now)!;
    expect(result).not.toBeNull();
    expect(result.currentEstimateMinutes).toBe(45);
    expect(result.reportCount).toBe(1);
    expect(result.confidence).toBe('low');
    expect(result.lastReportedAt).toEqual(new Date('2026-04-29T10:15:00'));
  });

  it('returns weighted average for multiple reports', () => {
    const reports = [
      makeReport({ id: 'r1', waitTimeMinutes: 60, reportedAt: new Date('2026-04-29T10:00:00') }),
      makeReport({ id: 'r2', waitTimeMinutes: 20, reportedAt: now }),
    ];
    const result = aggregateWaitTime(reports, now)!;
    expect(result).not.toBeNull();
    // Recent (20 min) should dominate
    expect(result.currentEstimateMinutes!).toBeLessThan(40);
    expect(result.currentEstimateMinutes!).toBeGreaterThan(20);
    expect(result.reportCount).toBe(2);
    expect(result.confidence).toBe('low');
  });

  it('filters outliers and aggregates remaining', () => {
    const reports = [
      makeReport({ id: 'r1', waitTimeMinutes: 30, reportedAt: new Date('2026-04-29T10:10:00') }),
      makeReport({ id: 'r2', waitTimeMinutes: 32, reportedAt: new Date('2026-04-29T10:15:00') }),
      makeReport({ id: 'r3', waitTimeMinutes: 28, reportedAt: new Date('2026-04-29T10:20:00') }),
      makeReport({ id: 'r4', waitTimeMinutes: 31, reportedAt: new Date('2026-04-29T10:25:00') }),
      makeReport({ id: 'r5', waitTimeMinutes: 29, reportedAt: new Date('2026-04-29T10:28:00') }),
      makeReport({ id: 'r6', waitTimeMinutes: 150, reportedAt: now }), // statistical outlier
    ];
    const result = aggregateWaitTime(reports, now)!;
    expect(result).not.toBeNull();
    // Should reject the 150 outlier, estimate near ~30
    expect(result.currentEstimateMinutes!).toBeLessThan(40);
    expect(result.currentEstimateMinutes!).toBeGreaterThan(25);
  });

  it('computes high confidence with 6+ recent reports', () => {
    const reports = Array.from({ length: 7 }, (_, i) =>
      makeReport({
        id: `r${i}`,
        waitTimeMinutes: 30 + i,
        reportedAt: new Date(now.getTime() - i * 5 * 60000),
      })
    );
    const result = aggregateWaitTime(reports, now)!;
    expect(result.confidence).toBe('high');
  });

  it('computes medium confidence with 3-5 recent reports', () => {
    const reports = Array.from({ length: 4 }, (_, i) =>
      makeReport({
        id: `r${i}`,
        waitTimeMinutes: 30,
        reportedAt: new Date(now.getTime() - i * 10 * 60000),
      })
    );
    const result = aggregateWaitTime(reports, now)!;
    expect(result.confidence).toBe('medium');
  });

  it('returns most recent reportedAt as lastReportedAt', () => {
    const reports = [
      makeReport({ id: 'r1', waitTimeMinutes: 30, reportedAt: new Date('2026-04-29T10:00:00') }),
      makeReport({ id: 'r2', waitTimeMinutes: 35, reportedAt: new Date('2026-04-29T10:20:00') }),
      makeReport({ id: 'r3', waitTimeMinutes: 32, reportedAt: new Date('2026-04-29T10:10:00') }),
    ];
    const result = aggregateWaitTime(reports, now)!;
    expect(result.lastReportedAt).toEqual(new Date('2026-04-29T10:20:00'));
  });

  it('returns null when valid reports are from a different day', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 30, reportedAt: new Date('2026-04-28T10:00:00') }),
    ];
    expect(aggregateWaitTime(reports, now)).toBeNull();
  });

  it('handles velocity-penalized reports in the aggregate', () => {
    // This test verifies the pipeline doesn't crash with velocity checks
    // (currentEstimate is undefined in fresh aggregation, so no velocity penalty applies)
    const reports = [
      makeReport({ id: 'r1', waitTimeMinutes: 30, reportedAt: new Date('2026-04-29T10:10:00') }),
      makeReport({ id: 'r2', waitTimeMinutes: 120, reportedAt: new Date('2026-04-29T10:20:00') }),
    ];
    const result = aggregateWaitTime(reports, now)!;
    expect(result).not.toBeNull();
    expect(result.reportCount).toBe(2);
  });
});
