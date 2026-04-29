/**
 * Tests for crowd level computation logic.
 *
 * Unit tests for the pure data transformation:
 * - Wait time averages → crowd levels (threshold boundaries)
 * - Null handling for parks with no forecast
 * - Edge cases: closed parks, all-same-level parks
 *
 * Written 2026-04-29 — proactive contract tests.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Threshold computation (matches Mikey's spec)
// Thresholds: <20min = level 1, 20-34 = level 2, 35-49 = level 3, 50+ = level 4
// ---------------------------------------------------------------------------

type CrowdLevelLabel = 'Low' | 'Moderate' | 'High' | 'Very High';

interface ComputedCrowdLevel {
  level: number;
  label: CrowdLevelLabel;
}

/**
 * Pure function: compute crowd level from average wait time.
 * This is the contract for what Chunk will implement.
 */
function computeCrowdLevel(avgWaitMinutes: number | null): ComputedCrowdLevel | null {
  if (avgWaitMinutes === null || avgWaitMinutes === undefined) return null;
  if (avgWaitMinutes < 0) return null;

  if (avgWaitMinutes < 20) return { level: 1, label: 'Low' };
  if (avgWaitMinutes < 35) return { level: 2, label: 'Moderate' };
  if (avgWaitMinutes < 50) return { level: 3, label: 'High' };
  return { level: 4, label: 'Very High' };
}

/**
 * Compute bestPlan: assign one park per day, no park repeats,
 * choosing the lowest crowd level for each assignment.
 */
function computeBestPlan(
  parksData: Record<string, Record<string, ComputedCrowdLevel | null>>,
  numDays: number = 3,
  parkNames: Record<string, string> = {},
): Array<{ date: string; bestParkId: string; bestParkName: string; level: number }> | null {
  // Build tuples of (day, parkId, level) excluding nulls
  const tuples: Array<{ date: string; parkId: string; level: number }> = [];

  for (const [parkId, days] of Object.entries(parksData)) {
    for (const [day, crowdLevel] of Object.entries(days)) {
      if (crowdLevel !== null) {
        tuples.push({ date: day, parkId, level: crowdLevel.level });
      }
    }
  }

  // Sort by level ascending (best/lowest first)
  tuples.sort((a, b) => a.level - b.level);

  const usedParks = new Set<string>();
  const usedDays = new Set<string>();
  const plan: Array<{ date: string; bestParkId: string; bestParkName: string; level: number }> = [];

  for (const t of tuples) {
    if (plan.length >= numDays) break;
    if (usedParks.has(t.parkId) || usedDays.has(t.date)) continue;
    usedParks.add(t.parkId);
    usedDays.add(t.date);
    plan.push({
      date: t.date,
      bestParkId: t.parkId,
      bestParkName: parkNames[t.parkId] || t.parkId,
      level: t.level,
    });
  }

  return plan.length > 0 ? plan : null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Crowd Level Computation — Thresholds', () => {
  it('returns level 1 (Low) for avgWait < 20', () => {
    expect(computeCrowdLevel(0)).toEqual({ level: 1, label: 'Low' });
    expect(computeCrowdLevel(10)).toEqual({ level: 1, label: 'Low' });
    expect(computeCrowdLevel(19)).toEqual({ level: 1, label: 'Low' });
    expect(computeCrowdLevel(19.9)).toEqual({ level: 1, label: 'Low' });
  });

  it('returns level 2 (Moderate) for avgWait 20–34', () => {
    expect(computeCrowdLevel(20)).toEqual({ level: 2, label: 'Moderate' });
    expect(computeCrowdLevel(27)).toEqual({ level: 2, label: 'Moderate' });
    expect(computeCrowdLevel(34)).toEqual({ level: 2, label: 'Moderate' });
    expect(computeCrowdLevel(34.9)).toEqual({ level: 2, label: 'Moderate' });
  });

  it('returns level 3 (High) for avgWait 35–49', () => {
    expect(computeCrowdLevel(35)).toEqual({ level: 3, label: 'High' });
    expect(computeCrowdLevel(42)).toEqual({ level: 3, label: 'High' });
    expect(computeCrowdLevel(49)).toEqual({ level: 3, label: 'High' });
    expect(computeCrowdLevel(49.9)).toEqual({ level: 3, label: 'High' });
  });

  it('returns level 4 (Very High) for avgWait 50+', () => {
    expect(computeCrowdLevel(50)).toEqual({ level: 4, label: 'Very High' });
    expect(computeCrowdLevel(75)).toEqual({ level: 4, label: 'Very High' });
    expect(computeCrowdLevel(120)).toEqual({ level: 4, label: 'Very High' });
    expect(computeCrowdLevel(999)).toEqual({ level: 4, label: 'Very High' });
  });

  it('returns null for null avgWait (no forecast data)', () => {
    expect(computeCrowdLevel(null)).toBeNull();
  });

  it('returns null for undefined avgWait', () => {
    expect(computeCrowdLevel(undefined as unknown as null)).toBeNull();
  });

  it('returns null for negative avgWait (invalid data)', () => {
    expect(computeCrowdLevel(-5)).toBeNull();
  });

  it('handles boundary value exactly at 0 minutes', () => {
    const result = computeCrowdLevel(0);
    expect(result).toEqual({ level: 1, label: 'Low' });
  });
});

describe('Crowd Level Computation — Park with no forecast', () => {
  it('parks with no forecast data get null crowd level (not zero)', () => {
    const parksData: Record<string, Record<string, ComputedCrowdLevel | null>> = {
      'magic-kingdom': {
        '2026-05-01': computeCrowdLevel(25),
        '2026-05-02': computeCrowdLevel(30),
      },
      'epcot': {
        '2026-05-01': null, // no forecast for this day
        '2026-05-02': null,
      },
    };

    // EPCOT should have null, not 0
    expect(parksData['epcot']['2026-05-01']).toBeNull();
    expect(parksData['epcot']['2026-05-02']).toBeNull();
    // Magic Kingdom should have valid levels
    expect(parksData['magic-kingdom']['2026-05-01']).not.toBeNull();
    expect(parksData['magic-kingdom']['2026-05-01']!.level).toBe(2);
  });

  it('null crowd level is distinct from level 0', () => {
    const nullResult = computeCrowdLevel(null);
    const zeroResult = computeCrowdLevel(0);

    expect(nullResult).toBeNull();
    expect(zeroResult).not.toBeNull();
    expect(zeroResult!.level).toBe(1);
  });
});

describe('Crowd Level Computation — bestPlan edge cases', () => {
  const parkNames = {
    'magic-kingdom': 'Magic Kingdom',
    'epcot': 'EPCOT',
    'hollywood-studios': 'Hollywood Studios',
    'animal-kingdom': 'Animal Kingdom',
  };

  it('closed park on a day → excluded from bestPlan', () => {
    const parksData: Record<string, Record<string, ComputedCrowdLevel | null>> = {
      'magic-kingdom': {
        '2026-05-01': computeCrowdLevel(25),  // level 2
        '2026-05-02': computeCrowdLevel(15),  // level 1
      },
      'epcot': {
        '2026-05-01': null,  // closed — no data
        '2026-05-02': computeCrowdLevel(30),  // level 2
      },
      'hollywood-studios': {
        '2026-05-01': computeCrowdLevel(40),  // level 3
        '2026-05-02': computeCrowdLevel(22),  // level 2
      },
    };

    const plan = computeBestPlan(parksData, 3, parkNames);

    expect(plan).not.toBeNull();
    // EPCOT day 1 (null) should NOT be in the plan
    const epcotEntry = plan!.find(p => p.bestParkId === 'epcot');
    if (epcotEntry) {
      expect(epcotEntry.date).not.toBe('2026-05-01');
    }
  });

  it('all parks same crowd level → bestPlan still returns valid assignment', () => {
    const parksData: Record<string, Record<string, ComputedCrowdLevel | null>> = {
      'magic-kingdom': {
        '2026-05-01': computeCrowdLevel(25),  // level 2
        '2026-05-02': computeCrowdLevel(28),  // level 2
        '2026-05-03': computeCrowdLevel(30),  // level 2
      },
      'epcot': {
        '2026-05-01': computeCrowdLevel(22),  // level 2
        '2026-05-02': computeCrowdLevel(26),  // level 2
        '2026-05-03': computeCrowdLevel(33),  // level 2
      },
      'hollywood-studios': {
        '2026-05-01': computeCrowdLevel(24),  // level 2
        '2026-05-02': computeCrowdLevel(29),  // level 2
        '2026-05-03': computeCrowdLevel(31),  // level 2
      },
    };

    const plan = computeBestPlan(parksData, 3, parkNames);

    expect(plan).not.toBeNull();
    expect(plan!.length).toBe(3);

    // All entries should have level 2
    for (const entry of plan!) {
      expect(entry.level).toBe(2);
    }

    // No duplicate parks
    const parkIds = plan!.map(p => p.bestParkId);
    expect(new Set(parkIds).size).toBe(3);

    // No duplicate days
    const days = plan!.map(p => p.date);
    expect(new Set(days).size).toBe(3);
  });

  it('bestPlan with fewer available parks than requested days returns partial plan', () => {
    const parksData: Record<string, Record<string, ComputedCrowdLevel | null>> = {
      'magic-kingdom': {
        '2026-05-01': computeCrowdLevel(25),
        '2026-05-02': computeCrowdLevel(30),
      },
      'epcot': {
        '2026-05-01': computeCrowdLevel(30),
        '2026-05-02': computeCrowdLevel(28),
      },
    };

    // Request 3 days but only 2 parks available → can only assign 2
    const plan = computeBestPlan(parksData, 3, parkNames);

    expect(plan).not.toBeNull();
    expect(plan!.length).toBe(2); // Limited by number of parks
  });

  it('bestPlan with all null days returns null', () => {
    const parksData: Record<string, Record<string, ComputedCrowdLevel | null>> = {
      'magic-kingdom': {
        '2026-05-01': null,
        '2026-05-02': null,
      },
      'epcot': {
        '2026-05-01': null,
        '2026-05-02': null,
      },
    };

    const plan = computeBestPlan(parksData, 3, parkNames);

    expect(plan).toBeNull();
  });

  it('bestPlan prefers day with lower crowd level even if it means different day order', () => {
    const parksData: Record<string, Record<string, ComputedCrowdLevel | null>> = {
      'magic-kingdom': {
        '2026-05-01': computeCrowdLevel(50),  // level 4
        '2026-05-02': computeCrowdLevel(10),  // level 1 ← best
      },
      'epcot': {
        '2026-05-01': computeCrowdLevel(15),  // level 1 ← best
        '2026-05-02': computeCrowdLevel(45),  // level 3
      },
    };

    const plan = computeBestPlan(parksData, 2, parkNames);

    expect(plan).not.toBeNull();
    expect(plan!.length).toBe(2);

    // Both assignments should be level 1 (best possible)
    const mkEntry = plan!.find(p => p.bestParkId === 'magic-kingdom');
    const epEntry = plan!.find(p => p.bestParkId === 'epcot');

    expect(mkEntry).toBeDefined();
    expect(epEntry).toBeDefined();
    expect(mkEntry!.level).toBe(1);
    expect(epEntry!.level).toBe(1);
    expect(mkEntry!.date).toBe('2026-05-02');
    expect(epEntry!.date).toBe('2026-05-01');
  });
});
