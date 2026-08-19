import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TripCard from '@/components/trips/TripCard';

const mocks = vi.hoisted(() => ({
  getTrips: vi.fn(),
  refreshStats: vi.fn(),
}));

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'user-1' }, loading: false }),
}));
vi.mock('@/lib/services/trip-service', () => ({
  getTrips: (...args: unknown[]) => mocks.getTrips(...args),
}));
vi.mock('@/lib/services/ride-log-service', () => ({
  refreshTripStatsAfterMutation: (...args: unknown[]) => mocks.refreshStats(...args),
}));
vi.mock('@/hooks/useAutoRefresh', () => ({
  useAutoRefresh: () => ({ isBackgroundRefreshing: false }),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ shareId: 'share-123456' }),
}));

import TripsPage from '@/app/trips/page';
import SharedTripPage from '@/app/trips/shared/[shareId]/page';

const trip = {
  id: 'trip-1',
  name: 'Trip',
  startDate: '2026-08-18',
  endDate: '2026-08-18',
  status: 'active' as const,
  shareId: null,
  stats: {
    totalRides: 2,
    totalWaitMinutes: 30,
    parksVisited: 1,
    uniqueAttractions: 2,
    favoriteAttraction: null,
  },
  notes: '',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const refreshedStats = {
  status: 'updated' as const,
  stats: {
    totalRides: 5,
    totalWaitMinutes: 75,
    parksVisited: 2,
    uniqueAttractions: 4,
    favoriteAttraction: 'Space Mountain',
  },
  statsUpdatedAt: new Date().toISOString(),
};

describe('trip summary freshness and shared pagination UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.getTrips.mockReset();
    mocks.refreshStats.mockReset();
    mocks.refreshStats.mockResolvedValue(refreshedStats);
  });

  it('labels a trip card whose persisted summary has no freshness timestamp', () => {
    render(<TripCard trip={trip} />);
    expect(screen.getByText('Ride summary refresh pending')).toBeInTheDocument();
  });

  it('does not label a brand-new zero-ride trip as refresh pending', () => {
    render(<TripCard trip={{
      ...trip,
      stats: {
        totalRides: 0,
        totalWaitMinutes: 0,
        parksVisited: 0,
        uniqueAttractions: 0,
        favoriteAttraction: null,
      },
    }} />);

    expect(screen.getByText('No rides logged yet')).toBeInTheDocument();
    expect(screen.queryByText('Ride summary refresh pending')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh ride summary' })).not.toBeInTheDocument();
  });

  it('installs authoritative stats before clearing stale recovery UI', async () => {
    render(<TripCard trip={trip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ride summary' }));
    await waitFor(() => expect(mocks.refreshStats).toHaveBeenCalledWith(
      'trip-1',
      expect.any(AbortSignal),
    ));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Refresh ride summary' })).not.toBeInTheDocument();
    });
    expect(screen.getByText('🎢 5 rides')).toBeInTheDocument();
    expect(screen.getByText('⏱️ 75 min waited')).toBeInTheDocument();
    expect(screen.getByText('🏰 2 parks')).toBeInTheDocument();
    expect(screen.getByText(/Ride summary updated/)).toBeInTheDocument();
  });

  it('lets a later trip prop update replace locally refreshed stats', async () => {
    const rendered = render(<TripCard trip={trip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ride summary' }));
    expect(await screen.findByText('🎢 5 rides')).toBeInTheDocument();

    rendered.rerender(<TripCard trip={{
      ...trip,
      stats: {
        ...trip.stats,
        totalRides: 7,
        totalWaitMinutes: 90,
        parksVisited: 3,
      },
      statsUpdatedAt: new Date('2099-08-18T22:31:00.000Z'),
    }} />);

    expect(await screen.findByText('🎢 7 rides')).toBeInTheDocument();
    expect(screen.getByText('⏱️ 90 min waited')).toBeInTheDocument();
    expect(screen.getByText('🏰 3 parks')).toBeInTheDocument();
  });

  it('does not let an older manual response overwrite newer props', async () => {
    let resolveRefresh!: (value: typeof refreshedStats) => void;
    mocks.refreshStats.mockReturnValueOnce(new Promise((resolve) => {
      resolveRefresh = resolve;
    }));
    const rendered = render(<TripCard trip={trip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ride summary' }));
    const signal = mocks.refreshStats.mock.calls[0][1] as AbortSignal;

    rendered.rerender(<TripCard trip={{
      ...trip,
      stats: { ...trip.stats, totalRides: 8 },
      statsUpdatedAt: '2026-08-19T02:00:00.123999Z',
    }} />);
    expect(signal.aborted).toBe(true);
    resolveRefresh({
      ...refreshedStats,
      stats: { ...refreshedStats.stats, totalRides: 6 },
      statsUpdatedAt: '2026-08-19T02:00:00.123456Z',
    });

    expect(await screen.findByText('🎢 8 rides')).toBeInTheDocument();
    expect(screen.queryByText('🎢 6 rides')).not.toBeInTheDocument();
  });

  it('invalidates a manual response when the card is reused for another trip', async () => {
    let resolveRefresh!: (value: typeof refreshedStats) => void;
    mocks.refreshStats.mockReturnValueOnce(new Promise((resolve) => {
      resolveRefresh = resolve;
    }));
    const rendered = render(<TripCard trip={trip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ride summary' }));
    const signal = mocks.refreshStats.mock.calls[0][1] as AbortSignal;

    rendered.rerender(<TripCard trip={{
      ...trip,
      id: 'trip-2',
      name: 'Second Trip',
      stats: { ...trip.stats, totalRides: 9 },
    }} />);
    expect(signal.aborted).toBe(true);
    resolveRefresh({
      ...refreshedStats,
      stats: { ...refreshedStats.stats, totalRides: 6 },
    });

    expect(await screen.findByText('🎢 9 rides')).toBeInTheDocument();
    expect(screen.queryByText('🎢 6 rides')).not.toBeInTheDocument();
  });

  it('applies a manual response that is newer than authoritative props', async () => {
    const rendered = render(<TripCard trip={{
      ...trip,
      statsUpdatedAt: '2026-08-19T03:00:00.123456Z',
    }} />);
    mocks.refreshStats.mockResolvedValueOnce({
      ...refreshedStats,
      statsUpdatedAt: '2026-08-19T03:00:00.123999Z',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ride summary' }));

    expect(await screen.findByText('🎢 5 rides')).toBeInTheDocument();
    rendered.rerender(<TripCard trip={{
      ...trip,
      stats: { ...trip.stats, totalRides: 3 },
      statsUpdatedAt: '2026-08-19T03:00:00.123456Z',
    }} />);
    expect(screen.getByText('🎢 5 rides')).toBeInTheDocument();
    expect(screen.queryByText('🎢 3 rides')).not.toBeInTheDocument();
  });

  it('compares offset timestamps by instant during manual refresh', async () => {
    render(<TripCard trip={{
      ...trip,
      statsUpdatedAt: '2026-08-19T03:00:00.123456789Z',
    }} />);
    mocks.refreshStats.mockResolvedValueOnce({
      ...refreshedStats,
      stats: { ...refreshedStats.stats, totalRides: 10 },
      statsUpdatedAt: '2026-08-18T23:00:00.123456789-04:00',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ride summary' }));

    await waitFor(() => expect(mocks.refreshStats).toHaveBeenCalled());
    expect(screen.getByText('🎢 2 rides')).toBeInTheDocument();
    expect(screen.queryByText('🎢 10 rides')).not.toBeInTheDocument();
  });

  it('keeps stale UI when a manual response timestamp is malformed', async () => {
    mocks.refreshStats.mockResolvedValueOnce({
      ...refreshedStats,
      statsUpdatedAt: '2026-08-19T03:00:00.1234567890Z',
    });
    render(<TripCard trip={trip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ride summary' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Summary is still pending');
    expect(screen.getByText('🎢 2 rides')).toBeInTheDocument();
  });

  it('keeps stale recovery UI after a failed manual refresh', async () => {
    mocks.refreshStats.mockRejectedValueOnce(new Error('offline'));
    render(<TripCard trip={trip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ride summary' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Summary is still pending');
    expect(screen.getByText('🎢 2 rides')).toBeInTheDocument();
    expect(screen.getByText('⏱️ 30 min waited')).toBeInTheDocument();
    expect(screen.getByText('Ride summary refresh pending')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh ride summary' })).toBeInTheDocument();
  });

  it('shows the next allowed time after a terminal throttled refresh', async () => {
    mocks.refreshStats.mockResolvedValueOnce({
      status: 'throttled',
      retryAt: Date.now() + 10_000,
    });
    render(<TripCard trip={trip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ride summary' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refresh is throttled until');
    expect(screen.getByRole('button', { name: 'Refresh ride summary' })).toBeInTheDocument();
  });

  it('aborts an in-flight manual refresh when its card unmounts', async () => {
    mocks.refreshStats.mockReturnValueOnce(new Promise(() => {}));
    const rendered = render(<TripCard trip={trip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh ride summary' }));
    const signal = mocks.refreshStats.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(false);
    rendered.unmount();
    expect(signal.aborted).toBe(true);
  });

  it('shows trip-list refresh failures instead of silently retaining stale values', async () => {
    mocks.getTrips.mockRejectedValueOnce(new Error('offline'));
    render(<TripsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Previously loaded values may be out of date',
    );
  });

  it('loads subsequent shared ride-log pages without hiding the remainder', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        trip: { ...trip, parkNames: {}, statsUpdatedAt: '2026-08-19T01:00:00Z' },
        rideLogs: [
          {
            id: 'ride-1',
            attractionName: 'First Ride',
            parkName: 'Park',
            rodeAt: '2026-08-18T20:00:00Z',
          },
          {
            id: 'ride-1b',
            attractionName: 'Another Ride',
            parkName: 'Second Park',
            rodeAt: '2026-08-18T19:30:00Z',
          },
        ],
        nextCursor: 'next-page',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rideLogs: [{
          id: 'ride-2',
          attractionName: 'Second Ride',
          parkName: 'Park',
          rodeAt: '2026-08-18T19:00:00Z',
        }],
        nextCursor: null,
      }), { status: 200 }));

    render(<SharedTripPage />);
    expect(await screen.findByText('First Ride')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Load more rides' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Load more rides' }));
    expect(await screen.findByText('Second Ride')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Load more rides' })).not.toBeInTheDocument();
    });
  });
});
