import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
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
  PARK_FAMILIES: [{
    id: 'test-family',
    name: 'Test Family',
    parks: [{ id: 'test-park', name: 'Test Park' }],
  }],
  CROWD_LEVEL_COLORS: {
    1: { hex: '#0f0', label: 'Low' },
    2: { hex: '#ff0', label: 'Moderate' },
    3: { hex: '#f90', label: 'High' },
    4: { hex: '#f00', label: 'Very High' },
  },
  // No slug in these fixtures resolves to a canonical UUID — every id
  // already passes through the calendar page's normalizeParkId() unchanged,
  // matching legacy/placeholder-shaped fixtures used by these tests.
  resolveScheduleParkId: () => null,
}));

vi.mock('@/components/crowd-calendar/FamilySelector', () => ({
  FamilySelector: () => <div>Test Family</div>,
}));

vi.mock('@/components/crowd-calendar/CalendarDayCell', () => ({
  CalendarDayCell: ({ dayNumber }: { dayNumber: number | null }) => (
    <div data-testid={dayNumber ? `day-${dayNumber}` : 'blank-day'} />
  ),
}));

vi.mock('@/components/crowd-calendar/MiniMonth', () => ({
  MiniMonth: () => <div data-testid="mini-month" />,
}));

import CalendarPage from '@/app/calendar/page';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function crowdMonth(dataQuality?: {
  source: 'historical' | 'stale-cache' | 'estimated';
  coverageRatio: number;
  daysWithData: number;
  totalDays: number;
}, month = currentMonth(), stale = false) {
  return {
    familyId: 'test-family',
    familyName: 'Test Family',
    month,
    parks: [{ id: 'test-park', name: 'Test Park' }],
    days: [{
      date: `${month}-01`,
      aggregateCrowdLevel: 2,
      parks: [{
        parkId: 'test-park',
        parkName: 'Test Park',
        status: 'OPEN',
        crowdLevel: 2,
        avgWaitMinutes: 25,
      }],
    }],
    bestPlan: null,
    stale,
    ...(dataQuality ? { dataQuality } : {}),
  };
}

describe('Crowd Calendar data disclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('labels estimated, limited-coverage data and removes unsupported claims', async () => {
    mockFetch.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: async () => crowdMonth(
        {
          source: 'estimated',
          coverageRatio: 0.25,
          daysWithData: 7,
          totalDays: 28,
        },
        new URL(url, 'http://localhost').searchParams.get('month') ?? currentMonth(),
      ),
    }));

    render(<CalendarPage />);

    expect(await screen.findByText('Limited-data estimate')).toBeInTheDocument();
    expect(screen.getByText(/Historical coverage is 25% \(7 of 28 days\)/)).toBeInTheDocument();
    expect(screen.getByText(/directional, not measured crowd conditions/i)).toBeInTheDocument();
    expect(screen.queryByText(/Plan the best days for your visit/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Avg temps/i)).not.toBeInTheDocument();
  });

  it('describes well-covered historical data as planning guidance rather than live measurement', async () => {
    mockFetch.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: async () => crowdMonth(
        {
          source: 'historical',
          coverageRatio: 0.75,
          daysWithData: 21,
          totalDays: 28,
        },
        new URL(url, 'http://localhost').searchParams.get('month') ?? currentMonth(),
      ),
    }));

    render(<CalendarPage />);

    expect(await screen.findByText('Historical estimate')).toBeInTheDocument();
    expect(screen.getByText(/qualifying historical wait-time patterns with 75% day coverage/i))
      .toBeInTheDocument();
    expect(screen.getByText(/planning guidance, not a live crowd measurement/i)).toBeInTheDocument();
  });

  it('clearly labels stale cached estimates and their original coverage', async () => {
    mockFetch.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: async () => crowdMonth(
        {
          source: 'stale-cache',
          coverageRatio: 0.6,
          daysWithData: 18,
          totalDays: 30,
        },
        new URL(url, 'http://localhost').searchParams.get('month') ?? currentMonth(),
        true,
      ),
    }));

    render(<CalendarPage />);

    expect(await screen.findByText('Older historical estimate')).toBeInTheDocument();
    expect(screen.getByText(/Fresh coverage is unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/18 of 30 days \(60%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/not a live crowd measurement/i)).toBeInTheDocument();
  });

  it('does not substitute synthetic crowd levels when coverage metadata is missing', async () => {
    mockFetch.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      json: async () => crowdMonth(
        undefined,
        new URL(url, 'http://localhost').searchParams.get('month') ?? currentMonth(),
      ),
    }));

    render(<CalendarPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Crowd estimates unavailable');
    expect(alert).toHaveTextContent(/can’t verify the historical coverage/i);
    expect(screen.queryByTestId('day-1')).not.toBeInTheDocument();
    expect(screen.queryByText('Very High')).not.toBeInTheDocument();
  });

  it('shows a retryable error without substituting fallback levels on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));

    render(<CalendarPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Crowd estimates unavailable');
    expect(alert).toHaveTextContent(
      'The crowd data service could not be reached. No fallback crowd levels are being substituted.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByTestId('day-1')).not.toBeInTheDocument();
  });
});
