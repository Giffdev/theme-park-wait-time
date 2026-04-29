import { describe, it, expect } from 'vitest';
import {
  deriveCrowdLevel,
  computeDailyAverage,
  computeParkCrowdDay,
  buildFamilyCrowdDay,
  computeBestPlan,
  type ForecastEntry,
} from '../aggregation';
import { CrowdLevel } from '@/types/parkFamily';

describe('deriveCrowdLevel', () => {
  it('returns Low for avg < 20', () => {
    expect(deriveCrowdLevel(0)).toBe(CrowdLevel.Low);
    expect(deriveCrowdLevel(10)).toBe(CrowdLevel.Low);
    expect(deriveCrowdLevel(19.9)).toBe(CrowdLevel.Low);
  });

  it('returns Moderate for avg 20-34.9', () => {
    expect(deriveCrowdLevel(20)).toBe(CrowdLevel.Moderate);
    expect(deriveCrowdLevel(25)).toBe(CrowdLevel.Moderate);
    expect(deriveCrowdLevel(34.9)).toBe(CrowdLevel.Moderate);
  });

  it('returns High for avg 35-49.9', () => {
    expect(deriveCrowdLevel(35)).toBe(CrowdLevel.High);
    expect(deriveCrowdLevel(45)).toBe(CrowdLevel.High);
    expect(deriveCrowdLevel(49.9)).toBe(CrowdLevel.High);
  });

  it('returns Extreme for avg >= 50', () => {
    expect(deriveCrowdLevel(50)).toBe(CrowdLevel.Extreme);
    expect(deriveCrowdLevel(100)).toBe(CrowdLevel.Extreme);
  });
});

describe('computeDailyAverage', () => {
  it('returns 0 for empty forecasts', () => {
    expect(computeDailyAverage([])).toBe(0);
  });

  it('computes the average of forecast wait times', () => {
    const forecasts: ForecastEntry[] = [
      { time: '2026-05-01T09:00:00Z', waitTime: 10 },
      { time: '2026-05-01T10:00:00Z', waitTime: 20 },
      { time: '2026-05-01T11:00:00Z', waitTime: 30 },
    ];
    expect(computeDailyAverage(forecasts)).toBe(20);
  });

  it('rounds to one decimal place', () => {
    const forecasts: ForecastEntry[] = [
      { time: '2026-05-01T09:00:00Z', waitTime: 10 },
      { time: '2026-05-01T10:00:00Z', waitTime: 15 },
      { time: '2026-05-01T11:00:00Z', waitTime: 20 },
    ];
    expect(computeDailyAverage(forecasts)).toBe(15);
  });
});

describe('computeParkCrowdDay', () => {
  it('returns Low crowd level for low average wait parks', () => {
    const forecasts = new Map<string, ForecastEntry[]>();
    forecasts.set('attraction-1', [
      { time: '2026-05-01T09:00:00Z', waitTime: 5 },
      { time: '2026-05-01T10:00:00Z', waitTime: 10 },
    ]);
    forecasts.set('attraction-2', [
      { time: '2026-05-01T09:00:00Z', waitTime: 8 },
      { time: '2026-05-01T10:00:00Z', waitTime: 12 },
    ]);

    const result = computeParkCrowdDay('park-1', 'Test Park', forecasts);
    expect(result.parkId).toBe('park-1');
    expect(result.parkName).toBe('Test Park');
    expect(result.crowdLevel).toBe(CrowdLevel.Low);
    expect(result.avgWaitMinutes).toBeLessThan(20);
  });

  it('returns Extreme for high average wait parks', () => {
    const forecasts = new Map<string, ForecastEntry[]>();
    forecasts.set('attraction-1', [
      { time: '2026-05-01T09:00:00Z', waitTime: 60 },
      { time: '2026-05-01T10:00:00Z', waitTime: 70 },
    ]);
    forecasts.set('attraction-2', [
      { time: '2026-05-01T09:00:00Z', waitTime: 55 },
      { time: '2026-05-01T10:00:00Z', waitTime: 65 },
    ]);

    const result = computeParkCrowdDay('park-1', 'Busy Park', forecasts);
    expect(result.crowdLevel).toBe(CrowdLevel.Extreme);
    expect(result.avgWaitMinutes).toBeGreaterThanOrEqual(50);
  });

  it('handles empty forecast map gracefully', () => {
    const result = computeParkCrowdDay('park-1', 'Empty Park', new Map());
    expect(result.crowdLevel).toBe(CrowdLevel.Low);
    expect(result.avgWaitMinutes).toBe(0);
  });

  it('skips attractions with no forecast entries', () => {
    const forecasts = new Map<string, ForecastEntry[]>();
    forecasts.set('attraction-1', []);
    forecasts.set('attraction-2', [
      { time: '2026-05-01T09:00:00Z', waitTime: 30 },
    ]);

    const result = computeParkCrowdDay('park-1', 'Mixed Park', forecasts);
    expect(result.avgWaitMinutes).toBe(30);
    expect(result.crowdLevel).toBe(CrowdLevel.Moderate);
  });
});

describe('buildFamilyCrowdDay', () => {
  it('builds a FamilyCrowdDay object', () => {
    const parks = [
      { parkId: 'p1', parkName: 'Park 1', crowdLevel: CrowdLevel.Low, avgWaitMinutes: 10 },
      { parkId: 'p2', parkName: 'Park 2', crowdLevel: CrowdLevel.High, avgWaitMinutes: 40 },
    ];
    const result = buildFamilyCrowdDay('2026-05-01', parks);
    expect(result.date).toBe('2026-05-01');
    expect(result.parks).toHaveLength(2);
    expect(result.parks[0].parkId).toBe('p1');
  });
});

describe('computeBestPlan', () => {
  const makeDays = (): import('@/types/parkFamily').FamilyCrowdDay[] => [
    {
      date: '2026-05-01',
      parks: [
        { parkId: 'p1', parkName: 'Park A', crowdLevel: CrowdLevel.High, avgWaitMinutes: 40 },
        { parkId: 'p2', parkName: 'Park B', crowdLevel: CrowdLevel.Low, avgWaitMinutes: 10 },
        { parkId: 'p3', parkName: 'Park C', crowdLevel: CrowdLevel.Moderate, avgWaitMinutes: 25 },
      ],
    },
    {
      date: '2026-05-02',
      parks: [
        { parkId: 'p1', parkName: 'Park A', crowdLevel: CrowdLevel.Low, avgWaitMinutes: 12 },
        { parkId: 'p2', parkName: 'Park B', crowdLevel: CrowdLevel.High, avgWaitMinutes: 38 },
        { parkId: 'p3', parkName: 'Park C', crowdLevel: CrowdLevel.Moderate, avgWaitMinutes: 28 },
      ],
    },
    {
      date: '2026-05-03',
      parks: [
        { parkId: 'p1', parkName: 'Park A', crowdLevel: CrowdLevel.Moderate, avgWaitMinutes: 22 },
        { parkId: 'p2', parkName: 'Park B', crowdLevel: CrowdLevel.Moderate, avgWaitMinutes: 24 },
        { parkId: 'p3', parkName: 'Park C', crowdLevel: CrowdLevel.Low, avgWaitMinutes: 8 },
      ],
    },
  ];

  it('returns empty plan for empty days', () => {
    const result = computeBestPlan([], 3);
    expect(result.days).toHaveLength(0);
  });

  it('picks lowest crowd levels with unique parks and dates', () => {
    const result = computeBestPlan(makeDays(), 3);
    expect(result.days).toHaveLength(3);

    // Each day should be different
    const dates = result.days.map((d) => d.date);
    expect(new Set(dates).size).toBe(3);

    // Should prefer unique parks
    const parks = result.days.map((d) => d.parkId);
    expect(new Set(parks).size).toBe(3);
  });

  it('picks the optimal assignment', () => {
    const result = computeBestPlan(makeDays(), 3);
    // Optimal: p3 on 5/3 (Low,8), p2 on 5/1 (Low,10), p1 on 5/2 (Low,12)
    expect(result.days[0]).toMatchObject({ date: '2026-05-01', parkId: 'p2' });
    expect(result.days[1]).toMatchObject({ date: '2026-05-02', parkId: 'p1' });
    expect(result.days[2]).toMatchObject({ date: '2026-05-03', parkId: 'p3' });
  });

  it('allows park repeats when numDays > parks', () => {
    const days = makeDays().slice(0, 2);
    // Only 2 days available, requesting 2
    const result = computeBestPlan(days, 2);
    expect(result.days).toHaveLength(2);
  });

  it('returns sorted by date', () => {
    const result = computeBestPlan(makeDays(), 3);
    for (let i = 1; i < result.days.length; i++) {
      expect(result.days[i].date >= result.days[i - 1].date).toBe(true);
    }
  });

  it('respects numDays parameter', () => {
    const result = computeBestPlan(makeDays(), 2);
    expect(result.days).toHaveLength(2);
  });
});
