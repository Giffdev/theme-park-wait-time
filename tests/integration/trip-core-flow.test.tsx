import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configurePendingSaveCommandMemoryStorageForTests,
  resetPendingSaveCommandStorageForTests,
} from '@/lib/services/pending-save-command-storage';

configurePendingSaveCommandMemoryStorageForTests();

const mockCreateTrip = vi.fn();
const mockReconcileTripCreation = vi.fn();
const mockGetTrip = vi.fn();
const mockGetTripRideLogs = vi.fn();
const mockGetTripDiningLogs = vi.fn();
const mockCreateRideLog = vi.fn();
const mockGetCollection = vi.fn();
const mockPush = vi.fn((href: string) => {
  const match = href.match(/^\/trips\/([^/?#]+)/);
  if (match) currentTripId = match[1];
});
const mockReplace = vi.fn();
const mockAuthState: {
  user: { uid: string } | null;
  loading: boolean;
} = {
  user: { uid: 'user-123' },
  loading: false,
};

let currentTripId = 'trip-1';

const parks = [
  { id: 'magic-kingdom', name: 'Magic Kingdom' },
  { id: 'epcot', name: 'EPCOT' },
];

const attractions = {
  'magic-kingdom': [
    { id: 'space-mountain', name: 'Space Mountain', entityType: 'ATTRACTION' },
  ],
  epcot: [
    { id: 'test-track', name: 'Test Track', entityType: 'ATTRACTION' },
  ],
};

const emptyStats = {
  totalRides: 0,
  totalWaitMinutes: 0,
  parksVisited: 0,
  uniqueAttractions: 0,
  favoriteAttraction: null,
};

const backend = {
  trip: null as null | {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    parkIds: string[];
    parkNames: Record<string, string>;
    status: 'active';
    shareId: null;
    stats: typeof emptyStats;
    notes: string;
    createdAt: Date;
    updatedAt: Date;
  },
  rideLogs: [] as Array<{
    id: string;
    userId: string;
    tripId: string | null;
    parkId: string;
    attractionId: string;
    parkName: string;
    attractionName: string;
    rodeAt: Date;
    waitTimeMinutes: number | null;
    attractionClosed: boolean;
    source: 'manual' | 'timer';
    rating: number | null;
    notes: string;
    requestId: string;
  }>,
  rideRequests: new Map<string, string>(),
  nextTripNumber: 1,
  nextRideNumber: 1,
  failFirstRideOnce: true,
};

vi.mock('next/navigation', () => ({
  useParams: () => ({ tripId: currentTripId }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('lucide-react', () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    Ban: Icon,
    Check: Icon,
    ChevronDown: Icon,
    ChevronLeft: Icon,
    ChevronUp: Icon,
    Clock: Icon,
    MapPin: Icon,
    Pencil: Icon,
    PlusCircle: Icon,
    RefreshCw: Icon,
    Search: Icon,
    Star: Icon,
    Timer: Icon,
    Trash2: Icon,
    Utensils: Icon,
    X: Icon,
    XCircle: Icon,
  };
});

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('@/lib/services/trip-service', () => ({
  completeTrip: vi.fn(),
  createTrip: (...args: unknown[]) => mockCreateTrip(...args),
  deleteTrip: vi.fn(),
  generateShareId: vi.fn(() => 'share-1'),
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
  getTripRideLogs: (...args: unknown[]) => mockGetTripRideLogs(...args),
  getTrips: vi.fn(),
  reconcileTripCreation: (...args: unknown[]) => mockReconcileTripCreation(...args),
  updateTrip: vi.fn(),
}));

vi.mock('@/lib/services/ride-log-service', () => ({
  canDiscardRideLogSave: (error: { outcome?: string }) => error?.outcome === 'definitive-non-commit',
  createRideLog: (...args: unknown[]) => mockCreateRideLog(...args),
  deleteRideLog: vi.fn(),
  refreshTripStatsAfterMutation: vi.fn(),
  updateRideLog: vi.fn(),
}));

vi.mock('@/lib/services/dining-log-service', () => ({
  addDiningLog: vi.fn(),
  deleteDiningLog: vi.fn(),
  getTripDiningLogs: (...args: unknown[]) => mockGetTripDiningLogs(...args),
  updateDiningLog: vi.fn(),
}));

vi.mock('@/lib/firebase/firestore', () => ({
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  whereConstraint: (_field: string, _operator: string, value: string) => ({ value }),
}));

vi.mock('@/lib/utils/classify-attraction', () => ({
  classifyAttraction: () => 'thrill',
}));

vi.mock('@/lib/utils/attraction-icons', () => ({
  getAttractionIcon: () => <span aria-hidden="true" />,
}));

vi.mock('@/components/ride-log/WaitTimeInput', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <input
      aria-label="Wait time in minutes"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
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

import CreateTripPage from '@/app/trips/new/page';
import TripDetailPage from '@/app/trips/[tripId]/page';
import TripLogRidePage from '@/app/trips/[tripId]/log/page';

function resetBackend() {
  backend.trip = null;
  backend.rideLogs = [];
  backend.rideRequests.clear();
  backend.nextTripNumber = 1;
  backend.nextRideNumber = 1;
  backend.failFirstRideOnce = true;
  currentTripId = 'trip-1';
}

function buildTripRecord(name: string, startDate: string, endDate: string) {
  const tripId = `trip-${backend.nextTripNumber}`;
  backend.nextTripNumber += 1;
  return {
    id: tripId,
    name,
    startDate,
    endDate,
    parkIds: ['magic-kingdom', 'epcot'],
    parkNames: {
      'magic-kingdom': 'Magic Kingdom',
      epcot: 'EPCOT',
    },
    status: 'active' as const,
    shareId: null,
    stats: { ...emptyStats },
    notes: '',
    createdAt: new Date('2026-08-19T16:00:00.000Z'),
    updatedAt: new Date('2026-08-19T16:00:00.000Z'),
  };
}

async function openRide(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name, 'i') }));
}

describe('trip core flow reload persistence', () => {
  beforeEach(async () => {
    await resetPendingSaveCommandStorageForTests();
    resetBackend();
    vi.clearAllMocks();
    localStorage.clear();

    mockAuthState.user = { uid: 'user-123' };
    mockAuthState.loading = false;

    mockCreateTrip.mockImplementation(async (_userId: string, data: {
      name: string;
      startDate: string;
      endDate: string;
    }) => {
      const trip = buildTripRecord(data.name, data.startDate, data.endDate);
      backend.trip = trip;
      return trip.id;
    });

    mockReconcileTripCreation.mockImplementation(async (_userId: string, _data: unknown, requestId: string) => requestId);

    mockGetTrip.mockImplementation(async (_userId: string, tripId: string) => {
      if (!backend.trip || backend.trip.id !== tripId) return null;
      return backend.trip;
    });

    mockGetTripRideLogs.mockImplementation(async (_userId: string, tripId: string) => (
      backend.rideLogs
        .filter((log) => log.tripId === tripId)
        .slice()
        .sort((a, b) => b.rodeAt.getTime() - a.rodeAt.getTime())
    ));

    mockGetTripDiningLogs.mockResolvedValue([]);

    mockGetCollection.mockImplementation(async (path: string, constraints?: Array<{ value?: string }>) => {
      if (path === 'parks') return parks;
      if (path === 'attractions') {
        const parkId = constraints?.[0]?.value as keyof typeof attractions | undefined;
        return parkId ? attractions[parkId] ?? [] : [];
      }
      return [];
    });

    mockCreateRideLog.mockImplementation(async (
      userId: string,
      data: {
        parkId: string;
        attractionId: string;
        parkName: string;
        attractionName: string;
        rodeAt: Date;
        waitTimeMinutes: number | null;
        attractionClosed: boolean;
        source: 'manual' | 'timer';
        rating: number | null;
        notes: string;
      },
      tripId: string | null | undefined,
      options: { requestId?: string } = {},
    ) => {
      const requestId = options.requestId ?? `ride-request-${backend.nextRideNumber}`;
      const existingLogId = backend.rideRequests.get(requestId);
      if (existingLogId) return existingLogId;

      const logId = `ride-${backend.nextRideNumber}`;
      backend.nextRideNumber += 1;
      backend.rideRequests.set(requestId, logId);
      backend.rideLogs.push({
        id: logId,
        userId,
        tripId: tripId ?? null,
        parkId: data.parkId,
        attractionId: data.attractionId,
        parkName: data.parkName,
        attractionName: data.attractionName,
        rodeAt: data.rodeAt,
        waitTimeMinutes: data.waitTimeMinutes,
        attractionClosed: data.attractionClosed,
        source: data.source,
        rating: data.rating,
        notes: data.notes,
        requestId,
      });

      if (backend.failFirstRideOnce) {
        backend.failFirstRideOnce = false;
        throw Object.assign(
          new Error('Ride saved, but the confirmation path lost the response before refresh completed.'),
          {
            code: 'write-failed',
            outcome: 'ambiguous',
            savedLogId: logId,
          },
        );
      }

      return logId;
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('survives a committed ride save across reload, reuses the same request ID, and reloads the trip with exactly two rides', async () => {
    const createView = render(<CreateTripPage />);

    const startTrip = await screen.findByRole('button', { name: /Start Trip/i });
    await waitFor(() => expect(startTrip).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Trip Name'), {
      target: { value: 'Adventure Trip' },
    });
    fireEvent.click(startTrip);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/trips/trip-1'));
    expect(backend.trip).not.toBeNull();
    expect(backend.trip?.name).toBe('Adventure Trip');
    createView.unmount();

    const logView = render(<TripLogRidePage />);

    await openRide('Space Mountain');
    fireEvent.click(screen.getByRole('button', { name: /Log Ride/i }));

    expect(await screen.findByText(/Failed to save ride log/i)).toBeInTheDocument();
    expect(backend.rideLogs).toHaveLength(1);
    const firstRequestId = mockCreateRideLog.mock.calls[0][3].requestId;
    expect(firstRequestId).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    logView.unmount();

    const reloadedLogView = render(<TripLogRidePage />);

    expect(await screen.findByText(/This ride save was not confirmed\. Retry will reconcile the same request\./i))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry Save/i }));
    expect(await screen.findByText(/Space Mountain logged!/i)).toBeInTheDocument();
    expect(mockCreateRideLog.mock.calls[1][3].requestId).toBe(firstRequestId);
    expect(backend.rideLogs).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'EPCOT' }));
    fireEvent.click(await screen.findByRole('button', { name: /Test Track/i }));
    fireEvent.click(screen.getByRole('button', { name: /Log Ride/i }));

    expect(await screen.findByText(/Test Track logged!/i)).toBeInTheDocument();
    expect(mockCreateRideLog).toHaveBeenCalledTimes(3);
    expect(mockCreateRideLog.mock.calls[2][3].requestId).not.toBe(firstRequestId);
    expect(backend.trip).toBeDefined();
    expect(backend.rideLogs).toHaveLength(2);
    expect(backend.rideRequests.size).toBe(2);

    reloadedLogView.unmount();

    render(<TripDetailPage />);

    expect(await screen.findByRole('heading', { name: 'Adventure Trip' })).toBeInTheDocument();
    expect(await screen.findByText('Space Mountain')).toBeInTheDocument();
    expect(await screen.findByText('Test Track')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Trip could not be loaded/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Ride visits could not be loaded/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Your adventure awaits!/i)).not.toBeInTheDocument();
  });
});
