/**
 * Tests for ride-log UI components.
 *
 * Components tested:
 * - RideLogList: list display with empty state and date grouping
 * - RideLogEntry: single entry display
 * - ManualLogForm: form validation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock Firebase
vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-123' } },
}));

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  collection: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/ride-log',
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Star: ({ className }: { className?: string }) => <span data-testid="icon-star" className={className} />,
  Clock: ({ className }: { className?: string }) => <span data-testid="icon-clock" className={className} />,
  Calendar: () => <span data-testid="icon-calendar" />,
  Plus: () => <span data-testid="icon-plus" />,
  Trash2: ({ className }: { className?: string }) => <span data-testid="icon-trash" className={className} />,
  Edit: () => <span data-testid="icon-edit" />,
  ChevronDown: ({ className }: { className?: string }) => <span data-testid="icon-chevron" className={className} />,
  X: () => <span data-testid="icon-x" />,
}));

// Mock auth context
vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'user-123', email: 'test@example.com' }, loading: false }),
}));

// Mock ride log service
vi.mock('@/lib/services/ride-log-service', () => ({
  getRideLogs: vi.fn(),
  addRideLog: vi.fn(),
  createRideLog: vi.fn(),
  deleteRideLog: vi.fn(),
}));

// Mock firestore getCollection
vi.mock('@/lib/firebase/firestore', () => ({
  getCollection: vi.fn().mockResolvedValue([]),
  addDocument: vi.fn(),
  getDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  whereConstraint: vi.fn(),
  orderByConstraint: vi.fn(),
  limitConstraint: vi.fn(),
  dateToTimestamp: vi.fn((d) => d),
}));

import RideLogList from '@/components/ride-log/RideLogList';
import RideLogEntry from '@/components/ride-log/RideLogEntry';
import ManualLogForm from '@/components/ride-log/ManualLogForm';

describe('RideLogList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no logs exist', () => {
    render(<RideLogList logs={[]} />);

    expect(screen.getByText(/No rides logged yet/)).toBeInTheDocument();
  });

  it('renders log entries when logs are provided', () => {
    const logs = [
      {
        id: 'log-1',
        parkId: 'magic-kingdom',
        attractionId: 'space-mountain',
        parkName: 'Magic Kingdom',
        attractionName: 'Space Mountain',
        rodeAt: new Date('2026-04-29T12:00:00Z'),
        waitTimeMinutes: 35,
        source: 'timer' as const,
        rating: 4,
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'log-2',
        parkId: 'magic-kingdom',
        attractionId: 'thunder-mountain',
        parkName: 'Magic Kingdom',
        attractionName: 'Thunder Mountain',
        rodeAt: new Date('2026-04-29T14:00:00Z'),
        waitTimeMinutes: 20,
        source: 'manual' as const,
        rating: null,
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    render(<RideLogList logs={logs} />);

    expect(screen.getByText(/Space Mountain/)).toBeInTheDocument();
    expect(screen.getByText(/Thunder Mountain/)).toBeInTheDocument();
  });

  it('groups entries by date with date headers', () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    const logs = [
      {
        id: 'log-1',
        parkId: 'mk',
        attractionId: 'sm',
        parkName: 'Magic Kingdom',
        attractionName: 'Space Mountain',
        rodeAt: today,
        waitTimeMinutes: 35,
        source: 'timer' as const,
        rating: 4,
        notes: '',
        createdAt: today,
        updatedAt: today,
      },
      {
        id: 'log-2',
        parkId: 'ep',
        attractionId: 'tt',
        parkName: 'EPCOT',
        attractionName: 'Test Track',
        rodeAt: yesterday,
        waitTimeMinutes: 50,
        source: 'timer' as const,
        rating: 5,
        notes: '',
        createdAt: yesterday,
        updatedAt: yesterday,
      },
    ];

    render(<RideLogList logs={logs} />);

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Yesterday')).toBeInTheDocument();
  });
});

describe('RideLogEntry', () => {
  it('displays all fields correctly', () => {
    const entry = {
      id: 'log-1',
      parkId: 'magic-kingdom',
      attractionId: 'space-mountain',
      parkName: 'Magic Kingdom',
      attractionName: 'Space Mountain',
      rodeAt: new Date('2026-04-29T12:00:00Z'),
      waitTimeMinutes: 35,
      source: 'timer' as const,
      rating: 4,
      notes: 'Great ride!',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    render(<RideLogEntry log={entry} />);

    expect(screen.getByText('Space Mountain')).toBeInTheDocument();
    expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
  });

  it('shows timer badge for timer-sourced entries', () => {
    const entry = {
      id: 'log-1',
      parkId: 'magic-kingdom',
      attractionId: 'space-mountain',
      parkName: 'Magic Kingdom',
      attractionName: 'Space Mountain',
      rodeAt: new Date('2026-04-29T12:00:00Z'),
      waitTimeMinutes: 35,
      source: 'timer' as const,
      rating: null,
      notes: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    render(<RideLogEntry log={entry} />);

    expect(screen.getByText(/Timer/)).toBeInTheDocument();
  });
});

describe('ManualLogForm', () => {
  it('validates required fields on submit', () => {
    const mockOnSuccess = vi.fn();

    render(<ManualLogForm onSuccess={mockOnSuccess} />);

    // Try to submit without filling required fields
    const submitButton = screen.getByText(/Log Ride/);
    fireEvent.click(submitButton);

    // Should show error for missing park/attraction
    expect(screen.getByText(/Please select a park and attraction/)).toBeInTheDocument();
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });
});
