import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

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

vi.mock('@/lib/constants', () => ({
  PARK_FAMILIES: [
    {
      id: 'walt-disney-world',
      name: 'Walt Disney World',
      parks: [
        { id: 'magic-kingdom', name: 'Magic Kingdom' },
        { id: 'epcot', name: 'EPCOT' },
        { id: 'hollywood-studios', name: 'Hollywood Studios' },
        { id: 'animal-kingdom', name: 'Animal Kingdom' },
      ],
    },
    {
      id: 'universal-orlando',
      name: 'Universal Orlando',
      parks: [{ id: 'universal-studios', name: 'Universal Studios' }],
    },
  ],
  CROWD_LEVEL_COLORS: {
    1: { hex: '#0f0', label: 'Low' },
    2: { hex: '#ff0', label: 'Moderate' },
    3: { hex: '#f90', label: 'High' },
    4: { hex: '#f00', label: 'Very High' },
  },
  resolveScheduleParkId: () => null,
}));

vi.mock('@/components/crowd-calendar/FamilySelector', () => ({
  FamilySelector: ({ onFamilyChange }: { onFamilyChange: (familyId: string) => void }) => (
    <div>
      <button onClick={() => onFamilyChange('walt-disney-world')}>Choose Walt Disney World</button>
      <button onClick={() => onFamilyChange('universal-orlando')}>Choose Universal Orlando</button>
    </div>
  ),
}));

vi.mock('@/components/crowd-calendar/CalendarDayCell', () => ({
  CalendarDayCell: ({
    day,
  }: {
    day: { parks: Array<{ parkName: string; status: string }> } | null;
  }) => day ? (
    <div data-testid="loaded-calendar">
      {day.parks[0]?.parkName}: {day.parks[0]?.status}
    </div>
  ) : <div />,
}));

vi.mock('@/components/crowd-calendar/MiniMonth', () => ({
  MiniMonth: ({ month }: { month: string }) => <div data-testid="future-preview">{month}</div>,
}));

import CalendarPage from '@/app/calendar/page';

const DATA_QUALITY = {
  source: 'historical' as const,
  coverageRatio: 0.9,
  daysWithData: 27,
  totalDays: 30,
};

function monthAtOffset(offset = 0): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthLabel(): string {
  return new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
}

function monthLabelAtOffset(offset: number): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' });
}

function crowdMonth(familyId: string, month: string) {
  const isDisney = familyId === 'walt-disney-world';
  const parkId = isDisney ? 'magic-kingdom' : 'universal-studios';
  const parkName = isDisney ? 'Magic Kingdom' : 'Universal Studios';

  return {
    familyId,
    familyName: isDisney ? 'Walt Disney World' : 'Universal Orlando',
    month,
    parks: [{ id: parkId, name: parkName }],
    days: [{
      date: `${month}-01`,
      aggregateCrowdLevel: 2 as const,
      parks: [{
        parkId,
        parkName,
        status: 'OPEN' as const,
        crowdLevel: 2 as const,
        avgWaitMinutes: 25,
      }],
    }],
    bestPlan: null,
    dataQuality: DATA_QUALITY,
  };
}

function responseFor(familyId: string, month: string) {
  return {
    ok: true,
    json: async () => crowdMonth(familyId, month),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('Crowd Calendar loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('shows accessible park and month context during a delayed initial load', async () => {
    const delayedDisney = deferred<ReturnType<typeof responseFor>>();

    mockFetch.mockImplementation((url: string) => {
      const params = new URL(url, 'http://localhost').searchParams;
      const familyId = params.get('familyId') ?? 'walt-disney-world';
      const month = params.get('month') ?? monthAtOffset();

      return month === monthAtOffset()
        ? delayedDisney.promise
        : Promise.resolve(responseFor(familyId, month));
    });

    render(<CalendarPage />);

    const loadingStatus = screen.getByRole('status');
    expect(loadingStatus).toHaveAttribute('aria-busy', 'true');
    expect(loadingStatus).toHaveTextContent('Loading Walt Disney World crowd calendar');
    expect(loadingStatus).toHaveTextContent(`Fetching verified crowd estimates for ${currentMonthLabel()}`);
    expect(screen.queryByTestId('loaded-calendar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('future-preview')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Closed')).not.toBeInTheDocument();
    expect(screen.queryByText('No Data')).not.toBeInTheDocument();

    await act(async () => {
      delayedDisney.resolve(responseFor('walt-disney-world', monthAtOffset()));
      await delayedDisney.promise;
    });

    expect(await screen.findByText('Magic Kingdom: OPEN')).toBeInTheDocument();
    expect(await screen.findAllByTestId('future-preview')).toHaveLength(2);
    expect(screen.queryByText('Loading Walt Disney World crowd calendar')).not.toBeInTheDocument();
  });

  it('clears the old family immediately while a newly selected Walt Disney World calendar loads', async () => {
    const delayedDisney = deferred<ReturnType<typeof responseFor>>();
    mockUseSearchParams.mockReturnValue(new URLSearchParams('family=universal-orlando'));

    mockFetch.mockImplementation((url: string) => {
      const params = new URL(url, 'http://localhost').searchParams;
      const familyId = params.get('familyId') ?? 'universal-orlando';
      const month = params.get('month') ?? monthAtOffset();

      if (familyId === 'walt-disney-world' && month === monthAtOffset()) {
        return delayedDisney.promise;
      }
      return Promise.resolve(responseFor(familyId, month));
    });

    render(<CalendarPage />);

    expect(await screen.findByText('Universal Studios: OPEN')).toBeInTheDocument();
    expect(await screen.findAllByTestId('future-preview')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Choose Walt Disney World' }));

    const loadingStatus = screen.getByRole('status');
    expect(loadingStatus).toHaveTextContent('Loading Walt Disney World crowd calendar');
    expect(loadingStatus).toHaveTextContent(currentMonthLabel());
    expect(screen.queryByText('Universal Studios: OPEN')).not.toBeInTheDocument();
    expect(screen.queryByTestId('future-preview')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await act(async () => {
      delayedDisney.resolve(responseFor('walt-disney-world', monthAtOffset()));
      await delayedDisney.promise;
    });

    expect(await screen.findByText('Magic Kingdom: OPEN')).toBeInTheDocument();
    expect(await screen.findAllByTestId('future-preview')).toHaveLength(2);
    expect(screen.queryByText('Universal Studios: OPEN')).not.toBeInTheDocument();
  });

  it('clears the old month and previews immediately while the next month loads', async () => {
    const delayedNextMonth = deferred<ReturnType<typeof responseFor>>();
    let nextMonthRequests = 0;

    mockFetch.mockImplementation((url: string) => {
      const params = new URL(url, 'http://localhost').searchParams;
      const familyId = params.get('familyId') ?? 'walt-disney-world';
      const month = params.get('month') ?? monthAtOffset();

      if (month === monthAtOffset(1) && ++nextMonthRequests === 2) {
        return delayedNextMonth.promise;
      }
      return Promise.resolve(responseFor(familyId, month));
    });

    render(<CalendarPage />);

    expect(await screen.findByText('Magic Kingdom: OPEN')).toBeInTheDocument();
    expect(await screen.findAllByTestId('future-preview')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    const loadingStatus = screen.getByRole('status');
    expect(loadingStatus).toHaveTextContent('Loading Walt Disney World crowd calendar');
    expect(loadingStatus).toHaveTextContent(monthLabelAtOffset(1));
    expect(screen.queryByTestId('loaded-calendar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('future-preview')).not.toBeInTheDocument();

    await act(async () => {
      delayedNextMonth.resolve(responseFor('walt-disney-world', monthAtOffset(1)));
      await delayedNextMonth.promise;
    });

    expect(await screen.findByText('Magic Kingdom: OPEN')).toBeInTheDocument();
    expect(await screen.findAllByTestId('future-preview')).toHaveLength(2);
  });
});
