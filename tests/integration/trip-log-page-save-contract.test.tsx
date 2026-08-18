import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPendingRideSaveCommand,
  persistPendingRideSaveCommand,
  rideSaveContext,
} from '@/lib/services/pending-ride-save-command';
import {
  configurePendingSaveCommandMemoryStorageForTests,
  configurePendingSaveCommandRemovalFailureForTests,
  resetPendingSaveCommandStorageForTests,
} from '@/lib/services/pending-save-command-storage';

configurePendingSaveCommandMemoryStorageForTests();

const mockGetTrip = vi.fn();
const mockGetTripRideLogs = vi.fn();
const mockCreateRideLog = vi.fn();
const mockGetCollection = vi.fn();
const mockUser = { uid: 'user-123' };

vi.mock('next/navigation', () => ({
  useParams: () => ({ tripId: 'trip-1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('lucide-react', () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    Search: Icon,
    X: Icon,
    Star: Icon,
    Timer: Icon,
    Clock: Icon,
    ChevronLeft: Icon,
    MapPin: Icon,
    Utensils: Icon,
  };
});

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

vi.mock('@/lib/services/trip-service', () => ({
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
  getTripRideLogs: (...args: unknown[]) => mockGetTripRideLogs(...args),
}));

vi.mock('@/lib/services/ride-log-service', () => ({
  createRideLog: (...args: unknown[]) => mockCreateRideLog(...args),
  canDiscardRideLogSave: (error: { outcome?: string }) => error?.outcome === 'definitive-non-commit',
  RIDE_LOG_SAVE_TIMEOUT_MS: 10_000,
  RideLogSaveError: class RideLogSaveError extends Error {
    constructor(
      public code: string,
      message: string,
      public cause?: unknown,
      public savedLogId?: string,
      public outcome: string = 'ambiguous',
    ) {
      super(message);
    }
  },
}));

vi.mock('@/lib/services/dining-log-service', () => ({
  addDiningLog: vi.fn(),
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
    onModeChange,
  }: {
    value: string;
    onChange: (value: string) => void;
    onModeChange: (mode: string) => void;
  }) => (
    <input
      aria-label="Wait time in minutes"
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
        onModeChange(event.target.value ? 'manual' : 'unknown');
      }}
    />
  ),
}));

import TripLogRidePage from '@/app/trips/[tripId]/log/page';

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

const trip = {
  id: 'trip-1',
  name: 'August Trip',
  parkIds: ['magic-kingdom', 'epcot'],
  parkNames: {
    'magic-kingdom': 'Magic Kingdom',
    epcot: 'EPCOT',
  },
};

function todayAt(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date;
}

function yesterdayAt(hour: number) {
  const date = todayAt(hour);
  date.setDate(date.getDate() - 1);
  return date;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function openRide(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(name, 'i') }));
  return screen.findByRole('button', { name: /Log Ride/i });
}

describe('trip ride-log production page save contract', () => {
  beforeEach(async () => {
    await resetPendingSaveCommandStorageForTests();
    configurePendingSaveCommandRemovalFailureForTests(null);
    vi.clearAllMocks();
    localStorage.clear();
    mockGetTrip.mockResolvedValue(trip);
    mockGetTripRideLogs.mockResolvedValue([]);
    mockCreateRideLog.mockResolvedValue('log-1');
    mockGetCollection.mockImplementation(
      async (path: string, constraints?: Array<{ value?: string }>) => {
        if (path === 'parks') return parks;
        if (path === 'attractions') {
          const parkId = constraints?.[0]?.value as keyof typeof attractions;
          return attractions[parkId] ?? [];
        }
        return [];
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exits the pending state after a successful save', async () => {
    const save = deferred<string>();
    mockCreateRideLog.mockReturnValue(save.promise);
    render(<TripLogRidePage />);

    const submit = await openRide('Space Mountain');
    fireEvent.click(submit);

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();

    await act(async () => save.resolve('log-1'));

    expect(await screen.findByText(/Space Mountain logged!/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saving...' })).not.toBeInTheDocument();
  });

  it('surfaces a rejected save and enables a successful retry', async () => {
    mockCreateRideLog
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('log-retried');
    render(<TripLogRidePage />);

    fireEvent.click(await openRide('Space Mountain'));

    expect(await screen.findByText(/Failed to save ride log/i)).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /Retry Save/i });
    expect(retry).toBeEnabled();

    fireEvent.click(retry);
    expect(await screen.findByText(/Space Mountain logged!/i)).toBeInTheDocument();
    expect(mockCreateRideLog).toHaveBeenCalledTimes(2);
    expect(mockCreateRideLog.mock.calls[1][3].requestId)
      .toBe(mockCreateRideLog.mock.calls[0][3].requestId);
    expect(mockCreateRideLog.mock.calls[1][1].rodeAt.toISOString())
      .toBe(mockCreateRideLog.mock.calls[0][1].rodeAt.toISOString());
  });

  it('finishes cleanup after commit without creating the ride twice', async () => {
    configurePendingSaveCommandRemovalFailureForTests(() => {
      throw new Error('cleanup failed');
    });
    render(<TripLogRidePage />);

    fireEvent.click(await openRide('Space Mountain'));
    expect(await screen.findByRole('button', { name: /Finish Cleanup/i })).toBeEnabled();
    expect(screen.getByText(/ride is saved/i)).toBeInTheDocument();
    expect(mockCreateRideLog).toHaveBeenCalledTimes(1);

    configurePendingSaveCommandRemovalFailureForTests(null);
    fireEvent.click(screen.getByRole('button', { name: /Finish Cleanup/i }));
    expect(await screen.findByText(/Space Mountain logged!/i)).toBeInTheDocument();
    expect(mockCreateRideLog).toHaveBeenCalledTimes(1);
  });

  it('restores the exact frozen ride command after reload', async () => {
    mockCreateRideLog.mockRejectedValueOnce(Object.assign(new Error('offline'), {
      outcome: 'ambiguous',
    }));
    const firstRender = render(<TripLogRidePage />);
    fireEvent.click(await openRide('Space Mountain'));
    await screen.findByText(/Failed to save ride log/i);
    const firstRequestId = mockCreateRideLog.mock.calls[0][3].requestId;
    const firstRodeAt = mockCreateRideLog.mock.calls[0][1].rodeAt.toISOString();
    firstRender.unmount();

    mockCreateRideLog.mockResolvedValueOnce('reconciled');
    render(<TripLogRidePage />);
    const retry = await screen.findByRole('button', { name: /Retry Save/i });
    fireEvent.click(retry);
    await screen.findByText(/Space Mountain logged!/i);

    expect(mockCreateRideLog.mock.calls[1][3].requestId).toBe(firstRequestId);
    expect(mockCreateRideLog.mock.calls[1][1].rodeAt.toISOString()).toBe(firstRodeAt);
    expect(localStorage.length).toBe(0);
  });

  it('surfaces a timed-out save distinctly and enables retry', async () => {
    mockCreateRideLog.mockRejectedValueOnce(
      new Error('Saving the ride took too long. It was not confirmed; retrying is safe.'),
    );
    render(<TripLogRidePage />);

    fireEvent.click(await openRide('Space Mountain'));

    expect(await screen.findByText(/took too long/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry Save/i })).toBeEnabled();
  });

  it('exits Saving at the page deadline when the save dependency never settles', async () => {
    mockCreateRideLog.mockReturnValue(new Promise(() => {}));
    const command = createPendingRideSaveCommand({
      parkId: 'magic-kingdom',
      attractionId: 'space-mountain',
      parkName: 'Magic Kingdom',
      attractionName: 'Space Mountain',
      rodeAt: new Date('2026-08-18T16:00:00.000Z'),
      waitTimeMinutes: null,
      attractionClosed: false,
      source: 'manual',
      rating: null,
      notes: '',
    }, 'trip-1');
    await persistPendingRideSaveCommand(
      'user-123',
      rideSaveContext('trip', 'trip-1'),
      command,
    );
    render(<TripLogRidePage />);

    const submit = await screen.findByRole('button', { name: /Retry Save/i });
    vi.useFakeTimers();
    fireEvent.click(submit);

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(mockCreateRideLog).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_001);
    });

    expect(screen.queryByRole('button', { name: 'Saving...' })).not.toBeInTheDocument();
    const retry = screen.getByRole('button', { name: /Retry Save/i });
    expect(retry).toBeEnabled();
    expect(screen.getByText(/reuse this save request/i)).toBeInTheDocument();

    const firstRequestId = mockCreateRideLog.mock.calls[0][3].requestId;
    fireEvent.click(retry);
    expect(mockCreateRideLog).toHaveBeenCalledTimes(2);
    expect(mockCreateRideLog.mock.calls[1][3].requestId).toBe(firstRequestId);
  });

  it('surfaces a late successful commit after the page deadline', async () => {
    const save = deferred<string>();
    mockCreateRideLog.mockReturnValue(save.promise);
    const command = createPendingRideSaveCommand({
      parkId: 'magic-kingdom',
      attractionId: 'space-mountain',
      parkName: 'Magic Kingdom',
      attractionName: 'Space Mountain',
      rodeAt: new Date('2026-08-18T16:00:00.000Z'),
      waitTimeMinutes: null,
      attractionClosed: false,
      source: 'manual',
      rating: null,
      notes: '',
    }, 'trip-1');
    await persistPendingRideSaveCommand(
      'user-123',
      rideSaveContext('trip', 'trip-1'),
      command,
    );
    render(<TripLogRidePage />);

    const submit = await screen.findByRole('button', { name: /Retry Save/i });
    vi.useFakeTimers();
    fireEvent.click(submit);
    expect(mockCreateRideLog).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_001);
    });
    expect(screen.getByRole('button', { name: /Retry Save/i })).toBeEnabled();

    vi.useRealTimers();
    await act(async () => save.resolve('log-late'));

    expect(await screen.findByText(/Space Mountain logged!/i)).toBeInTheDocument();
    expect(screen.queryByText(/reuse this save request/i)).not.toBeInTheDocument();
  });

  it('does not create duplicate writes when Save is double-clicked', async () => {
    const save = deferred<string>();
    mockCreateRideLog.mockReturnValue(save.promise);
    render(<TripLogRidePage />);

    const submit = await openRide('Space Mountain');
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(mockCreateRideLog).toHaveBeenCalledTimes(1));
    await act(async () => save.resolve('log-1'));
  });

  it.each(['-1', '1', '181', '12.5', 'not-a-number'])(
    'rejects invalid ride wait %s before the trip save entrypoint',
    async (waitTime) => {
      render(<TripLogRidePage />);
      await openRide('Space Mountain');
      fireEvent.change(screen.getByLabelText('Wait time in minutes'), {
        target: { value: waitTime },
      });
      fireEvent.click(screen.getByRole('button', { name: /Log Ride/i }));

      expect(await screen.findByText(/Ride wait time must be/i)).toBeInTheDocument();
      expect(mockCreateRideLog).not.toHaveBeenCalled();
    },
  );

  it('blocks park interaction until deferred recent-park resolution completes', async () => {
    const logs = deferred<Array<{ id: string; parkId: string; rodeAt: Date }>>();
    mockGetTripRideLogs.mockReturnValue(logs.promise);
    render(<TripLogRidePage />);

    const magicKingdom = await screen.findByRole('button', { name: 'Magic Kingdom' });
    const epcot = screen.getByRole('button', { name: 'EPCOT' });
    expect(magicKingdom).toBeDisabled();
    expect(epcot).toBeDisabled();

    fireEvent.click(magicKingdom);
    expect(screen.queryByRole('button', { name: /Space Mountain/i })).not.toBeInTheDocument();

    await act(async () => logs.resolve([
      { id: 'recent', parkId: 'epcot', rodeAt: todayAt(15) },
    ]));

    expect(await screen.findByRole('button', { name: /Test Track/i })).toBeInTheDocument();
    expect(epcot).toBeEnabled();
  });

  it('clears a definitively rejected command and starts with a new request ID', async () => {
    mockCreateRideLog
      .mockRejectedValueOnce(Object.assign(new Error('invalid request'), {
        outcome: 'definitive-non-commit',
      }))
      .mockResolvedValueOnce('log-new');
    render(<TripLogRidePage />);

    fireEvent.click(await openRide('Space Mountain'));
    expect(await screen.findByText(/Failed to save ride log/i)).toBeInTheDocument();
    const firstRequestId = mockCreateRideLog.mock.calls[0][3].requestId;

    expect(screen.getByRole('button', { name: 'EPCOT' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Log Ride/i }));
    await screen.findByText(/Space Mountain logged!/i);
    const secondRequestId = mockCreateRideLog.mock.calls[1][3].requestId;
    expect(secondRequestId).not.toBe(firstRequestId);
  });

  it('never offers start-over for an ambiguous outcome and retries the same ID', async () => {
    mockCreateRideLog
      .mockRejectedValueOnce(Object.assign(new Error('network unavailable'), {
        outcome: 'ambiguous',
      }))
      .mockResolvedValueOnce('late-committed-id');
    render(<TripLogRidePage />);

    fireEvent.click(await openRide('Space Mountain'));
    expect(await screen.findByText(/Failed to save ride log/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Discard failed save/i })).not.toBeInTheDocument();
    const firstRequestId = mockCreateRideLog.mock.calls[0][3].requestId;

    fireEvent.click(screen.getByRole('button', { name: /Retry Save/i }));
    expect(await screen.findByText(/Space Mountain logged!/i)).toBeInTheDocument();
    expect(mockCreateRideLog.mock.calls[1][3].requestId).toBe(firstRequestId);
  });

  it('blocks closing or changing attractions while an ambiguous command is pending', async () => {
    mockCreateRideLog.mockRejectedValueOnce(Object.assign(new Error('network unavailable'), {
      outcome: 'ambiguous',
    }));
    render(<TripLogRidePage />);

    fireEvent.click(await openRide('Space Mountain'));
    await screen.findByText(/Failed to save ride log/i);

    expect(screen.getByRole('button', { name: /Pending save must be resumed/i })).toBeDisabled();
    expect(screen.getByText(/Space Mountain/i, { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText(/Magic Kingdom.*Unknown wait/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EPCOT' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Retry Save/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Test Track/i })).not.toBeInTheDocument();
  });

  it('defaults to the most recently logged park in the same trip and day', async () => {
    mockGetTripRideLogs.mockResolvedValue([
      { id: 'newest', parkId: 'epcot', rodeAt: todayAt(15) },
      { id: 'older', parkId: 'magic-kingdom', rodeAt: todayAt(10) },
    ]);

    render(<TripLogRidePage />);

    expect(await screen.findByRole('button', { name: /Test Track/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Space Mountain/i })).not.toBeInTheDocument();
  });

  it('clears the stale attraction on park switch and changes the next default only after a successful save', async () => {
    const logs = [{ id: 'mk-log', parkId: 'magic-kingdom', rodeAt: todayAt(10) }];
    mockGetTripRideLogs.mockImplementation(async () => logs);
    mockCreateRideLog.mockRejectedValueOnce(Object.assign(new Error('invalid request'), {
      outcome: 'definitive-non-commit',
    }));

    const first = render(<TripLogRidePage />);
    await openRide('Space Mountain');
    fireEvent.click(screen.getByRole('button', { name: 'EPCOT' }));

    expect(screen.queryByText('Space Mountain logged! 🎉')).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Test Track/i })).toBeInTheDocument();
    fireEvent.click(await openRide('Test Track'));
    expect(await screen.findByText(/Failed to save ride log/i)).toBeInTheDocument();
    first.unmount();

    const second = render(<TripLogRidePage />);
    expect(await screen.findByRole('button', { name: /Space Mountain/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'EPCOT' }));
    fireEvent.click(await openRide('Test Track'));
    expect(await screen.findByText(/Test Track logged!/i)).toBeInTheDocument();
    logs.unshift({ id: 'epcot-log', parkId: 'epcot', rodeAt: todayAt(16) });
    second.unmount();

    render(<TripLogRidePage />);
    expect(await screen.findByRole('button', { name: /Test Track/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Space Mountain/i })).not.toBeInTheDocument();
  });

  it('does not carry a previous-day park across the trip-day boundary', async () => {
    mockGetTripRideLogs.mockResolvedValue([
      { id: 'yesterday', parkId: 'epcot', rodeAt: yesterdayAt(16) },
    ]);

    render(<TripLogRidePage />);

    expect(await screen.findByRole('button', { name: /Space Mountain/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Test Track/i })).not.toBeInTheDocument();
  });

  it('uses the trip route park only when same-trip/day history is absent', async () => {
    mockGetTripRideLogs.mockResolvedValue([
      { id: 'today', parkId: 'epcot', rodeAt: todayAt(14) },
    ]);
    const first = render(<TripLogRidePage />);

    expect(await screen.findByRole('button', { name: /Test Track/i })).toBeInTheDocument();
    first.unmount();

    mockGetTripRideLogs.mockResolvedValue([]);
    render(<TripLogRidePage />);

    expect(await screen.findByRole('button', { name: /Space Mountain/i })).toBeInTheDocument();
  });

  it('ignores a stale attraction completion after the park changes', async () => {
    const magicKingdom = deferred<typeof attractions['magic-kingdom']>();
    const epcot = deferred<typeof attractions.epcot>();
    mockGetCollection.mockImplementation(
      (path: string, constraints?: Array<{ value?: string }>) => {
        if (path === 'parks') return Promise.resolve(parks);
        if (constraints?.[0]?.value === 'magic-kingdom') return magicKingdom.promise;
        if (constraints?.[0]?.value === 'epcot') return epcot.promise;
        return Promise.resolve([]);
      },
    );
    render(<TripLogRidePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'EPCOT' }));
    await act(async () => epcot.resolve(attractions.epcot));
    expect(await screen.findByRole('button', { name: /Test Track/i })).toBeInTheDocument();

    await act(async () => magicKingdom.resolve(attractions['magic-kingdom']));
    expect(screen.queryByRole('button', { name: /Space Mountain/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Test Track/i })).toBeInTheDocument();
  });

  it('shows a confirmed empty attraction result instead of Loading', async () => {
    mockGetCollection.mockImplementation(
      async (path: string) => path === 'parks' ? parks : [],
    );
    render(<TripLogRidePage />);

    expect(await screen.findByText('No attractions are available.')).toBeInTheDocument();
    expect(screen.queryByText('Loading attractions...')).not.toBeInTheDocument();
  });

  it('keeps park and attraction failures independent', async () => {
    mockGetCollection.mockImplementation(
      async (path: string, constraints?: Array<{ value?: string }>) => {
        if (path === 'parks') throw new Error('parks offline');
        const selected = constraints?.[0]?.value as keyof typeof attractions;
        return attractions[selected] ?? [];
      },
    );
    render(<TripLogRidePage />);

    expect(await screen.findByText(/Parks could not be loaded/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Space Mountain/i })).toBeInTheDocument();
    expect(screen.queryByText(/Attractions could not be loaded/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry park loading/i })).toBeEnabled();
  });

  it('times out a never-settling attraction request with terminal retry UI', async () => {
    mockGetCollection.mockImplementation(
      (path: string) => path === 'parks' ? Promise.resolve(parks) : new Promise(() => {}),
    );
    render(<TripLogRidePage />);

    expect(await screen.findByText(/Attractions could not be loaded/i, {}, {
      timeout: 9_000,
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry attraction loading/i })).toBeEnabled();
    expect(screen.queryByText('Loading attractions...')).not.toBeInTheDocument();
  }, 10_000);

  it('recovers an attraction rejection with an attraction-only retry', async () => {
    let attractionAttempts = 0;
    mockGetCollection.mockImplementation(
      async (path: string, constraints?: Array<{ value?: string }>) => {
        if (path === 'parks') return parks;
        attractionAttempts += 1;
        if (attractionAttempts === 1) throw new Error('attractions offline');
        const selected = constraints?.[0]?.value as keyof typeof attractions;
        return attractions[selected] ?? [];
      },
    );
    render(<TripLogRidePage />);

    expect(await screen.findByText(/Attractions could not be loaded/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry attraction loading/i }));
    expect(await screen.findByRole('button', { name: /Space Mountain/i })).toBeInTheDocument();
    expect(screen.queryByText(/Attractions could not be loaded/i)).not.toBeInTheDocument();
  });
});
