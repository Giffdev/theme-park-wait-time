import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAddRideLog = vi.fn();
const mockSubmitWaitTimeReport = vi.fn();
const mockGetCollection = vi.fn();
const mockGetActiveTrip = vi.fn();
const mockGetTripRideLogs = vi.fn();

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('lucide-react', () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    X: Icon,
    Search: Icon,
    Clock: Icon,
    Star: Icon,
    Check: Icon,
    MapPin: Icon,
    ChevronDown: Icon,
    ChevronUp: Icon,
    Ban: Icon,
    XCircle: Icon,
  };
});

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'user-123', email: 'private@example.com' } }),
}));

vi.mock('@/lib/firebase/firestore', () => ({
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  whereConstraint: (_field: string, _operator: string, value: string) => ({ value }),
}));

vi.mock('@/lib/services/ride-log-service', () => ({
  addRideLog: (...args: unknown[]) => mockAddRideLog(...args),
  canDiscardRideLogSave: (error: { outcome?: string }) => error?.outcome === 'definitive-non-commit',
}));

vi.mock('@/lib/firebase/waitTimeReports', () => ({
  getOrCreateWaitTimeReportCommand: (input: Record<string, unknown>) => ({
    requestId: 'wait-report-1234',
    attractionId: input.attractionId,
    attractionName: input.attractionName,
    parkId: input.parkId,
    waitTime: input.waitTime,
  }),
  submitWaitTimeReport: (...args: unknown[]) => mockSubmitWaitTimeReport(...args),
}));

vi.mock('@/lib/services/trip-service', () => ({
  getActiveTrip: (...args: unknown[]) => mockGetActiveTrip(...args),
  getTripRideLogs: (...args: unknown[]) => mockGetTripRideLogs(...args),
}));

vi.mock('@/lib/utils/classify-attraction', () => ({
  classifyAttraction: () => 'thrill',
}));

import UnifiedLogSheet from '@/components/UnifiedLogSheet';
import {
  configurePendingSaveCommandMemoryStorageForTests,
  configurePendingSaveCommandRemovalFailureForTests,
  resetPendingSaveCommandStorageForTests,
  storePendingSaveCommand,
} from '@/lib/services/pending-save-command-storage';

configurePendingSaveCommandMemoryStorageForTests();

describe('UnifiedLogSheet save contract', () => {
  beforeEach(async () => {
    await resetPendingSaveCommandStorageForTests();
    configurePendingSaveCommandRemovalFailureForTests(null);
    vi.clearAllMocks();
    localStorage.clear();
    vi.useRealTimers();
    mockAddRideLog.mockResolvedValue('ride-1');
    mockSubmitWaitTimeReport.mockRejectedValue(new Error('permission denied'));
    mockGetActiveTrip.mockResolvedValue({ id: 'trip-1', name: 'August Trip' });
    mockGetTripRideLogs.mockResolvedValue([]);
    mockGetCollection.mockImplementation(
      async (path: string, constraints?: Array<{ value?: string }>) => {
        if (path === 'parks') return [{ id: 'magic-kingdom', name: 'Magic Kingdom' }];
        if (path === 'attractions' && constraints?.[0]?.value === 'magic-kingdom') {
          return [{
            id: 'space-mountain',
            name: 'Space Mountain',
            entityType: 'ATTRACTION',
          }];
        }
        return [];
      },
    );
  });

  it('keeps a successful ride when the optional report fails and uses accurate copy', async () => {
    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);

    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    fireEvent.click(screen.getByRole('button', { name: /No Wait/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));

    expect(await screen.findByText('Ride Logged!')).toBeInTheDocument();
    expect(screen.queryByText('Ride Logged & Wait Reported!')).not.toBeInTheDocument();
    expect(screen.getByText(/Ride saved.*report could not be sent/i)).toBeInTheDocument();
    expect(mockAddRideLog).toHaveBeenCalledTimes(1);
    expect(mockSubmitWaitTimeReport).toHaveBeenCalledWith({
      requestId: 'wait-report-1234',
      attractionId: 'space-mountain',
      attractionName: 'Space Mountain',
      parkId: 'magic-kingdom',
      waitTime: 0,
    });
  });

  it('requires an explicit standalone choice when active-trip lookup fails', async () => {
    mockGetActiveTrip.mockRejectedValueOnce(new Error('offline'));

    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);

    expect(await screen.findByText(/Could not check for an active trip/i)).toBeInTheDocument();
    expect(screen.queryByText('No active trip')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Log standalone/i })).toBeInTheDocument();

    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    fireEvent.change(screen.getByLabelText('Wait time in minutes'), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Could not check for an active trip/i)).toHaveLength(2);
    });
    expect(mockAddRideLog).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Log standalone/i }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Log standalone/i })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));

    expect(await screen.findByText('Ride Logged!')).toBeInTheDocument();
    expect(mockAddRideLog).toHaveBeenCalledTimes(1);
    expect(mockAddRideLog.mock.calls[0][2]).toBeNull();
  });

  it('times out a never-settling active-trip read and exposes retryable terminal UI', async () => {
    mockGetActiveTrip.mockImplementation(() => new Promise(() => {}));
    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);

    expect(await screen.findByText(/Could not check for an active trip/i, {}, {
      timeout: 9_000,
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry trip check/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Log standalone/i })).toBeEnabled();
  }, 10_000);

  it('logs the frozen ride command after recent-rides lookup times out and park is explicit', async () => {
    mockGetTripRideLogs.mockImplementation(() => new Promise(() => {}));
    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);

    expect(await screen.findByText(/Could not load recent rides/i, {}, {
      timeout: 9_000,
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry trip check/i })).toBeEnabled();
    const parkSelect = screen.getByLabelText('Logging at');
    expect(parkSelect).toBeEnabled();
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    fireEvent.change(screen.getByLabelText('Wait time in minutes'), {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));

    expect(await screen.findByText('Ride Logged!')).toBeInTheDocument();
    expect(mockAddRideLog.mock.calls).toEqual([[
      'user-123',
      {
        parkId: 'magic-kingdom',
        attractionId: 'space-mountain',
        parkName: 'Magic Kingdom',
        attractionName: 'Space Mountain',
        rodeAt: expect.any(Date),
        waitTimeMinutes: 25,
        attractionClosed: false,
        source: 'manual',
        rating: null,
        notes: '',
      },
      'trip-1',
      {
        requestId: expect.stringMatching(/^[A-Za-z0-9_-]{8,128}$/),
        timeoutMs: 10_000,
      },
    ]]);
  }, 10_000);

  it('keeps the same ride command after an ambiguous failure and never offers start-over', async () => {
    mockAddRideLog
      .mockRejectedValueOnce(Object.assign(new Error('network unavailable'), {
        outcome: 'ambiguous',
      }))
      .mockResolvedValueOnce('ride-1');
    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);

    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    fireEvent.click(screen.getByRole('button', { name: /No Wait/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));

    expect(await screen.findByText('network unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Discard failed save/i })).not.toBeInTheDocument();
    const firstRequestId = mockAddRideLog.mock.calls[0][3].requestId;

    fireEvent.click(screen.getByRole('button', { name: /Retry Save/i }));
    expect(await screen.findByText('Ride Logged!')).toBeInTheDocument();
    expect(mockAddRideLog.mock.calls[1][3].requestId).toBe(firstRequestId);
    expect(mockAddRideLog.mock.calls[1][1].rodeAt.toISOString())
      .toBe(mockAddRideLog.mock.calls[0][1].rodeAt.toISOString());
  });

  it('finishes committed cleanup without submitting the ride twice', async () => {
    configurePendingSaveCommandRemovalFailureForTests(() => {
      throw new Error('cleanup failed');
    });
    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);

    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    fireEvent.click(screen.getByRole('button', { name: /No Wait/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));

    expect(await screen.findByRole('button', { name: /Finish Cleanup/i })).toBeEnabled();
    expect(screen.getByText(/ride is saved/i)).toBeInTheDocument();
    expect(mockAddRideLog).toHaveBeenCalledTimes(1);
    expect(mockSubmitWaitTimeReport).not.toHaveBeenCalled();

    configurePendingSaveCommandRemovalFailureForTests(null);
    fireEvent.click(screen.getByRole('button', { name: /Finish Cleanup/i }));
    expect(await screen.findByText('Ride Logged!')).toBeInTheDocument();
    expect(mockAddRideLog).toHaveBeenCalledTimes(1);
  });

  it('restores the complete frozen command after reload', async () => {
    mockAddRideLog
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { outcome: 'ambiguous' }))
      .mockResolvedValueOnce('ride-1');
    const first = render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);

    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    fireEvent.click(screen.getByRole('button', { name: /No Wait/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));
    await screen.findByText('offline');
    const firstRequestId = mockAddRideLog.mock.calls[0][3].requestId;
    const firstRodeAt = mockAddRideLog.mock.calls[0][1].rodeAt.toISOString();
    first.unmount();

    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Retry Save/i }));
    await screen.findByText('Ride Logged!');

    expect(mockAddRideLog.mock.calls[1][3].requestId).toBe(firstRequestId);
    expect(mockAddRideLog.mock.calls[1][1].rodeAt.toISOString()).toBe(firstRodeAt);
    expect(localStorage.length).toBe(0);
  });

  it('preserves and restores the frozen command after close and reopen without unmounting', async () => {
    mockAddRideLog
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { outcome: 'ambiguous' }))
      .mockResolvedValueOnce('ride-1');

    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open log sheet</button>
          <UnifiedLogSheet open={open} expandedByDefault onClose={() => setOpen(false)} />
        </>
      );
    }

    render(<Harness />);
    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    fireEvent.click(screen.getByRole('button', { name: /No Wait/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));
    await screen.findByText('offline');
    const requestId = mockAddRideLog.mock.calls[0][3].requestId;

    fireEvent.click(screen.getByRole('button', { name: 'Close log sheet' }));
    expect(screen.queryByLabelText('Logging at')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open log sheet' }));

    expect(await screen.findByText(/Pending save for Space Mountain/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Logging at')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry Save/i }));
    await screen.findByText('Ride Logged!');
    expect(mockAddRideLog.mock.calls[1][3].requestId).toBe(requestId);
  });

  it('restores an expanded frozen command with a default-collapsed close and reopen', async () => {
    mockAddRideLog
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { outcome: 'ambiguous' }))
      .mockResolvedValueOnce('ride-1');

    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open log sheet</button>
          <UnifiedLogSheet open={open} onClose={() => setOpen(false)} />
        </>
      );
    }

    render(<Harness />);
    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    fireEvent.click(screen.getByRole('button', { name: /I also rode this/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));
    await screen.findByText('offline');
    const firstPayload = mockAddRideLog.mock.calls[0][1];
    const firstRequestId = mockAddRideLog.mock.calls[0][3].requestId;

    fireEvent.click(screen.getByRole('button', { name: 'Close log sheet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open log sheet' }));
    expect(await screen.findByRole('button', { name: /I rode this/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Retry Save/i }));
    await screen.findByText('Ride Logged!');

    expect(mockAddRideLog.mock.calls[1][1]).toEqual(firstPayload);
    expect(mockAddRideLog.mock.calls[1][3].requestId).toBe(firstRequestId);
    expect(mockAddRideLog).toHaveBeenCalledTimes(2);
  });

  it('restores an expanded frozen command with a default-collapsed reload', async () => {
    mockAddRideLog
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { outcome: 'ambiguous' }))
      .mockResolvedValueOnce('ride-1');
    const first = render(<UnifiedLogSheet open onClose={vi.fn()} />);
    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    fireEvent.click(screen.getByRole('button', { name: /I also rode this/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));
    await screen.findByText('offline');
    const firstPayload = mockAddRideLog.mock.calls[0][1];
    const firstRequestId = mockAddRideLog.mock.calls[0][3].requestId;
    first.unmount();

    render(<UnifiedLogSheet open onClose={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /I rode this/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Retry Save/i }));
    await screen.findByText('Ride Logged!');

    expect(mockAddRideLog.mock.calls[1][1]).toEqual(firstPayload);
    expect(mockAddRideLog.mock.calls[1][3].requestId).toBe(firstRequestId);
    expect(mockAddRideLog).toHaveBeenCalledTimes(2);
  });

  it('shows capacity guidance and sends no ride or report request', async () => {
    for (let index = 0; index < 8; index += 1) {
      expect((await storePendingSaveCommand('user-123', `occupied:${index}`, {
        requestId: `occupied-${index}`,
      })).ok).toBe(true);
    }
    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);
    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));

    expect(await screen.findByText(/pending-save storage is full/i)).toBeInTheDocument();
    expect(screen.getByText(/no request was sent/i)).toBeInTheDocument();
    expect(mockAddRideLog).not.toHaveBeenCalled();
    expect(mockSubmitWaitTimeReport).not.toHaveBeenCalled();
  });

  it('shows park catalog failures independently and recovers with park-only retry', async () => {
    let failParks = true;
    mockGetCollection
      .mockImplementation(async (path: string, constraints?: Array<{ value?: string }>) => {
        if (path === 'parks') {
          if (failParks) throw new Error('park read failed');
          return [{ id: 'magic-kingdom', name: 'Magic Kingdom' }];
        }
        if (path === 'attractions' && constraints?.[0]?.value === 'magic-kingdom') {
          return [{
            id: 'space-mountain',
            name: 'Space Mountain',
            entityType: 'ATTRACTION',
          }];
        }
        return [];
      });

    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);
    expect(await screen.findByText(/Parks could not be loaded/i)).toBeInTheDocument();
    failParks = false;
    fireEvent.click(screen.getByRole('button', { name: /Retry park loading/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Logging at')).toHaveTextContent('Magic Kingdom');
    });
  });

  it('times out a never-settling attraction catalog read with visible independent retry', async () => {
    mockGetCollection.mockImplementation(
      (path: string) => path === 'parks'
        ? Promise.resolve([{ id: 'magic-kingdom', name: 'Magic Kingdom' }])
        : new Promise(() => {}),
    );
    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);
    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });

    expect(await screen.findByText(/Attractions could not be loaded/i, {}, {
      timeout: 9_000,
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry attraction loading/i })).toBeEnabled();
  }, 10_000);

  it.each(['-1', '1', '181', '12.5'])(
    'rejects invalid ride wait %s before the unified save entrypoint',
    async (waitTime) => {
      render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);
      const parkSelect = await screen.findByLabelText('Logging at');
      await waitFor(() => expect(parkSelect).toBeEnabled());
      fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
      fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
      fireEvent.change(screen.getByLabelText('Wait time in minutes'), {
        target: { value: waitTime },
      });
      fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));

      expect(await screen.findByText(/Wait time must be/i)).toBeInTheDocument();
      expect(mockAddRideLog).not.toHaveBeenCalled();
    },
  );
});
