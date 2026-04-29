import { describe, it, expect } from 'vitest';
import { computeWeightedAverage } from '../weighted-average';
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

describe('computeWeightedAverage', () => {
  const now = new Date('2026-04-29T10:30:00');

  it('returns null for empty reports', () => {
    expect(computeWeightedAverage([], now)).toBeNull();
  });

  it('returns the single report value when only one report exists', () => {
    const reports = [makeReport({ waitTimeMinutes: 45, reportedAt: now })];
    expect(computeWeightedAverage(reports, now)).toBe(45);
  });

  it('weights recent reports more heavily than older ones', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 60, reportedAt: new Date('2026-04-29T10:00:00') }), // 30 min old
      makeReport({ waitTimeMinutes: 20, reportedAt: new Date('2026-04-29T10:30:00') }), // current
    ];
    const result = computeWeightedAverage(reports, now)!;
    // The recent report (20 min) should pull average below 40
    expect(result).toBeLessThan(40);
    expect(result).toBeGreaterThan(20);
  });

  it('gives a 30-min-old report half the weight of a current report', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 60, reportedAt: new Date('2026-04-29T10:00:00') }), // 30 min ago
      makeReport({ waitTimeMinutes: 20, reportedAt: now }), // now
    ];
    // weight of 30-min-old: 1/(1+30/30) = 0.5
    // weight of now: 1/(1+0/30) = 1.0
    // expected: (60*0.5 + 20*1.0) / (0.5 + 1.0) = (30 + 20) / 1.5 = 33.33
    const result = computeWeightedAverage(reports, now)!;
    expect(result).toBeCloseTo(33.3, 0);
  });

  it('excludes reports older than maxAge (2 hours)', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 100, reportedAt: new Date('2026-04-29T08:00:00') }), // 2.5 hrs old
      makeReport({ waitTimeMinutes: 30, reportedAt: new Date('2026-04-29T10:00:00') }), // 30 min old
    ];
    const result = computeWeightedAverage(reports, now)!;
    // The 2.5-hour-old report should be excluded
    expect(result).toBeCloseTo(30, 0);
  });

  it('excludes reports from a different calendar day', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 100, reportedAt: new Date('2026-04-28T23:59:00') }), // yesterday
      makeReport({ waitTimeMinutes: 30, reportedAt: new Date('2026-04-29T10:00:00') }), // today
    ];
    const result = computeWeightedAverage(reports, now)!;
    expect(result).toBeCloseTo(30, 0);
  });

  it('returns null when all reports are from a different day', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 30, reportedAt: new Date('2026-04-28T10:00:00') }),
    ];
    expect(computeWeightedAverage(reports, now)).toBeNull();
  });

  it('returns null when all reports are older than maxAge', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 30, reportedAt: new Date('2026-04-29T07:00:00') }), // 3.5 hrs old
    ];
    expect(computeWeightedAverage(reports, now)).toBeNull();
  });

  it('respects custom halfLifeMinutes', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 60, reportedAt: new Date('2026-04-29T10:15:00') }), // 15 min old
      makeReport({ waitTimeMinutes: 20, reportedAt: now }),
    ];
    // With halfLife=15: weight of 15-min-old = 1/(1+15/15) = 0.5
    const result = computeWeightedAverage(reports, now, { halfLifeMinutes: 15 })!;
    // (60*0.5 + 20*1.0) / 1.5 = 33.3
    expect(result).toBeCloseTo(33.3, 0);
  });

  it('respects custom maxAgeMinutes', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 100, reportedAt: new Date('2026-04-29T10:00:00') }), // 30 min old
      makeReport({ waitTimeMinutes: 30, reportedAt: new Date('2026-04-29T10:25:00') }), // 5 min old
    ];
    // With maxAge=20, the 30-min-old report is excluded
    const result = computeWeightedAverage(reports, now, { maxAgeMinutes: 20 })!;
    expect(result).toBeCloseTo(30, 0);
  });

  it('handles reports exactly at the boundary time (maxAge)', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 45, reportedAt: new Date('2026-04-29T08:30:00') }), // exactly 120 min old
    ];
    // Exactly at maxAge — should be included (ageMinutes <= maxAge)
    const result = computeWeightedAverage(reports, now);
    expect(result).toBe(45);
  });

  it('excludes future reports', () => {
    const reports = [
      makeReport({ waitTimeMinutes: 30, reportedAt: new Date('2026-04-29T11:00:00') }), // future
    ];
    expect(computeWeightedAverage(reports, now)).toBeNull();
  });

  it('handles multiple reports at the same time', () => {
    const reports = [
      makeReport({ id: 'r1', waitTimeMinutes: 20, reportedAt: now }),
      makeReport({ id: 'r2', waitTimeMinutes: 40, reportedAt: now }),
    ];
    // Both have weight 1.0, simple average
    const result = computeWeightedAverage(reports, now)!;
    expect(result).toBe(30);
  });
});
