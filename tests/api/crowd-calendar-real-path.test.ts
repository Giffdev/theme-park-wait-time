import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Regression coverage for the "real"/computed crowd-calendar path
 * (`computeFamilyCrowdDays` in src/app/api/crowd-calendar/route.ts).
 *
 * Two defects fixed here:
 *  1. `hasData:false` (schedule fetch failure/timeout) was treated the same
 *     as a legitimate `isOpen:false` result, collapsing "unknown" into
 *     CLOSED. Fixed to always surface NO_DATA when hasData is false.
 *  2. "Today" (used to decide whether to prefer live forecast data over
 *     historical aggregates) was computed once globally from the server's
 *     UTC clock, causing an off-by-one for any park whose local calendar
 *     date differs from UTC's at the time of the request. Fixed to resolve
 *     "today" per park using that park's own IANA timezone (sourced from
 *     its schedule status) via `getLocalDateString`.
 */

const WOF_UUID = 'bb731eae-7bd3-4713-bd7b-89d79b031743';

const mocks = vi.hoisted(() => ({
  aggregatesGet: vi.fn(),
  waitTimesGet: vi.fn(),
  batchGetParkOperatingStatus: vi.fn(),
}));

function makeRef(path: string[]): Record<string, unknown> {
  return {
    collection: (name: string) => makeRef([...path, name]),
    doc: (id: string) => makeRef([...path, id]),
    get: async () => {
      if (path[0] === 'crowdCalendar') {
        return { exists: false, data: () => undefined };
      }
      if (path[0] === 'forecastAggregates') {
        const parkId = path[1];
        const dow = path[3];
        return mocks.aggregatesGet(parkId, dow);
      }
      if (path[0] === 'waitTimes') {
        const parkId = path[1];
        return mocks.waitTimesGet(parkId);
      }
      return { exists: false, docs: [] };
    },
    set: async () => undefined,
  };
}

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: (name: string) => makeRef([name]) },
}));

// Keep the real aggregation implementations (computeParkCrowdDay etc.) —
// only stub the family lookup to a small single-park fixture family so the
// route takes the "real" computeFamilyCrowdDays branch, not the placeholder.
vi.mock('@/lib/crowd-calendar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crowd-calendar')>();
  return {
    ...actual,
    getParkFamily: (familyId: string) =>
      familyId === 'test-family'
        ? {
            id: 'test-family',
            name: 'Test Family',
            slug: 'test-family',
            parks: [{ parkId: WOF_UUID, parkName: 'Worlds of Fun' }],
          }
        : undefined,
  };
});

vi.mock('@/lib/parks/park-schedule-check', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/parks/park-schedule-check')>();
  return {
    ...actual,
    batchGetParkOperatingStatus: mocks.batchGetParkOperatingStatus,
  };
});

import { GET } from '@/app/api/crowd-calendar/route';

function request(month: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/crowd-calendar?familyId=test-family&month=${month}`
  );
}

function aggregateDoc(avgWait: number) {
  return {
    id: 'attraction-1',
    data: () => ({
      attractionId: 'attraction-1',
      attractionName: 'Test Coaster',
      totalSamples: 20,
      hourlyAverages: {
        '10': { avgWait, sampleCount: 5, stdDev: 2 },
        '14': { avgWait, sampleCount: 5, stdDev: 2 },
      },
      lastUpdated: new Date().toISOString(),
      oldestDataDate: '2026-01-01',
      newestDataDate: '2026-08-01',
    }),
  };
}

function fullMonthScheduleMap(dates: string[], timezone: string, overrides: Record<string, { isOpen: boolean; hasData: boolean }> = {}) {
  const perDate = new Map<string, { isOpen: boolean; hasData: boolean; timezone?: string }>();
  for (const date of dates) {
    perDate.set(date, { isOpen: true, hasData: true, timezone, ...overrides[date] });
  }
  return new Map([[WOF_UUID, perDate]]);
}

function monthDates(monthStr: string): string[] {
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) =>
    `${monthStr}-${String(i + 1).padStart(2, '0')}`
  );
}

describe('crowd-calendar real path: hasData semantics + per-park timezone "today"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every day-of-week has a qualifying aggregate so the route's
    // "hasRealData >= 50% of days" gate passes for the whole month.
    mocks.aggregatesGet.mockResolvedValue({ docs: [aggregateDoc(20)] });
    mocks.waitTimesGet.mockResolvedValue({ docs: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats hasData:false as NO_DATA, never CLOSED, in the computed path', async () => {
    const dates = monthDates('2026-08');
    mocks.batchGetParkOperatingStatus.mockResolvedValue(
      fullMonthScheduleMap(dates, 'UTC', {
        '2026-08-20': { isOpen: false, hasData: false },
      })
    );

    const response = await GET(request('2026-08'));
    expect(response.status).toBe(200);
    const data = await response.json();

    const day = data.days.find((d: { date: string }) => d.date === '2026-08-20');
    const parkStatus = day.parks.find((p: { parkId: string }) => p.parkId === WOF_UUID);
    expect(parkStatus.status).toBe('NO_DATA');
    expect(parkStatus.status).not.toBe('CLOSED');
  });

  it('keeps a legitimate no-OPERATING-segment day CLOSED when hasData is true', async () => {
    const dates = monthDates('2026-08');
    mocks.batchGetParkOperatingStatus.mockResolvedValue(
      fullMonthScheduleMap(dates, 'UTC', {
        '2026-08-21': { isOpen: false, hasData: true },
      })
    );

    const response = await GET(request('2026-08'));
    const data = await response.json();

    const day = data.days.find((d: { date: string }) => d.date === '2026-08-21');
    const parkStatus = day.parks.find((p: { parkId: string }) => p.parkId === WOF_UUID);
    expect(parkStatus.status).toBe('CLOSED');
  });

  it('resolves "today" using the park\'s own timezone rather than the server UTC date', async () => {
    // 2026-08-16T02:00:00Z is already 2026-08-15, 22:00 local in
    // America/New_York — the park-local calendar date is one day behind UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T02:00:00.000Z'));

    const dates = monthDates('2026-08');
    mocks.batchGetParkOperatingStatus.mockResolvedValue(
      fullMonthScheduleMap(dates, 'America/New_York')
    );
    // Live forecast data tagged for the park-LOCAL "today" (2026-08-15).
    mocks.waitTimesGet.mockResolvedValue({
      docs: [
        {
          id: 'attraction-1',
          data: () => ({
            forecast: [{ time: '2026-08-15T18:00:00.000Z', waitTime: 999 }],
          }),
        },
      ],
    });

    const response = await GET(request('2026-08'));
    const data = await response.json();

    const localToday = data.days.find((d: { date: string }) => d.date === '2026-08-15');
    const localTodayPark = localToday.parks.find((p: { parkId: string }) => p.parkId === WOF_UUID);
    // Live data (999 min) must win for the park-local "today", not aggregates.
    expect(localTodayPark.avgWaitMinutes).toBe(999);

    const utcToday = data.days.find((d: { date: string }) => d.date === '2026-08-16');
    const utcTodayPark = utcToday.parks.find((p: { parkId: string }) => p.parkId === WOF_UUID);
    // The UTC-calendar-day-only view must NOT be treated as "today" for this
    // park, so it falls back to the (non-999) historical aggregate value.
    expect(utcTodayPark.avgWaitMinutes).not.toBe(999);
  });
});
