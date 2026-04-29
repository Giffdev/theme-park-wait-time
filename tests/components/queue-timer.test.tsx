/**
 * Tests for queue-timer UI components.
 *
 * Components tested:
 * - QueueTimerButton: start/stop timer interaction
 * - TimerDisplay: MM:SS elapsed time display
 * - TimerCompleteSheet: bottom sheet after timer stop
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
const mockUser = { uid: 'user-123', email: 'test@example.com' };
vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
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
});
