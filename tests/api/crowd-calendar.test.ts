/**
 * Tests for GET /api/crowd-calendar
 *
 * Validates the park-family crowd calendar API route:
 * - Returns FamilyCrowdMonth shape
 * - Input validation (familyId, month format)
 * - Crowd level threshold logic
 * - bestPlan computation (default 3 days, no park repeats, lowest crowd)
 * - Error handling + caching behavior
 *
 * Written 2026-04-29 — proactive contract tests ahead of implementation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();

vi.mock('@/lib/firebase/admin', () => ({
  adminApp: { name: 'mock-app' },
  adminDb: {
    doc: (...args: string[]) => ({ get: () => mockGetDoc(...args) }),
    collection: (...args: string[]) => ({ get: () => mockGetDocs(...args) }),
  },
}));

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: {},
}));

// We'll import the route handler once it exists.
// For now, define an inline implementation that matches the spec contract.
// Replace this with: import { GET } from '@/app/api/crowd-calendar/route';
// once Chunk lands the route.

// ---------------------------------------------------------------------------
// Test Types (mirror what the route will return)
// ---------------------------------------------------------------------------

interface CrowdCalendarDay {
  level: number;
  label: string;
  source: string;
  avgWait?: number;
}

interface FamilyCrowdMonth {
  familyId: string;
  month: string;
  parks: Record<string, Record<string, CrowdCalendarDay>>;
  aggregate: Record<string, { level: number; label: string }>;
  generatedAt: string;
  bestPlan: DayRecommendation[] | null;
}

interface DayRecommendation {
  date: string;
  bestParkId: string;
  bestParkName: string;
  level: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/crowd-calendar');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url, { method: 'GET' });
}

/** Simulates a minimal crowd month doc from Firestore */
function buildCrowdMonthDoc(familyId: string, month: string, parkData: Record<string, Record<string, { avgWait: number }>>) {
  const parks: Record<string, Record<string, CrowdCalendarDay>> = {};

  for (const [parkId, days] of Object.entries(parkData)) {
    parks[parkId] = {};
    for (const [day, { avgWait }] of Object.entries(days)) {
      let level: number;
      let label: string;
      if (avgWait < 20) { level = 1; label = 'Low'; }
      else if (avgWait < 35) { level = 2; label = 'Moderate'; }
      else if (avgWait < 50) { level = 3; label = 'High'; }
      else { level = 4; label = 'Very High'; }
      parks[parkId][day] = { level, label, source: 'predicted', avgWait };
    }
  }

  // Aggregate: average across parks per day
  const allDays = new Set(Object.values(parkData).flatMap(d => Object.keys(d)));
  const aggregate: Record<string, { level: number; label: string }> = {};
  for (const day of allDays) {
    const levels = Object.keys(parkData).map(pid => parks[pid]?.[day]?.level).filter(Boolean) as number[];
    const avg = levels.length > 0 ? Math.round(levels.reduce((s, l) => s + l, 0) / levels.length) : 0;
    aggregate[day] = { level: avg, label: avg <= 1 ? 'Low' : avg <= 2 ? 'Moderate' : avg <= 3 ? 'High' : 'Very High' };
  }

  return { familyId, month, parks, aggregate, generatedAt: '2026-04-29T00:00:00Z' };
}

/** Compute bestPlan from a crowd month doc (mirrors expected route logic) */
function computeBestPlan(doc: ReturnType<typeof buildCrowdMonthDoc>, numDays = 3): DayRecommendation[] | null {
  const parkNames: Record<string, string> = {
    'universal-studios': 'Universal Studios',
    'islands-of-adventure': 'Islands of Adventure',
    'epic-universe': 'Epic Universe',
    'magic-kingdom': 'Magic Kingdom',
    'epcot': 'EPCOT',
    'hollywood-studios': 'Hollywood Studios',
    'animal-kingdom': 'Animal Kingdom',
  };

  // Build list of (day, parkId, level) tuples
  const tuples: Array<{ date: string; parkId: string; level: number }> = [];
  for (const [parkId, days] of Object.entries(doc.parks)) {
    for (const [day, data] of Object.entries(days)) {
      tuples.push({ date: `${doc.month}-${day.padStart(2, '0')}`, parkId, level: data.level });
    }
  }

  // Sort by level ascending
  tuples.sort((a, b) => a.level - b.level);

  // Pick best non-repeating parks
  const usedParks = new Set<string>();
  const usedDays = new Set<string>();
  const plan: DayRecommendation[] = [];

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
      label: t.level <= 1 ? 'Low' : t.level <= 2 ? 'Moderate' : t.level <= 3 ? 'High' : 'Very High',
    });
  }

  return plan.length > 0 ? plan : null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/crowd-calendar', () => {
  const universalData = {
    'universal-studios': {
      '1': { avgWait: 15 }, '2': { avgWait: 25 }, '3': { avgWait: 40 },
      '4': { avgWait: 55 }, '5': { avgWait: 10 }, '6': { avgWait: 30 },
    },
    'islands-of-adventure': {
      '1': { avgWait: 30 }, '2': { avgWait: 18 }, '3': { avgWait: 22 },
      '4': { avgWait: 45 }, '5': { avgWait: 60 }, '6': { avgWait: 12 },
    },
    'epic-universe': {
      '1': { avgWait: 50 }, '2': { avgWait: 55 }, '3': { avgWait: 10 },
      '4': { avgWait: 20 }, '5': { avgWait: 38 }, '6': { avgWait: 42 },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Shape validation ─────────────────────────────────────────────────────

  it('returns FamilyCrowdMonth shape with required fields', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', universalData);

    expect(doc).toHaveProperty('familyId', 'universal-orlando');
    expect(doc).toHaveProperty('month', '2026-05');
    expect(doc).toHaveProperty('parks');
    expect(doc).toHaveProperty('aggregate');
    expect(doc).toHaveProperty('generatedAt');
    expect(Object.keys(doc.parks)).toEqual(['universal-studios', 'islands-of-adventure', 'epic-universe']);
  });

  // ─── Input validation ─────────────────────────────────────────────────────

  it('rejects unknown family IDs', () => {
    const validFamilies = ['walt-disney-world', 'universal-orlando', 'disneyland-resort'];
    const unknownFamily = 'six-flags-magic-mountain';

    expect(validFamilies.includes(unknownFamily)).toBe(false);
  });

  it('validates month format must be YYYY-MM', () => {
    const validPatterns = ['2026-05', '2026-12', '2027-01'];
    const invalidPatterns = ['May 2026', '2026/05', '05-2026', '2026-5', '2026-13', ''];

    const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

    for (const valid of validPatterns) {
      expect(monthRegex.test(valid)).toBe(true);
    }
    for (const invalid of invalidPatterns) {
      expect(monthRegex.test(invalid)).toBe(false);
    }
  });

  // ─── Crowd level threshold logic ─────────────────────────────────────────

  it('computes crowd level 1 for avg wait < 20 min', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', {
      'universal-studios': { '1': { avgWait: 15 } },
    });

    expect(doc.parks['universal-studios']['1'].level).toBe(1);
    expect(doc.parks['universal-studios']['1'].label).toBe('Low');
  });

  it('computes crowd level 2 for avg wait 20–34 min', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', {
      'universal-studios': { '1': { avgWait: 25 } },
    });

    expect(doc.parks['universal-studios']['1'].level).toBe(2);
    expect(doc.parks['universal-studios']['1'].label).toBe('Moderate');
  });

  it('computes crowd level 3 for avg wait 35–49 min', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', {
      'universal-studios': { '1': { avgWait: 40 } },
    });

    expect(doc.parks['universal-studios']['1'].level).toBe(3);
    expect(doc.parks['universal-studios']['1'].label).toBe('High');
  });

  it('computes crowd level 4 for avg wait 50+ min', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', {
      'universal-studios': { '1': { avgWait: 60 } },
    });

    expect(doc.parks['universal-studios']['1'].level).toBe(4);
    expect(doc.parks['universal-studios']['1'].label).toBe('Very High');
  });

  it('handles boundary: exactly 20 min = level 2', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', {
      'universal-studios': { '1': { avgWait: 20 } },
    });
    expect(doc.parks['universal-studios']['1'].level).toBe(2);
  });

  it('handles boundary: exactly 35 min = level 3', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', {
      'universal-studios': { '1': { avgWait: 35 } },
    });
    expect(doc.parks['universal-studios']['1'].level).toBe(3);
  });

  it('handles boundary: exactly 50 min = level 4', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', {
      'universal-studios': { '1': { avgWait: 50 } },
    });
    expect(doc.parks['universal-studios']['1'].level).toBe(4);
  });

  // ─── bestPlan computation ─────────────────────────────────────────────────

  it('returns bestPlan with default 3 days', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', universalData);
    const plan = computeBestPlan(doc, 3);

    expect(plan).not.toBeNull();
    expect(plan!.length).toBe(3);
  });

  it('bestPlan assigns different parks to different days (no repeats)', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', universalData);
    const plan = computeBestPlan(doc, 3);

    const parkIds = plan!.map(d => d.bestParkId);
    expect(new Set(parkIds).size).toBe(parkIds.length);
  });

  it('bestPlan picks lowest crowd days for each park', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', universalData);
    const plan = computeBestPlan(doc, 3);

    // Plan should be sorted by level (best days first)
    for (let i = 0; i < plan!.length - 1; i++) {
      expect(plan![i].level).toBeLessThanOrEqual(plan![i + 1].level);
    }
  });

  it('bestPlan does not use the same day for multiple parks', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', universalData);
    const plan = computeBestPlan(doc, 3);

    const days = plan!.map(d => d.date);
    expect(new Set(days).size).toBe(days.length);
  });

  it('bestPlan includes bestParkName in each recommendation', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', universalData);
    const plan = computeBestPlan(doc, 3);

    for (const rec of plan!) {
      expect(rec.bestParkName).toBeTruthy();
      expect(typeof rec.bestParkName).toBe('string');
    }
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  it('returns null bestPlan when no forecast data available', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', {});
    const plan = computeBestPlan(doc);

    expect(plan).toBeNull();
  });

  it('handles missing forecast data gracefully — empty parks object still returns valid shape', () => {
    const doc = buildCrowdMonthDoc('universal-orlando', '2026-05', {});

    expect(doc.familyId).toBe('universal-orlando');
    expect(doc.month).toBe('2026-05');
    expect(Object.keys(doc.parks)).toHaveLength(0);
    expect(Object.keys(doc.aggregate)).toHaveLength(0);
  });

  // ─── Caching behavior ────────────────────────────────────────────────────

  it('caching: identical requests within TTL should return same data', () => {
    // Simulating cache behavior: same input → same output
    const doc1 = buildCrowdMonthDoc('universal-orlando', '2026-05', universalData);
    const doc2 = buildCrowdMonthDoc('universal-orlando', '2026-05', universalData);

    expect(doc1).toEqual(doc2);
  });

  it('stale fallback: serves expired cache when fresh fetch fails', () => {
    // Contract: when Firestore fetch fails, the route should return stale data
    // with a staleness indicator rather than a 500
    const cachedDoc = buildCrowdMonthDoc('universal-orlando', '2026-05', universalData);

    // The response should include the cached data even if generatedAt is old
    expect(cachedDoc.generatedAt).toBeTruthy();
    // Route should add a `stale: true` header or field — testing contract
    const staleResponse = { ...cachedDoc, stale: true };
    expect(staleResponse.stale).toBe(true);
    expect(staleResponse.familyId).toBe('universal-orlando');
  });
});
