import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  batchGetParkOperatingStatus: vi.fn(),
  resolveScheduleParkId: vi.fn(() => null as string | null),
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

vi.mock('@/lib/crowd-calendar', () => ({
  getParkFamily: () => null,
  computeParkCrowdDay: vi.fn(),
  buildFamilyCrowdDay: vi.fn(),
  computeBestPlan: vi.fn(),
}));

vi.mock('@/lib/constants', () => ({
  PARK_FAMILIES: [{
    id: 'test-family',
    name: 'Test Family',
    parks: [{ id: 'test-park', name: 'Test Park' }],
  }],
  // Default: unresolvable slug -> null -> NO_DATA (mirrors production
  // behavior for a park missing from the registry). Individual tests can
  // override this to exercise a resolvable park hitting the real upstream
  // failure shape instead.
  resolveScheduleParkId: mocks.resolveScheduleParkId,
}));

vi.mock('@/lib/parks/park-schedule-check', () => ({
  batchGetParkOperatingStatus: mocks.batchGetParkOperatingStatus,
}));

import { GET } from '@/app/api/crowd-calendar/route';

function request(month = '2026-08'): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/crowd-calendar?familyId=test-family&month=${month}`,
  );
}

function cachedMonth(generatedAt: string) {
  return {
    familyId: 'test-family',
    familyName: 'Test Family',
    month: '2026-08',
    parks: [{ id: 'test-park', name: 'Test Park' }],
    days: [
      {
        date: '2026-08-01',
        aggregateCrowdLevel: 2,
        parks: [{
          parkId: 'test-park',
          parkName: 'Test Park',
          status: 'OPEN',
          crowdLevel: 2,
          avgWaitMinutes: 25,
        }],
      },
      {
        date: '2026-08-02',
        aggregateCrowdLevel: 3,
        parks: [{
          parkId: 'test-park',
          parkName: 'Test Park',
          status: 'OPEN',
          crowdLevel: 3,
          avgWaitMinutes: 40,
        }],
      },
    ],
    bestPlan: null,
    generatedAt,
  };
}

describe('GET /api/crowd-calendar data quality', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cacheSet.mockResolvedValue(undefined);
    mocks.batchGetParkOperatingStatus.mockResolvedValue(new Map());
    mocks.resolveScheduleParkId.mockReturnValue(null);
  });

  it('adds historical coverage metadata to a qualifying fresh cache', async () => {
    const generatedAt = new Date().toISOString();
    mocks.cacheGet.mockResolvedValue({
      exists: true,
      data: () => cachedMonth(generatedAt),
    });

    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.dataQuality).toEqual({
      source: 'historical',
      coverageRatio: 1,
      daysWithData: 2,
      totalDays: 2,
      generatedAt,
    });
  });

  it('labels a qualifying expired cache as stale-cache with preserved generation time', async () => {
    const generatedAt = '2026-07-01T00:00:00.000Z';
    mocks.cacheGet.mockResolvedValue({
      exists: true,
      data: () => cachedMonth(generatedAt),
    });

    const response = await GET(request());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stale).toBe(true);
    expect(data.dataQuality).toEqual({
      source: 'stale-cache',
      coverageRatio: 1,
      daysWithData: 2,
      totalDays: 2,
      generatedAt,
    });
  });

  it('reports schedule-aware fallback as estimated with zero historical coverage', async () => {
    mocks.cacheGet.mockResolvedValue({ exists: false, data: () => undefined });

    const response = await GET(request('2026-02'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.dataQuality).toEqual(expect.objectContaining({
      source: 'estimated',
      coverageRatio: 0,
      daysWithData: 0,
      totalDays: 28,
      generatedAt: expect.any(String),
    }));
    expect(data.days).toHaveLength(28);
    expect(data.days.every((day: { parks: Array<{ status: string }> }) =>
      day.parks.every((park) => park.status === 'NO_DATA')))
      .toBe(true);
  });

  it('surfaces the real upstream failure shape ({isOpen:false, hasData:false} per date) as NO_DATA, never CLOSED', async () => {
    // Regression coverage for Defect E: an empty Map() (as used by the other
    // tests above) only proves the "no entry at all" branch. Production
    // failures actually return a *populated* per-date Map whose entries carry
    // isOpen:false alongside hasData:false — this must be distinguished from
    // a legitimate CLOSED day (which also has isOpen:false, but hasData:true).
    mocks.cacheGet.mockResolvedValue({ exists: false, data: () => undefined });
    mocks.resolveScheduleParkId.mockReturnValue('11111111-1111-1111-1111-111111111111');

    const dates: string[] = [];
    for (let d = 1; d <= 28; d++) {
      dates.push(`2026-02-${String(d).padStart(2, '0')}`);
    }
    const failureEntries = new Map(
      dates.map((date) => [date, { isOpen: false, hasData: false }])
    );
    mocks.batchGetParkOperatingStatus.mockResolvedValue(
      new Map([['11111111-1111-1111-1111-111111111111', failureEntries]])
    );

    const response = await GET(request('2026-02'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.days).toHaveLength(28);
    expect(
      data.days.every((day: { parks: Array<{ status: string }> }) =>
        day.parks.every((park) => park.status === 'NO_DATA'))
    ).toBe(true);
    // None of the failure-shaped days should ever be misreported as CLOSED.
    expect(
      data.days.some((day: { parks: Array<{ status: string }> }) =>
        day.parks.some((park) => park.status === 'CLOSED'))
    ).toBe(false);
  });

  it('preserves a legitimate CLOSED day (valid schedule data, zero OPERATING segments) distinct from NO_DATA', async () => {
    // Same shape of test as above, but hasData:true with isOpen:false — a
    // real, successfully-fetched schedule showing the park simply isn't
    // operating that day (e.g. Worlds of Fun's post-Labor-Day weekday
    // closures, or Oceans of Fun's reduced weekday summer schedule). The
    // hasData-before-isOpen fix must not over-correct this into NO_DATA.
    mocks.cacheGet.mockResolvedValue({ exists: false, data: () => undefined });
    mocks.resolveScheduleParkId.mockReturnValue('11111111-1111-1111-1111-111111111111');

    const dates: string[] = [];
    for (let d = 1; d <= 28; d++) {
      dates.push(`2026-02-${String(d).padStart(2, '0')}`);
    }
    const legitimateClosedEntries = new Map(
      dates.map((date) => [date, { isOpen: false, hasData: true }])
    );
    mocks.batchGetParkOperatingStatus.mockResolvedValue(
      new Map([['11111111-1111-1111-1111-111111111111', legitimateClosedEntries]])
    );

    const response = await GET(request('2026-02'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.days).toHaveLength(28);
    expect(
      data.days.every((day: { parks: Array<{ status: string }> }) =>
        day.parks.every((park) => park.status === 'CLOSED'))
    ).toBe(true);
    expect(
      data.days.some((day: { parks: Array<{ status: string }> }) =>
        day.parks.some((park) => park.status === 'NO_DATA'))
    ).toBe(false);
  });
});
