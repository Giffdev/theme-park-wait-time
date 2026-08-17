/**
 * Tests for queue-timer UI components.
 *
 * Components tested:
 * - QueueTimerButton: start/stop timer interaction
 * - TimerDisplay: MM:SS elapsed time display
 * - TimerCompleteSheet: bottom sheet after timer stop
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';

// Mock Firebase config
vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-123' } },
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/parks/magic-kingdom/space-mountain',
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Timer: ({ className }: { className?: string }) => <span data-testid="icon-timer" className={className} />,
  Square: () => <span data-testid="icon-square" />,
  Star: ({ className }: { className?: string }) => <span data-testid="icon-star" className={className} />,
  Clock: () => <span data-testid="icon-clock" />,
  Check: () => <span data-testid="icon-check" />,
  X: () => <span data-testid="icon-x" />,
}));

// Mock auth context
const mockAuthState = {
  user: { uid: 'user-123', email: 'test@example.com' } as {
    uid: string;
    email: string;
  } | null,
};
vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: mockAuthState.user, loading: false }),
}));

// Mock useActiveTimer hook
const mockUseActiveTimer = vi.fn();
vi.mock('@/hooks/useActiveTimer', () => ({
  useActiveTimer: () => mockUseActiveTimer(),
}));

// Mock timer service
vi.mock('@/lib/services/timer-service', () => ({
  startTimer: vi.fn().mockResolvedValue(undefined),
  stopTimer: vi.fn().mockResolvedValue({ elapsedMinutes: 35, timer: { attractionName: 'Space Mountain', parkId: 'magic-kingdom', attractionId: 'space-mountain', parkName: 'Magic Kingdom' } }),
  subscribeToActiveTimer: vi.fn(() => () => {}),
}));

// Mock ride-log-service (used by TimerCompleteSheet)
vi.mock('@/lib/services/ride-log-service', () => ({
  RideLogSaveError: class RideLogSaveError extends Error {
    code: string;
    savedLogId?: string;

    constructor(code: string, message: string, _cause?: unknown, savedLogId?: string) {
      super(message);
      this.name = 'RideLogSaveError';
      this.code = code;
      this.savedLogId = savedLogId;
    }
  },
  RIDE_LOG_SAVE_TIMEOUT_MS: 10_000,
  createRideLog: vi.fn().mockResolvedValue('log-1'),
  submitCrowdReport: vi.fn().mockResolvedValue(undefined),
}));

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  serverTimestamp: vi.fn(),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }), fromDate: (d: Date) => d },
}));

import QueueTimerButton from '@/components/queue-timer/QueueTimerButton';
import TimerDisplay from '@/components/queue-timer/TimerDisplay';
import TimerCompleteSheet from '@/components/queue-timer/TimerCompleteSheet';
import {
  createRideLog,
  RideLogSaveError,
  submitCrowdReport,
} from '@/lib/services/ride-log-service';

const mockCreateRideLog = vi.mocked(createRideLog);
const mockSubmitCrowdReport = vi.mocked(submitCrowdReport);

describe('QueueTimerButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Start Queue Timer" when no timer is active', () => {
    mockUseActiveTimer.mockReturnValue({ timer: null, isActive: false, elapsed: 0, isAbandoned: false });

    render(
      <QueueTimerButton
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        attractionName="Space Mountain"
      />,
    );

    expect(screen.getByText(/Start Queue Timer/)).toBeInTheDocument();
  });

  it('shows stop action when timer is active for this ride', () => {
    mockUseActiveTimer.mockReturnValue({
      timer: {
        parkId: 'magic-kingdom',
        attractionId: 'space-mountain',
        parkName: 'Magic Kingdom',
        attractionName: 'Space Mountain',
        clientStartedAt: Date.now() - 10 * 60 * 1000,
        startedAt: new Date(Date.now() - 10 * 60 * 1000),
        status: 'active',
      },
      isActive: true,
      elapsed: 600,
      isAbandoned: false,
    });

    render(
      <QueueTimerButton
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        attractionName="Space Mountain"
      />,
    );

    // Should show "I'm On!" stop button, not "Start"
    expect(screen.getByText(/I'm On!/)).toBeInTheDocument();
    expect(screen.queryByText(/Start Queue Timer/)).not.toBeInTheDocument();
  });

  it('shows disabled state when timer is active for a different ride', () => {
    mockUseActiveTimer.mockReturnValue({
      timer: {
        parkId: 'magic-kingdom',
        attractionId: 'thunder-mountain',
        parkName: 'Magic Kingdom',
        attractionName: 'Thunder Mountain',
        clientStartedAt: Date.now() - 5 * 60 * 1000,
        startedAt: new Date(Date.now() - 5 * 60 * 1000),
        status: 'active',
      },
      isActive: true,
      elapsed: 300,
      isAbandoned: false,
    });

    render(
      <QueueTimerButton
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        attractionName="Space Mountain"
      />,
    );

    // Button should be disabled and show the other ride name
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(screen.getByText(/Thunder Mountain/)).toBeInTheDocument();
  });
});

describe('TimerDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-29T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('updates every second', () => {
    const startTime = new Date(Date.now() - 65 * 1000); // 1 min 5 sec ago

    render(<TimerDisplay startedAt={startTime} />);

    // Should show 01:05 initially
    expect(screen.getByText('01:05')).toBeInTheDocument();

    // Advance 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should now show 01:06
    expect(screen.getByText('01:06')).toBeInTheDocument();
  });

  it('shows green for durations < 30 min', () => {
    const startTime = new Date(Date.now() - 10 * 60 * 1000); // 10 min

    const { container } = render(<TimerDisplay startedAt={startTime} />);

    const display = container.querySelector('span');
    expect(display?.className).toContain('green');
  });

  it('shows yellow for durations 30-60 min', () => {
    const startTime = new Date(Date.now() - 35 * 60 * 1000); // 35 min

    const { container } = render(<TimerDisplay startedAt={startTime} />);

    const display = container.querySelector('span');
    expect(display?.className).toContain('yellow');
  });

  it('shows red for durations > 60 min', () => {
    const startTime = new Date(Date.now() - 65 * 60 * 1000); // 65 min

    const { container } = render(<TimerDisplay startedAt={startTime} />);

    const display = container.querySelector('span');
    expect(display?.className).toContain('red');
  });
});

describe('TimerCompleteSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user = { uid: 'user-123', email: 'test@example.com' };
    mockCreateRideLog.mockResolvedValue('log-1');
    mockSubmitCrowdReport.mockResolvedValue(undefined);
  });

  it('renders with ride name and wait time', () => {
    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Space Mountain/)).toBeInTheDocument();
    expect(screen.getByText(/35 minute/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'timer-complete-title');
  });

  it.each([1, 181, 12.5, Number.NaN])(
    'rejects invalid elapsed wait %s before the timer save entrypoint',
    async (elapsedMinutes) => {
      render(
        <TimerCompleteSheet
          elapsedMinutes={elapsedMinutes}
          attractionName="Space Mountain"
          parkId="magic-kingdom"
          attractionId="space-mountain"
          parkName="Magic Kingdom"
          onClose={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save 🎉' }));
      expect(await screen.findByText(/Ride wait time must be/i)).toBeInTheDocument();
      expect(mockCreateRideLog).not.toHaveBeenCalled();
    },
  );

  it('moves focus into the dialog and traps Tab navigation', () => {
    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    const closeButton = screen.getByRole('button', {
      name: /Save ride without rating or notes and close/i,
    });
    const saveButton = screen.getByRole('button', { name: 'Save 🎉' });

    expect(closeButton).toHaveFocus();
    saveButton.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(closeButton).toHaveFocus();

    closeButton.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(saveButton).toHaveFocus();
  });

  it('handles Escape and restores focus to the opener after close', async () => {
    function DialogHarness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open completion</button>
          {open && (
            <TimerCompleteSheet
              elapsedMinutes={35}
              attractionName="Space Mountain"
              parkId="magic-kingdom"
              attractionId="space-mountain"
              parkName="Magic Kingdom"
              onClose={() => setOpen(false)}
            />
          )}
        </>
      );
    }

    render(<DialogHarness />);
    const opener = screen.getByRole('button', { name: 'Open completion' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog');
    expect(screen.getByRole('button', {
      name: /Save ride without rating or notes and close/i,
    })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
    expect(mockCreateRideLog).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        rating: null,
        notes: '',
      }),
      undefined,
      expect.any(Object),
    );
  });

  it('shows star rating buttons', () => {
    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={vi.fn()}
      />,
    );

    // 5 star buttons
    const stars = screen.getAllByTestId('icon-star');
    expect(stars.length).toBe(5);
    expect(screen.getByRole('button', { name: 'Rate 1 out of 5 stars' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save ride without rating or notes and close/i })).toBeInTheDocument();
  });

  it('has save and skip buttons', () => {
    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Save/)).toBeInTheDocument();
    expect(screen.getByText(/Skip/)).toBeInTheDocument();
  });

  it('saves successfully, reports the wait, and closes', async () => {
    const onClose = vi.fn();

    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText(/Save/));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockCreateRideLog).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        attractionId: 'space-mountain',
        waitTimeMinutes: 35,
      }),
      undefined,
      expect.objectContaining({
        requestId: expect.any(String),
        timeoutMs: 10_000,
        waitForTripStats: true,
      }),
    );
    expect(mockSubmitCrowdReport).toHaveBeenCalledWith({
      parkId: 'magic-kingdom',
      attractionId: 'space-mountain',
      waitTimeMinutes: 35,
    });
  });

  it('surfaces a bounded backend timeout and clears Saving state', async () => {
    mockCreateRideLog.mockRejectedValue(
      new RideLogSaveError('timeout', 'Saving the ride took too long. It was not confirmed; retrying is safe.'),
    );

    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/Save/));

    expect(await screen.findByRole('alert')).toHaveTextContent(/took too long/i);
    expect(screen.getByText(/Retry Save/)).toBeEnabled();
    expect(screen.getByText(/Retry Save/)).toHaveFocus();
  });

  it('reuses the immutable first command when retrying an unconfirmed timeout', async () => {
    const onClose = vi.fn();
    mockCreateRideLog
      .mockRejectedValueOnce(
        new RideLogSaveError('timeout', 'Saving the ride took too long. It was not confirmed; retrying is safe.'),
      )
      .mockResolvedValueOnce('confirmed-log');

    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rate 4 out of 5 stars' }));
    fireEvent.change(screen.getByLabelText('Notes (optional)'), {
      target: { value: 'First command notes' },
    });
    fireEvent.click(screen.getByText(/Save/));
    expect(await screen.findByRole('alert')).toHaveTextContent(/retrying is safe/i);

    const firstData = mockCreateRideLog.mock.calls[0][1];
    const firstRequestId = mockCreateRideLog.mock.calls[0][3]?.requestId;
    expect(screen.getByLabelText('Notes (optional)')).toBeDisabled();
    expect(screen.getByText('Skip')).toBeDisabled();
    fireEvent.click(screen.getByText(/Retry Save/));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockCreateRideLog).toHaveBeenCalledTimes(2);
    expect(mockCreateRideLog.mock.calls[1][3]?.requestId).toBe(firstRequestId);
    expect(mockCreateRideLog.mock.calls[1][1]).toBe(firstData);
    expect(mockCreateRideLog.mock.calls[1][1]).toMatchObject({
      rating: 4,
      notes: 'First command notes',
      rodeAt: firstData.rodeAt,
    });
  });

  it('surfaces auth loss without starting a write', async () => {
    mockAuthState.user = null;

    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/Save/));

    expect(await screen.findByRole('alert')).toHaveTextContent(/session expired/i);
    expect(mockCreateRideLog).not.toHaveBeenCalled();
  });

  it('surfaces Firestore rejection and does not close', async () => {
    const onClose = vi.fn();
    mockCreateRideLog.mockRejectedValue(
      new RideLogSaveError('write-failed', 'Firestore rejected the ride save. Check your connection and try again.'),
    );

    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText(/Save/));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Firestore rejected/i);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Retry Save/)).toBeEnabled();
    expect(screen.getByText(/Retry Save/)).toHaveFocus();
  });

  it('reports a close/navigation failure without saving the ride twice', async () => {
    const onClose = vi.fn().mockRejectedValue(new Error('navigation failed'));

    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText(/Save/));

    expect(await screen.findByText(/Ride saved.*could not close/i)).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeEnabled();
    expect(screen.getByText('Close')).toHaveFocus();

    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
    expect(mockCreateRideLog).toHaveBeenCalledTimes(1);
  });

  it('reports post-write stats timeout as saved and prevents duplicate retry', async () => {
    mockCreateRideLog.mockRejectedValue(
      new RideLogSaveError(
        'post-write-refresh-failed',
        'Ride saved. The trip summary could not refresh, but retrying will not duplicate this ride.',
        undefined,
        'ride-request-partial',
      ),
    );

    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/Save/));

    expect(await screen.findByText(/Ride saved.*trip summary could not refresh/i)).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent('Ride saved.');
    expect(mockSubmitCrowdReport).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Close')).toHaveFocus();

    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => expect(mockCreateRideLog).toHaveBeenCalledTimes(1));
  });

  it('announces saving and disables all interactive controls during submission', async () => {
    let resolveSave!: (value: string) => void;
    mockCreateRideLog.mockImplementation(() => new Promise<string>((resolve) => {
      resolveSave = resolve;
    }));

    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText(/Save/));

    expect(screen.getByRole('status')).toHaveTextContent('Saving ride.');
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-busy', 'true');
    expect(dialog).toHaveFocus();
    expect(screen.getByLabelText('Notes (optional)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rate 1 out of 5 stars' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save ride without rating or notes and close/i })).toBeDisabled();
    expect(screen.getByText('Skip')).toBeDisabled();

    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(mockCreateRideLog).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    resolveSave('log-1');
    await waitFor(() => expect(mockCreateRideLog).toHaveBeenCalledTimes(1));
  });

  it('ignores a rapid double click while the same save is in flight', async () => {
    let resolveSave!: (value: string) => void;
    mockCreateRideLog.mockImplementation(() => new Promise<string>((resolve) => {
      resolveSave = resolve;
    }));
    const onClose = vi.fn();

    render(
      <TimerCompleteSheet
        elapsedMinutes={35}
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        attractionId="space-mountain"
        parkName="Magic Kingdom"
        onClose={onClose}
      />,
    );

    const saveButton = screen.getByText(/Save/);
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    expect(mockCreateRideLog).toHaveBeenCalledTimes(1);

    resolveSave('log-1');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockCreateRideLog).toHaveBeenCalledTimes(1);
  });
});
