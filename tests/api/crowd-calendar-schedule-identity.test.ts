import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Regression coverage for the "Worlds of Fun shows CLOSED in August" bug.
 *
 * Root cause (fallback/placeholder crowd-calendar path):
 *  1. The frontend-facing `PARK_FAMILIES` registry (src/lib/constants.ts) is
 *     keyed by park *slug* (needed for `/parks/{slug}` routing), but the
 *     ThemeParks Wiki schedule API requires the entity *UUID*. The
 *     placeholder path previously sent the slug straight through, which
 *     never resolved to real schedule data for any park reached via this
 *     path (more common for sparse-data regional parks like Worlds of Fun).
 *  2. `getParkOperatingStatus`/`batchGetParkOperatingStatus` return
 *     `{ isOpen: false, hasData: false }` on any fetch failure/timeout/no
 *     data, and the route previously treated that identically to a
 *     legitimate `isOpen: false` (CLOSED) result — collapsing "unknown"
 *     into "closed".
 *
 * These tests exercise the real route (only `firebase/admin`,
 * `@/lib/crowd-calendar`'s `getParkFamily`, and
 * `batchGetParkOperatingStatus` are mocked) to prove:
 *  - the UUID (not the slug) is sent upstream for schedule checks,
 *  - an unresolvable slug is simply omitted rather than sent raw,
 *  - hasData:false always yields NO_DATA, never CLOSED,
 *  - a valid August OPERATING day yields OPEN,
 *  - a valid schedule with no OPERATING segment is legitimately CLOSED,
 *  - dataQuality metadata stays accurate ('estimated' fallback source).
 */

const WOF_UUID = 'bb731eae-7bd3-4713-bd7b-89d79b031743'; // real Worlds of Fun entity id

const mocks = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  batchGetParkOperatingStatus: vi.fn(),
}));

function chainableFirestoreRef(): Record<string, unknown> {
  const ref: Record<string, unknown> = {};
  ref.collection = vi.fn().mockReturnValue(ref);
  ref.doc = vi.fn().mockReturnValue(ref);
  ref.get = mocks.cacheGet;
  ref.set = mocks.cacheSet;
  return ref;
}

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => chainableFirestoreRef(),
  },
}));

// No canonical family definition for 'test-family' — forces the route down
// the PARK_FAMILIES-only placeholder/fallback path, which is the path that
// was actually being exercised in production for Worlds of Fun.
vi.mock('@/lib/crowd-calendar', () => ({
  getParkFamily: () => undefined,
  computeParkCrowdDay: vi.fn(),
  buildFamilyCrowdDay: vi.fn(),
  computeBestPlan: vi.fn(),
}));

// Keep the REAL resolveScheduleParkId (backed by the real park-registry) so
// the slug -> UUID translation under test is the actual production logic,
// not a stub. Only PARK_FAMILIES is overridden to a small fixture family.
vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/constants')>();
  return {
    ...actual,
    PARK_FAMILIES: [
      {
        id: 'test-family',
        name: 'Test Family',
        parks: [
          { id: 'worlds-of-fun', name: 'Worlds of Fun' },
          { id: 'unmapped-park', name: 'Unmapped Park' },
        ],
      },
    ],
  };
});

vi.mock('@/lib/parks/park-schedule-check', () => ({
  batchGetParkOperatingStatus: mocks.batchGetParkOperatingStatus,
}));

import { GET } from '@/app/api/crowd-calendar/route';

function request(month = '2026-08'): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/crowd-calendar?familyId=test-family&month=${month}`
  );
}

function findPark(data: { days: Array<{ date: string; parks: Array<{ parkId: string; status: string }> }> }, date: string, parkId: string) {
  const day = data.days.find((d) => d.date === date);
  return day?.parks.find((p) => p.parkId === parkId);
}

describe('crowd-calendar placeholder path: schedule identity + hasData semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheGet.mockResolvedValue({ exists: false, data: () => undefined });
    mocks.cacheSet.mockResolvedValue(undefined);
    mocks.batchGetParkOperatingStatus.mockResolvedValue(new Map());
  });

  it('sends the resolved UUID (not the slug) upstream for schedule checks', async () => {
    await GET(request());

    expect(mocks.batchGetParkOperatingStatus).toHaveBeenCalledTimes(1);
    const [parkIdsArg] = mocks.batchGetParkOperatingStatus.mock.calls[0] as [string[], string[]];
    expect(parkIdsArg).toContain(WOF_UUID);
    expect(parkIdsArg).not.toContain('worlds-of-fun');
  });

  it('omits an unresolvable slug rather than sending it raw', async () => {
    await GET(request());

    const [parkIdsArg] = mocks.batchGetParkOperatingStatus.mock.calls[0] as [string[], string[]];
    expect(parkIdsArg).not.toContain('unmapped-park');
  });

  it('treats hasData:false (fetch failure/timeout) as NO_DATA, never CLOSED', async () => {
    mocks.batchGetParkOperatingStatus.mockImplementation(async (parkIds: string[], dates: string[]) => {
      const perDate = new Map<string, { isOpen: boolean; hasData: boolean }>();
      for (const date of dates) {
        perDate.set(date, { isOpen: false, hasData: false });
      }
      return new Map([[WOF_UUID, perDate]]);
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    const data = await response.json();

    const statuses = data.days.map(
      (d: { parks: Array<{ parkId: string; status: string }> }) =>
        d.parks.find((p) => p.parkId === 'worlds-of-fun')?.status
    );
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((s: string) => s === 'NO_DATA')).toBe(true);
    expect(statuses).not.toContain('CLOSED');
  });

  it('reports a valid August day with an OPERATING segment as OPEN', async () => {
    mocks.batchGetParkOperatingStatus.mockImplementation(async (parkIds: string[], dates: string[]) => {
      const perDate = new Map<string, { isOpen: boolean; hasData: boolean }>();
      for (const date of dates) {
        perDate.set(date, { isOpen: true, hasData: true });
      }
      return new Map([[WOF_UUID, perDate]]);
    });

    const response = await GET(request('2026-08'));
    const data = await response.json();

    const status = findPark(data, '2026-08-15', 'worlds-of-fun')?.status;
    expect(status).toBe('OPEN');
  });

  it('reports a valid schedule with no OPERATING segment as legitimate CLOSED', async () => {
    mocks.batchGetParkOperatingStatus.mockImplementation(async (parkIds: string[], dates: string[]) => {
      const perDate = new Map<string, { isOpen: boolean; hasData: boolean }>();
      for (const date of dates) {
        // Valid, successful schedule fetch that legitimately has zero
        // OPERATING segments for this date (e.g. an off-season closure day).
        perDate.set(date, { isOpen: false, hasData: true });
      }
      return new Map([[WOF_UUID, perDate]]);
    });

    const response = await GET(request());
    const data = await response.json();

    const status = findPark(data, '2026-08-15', 'worlds-of-fun')?.status;
    expect(status).toBe('CLOSED');
  });

  it('keeps dataQuality metadata accurate for the estimated fallback source', async () => {
    mocks.batchGetParkOperatingStatus.mockImplementation(async (parkIds: string[], dates: string[]) => {
      const perDate = new Map<string, { isOpen: boolean; hasData: boolean }>();
      for (const date of dates) {
        perDate.set(date, { isOpen: true, hasData: true });
      }
      return new Map([[WOF_UUID, perDate]]);
    });

    const response = await GET(request('2026-08'));
    const data = await response.json();

    expect(data.dataQuality).toEqual(
      expect.objectContaining({
        source: 'estimated',
        totalDays: 31,
        generatedAt: expect.any(String),
      })
    );
  });
});
