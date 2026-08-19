import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTrips = vi.fn();
const mockGetTrip = vi.fn();
const mockGetTripRideLogs = vi.fn();
const mockGetTripDiningLogs = vi.fn();
const mockUser = { uid: 'user-123' };

vi.mock('next/navigation', () => ({
  useParams: () => ({ tripId: 'trip-1' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('lucide-react', () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    Clock: Icon,
    MapPin: Icon,
    Pencil: Icon,
    PlusCircle: Icon,
    RefreshCw: Icon,
    Trash2: Icon,
    X: Icon,
  };
});

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

vi.mock('@/hooks/useAutoRefresh', () => ({
  useAutoRefresh: () => ({ isBackgroundRefreshing: false }),
}));

vi.mock('@/lib/services/trip-service', () => ({
  completeTrip: vi.fn(),
  deleteTrip: vi.fn(),
  generateShareId: vi.fn(() => 'share-1'),
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
  getTripRideLogs: (...args: unknown[]) => mockGetTripRideLogs(...args),
  getTrips: (...args: unknown[]) => mockGetTrips(...args),
  updateTrip: vi.fn(),
}));

vi.mock('@/lib/services/ride-log-service', () => ({
  deleteRideLog: vi.fn(),
  refreshTripStatsAfterMutation: vi.fn(),
  updateRideLog: vi.fn(),
}));

vi.mock('@/lib/services/dining-log-service', () => ({
  deleteDiningLog: vi.fn(),
  getTripDiningLogs: (...args: unknown[]) => mockGetTripDiningLogs(...args),
  updateDiningLog: vi.fn(),
}));

vi.mock('@/components/trips/ActiveTripBanner', () => ({
  notifyActiveTripChanged: vi.fn(),
}));

vi.mock('@/components/ui/ConfirmDialog', () => ({
  default: () => null,
}));

vi.mock('@/components/trips/ShareModal', () => ({
  default: () => null,
}));

import TripDetailPage from '@/app/trips/[tripId]/page';
import TripsPage from '@/app/trips/page';

const trip = {
  id: 'trip-1',
  name: 'Persisted Trip',
  startDate: '2026-08-19',
  endDate: '2026-08-19',
  parkIds: [],
  parkNames: {},
  status: 'active' as const,
  shareId: null,
  stats: {
    totalRides: 0,
    totalWaitMinutes: 0,
    parksVisited: 0,
    uniqueAttractions: 0,
    favoriteAttraction: null,
  },
  notes: '',
  createdAt: new Date('2026-08-19T16:00:00.000Z'),
  updatedAt: new Date('2026-08-19T16:00:00.000Z'),
};

const rideVisit = {
  id: 'ride-1',
  userId: 'user-123',
  parkId: 'magic-kingdom',
  attractionId: 'space-mountain',
  parkName: 'Magic Kingdom',
  attractionName: 'Space Mountain',
  rodeAt: new Date('2026-08-19T17:00:00.000Z'),
  waitTimeMinutes: 25,
  attractionClosed: false,
  source: 'manual' as const,
  rating: 5,
  notes: '',
  tripId: 'trip-1',
  createdAt: new Date('2026-08-19T17:00:00.000Z'),
};

describe('trip reload UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTrips.mockResolvedValue([trip]);
    mockGetTrip.mockResolvedValue(trip);
    mockGetTripRideLogs.mockResolvedValue([rideVisit]);
    mockGetTripDiningLogs.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the persisted trip and ride visits after a fresh load', async () => {
    render(<TripDetailPage />);

    expect(await screen.findByRole('heading', { name: 'Persisted Trip' })).toBeInTheDocument();
    expect(await screen.findByText('Space Mountain')).toBeInTheDocument();
    expect(screen.queryByText(/Your adventure awaits/i)).not.toBeInTheDocument();
  });

  it('does not report a trip as missing when its reload fails', async () => {
    mockGetTrip.mockImplementation(() => Promise.reject(new Error('Temporary trip read failure')));
    render(<TripDetailPage />);

    expect(await screen.findByRole('heading', { name: /Trip could not be loaded/i }))
      .toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Trip Not Found/i })).not.toBeInTheDocument();
  });

  it('does not show the empty timeline when ride visits fail to reload and can retry', async () => {
    mockGetTripRideLogs
      .mockRejectedValueOnce(new Error('Temporary ride read failure'))
      .mockResolvedValueOnce([rideVisit]);
    render(<TripDetailPage />);

    expect(await screen.findByText(/Ride visits could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/Your adventure awaits/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(await screen.findByText('Space Mountain')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/Ride visits could not be loaded/i)).not.toBeInTheDocument();
    });
  });

  it('does not show a no-trips empty state when the trip list reload fails', async () => {
    mockGetTrips.mockImplementation(() => Promise.reject(new Error('Temporary trip list failure')));
    render(<TripsPage />);

    expect(await screen.findByRole('heading', { name: /Trips could not be loaded/i }))
      .toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /No Trips Logged Yet/i }))
      .not.toBeInTheDocument();
  });
});
