import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

/**
 * Regression coverage for the crowd-calendar identity boundary.
 *
 * Data's backend fix made `/api/crowd-calendar` resolve schedule lookups to
 * canonical ThemeParks Wiki entity UUIDs and emit real/computed `parkId`
 * values as UUIDs (not slugs). `PARK_FAMILIES` (and the calendar page's park
 * toggle chips / `/parks/{slug}` links) still key parks by slug, since slugs
 * are the user-facing URL identity. Without a normalization boundary, a
 * UUID-keyed payload would never match the slug-keyed `enabledParks` set
 * used for filtering, silently hiding every park on the calendar.
 *
 * These tests render the *real* `CalendarDayCell` (unlike
 * crowd-calendar-disclosure.test.tsx, which mocks it) so the actual
 * `enabledParkIds.has(parkId)` filter executes, proving the calendar page's
 * `normalizeParkId` boundary keeps UUID-backed real data, and legacy
 * slug-keyed cached payloads, both filtering/rendering correctly.
 */

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const mockUseSearchParams = vi.fn(() => new URLSearchParams());
vi.mock('next/navigation', () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('lucide-react', () => ({
  AlertCircle: () => <span aria-hidden="true">!</span>,
  ChevronLeft: () => <span aria-hidden="true">‹</span>,
  ChevronRight: () => <span aria-hidden="true">›</span>,
}));

vi.mock('@/hooks/useAutoRefresh', () => ({
  useAutoRefresh: () => ({ isBackgroundRefreshing: false }),
}));

vi.mock('@/components/crowd-calendar/FamilySelector', () => ({
  FamilySelector: ({ onFamilyChange }: { onFamilyChange: (familyId: string) => void }) => (
    <div>
      <button onClick={() => onFamilyChange('worlds-of-fun')}>Choose Worlds of Fun</button>
      <button onClick={() => onFamilyChange('seaworld-orlando')}>Choose SeaWorld Orlando</button>
    </div>
  ),
}));

vi.mock('@/components/crowd-calendar/MiniMonth', () => ({
  MiniMonth: ({
    month,
    days,
  }: {
    month: string;
    days: Array<{ parks: Array<{ parkName: string }> }>;
  }) => (
    <div data-testid="mini-month">{days[0]?.parks[0]?.parkName}:{month}</div>
  ),
}));

// Two single-park families mirroring the real registry shape: a slug that
// happens to equal the family id (Worlds of Fun) and a distinct slug within
// a differently-named family (SeaWorld Orlando) — canonical UUIDs match the
// real `park-registry.ts` entries.
const WORLDS_OF_FUN_UUID = 'bb731eae-7bd3-4713-bd7b-89d79b031743';
const OCEANS_OF_FUN_UUID = 'b5a89552-3381-47ad-88cc-ab0087019c8b';
const SEAWORLD_ORLANDO_UUID = '27d64dee-d85e-48dc-ad6d-8077445cd946';

vi.mock('@/lib/constants', () => ({
  PARK_FAMILIES: [
    {
      id: 'worlds-of-fun',
      name: 'Worlds of Fun',
      parks: [
        { id: 'worlds-of-fun', name: 'Worlds of Fun' },
        { id: 'oceans-of-fun', name: 'Oceans of Fun' },
      ],
    },
    { id: 'seaworld-orlando', name: 'SeaWorld Orlando', parks: [{ id: 'seaworld-orlando', name: 'SeaWorld Orlando' }] },
  ],
  CROWD_LEVEL_COLORS: {
    1: { hex: '#0f0', label: 'Low' },
    2: { hex: '#ff0', label: 'Moderate' },
    3: { hex: '#f90', label: 'High' },
    4: { hex: '#f00', label: 'Very High' },
  },
  resolveScheduleParkId: (slug: string) => {
    if (slug === 'worlds-of-fun') return WORLDS_OF_FUN_UUID;
    if (slug === 'oceans-of-fun') return OCEANS_OF_FUN_UUID;
    if (slug === 'seaworld-orlando') return SEAWORLD_ORLANDO_UUID;
    return null;
  },
}));

import CalendarPage from '@/app/calendar/page';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const DATA_QUALITY = {
  source: 'historical' as const,
  coverageRatio: 0.9,
  daysWithData: 27,
  totalDays: 30,
};

function crowdMonthResponse(
  familyId: string,
  parkId: string,
  parkName: string,
  month: string,
  parkOverrides: Partial<{ status: 'OPEN' | 'CLOSED' | 'NO_DATA'; crowdLevel: 1 | 2 | 3 | 4; avgWaitMinutes: number }> = {},
) {
  return {
    familyId,
    familyName: parkName,
    month,
    parks: [{ id: parkId, name: parkName }],
    days: [{
      date: `${month}-01`,
      aggregateCrowdLevel: 2,
      parks: [{
        parkId,
        parkName,
        status: 'OPEN' as const,
        crowdLevel: 2,
        avgWaitMinutes: 25,
        ...parkOverrides,
      }],
    }],
    bestPlan: null,
    dataQuality: DATA_QUALITY,
  };
}

function worldsFamilyMonthResponse(month: string) {
  return {
    familyId: 'worlds-of-fun',
    familyName: 'Worlds of Fun',
    month,
    parks: [
      { id: WORLDS_OF_FUN_UUID, name: 'Worlds of Fun' },
      { id: OCEANS_OF_FUN_UUID, name: 'Oceans of Fun' },
    ],
    days: [{
      date: `${month}-01`,
      aggregateCrowdLevel: 2 as const,
      parks: [
        {
          parkId: WORLDS_OF_FUN_UUID,
          parkName: 'Worlds of Fun',
          status: 'OPEN' as const,
          crowdLevel: 2 as const,
          avgWaitMinutes: 25,
        },
        {
          parkId: OCEANS_OF_FUN_UUID,
          parkName: 'Oceans of Fun',
          status: 'OPEN' as const,
          crowdLevel: 2 as const,
          avgWaitMinutes: 20,
        },
      ],
    }],
    bestPlan: null,
    dataQuality: DATA_QUALITY,
  };
}

function mockFetchWith(build: (month: string) => ReturnType<typeof crowdMonthResponse>) {
  mockFetch.mockImplementation((url: string) => Promise.resolve({
    ok: true,
    json: async () => build(new URL(url, 'http://localhost').searchParams.get('month') ?? currentMonth()),
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('Crowd Calendar identity boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('renders and filters Worlds of Fun when the API returns canonical UUID-keyed parkIds', async () => {
    mockFetchWith((month) => crowdMonthResponse('worlds-of-fun', WORLDS_OF_FUN_UUID, 'Worlds of Fun', month));

    render(<CalendarPage />);

    // The park toggle chip is slug-keyed (user-facing), and stays enabled by
    // default — proving `enabledParks` (seeded via normalizeParkId) matches
    // the canonical UUID the day cell was filtered against.
    expect(await screen.findByText('Worlds of Fun')).toBeInTheDocument();
    expect((await screen.findAllByTitle(/Worlds of Fun: Moderate/i)).length).toBeGreaterThan(0);
    // Slug preserved for the user-facing link, not the UUID.
    expect(screen.getByTitle('View Worlds of Fun live wait times')).toHaveAttribute(
      'href',
      '/parks/worlds-of-fun',
    );
  });

  it('renders both Worlds of Fun parks in the current month, not only future previews', async () => {
    mockFetchWith((month) => worldsFamilyMonthResponse(month));

    render(<CalendarPage />);

    expect((await screen.findAllByTitle(/Worlds of Fun: Moderate/i)).length).toBeGreaterThan(0);
    expect((await screen.findAllByTitle(/Oceans of Fun: Moderate/i)).length).toBeGreaterThan(0);
    expect(screen.getByText(
      new Date().toLocaleString('default', { month: 'long', year: 'numeric' })
    )).toBeInTheDocument();
  });

  it('renders and filters SeaWorld Orlando when the API returns canonical UUID-keyed parkIds', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('family=seaworld-orlando'));
    mockFetchWith((month) => crowdMonthResponse('seaworld-orlando', SEAWORLD_ORLANDO_UUID, 'SeaWorld Orlando', month));

    render(<CalendarPage />);

    expect((await screen.findAllByTitle(/SeaWorld Orlando: Moderate/i)).length).toBeGreaterThan(0);
    expect(screen.getByTitle('View SeaWorld Orlando live wait times')).toHaveAttribute(
      'href',
      '/parks/seaworld-orlando',
    );
  });

  it('degrades safely for legacy slug-keyed cached payloads during the rollout cache TTL', async () => {
    // Simulates a Firestore-cached response generated before Data's fix,
    // still within the 6h /api/crowd-calendar cache TTL: parkId is the old
    // slug, not the canonical UUID.
    mockFetchWith((month) => crowdMonthResponse('worlds-of-fun', 'worlds-of-fun', 'Worlds of Fun', month));

    render(<CalendarPage />);

    // Still renders/filters correctly: normalizeParkId maps the legacy slug
    // to the same canonical UUID the enabledParks set uses.
    expect((await screen.findAllByTitle(/Worlds of Fun: Moderate/i)).length).toBeGreaterThan(0);
  });

  it('preserves CLOSED vs NO_DATA distinctions for canonical UUID-keyed payloads', async () => {
    mockFetchWith((month) =>
      crowdMonthResponse('worlds-of-fun', WORLDS_OF_FUN_UUID, 'Worlds of Fun', month, { status: 'CLOSED' }));

    render(<CalendarPage />);

    expect((await screen.findAllByTitle('Worlds of Fun: Closed')).length).toBeGreaterThan(0);

    vi.clearAllMocks();
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockFetchWith((month) =>
      crowdMonthResponse('worlds-of-fun', WORLDS_OF_FUN_UUID, 'Worlds of Fun', month, { status: 'NO_DATA' }));

    render(<CalendarPage />);

    expect((await screen.findAllByTitle('Worlds of Fun: No Data')).length).toBeGreaterThan(0);
  });

  it('ignores an older family response that finishes after the selected family loads', async () => {
    const delayedWorldsResponse = deferred<{
      ok: boolean;
      json: () => Promise<ReturnType<typeof crowdMonthResponse>>;
    }>();
    let worldsRequestCount = 0;

    mockFetch.mockImplementation((url: string) => {
      const params = new URL(url, 'http://localhost').searchParams;
      const familyId = params.get('familyId');
      const month = params.get('month') ?? currentMonth();

      if (familyId === 'worlds-of-fun' && worldsRequestCount++ === 0) {
        return delayedWorldsResponse.promise;
      }

      const isSeaWorld = familyId === 'seaworld-orlando';
      return Promise.resolve({
        ok: true,
        json: async () => crowdMonthResponse(
          familyId ?? 'worlds-of-fun',
          isSeaWorld ? SEAWORLD_ORLANDO_UUID : WORLDS_OF_FUN_UUID,
          isSeaWorld ? 'SeaWorld Orlando' : 'Worlds of Fun',
          month,
        ),
      });
    });

    render(<CalendarPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose SeaWorld Orlando' }));

    expect((await screen.findAllByTitle(/SeaWorld Orlando: Moderate/i)).length).toBeGreaterThan(0);

    await act(async () => {
      delayedWorldsResponse.resolve({
        ok: true,
        json: async () => crowdMonthResponse(
          'worlds-of-fun',
          WORLDS_OF_FUN_UUID,
          'Worlds of Fun',
          currentMonth(),
        ),
      });
      await delayedWorldsResponse.promise;
    });

    expect(worldsRequestCount).toBe(1);
    expect((await screen.findAllByTitle(/SeaWorld Orlando: Moderate/i)).length).toBeGreaterThan(0);
    expect(screen.queryByTitle(/Worlds of Fun: Moderate/i)).not.toBeInTheDocument();
  });

  it('ignores older future-month responses after a different family finishes loading', async () => {
    const delayedWorldsFuture = deferred<{
      ok: boolean;
      json: () => Promise<ReturnType<typeof worldsFamilyMonthResponse>>;
    }>();
    const nextMonth = (() => {
      const date = new Date();
      date.setMonth(date.getMonth() + 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    })();

    mockFetch.mockImplementation((url: string) => {
      const params = new URL(url, 'http://localhost').searchParams;
      const familyId = params.get('familyId') ?? 'worlds-of-fun';
      const month = params.get('month') ?? currentMonth();

      if (familyId === 'worlds-of-fun' && month === nextMonth) {
        return delayedWorldsFuture.promise;
      }

      const isSeaWorld = familyId === 'seaworld-orlando';
      return Promise.resolve({
        ok: true,
        json: async () => isSeaWorld
          ? crowdMonthResponse(
              familyId,
              SEAWORLD_ORLANDO_UUID,
              'SeaWorld Orlando',
              month,
            )
          : worldsFamilyMonthResponse(month),
      });
    });

    render(<CalendarPage />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole('button', { name: 'Choose SeaWorld Orlando' }));
    expect((await screen.findAllByTitle(/SeaWorld Orlando: Moderate/i)).length).toBeGreaterThan(0);
    expect(await screen.findAllByText(/^SeaWorld Orlando:\d{4}-\d{2}$/)).toHaveLength(2);

    await act(async () => {
      delayedWorldsFuture.resolve({
        ok: true,
        json: async () => worldsFamilyMonthResponse(nextMonth),
      });
      await delayedWorldsFuture.promise;
    });

    const previews = screen.getAllByTestId('mini-month');
    expect(previews).toHaveLength(2);
    expect(previews.every((preview) => preview.textContent?.startsWith('SeaWorld Orlando:'))).toBe(true);
  });
});
