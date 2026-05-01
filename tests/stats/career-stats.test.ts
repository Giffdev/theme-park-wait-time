/**
 * Tests for Career Stats Aggregation (src/lib/stats/career-stats.ts)
 *
 * Covers:
 * - Empty ride logs → sensible defaults
 * - Single ride log → all stats computed correctly
 * - Multiple rides across multiple parks → correct aggregation
 * - Date range filtering → only rides within range
 * - Rides with zero/null/undefined wait times → graceful handling
 * - Large dataset (100+ rides) → correct computation
 * - Ties in favorite/most-visited → deterministic result
 *
 * Written 2026-05-01 by Stef (QA)
 */
import { describe, it, expect } from 'vitest';
import {
  computeCareerStats,
  filterByDateRange,
  computeRideDistributionByPark,
  computeAttractionCounts,
} from '@/lib/stats/career-stats';
import type { RideLog } from '@/types/ride-log';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let nextId = 1;

function createRideLog(overrides: Partial<RideLog> = {}): RideLog {
  const id = `log-${nextId++}`;
  return {
    id,
    parkId: 'park-mk',
    attractionId: 'attr-sm',
    parkName: 'Magic Kingdom',
    attractionName: 'Space Mountain',
    rodeAt: new Date('2026-03-15T10:00:00Z'),
    waitTimeMinutes: 30,
    attractionClosed: false,
    source: 'manual',
    rating: null,
    notes: '',
    tripId: null,
    createdAt: new Date('2026-03-15T10:30:00Z'),
    updatedAt: new Date('2026-03-15T10:30:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Empty Input
// ---------------------------------------------------------------------------

describe('computeCareerStats — empty input', () => {
  it('returns sensible defaults for an empty array', () => {
    const stats = computeCareerStats([]);
    expect(stats.totalRides).toBe(0);
    expect(stats.totalParksVisited).toBe(0);
    expect(stats.averageWaitMinutes).toBeNull();
    expect(stats.mostVisitedPark).toBeNull();
    expect(stats.favoriteAttraction).toBeNull();
    expect(stats.topAttractions).toEqual([]);
    expect(stats.rideDistributionByPark).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Single Ride Log
// ---------------------------------------------------------------------------

describe('computeCareerStats — single ride', () => {
  it('computes all stats correctly from one ride', () => {
    const log = createRideLog({
      parkName: 'EPCOT',
      attractionName: 'Guardians of the Galaxy',
      waitTimeMinutes: 45,
    });
    const stats = computeCareerStats([log]);

    expect(stats.totalRides).toBe(1);
    expect(stats.totalParksVisited).toBe(1);
    expect(stats.averageWaitMinutes).toBe(45);
    expect(stats.mostVisitedPark).toEqual({ parkName: 'EPCOT', rideCount: 1 });
    expect(stats.favoriteAttraction).toEqual({
      attractionName: 'Guardians of the Galaxy',
      parkName: 'EPCOT',
      rideCount: 1,
    });
    expect(stats.topAttractions).toHaveLength(1);
    expect(stats.rideDistributionByPark).toEqual({ EPCOT: 1 });
  });
});

// ---------------------------------------------------------------------------
// Multiple Rides Across Parks
// ---------------------------------------------------------------------------

describe('computeCareerStats — multiple rides, multiple parks', () => {
  const logs: RideLog[] = [
    createRideLog({ parkName: 'Magic Kingdom', attractionName: 'Space Mountain', waitTimeMinutes: 30 }),
    createRideLog({ parkName: 'Magic Kingdom', attractionName: 'Space Mountain', waitTimeMinutes: 40 }),
    createRideLog({ parkName: 'Magic Kingdom', attractionName: 'Splash Mountain', waitTimeMinutes: 20 }),
    createRideLog({ parkName: 'EPCOT', attractionName: 'Test Track', waitTimeMinutes: 50 }),
    createRideLog({ parkName: 'EPCOT', attractionName: 'Test Track', waitTimeMinutes: 60 }),
    createRideLog({ parkName: 'Hollywood Studios', attractionName: "Rock 'n' Roller Coaster", waitTimeMinutes: 10 }),
  ];

  it('counts total rides', () => {
    const stats = computeCareerStats(logs);
    expect(stats.totalRides).toBe(6);
  });

  it('counts unique parks', () => {
    const stats = computeCareerStats(logs);
    expect(stats.totalParksVisited).toBe(3);
  });

  it('computes average wait time', () => {
    const stats = computeCareerStats(logs);
    // (30+40+20+50+60+10)/6 = 210/6 = 35
    expect(stats.averageWaitMinutes).toBe(35);
  });

  it('identifies most visited park', () => {
    const stats = computeCareerStats(logs);
    expect(stats.mostVisitedPark).toEqual({ parkName: 'Magic Kingdom', rideCount: 3 });
  });

  it('identifies favorite attraction', () => {
    const stats = computeCareerStats(logs);
    // Space Mountain and Test Track both have 2 rides; first encountered wins
    expect(stats.favoriteAttraction!.rideCount).toBe(2);
  });

  it('returns top 5 attractions sorted by ride count', () => {
    const stats = computeCareerStats(logs);
    expect(stats.topAttractions.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < stats.topAttractions.length; i++) {
      expect(stats.topAttractions[i - 1].rideCount).toBeGreaterThanOrEqual(
        stats.topAttractions[i].rideCount
      );
    }
  });

  it('computes correct ride distribution by park', () => {
    const stats = computeCareerStats(logs);
    expect(stats.rideDistributionByPark).toEqual({
      'Magic Kingdom': 3,
      EPCOT: 2,
      'Hollywood Studios': 1,
    });
  });
});

// ---------------------------------------------------------------------------
// Date Range Filtering
// ---------------------------------------------------------------------------

describe('computeCareerStats — date range filtering', () => {
  const logs: RideLog[] = [
    createRideLog({ rodeAt: new Date('2026-01-10T10:00:00Z'), parkName: 'Park A', attractionName: 'Ride 1' }),
    createRideLog({ rodeAt: new Date('2026-02-15T10:00:00Z'), parkName: 'Park B', attractionName: 'Ride 2' }),
    createRideLog({ rodeAt: new Date('2026-03-20T10:00:00Z'), parkName: 'Park C', attractionName: 'Ride 3' }),
    createRideLog({ rodeAt: new Date('2026-04-05T10:00:00Z'), parkName: 'Park A', attractionName: 'Ride 1' }),
  ];

  it('includes only rides within the date range', () => {
    const stats = computeCareerStats(logs, {
      start: new Date('2026-02-01T00:00:00Z'),
      end: new Date('2026-03-31T23:59:59Z'),
    });
    expect(stats.totalRides).toBe(2);
    expect(stats.totalParksVisited).toBe(2);
  });

  it('returns empty stats when no rides match the date range', () => {
    const stats = computeCareerStats(logs, {
      start: new Date('2025-01-01T00:00:00Z'),
      end: new Date('2025-12-31T23:59:59Z'),
    });
    expect(stats.totalRides).toBe(0);
    expect(stats.mostVisitedPark).toBeNull();
  });

  it('includes rides exactly at range boundaries (inclusive)', () => {
    const exact = new Date('2026-02-15T10:00:00Z');
    const stats = computeCareerStats(logs, { start: exact, end: exact });
    expect(stats.totalRides).toBe(1);
  });
});

describe('filterByDateRange', () => {
  it('filters correctly with inclusive boundaries', () => {
    const logs = [
      createRideLog({ rodeAt: new Date('2026-03-01T00:00:00Z') }),
      createRideLog({ rodeAt: new Date('2026-03-15T12:00:00Z') }),
      createRideLog({ rodeAt: new Date('2026-03-31T23:59:59Z') }),
      createRideLog({ rodeAt: new Date('2026-04-01T00:00:00Z') }),
    ];
    const result = filterByDateRange(logs, {
      start: new Date('2026-03-01T00:00:00Z'),
      end: new Date('2026-03-31T23:59:59Z'),
    });
    expect(result).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Null / Zero / Undefined Wait Times
// ---------------------------------------------------------------------------

describe('computeCareerStats — null/zero wait times', () => {
  it('excludes null wait times from average calculation', () => {
    const logs = [
      createRideLog({ waitTimeMinutes: 20 }),
      createRideLog({ waitTimeMinutes: null }),
      createRideLog({ waitTimeMinutes: 40 }),
    ];
    const stats = computeCareerStats(logs);
    // Average should be (20+40)/2 = 30, ignoring null
    expect(stats.averageWaitMinutes).toBe(30);
    expect(stats.totalRides).toBe(3); // All 3 rides still counted
  });

  it('handles all-null wait times → averageWaitMinutes is null', () => {
    const logs = [
      createRideLog({ waitTimeMinutes: null }),
      createRideLog({ waitTimeMinutes: null }),
    ];
    const stats = computeCareerStats(logs);
    expect(stats.averageWaitMinutes).toBeNull();
    expect(stats.totalRides).toBe(2);
  });

  it('includes zero wait time in average (walk-on rides)', () => {
    const logs = [
      createRideLog({ waitTimeMinutes: 0 }),
      createRideLog({ waitTimeMinutes: 20 }),
    ];
    const stats = computeCareerStats(logs);
    // (0 + 20) / 2 = 10
    expect(stats.averageWaitMinutes).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Large Dataset
// ---------------------------------------------------------------------------

describe('computeCareerStats — large dataset (100+ rides)', () => {
  const parks = ['Magic Kingdom', 'EPCOT', 'Hollywood Studios', 'Animal Kingdom'];
  const attractions: Record<string, string[]> = {
    'Magic Kingdom': ['Space Mountain', 'Big Thunder Mountain', 'Pirates of the Caribbean'],
    EPCOT: ['Test Track', 'Guardians', 'Frozen Ever After'],
    'Hollywood Studios': ["Rock 'n' Roller Coaster", 'Tower of Terror', 'Slinky Dog'],
    'Animal Kingdom': ['Everest', 'Flight of Passage', 'Kilimanjaro Safaris'],
  };

  const largeLogs: RideLog[] = [];
  for (let i = 0; i < 150; i++) {
    const park = parks[i % parks.length];
    const attr = attractions[park][i % attractions[park].length];
    largeLogs.push(
      createRideLog({
        parkName: park,
        attractionName: attr,
        waitTimeMinutes: (i % 10) * 5 + 5, // 5..50
        rodeAt: new Date(`2026-0${(i % 4) + 1}-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`),
      })
    );
  }

  it('processes 150 rides without error', () => {
    const stats = computeCareerStats(largeLogs);
    expect(stats.totalRides).toBe(150);
    expect(stats.totalParksVisited).toBe(4);
  });

  it('returns exactly 5 top attractions', () => {
    const stats = computeCareerStats(largeLogs);
    expect(stats.topAttractions).toHaveLength(5);
  });

  it('ride distribution sums to total rides', () => {
    const stats = computeCareerStats(largeLogs);
    const sum = Object.values(stats.rideDistributionByPark).reduce((a, b) => a + b, 0);
    expect(sum).toBe(150);
  });

  it('average wait time is a reasonable number', () => {
    const stats = computeCareerStats(largeLogs);
    expect(stats.averageWaitMinutes).toBeGreaterThan(0);
    expect(stats.averageWaitMinutes).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// Ties — Deterministic Results
// ---------------------------------------------------------------------------

describe('computeCareerStats — ties in favorites', () => {
  it('returns a deterministic result when parks are tied', () => {
    const logs = [
      createRideLog({ parkName: 'Park A', attractionName: 'Ride A1' }),
      createRideLog({ parkName: 'Park B', attractionName: 'Ride B1' }),
    ];
    const stats1 = computeCareerStats(logs);
    const stats2 = computeCareerStats(logs);
    // Same input always produces same output
    expect(stats1.mostVisitedPark).toEqual(stats2.mostVisitedPark);
    expect(stats1.favoriteAttraction).toEqual(stats2.favoriteAttraction);
  });

  it('returns a deterministic result when attractions are tied', () => {
    const logs = [
      createRideLog({ parkName: 'MK', attractionName: 'A', waitTimeMinutes: 10 }),
      createRideLog({ parkName: 'MK', attractionName: 'A', waitTimeMinutes: 10 }),
      createRideLog({ parkName: 'EP', attractionName: 'B', waitTimeMinutes: 20 }),
      createRideLog({ parkName: 'EP', attractionName: 'B', waitTimeMinutes: 20 }),
    ];
    const stats1 = computeCareerStats(logs);
    const stats2 = computeCareerStats(logs);
    expect(stats1.favoriteAttraction).toEqual(stats2.favoriteAttraction);
    expect(stats1.topAttractions).toEqual(stats2.topAttractions);
  });
});

// ---------------------------------------------------------------------------
// Helper Functions Directly
// ---------------------------------------------------------------------------

describe('computeRideDistributionByPark', () => {
  it('counts rides per park correctly', () => {
    const logs = [
      createRideLog({ parkName: 'X' }),
      createRideLog({ parkName: 'X' }),
      createRideLog({ parkName: 'Y' }),
    ];
    expect(computeRideDistributionByPark(logs)).toEqual({ X: 2, Y: 1 });
  });
});

describe('computeAttractionCounts', () => {
  it('ranks attractions descending by ride count', () => {
    const logs = [
      createRideLog({ parkName: 'P', attractionName: 'Low' }),
      createRideLog({ parkName: 'P', attractionName: 'High' }),
      createRideLog({ parkName: 'P', attractionName: 'High' }),
      createRideLog({ parkName: 'P', attractionName: 'High' }),
    ];
    const result = computeAttractionCounts(logs);
    expect(result[0].attractionName).toBe('High');
    expect(result[0].rideCount).toBe(3);
    expect(result[1].attractionName).toBe('Low');
    expect(result[1].rideCount).toBe(1);
  });

  it('distinguishes same attraction name in different parks', () => {
    const logs = [
      createRideLog({ parkName: 'Park A', attractionName: 'Ride X' }),
      createRideLog({ parkName: 'Park B', attractionName: 'Ride X' }),
    ];
    const result = computeAttractionCounts(logs);
    expect(result).toHaveLength(2);
  });
});
