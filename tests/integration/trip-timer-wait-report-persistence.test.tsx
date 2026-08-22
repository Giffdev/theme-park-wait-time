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
const mockCreateRideLog = vi.fn();
const mockSubmitCrowdReport = vi.fn();
const mockGetCollection = vi.fn();
const mockPush = vi.fn();

const backend = {
  trip: null as null | {
    id: string;
    name: string;
  },
  rideVisits: [] as Array<{
    id: string;
    tripId: string;
    attractionId: string;
    waitTimeMinutes: number;
  }>,
  waitTimeReports: [] as Array<{
    requestId: string;
    reportedAtMs: number;
    attractionId: string;
    parkId: string;
    waitTimeMinutes: number;
  }>,
};

let navigationStarted = false;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('lucide-react', () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    Calendar: Icon,
    Check: Icon,
    ChevronLeft: Icon,
    MapPin: Icon,
    Star: Icon,
    X: Icon,
  };
});

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({
    user: { uid: 'user-123', email: 'tester@example.com' },
    loading: false,
  }),
}));

vi.mock('@/lib/firebase/firestore', () => ({
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
}));

vi.mock('@/lib/services/trip-service', () => ({
  createTrip: (...args: unknown[]) => mockCreateTrip(...args),
  reconcileTripCreation: (...args: unknown[]) => mockReconcileTripCreation(...args),
}));

vi.mock('@/components/trips/ActiveTripBanner', () => ({
  notifyActiveTripChanged: vi.fn(),
}));

vi.mock('@/lib/services/ride-log-service', () => {
  class RideLogSaveError extends Error {
    code: string;
    savedLogId?: string;
    outcome: 'definitive-non-commit' | 'ambiguous' | 'committed';

    constructor(
      code: string,
      message: string,
      _cause?: unknown,
      savedLogId?: string,
      outcome: 'definitive-non-commit' | 'ambiguous' | 'committed' = 'ambiguous',
    ) {
      super(message);
      this.name = 'RideLogSaveError';
      this.code = code;
      this.savedLogId = savedLogId;
      this.outcome = outcome;
    }
  }

  return {
    RideLogSaveError,
    RIDE_LOG_SAVE_TIMEOUT_MS: 10_000,
    canDiscardRideLogSave: (error: { outcome?: string }) => (
      error?.outcome === 'definitive-non-commit'
    ),
    createRideLog: (...args: unknown[]) => mockCreateRideLog(...args),
    submitCrowdReport: (...args: unknown[]) => mockSubmitCrowdReport(...args),
  };
});

import CreateTripPage from '@/app/trips/new/page';
import TimerCompleteSheet from '@/components/queue-timer/TimerCompleteSheet';

function reloadSnapshots() {
  return {
    trip: backend.trip ? { ...backend.trip } : null,
    rideVisits: backend.rideVisits.map((visit) => ({ ...visit })),
    waitTimeReports: backend.waitTimeReports.map((report) => ({ ...report })),
  };
}

async function createTrip() {
  const view = render(<CreateTripPage />);
  const startTrip = await screen.findByRole('button', { name: /Start Trip/i });
  await waitFor(() => expect(startTrip).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Trip Name'), {
    target: { value: 'Persistence Trip' },
  });
  fireEvent.click(startTrip);
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/trips/trip-1'));
  view.unmount();
}

function renderCompletedTimer(onClose: () => void) {
  return render(
    <TimerCompleteSheet
      elapsedMinutes={35}
      attractionName="Space Mountain"
      parkId="magic-kingdom"
      attractionId="space-mountain"
      parkName="Magic Kingdom"
      onClose={onClose}
    />,
  );
}

async function clickTimerSave(): Promise<void> {
  const button = screen.getByRole('button', { name: 'Save 🎉' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

describe('trip timer wait-report reload persistence', () => {
  beforeEach(async () => {
    await resetPendingSaveCommandStorageForTests();
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
    navigationStarted = false;
    backend.trip = null;
    backend.rideVisits = [];
    backend.waitTimeReports = [];

    mockGetCollection.mockResolvedValue([
      { id: 'magic-kingdom', name: 'Magic Kingdom' },
    ]);
    mockCreateTrip.mockImplementation(async (_userId: string, data: { name: string }) => {
      backend.trip = { id: 'trip-1', name: data.name };
      return 'trip-1';
    });
    mockReconcileTripCreation.mockResolvedValue(null);
    mockCreateRideLog.mockImplementation(async (
      _userId: string,
      data: { attractionId: string; waitTimeMinutes: number },
      _tripId: string | null | undefined,
      options: { requestId: string },
    ) => {
      if (!backend.rideVisits.some(({ id }) => id === options.requestId)) {
        backend.rideVisits.push({
          id: options.requestId,
          tripId: backend.trip?.id ?? '',
          attractionId: data.attractionId,
          waitTimeMinutes: data.waitTimeMinutes,
        });
      }
      return options.requestId;
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps the trip, ride visit, and wait-time report after close and refetch', async () => {
    await createTrip();

    mockSubmitCrowdReport.mockImplementation((
      report: {
        requestId: string;
        reportedAtMs: number;
        attractionId: string;
        parkId: string;
        waitTimeMinutes: number;
      },
    ) => new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (navigationStarted) {
          reject(new Error('request cancelled during navigation'));
          return;
        }
        backend.waitTimeReports.push({ ...report });
        resolve();
      }, 20);
    }));

    const onClose = vi.fn(() => {
      navigationStarted = true;
    });
    const timerView = renderCompletedTimer(onClose);
    await clickTimerSave();

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    timerView.unmount();
    await new Promise((resolve) => setTimeout(resolve, 30));

    const reloaded = reloadSnapshots();
    expect(reloaded.trip).toMatchObject({
      id: 'trip-1',
      name: 'Persistence Trip',
    });
    expect(reloaded.rideVisits).toEqual([{
      id: expect.any(String),
      tripId: 'trip-1',
      attractionId: 'space-mountain',
      waitTimeMinutes: 35,
    }]);
    expect(reloaded.waitTimeReports).toEqual([{
      requestId: expect.any(String),
      reportedAtMs: expect.any(Number),
      attractionId: 'space-mountain',
      parkId: 'magic-kingdom',
      waitTimeMinutes: 35,
    }]);
  });

  it('does not close as full success when the wait-time write fails', async () => {
    await createTrip();
    mockSubmitCrowdReport.mockRejectedValue(new Error('report write rejected'));

    const onClose = vi.fn();
    renderCompletedTimer(onClose);
    await clickTimerSave();

    await waitFor(() => expect(mockSubmitCrowdReport).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(backend.rideVisits).toHaveLength(1);
    expect(backend.waitTimeReports).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Ride saved.*wait-time report could not be sent/i))
      .toBeInTheDocument();
  });

  it('replays one durable identity after response loss, unmount, and remount', async () => {
    await createTrip();
    let attempts = 0;
    mockSubmitCrowdReport.mockImplementation(async (report: {
      requestId: string;
      reportedAtMs: number;
      attractionId: string;
      parkId: string;
      waitTimeMinutes: number;
    }) => {
      attempts += 1;
      if (!backend.waitTimeReports.some(({ requestId }) => requestId === report.requestId)) {
        backend.waitTimeReports.push({ ...report });
      }
      if (attempts === 1) throw new Error('response lost after committed report');
    });

    const onClose = vi.fn();
    const firstView = renderCompletedTimer(onClose);
    await clickTimerSave();

    await screen.findByRole('button', { name: 'Retry wait-time report' });
    const firstReport = mockSubmitCrowdReport.mock.calls[0][0];
    firstView.unmount();

    const restoredView = renderCompletedTimer(onClose);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry wait-time report' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    restoredView.unmount();
    expect(mockCreateRideLog).toHaveBeenCalledTimes(1);
    expect(mockSubmitCrowdReport).toHaveBeenCalledTimes(2);
    expect(mockSubmitCrowdReport.mock.calls[1][0]).toEqual(firstReport);
    expect(backend.rideVisits).toHaveLength(1);
    expect(backend.waitTimeReports).toEqual([{ ...firstReport }]);
  });
});
