/**
 * Tests for QuickLogSheet component.
 *
 * The QuickLogSheet is the primary logging interface — a bottom sheet that lets
 * users log rides from any page. It handles park selection, attraction search,
 * temporal modes, and ride saving.
 *
 * Component file: src/components/QuickLogSheet.tsx (being built in parallel)
 * These tests define the rendering and interaction contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// --- Mock Firebase config ---
vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-123' } },
}));

// --- Mock next/navigation ---
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/parks',
}));

// --- Mock lucide-react icons ---
vi.mock('lucide-react', () => ({
  X: () => <span data-testid="icon-x" />,
  Search: () => <span data-testid="icon-search" />,
  Clock: () => <span data-testid="icon-clock" />,
  Star: ({ className }: { className?: string }) => <span data-testid="icon-star" className={className} />,
  Check: () => <span data-testid="icon-check" />,
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
  MapPin: () => <span data-testid="icon-map-pin" />,
  Plus: () => <span data-testid="icon-plus" />,
}));

// --- Mock auth context ---
const mockUser = { uid: 'user-123', email: 'test@example.com' };
vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

// --- Mock ride-log-service ---
const mockAddRideLog = vi.fn().mockResolvedValue('log-new-1');
vi.mock('@/lib/services/ride-log-service', () => ({
  addRideLog: (...args: unknown[]) => mockAddRideLog(...args),
}));

// --- Mock trip-service ---
const mockGetActiveTrip = vi.fn();
const mockQuickCreateTrip = vi.fn();
vi.mock('@/lib/services/trip-service', () => ({
  getActiveTrip: (...args: unknown[]) => mockGetActiveTrip(...args),
  quickCreateTrip: (...args: unknown[]) => mockQuickCreateTrip(...args),
}));

// --- Mock trip-day-service ---
const mockEnsureTripDayForLog = vi.fn();
vi.mock('@/lib/services/trip-day-service', () => ({
  ensureTripDayForLog: (...args: unknown[]) => mockEnsureTripDayForLog(...args),
}));

// --- Mock firebase/firestore ---
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }), fromDate: (d: Date) => d },
}));

// --- Mock parks/attractions data ---
const mockParks = [
  { id: 'magic-kingdom', name: 'Magic Kingdom' },
  { id: 'epcot', name: 'EPCOT' },
  { id: 'hollywood-studios', name: "Hollywood Studios" },
];

const mockAttractions = [
  { id: 'space-mountain', name: 'Space Mountain', parkId: 'magic-kingdom', type: 'thrill' },
  { id: 'haunted-mansion', name: 'Haunted Mansion', parkId: 'magic-kingdom', type: 'family' },
  { id: 'its-a-small-world', name: "It's a Small World", parkId: 'magic-kingdom', type: 'family' },
  { id: 'test-track', name: 'Test Track', parkId: 'epcot', type: 'thrill' },
];

vi.mock('@/lib/firebase/firestore', () => ({
  getCollection: vi.fn().mockImplementation((path: string) => {
    if (path.includes('parks')) return Promise.resolve(mockParks);
    if (path.includes('attractions')) return Promise.resolve(mockAttractions);
    return Promise.resolve([]);
  }),
}));

/**
 * Since QuickLogSheet.tsx doesn't exist yet, we define an inline stub component
 * that matches the expected contract. When the real component lands, swap this import.
 *
 * Contract:
 * - Props: { isOpen, onClose, preselectedParkId?, preselectedAttractionId? }
 * - When isOpen=false, renders nothing visible
 * - When isOpen=true, shows the full logging UI
 * - Park selector remembers last selection (localStorage)
 * - Temporal mode selector defaults to 'Now'
 * - Filters attractions by type pills
 * - On successful log: shows success state with "Log Another" and "Done" buttons
 * - When no active trip: shows "Add to trip?" prompt
 */

// Stub component for contract testing
function QuickLogSheet({
  isOpen,
  onClose,
  preselectedParkId,
}: {
  isOpen: boolean;
  onClose: () => void;
  preselectedParkId?: string;
  preselectedAttractionId?: string;
}) {
  const [selectedPark, setSelectedPark] = React.useState(
    preselectedParkId || localStorage.getItem('lastParkId') || '',
  );
  const [selectedType, setSelectedType] = React.useState<string | null>(null);
  const [logSuccess, setLogSuccess] = React.useState(false);
  const [showTripPrompt, setShowTripPrompt] = React.useState(false);

  if (!isOpen) return null;

  const filteredAttractions = mockAttractions.filter((a) => {
    if (a.parkId !== selectedPark) return false;
    if (selectedType && a.type !== selectedType) return false;
    return true;
  });

  const handleLogRide = async (attractionId: string) => {
    const hasActiveTrip = await mockGetActiveTrip('user-123');
    if (!hasActiveTrip) {
      setShowTripPrompt(true);
      return;
    }
    await mockAddRideLog('user-123', {
      parkId: selectedPark,
      attractionId,
      rodeAt: new Date(),
    });
    setLogSuccess(true);
  };

  if (showTripPrompt) {
    return (
      <div data-testid="quick-log-sheet" role="dialog">
        <p>Add to trip?</p>
        <button onClick={() => setShowTripPrompt(false)}>Create New Trip</button>
        <button onClick={() => setShowTripPrompt(false)}>Log Without Trip</button>
      </div>
    );
  }

  if (logSuccess) {
    return (
      <div data-testid="quick-log-sheet" role="dialog">
        <p>Ride logged!</p>
        <button onClick={() => setLogSuccess(false)}>Log Another</button>
        <button onClick={onClose}>Done</button>
      </div>
    );
  }

  return (
    <div data-testid="quick-log-sheet" role="dialog">
      <h2>Log a Ride</h2>

      {/* Temporal Mode Selector */}
      <div data-testid="temporal-modes">
        <button aria-pressed="true">Now</button>
        <button aria-pressed="false">Earlier</button>
        <button aria-pressed="false">Past Date</button>
      </div>

      {/* Park Selector */}
      <select
        data-testid="park-selector"
        value={selectedPark}
        onChange={(e) => {
          setSelectedPark(e.target.value);
          localStorage.setItem('lastParkId', e.target.value);
        }}
      >
        <option value="">Select Park</option>
        {mockParks.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      {/* Type Filter Pills */}
      <div data-testid="type-filters">
        <button
          data-testid="filter-thrill"
          onClick={() => setSelectedType(selectedType === 'thrill' ? null : 'thrill')}
        >
          Thrill
        </button>
        <button
          data-testid="filter-family"
          onClick={() => setSelectedType(selectedType === 'family' ? null : 'family')}
        >
          Family
        </button>
      </div>

      {/* Attraction List */}
      <ul data-testid="attraction-list">
        {filteredAttractions.map((a) => (
          <li key={a.id}>
            <button onClick={() => handleLogRide(a.id)}>{a.name}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

describe('QuickLogSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetActiveTrip.mockResolvedValue(null);
  });

  it('renders in closed state (not visible)', () => {
    const { container } = render(<QuickLogSheet isOpen={false} onClose={vi.fn()} />);

    expect(container.innerHTML).toBe('');
    expect(screen.queryByTestId('quick-log-sheet')).not.toBeInTheDocument();
  });

  it('opens when triggered (visible, shows UI)', () => {
    render(<QuickLogSheet isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByTestId('quick-log-sheet')).toBeInTheDocument();
    expect(screen.getByText('Log a Ride')).toBeInTheDocument();
  });

  it('shows park selector pre-filled from localStorage', () => {
    localStorage.setItem('lastParkId', 'epcot');

    render(<QuickLogSheet isOpen={true} onClose={vi.fn()} />);

    const selector = screen.getByTestId('park-selector') as HTMLSelectElement;
    expect(selector.value).toBe('epcot');
  });

  it('shows temporal mode selector with "Now" as default', () => {
    render(<QuickLogSheet isOpen={true} onClose={vi.fn()} />);

    const nowButton = screen.getByText('Now');
    expect(nowButton).toBeInTheDocument();
    expect(nowButton.getAttribute('aria-pressed')).toBe('true');

    const earlierButton = screen.getByText('Earlier');
    expect(earlierButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('filters attractions by type when pill selected', async () => {
    localStorage.setItem('lastParkId', 'magic-kingdom');

    render(<QuickLogSheet isOpen={true} onClose={vi.fn()} />);

    // Initially shows all MK attractions
    expect(screen.getByText('Space Mountain')).toBeInTheDocument();
    expect(screen.getByText('Haunted Mansion')).toBeInTheDocument();

    // Click 'Thrill' filter
    fireEvent.click(screen.getByTestId('filter-thrill'));

    // Now only thrill rides should show
    expect(screen.getByText('Space Mountain')).toBeInTheDocument();
    expect(screen.queryByText('Haunted Mansion')).not.toBeInTheDocument();
  });

  it('logs ride and shows success state', async () => {
    localStorage.setItem('lastParkId', 'magic-kingdom');
    mockGetActiveTrip.mockResolvedValue({ id: 'trip-active', status: 'active' });

    render(<QuickLogSheet isOpen={true} onClose={vi.fn()} />);

    // Click on Space Mountain to log
    fireEvent.click(screen.getByText('Space Mountain'));

    await waitFor(() => {
      expect(screen.getByText('Ride logged!')).toBeInTheDocument();
    });
  });

  it('"Log Another" keeps sheet open after successful log', async () => {
    localStorage.setItem('lastParkId', 'magic-kingdom');
    mockGetActiveTrip.mockResolvedValue({ id: 'trip-active', status: 'active' });

    render(<QuickLogSheet isOpen={true} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Space Mountain'));

    await waitFor(() => {
      expect(screen.getByText('Log Another')).toBeInTheDocument();
    });

    // Click "Log Another"
    fireEvent.click(screen.getByText('Log Another'));

    // Sheet should still be open, back to log state
    await waitFor(() => {
      expect(screen.getByText('Log a Ride')).toBeInTheDocument();
    });
  });

  it('"Done" closes the sheet', async () => {
    localStorage.setItem('lastParkId', 'magic-kingdom');
    mockGetActiveTrip.mockResolvedValue({ id: 'trip-active', status: 'active' });
    const onClose = vi.fn();

    render(<QuickLogSheet isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getByText('Space Mountain'));

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Done'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows "Add to trip?" prompt when no active trip exists', async () => {
    localStorage.setItem('lastParkId', 'magic-kingdom');
    mockGetActiveTrip.mockResolvedValue(null);

    render(<QuickLogSheet isOpen={true} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('Space Mountain'));

    await waitFor(() => {
      expect(screen.getByText('Add to trip?')).toBeInTheDocument();
    });
  });
});
