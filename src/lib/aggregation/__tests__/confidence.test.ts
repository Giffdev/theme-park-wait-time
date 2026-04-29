import { describe, it, expect } from 'vitest';
import { computeConfidence } from '../confidence';
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

describe('computeConfidence', () => {
  const now = new Date('2026-04-29T10:30:00');

  it('returns "none" for empty reports', () => {
    expect(computeConfidence([], now)).toBe('none');
  });

  it('returns "none" when no reports are within the window', () => {
    const reports = [
      makeReport({ reportedAt: new Date('2026-04-29T09:00:00') }), // 90 min ago
    ];
    expect(computeConfidence(reports, now)).toBe('none');
  });

  it('returns "low" for 1 report in last 60 min', () => {
    const reports = [
      makeReport({ reportedAt: new Date('2026-04-29T10:00:00') }), // 30 min ago
    ];
    expect(computeConfidence(reports, now)).toBe('low');
  });

  it('returns "low" for 2 reports in last 60 min', () => {
    const reports = [
      makeReport({ id: 'r1', reportedAt: new Date('2026-04-29T10:00:00') }),
      makeReport({ id: 'r2', reportedAt: new Date('2026-04-29T10:10:00') }),
    ];
    expect(computeConfidence(reports, now)).toBe('low');
  });

  it('returns "medium" for 3 reports in last 60 min', () => {
    const reports = [
      makeReport({ id: 'r1', reportedAt: new Date('2026-04-29T10:00:00') }),
      makeReport({ id: 'r2', reportedAt: new Date('2026-04-29T10:10:00') }),
      makeReport({ id: 'r3', reportedAt: new Date('2026-04-29T10:20:00') }),
    ];
    expect(computeConfidence(reports, now)).toBe('medium');
  });

  it('returns "medium" for 5 reports in last 60 min', () => {
    const reports = Array.from({ length: 5 }, (_, i) =>
      makeReport({ id: `r${i}`, reportedAt: new Date(`2026-04-29T10:${i * 5}0:00`) })
    );
    // Reports at 10:00, 10:50, 10:100... fix the timestamps
    const fixedReports = [
      makeReport({ id: 'r1', reportedAt: new Date('2026-04-29T10:00:00') }),
      makeReport({ id: 'r2', reportedAt: new Date('2026-04-29T10:05:00') }),
      makeReport({ id: 'r3', reportedAt: new Date('2026-04-29T10:10:00') }),
      makeReport({ id: 'r4', reportedAt: new Date('2026-04-29T10:15:00') }),
      makeReport({ id: 'r5', reportedAt: new Date('2026-04-29T10:20:00') }),
    ];
    expect(computeConfidence(fixedReports, now)).toBe('medium');
  });

  it('returns "high" for 6 reports in last 60 min', () => {
    const reports = Array.from({ length: 6 }, (_, i) =>
      makeReport({ id: `r${i}`, reportedAt: new Date(now.getTime() - i * 5 * 60000) })
    );
    expect(computeConfidence(reports, now)).toBe('high');
  });

  it('returns "high" for many reports in last 60 min', () => {
    const reports = Array.from({ length: 20 }, (_, i) =>
      makeReport({ id: `r${i}`, reportedAt: new Date(now.getTime() - i * 2 * 60000) })
    );
    expect(computeConfidence(reports, now)).toBe('high');
  });

  it('only counts reports within the window, ignoring older ones', () => {
    const reports = [
      makeReport({ id: 'r1', reportedAt: new Date('2026-04-29T09:00:00') }), // 90 min ago
      makeReport({ id: 'r2', reportedAt: new Date('2026-04-29T09:10:00') }), // 80 min ago
      makeReport({ id: 'r3', reportedAt: new Date('2026-04-29T10:00:00') }), // 30 min ago — in window
    ];
    expect(computeConfidence(reports, now)).toBe('low');
  });

  it('respects custom window size', () => {
    const reports = [
      makeReport({ id: 'r1', reportedAt: new Date('2026-04-29T10:00:00') }), // 30 min ago
    ];
    // With 20 min window, this report is outside
    expect(computeConfidence(reports, now, { windowMinutes: 20 })).toBe('none');
    // With 60 min window, it's inside
    expect(computeConfidence(reports, now, { windowMinutes: 60 })).toBe('low');
  });

  it('handles reports exactly at the window boundary', () => {
    const reports = [
      makeReport({ reportedAt: new Date('2026-04-29T09:30:00') }), // exactly 60 min ago
    ];
    // The cutoff is now - 60min = 09:30:00. reportedAt >= cutoff should be true.
    expect(computeConfidence(reports, now)).toBe('low');
  });

  it('excludes future reports', () => {
    const reports = [
      makeReport({ reportedAt: new Date('2026-04-29T11:00:00') }), // future
    ];
    expect(computeConfidence(reports, now)).toBe('none');
  });
});
