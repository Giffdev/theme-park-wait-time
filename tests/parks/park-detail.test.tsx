/**
 * Tests for the Park Detail page.
 *
 * The park detail page is a client component that:
 * - Uses useParams to get parkId from the URL
 * - Fetches park doc, attractions, and wait times from Firestore
 * - Shows loading skeletons while data loads
 * - Sorts attractions by wait time (shortest first by default)
 * - Groups by status (operating first, then closed/refurbishment)
 * - Has a refresh button to reload wait time data
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ parkId: 'magic-kingdom' }),
  usePathname: () => '/parks/magic-kingdom',
}));

// Mock Firebase config
vi.mock('@/lib/firebase/config', () => ({
  auth: {},
  db: {},
  storage: {},
  app: {},
}));

vi.mock('@/components/UnifiedLogSheet', () => ({
  default: () => null,
}));

// Mock Firestore
const mockGetCollection = vi.fn();
vi.mock('@/lib/firebase/firestore', () => ({
  getDocument: vi.fn(),
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  whereConstraint: vi.fn((...args: unknown[]) => args),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  RefreshCw: ({ className }: { className?: string }) => <span data-testid="refresh-icon" className={className}>↻</span>,
  ArrowUpDown: () => <span>⇅</span>,
  TrendingUp: () => <span>↗</span>,
  Clock: () => <span>🕐</span>,
  AlertCircle: () => <span>⚠</span>,
  MapPin: () => <span>📍</span>,
}));

// Mock park registry and locations
vi.mock('@/lib/parks/park-registry', () => ({
  DESTINATION_FAMILIES: [{
    familyName: 'Disney Parks',
    destinations: [{
      id: 'wdw',
      destinationId: 'wdw',
      slug: 'walt-disney-world-dest',
      parks: [{ id: 'magic-kingdom', name: 'Magic Kingdom' }],
    }],
  }],
}));

vi.mock('@/lib/parks/park-locations', () => ({
  getLocationByDestinationId: () => ({ city: 'Orlando', state: 'FL', country: 'United States' }),
  formatLocation: () => 'Orlando, FL',
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockSchedule = {
  segments: [],
  timezone: 'America/New_York',
};

const mockPark = {
  id: 'magic-kingdom',
  name: 'Magic Kingdom',
  slug: 'magic-kingdom',
  destinationName: 'Walt Disney World',
  destinationId: 'wdw',
};

const mockAttractions = [
  { id: 'space-mountain', name: 'Space Mountain', parkId: 'magic-kingdom', parkName: 'Magic Kingdom', entityType: 'ATTRACTION', slug: 'space-mountain' },
  { id: 'haunted-mansion', name: 'Haunted Mansion', parkId: 'magic-kingdom', parkName: 'Magic Kingdom', entityType: 'ATTRACTION', slug: 'haunted-mansion' },
  { id: 'pirates', name: 'Pirates of the Caribbean', parkId: 'magic-kingdom', parkName: 'Magic Kingdom', entityType: 'ATTRACTION', slug: 'pirates' },
  { id: 'jungle-cruise', name: 'Jungle Cruise', parkId: 'magic-kingdom', parkName: 'Magic Kingdom', entityType: 'ATTRACTION', slug: 'jungle-cruise' },
];

const mockWaitTimes = [
  { id: 'wt-1', attractionId: 'space-mountain', attractionName: 'Space Mountain', status: 'OPERATING', waitMinutes: 60, lastUpdated: '2026-04-29T09:00:00Z', fetchedAt: '2026-04-29T09:05:00Z', forecast: [{ time: '10:00', wait: 60 }] },
  { id: 'wt-2', attractionId: 'haunted-mansion', attractionName: 'Haunted Mansion', status: 'OPERATING', waitMinutes: 20, lastUpdated: '2026-04-29T09:00:00Z', fetchedAt: '2026-04-29T09:05:00Z', forecast: [{ time: '10:00', wait: 20 }] },
  { id: 'wt-3', attractionId: 'pirates', attractionName: 'Pirates of the Caribbean', status: 'CLOSED', waitMinutes: null, lastUpdated: null, fetchedAt: '2026-04-29T09:05:00Z', forecast: [] },
  { id: 'wt-4', attractionId: 'jungle-cruise', attractionName: 'Jungle Cruise', status: 'OPERATING', waitMinutes: 35, lastUpdated: '2026-04-29T09:00:00Z', fetchedAt: '2026-04-29T09:05:00Z', forecast: [{ time: '10:00', wait: 35 }] },
];

describe('Park Detail Page', () => {
  let ParkDetailPage: React.ComponentType;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetCollection.mockImplementation((collectionPath: string) => {
      if (collectionPath === 'parks') return Promise.resolve([mockPark]);
      if (collectionPath === 'attractions') return Promise.resolve(mockAttractions);
      if (collectionPath === 'waitTimes/magic-kingdom/current') return Promise.resolve(mockWaitTimes);
      return Promise.resolve([]);
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSchedule),
    });
    const mod = await import('@/app/parks/[parkId]/page');
    ParkDetailPage = mod.default;
  });

  describe('loading state', () => {
    it('shows loading skeletons while data loads', () => {
      mockGetCollection.mockReturnValue(new Promise(() => {}));

      const { container } = render(<ParkDetailPage />);

      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('shows wait-time loading state after park attractions are available', async () => {
      mockGetCollection.mockImplementation((collectionPath: string) => {
        if (collectionPath === 'parks') return Promise.resolve([mockPark]);
        if (collectionPath === 'attractions') return Promise.resolve(mockAttractions);
        if (collectionPath === 'waitTimes/magic-kingdom/current') return new Promise(() => {});
        return Promise.resolve([]);
      });

      render(<ParkDetailPage />);

      expect(await screen.findByText('Space Mountain')).toBeInTheDocument();
      expect(screen.getAllByText(/loading wait times/i).length).toBeGreaterThan(0);
    });
  });

  describe('after data loads', () => {
    it('renders park name from Firestore data', async () => {
      render(<ParkDetailPage />);

      await waitFor(() => {
        const heading = screen.getByRole('heading', { level: 1 });
        expect(heading).toHaveTextContent('Magic Kingdom');
      });
    });

    it('renders destination name', async () => {
      render(<ParkDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/Walt Disney World/)).toBeInTheDocument();
      });
    });

    it('renders breadcrumb navigation back to parks list', async () => {
      render(<ParkDetailPage />);

      await waitFor(() => {
        const parksLink = screen.getByRole('link', { name: /parks/i });
        expect(parksLink).toHaveAttribute('href', '/parks');
      });
    });

    it('displays attraction names', async () => {
      render(<ParkDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Space Mountain')).toBeInTheDocument();
        expect(screen.getByText('Haunted Mansion')).toBeInTheDocument();
        expect(screen.getByText('Jungle Cruise')).toBeInTheDocument();
      });
    });

    it('renders populated live wait times', async () => {
      render(<ParkDetailPage />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Space Mountain, operating, 60 minute wait/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Jungle Cruise, operating, 35 minute wait/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Haunted Mansion, operating, 20 minute wait/i })).toBeInTheDocument();
      });
    });

    it('marks an old snapshot as stale instead of presenting it as live', async () => {
      render(<ParkDetailPage />);

      expect((await screen.findAllByText(/Stale snapshot/i)).length).toBeGreaterThan(0);
    });

    it('separates attractions missing from a partial snapshot from confirmed closures', async () => {
      mockGetCollection.mockReset();
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockResolvedValueOnce(mockAttractions)
        .mockResolvedValueOnce([mockWaitTimes[0]])
        // Fallback for any further wait-times reads (e.g. an arrival-triggered
        // background refresh, since this fixture's timestamps are far in the
        // past and read as stale) — keeps behavior deterministic instead of
        // resolving to `undefined` once the queued once-values are exhausted.
        .mockResolvedValue([mockWaitTimes[0]]);

      render(<ParkDetailPage />);

      expect(await screen.findByRole('heading', { name: 'Wait Unavailable (3)' })).toBeInTheDocument();
      expect(screen.getAllByText('Unavailable')).toHaveLength(3);
      expect(screen.queryByText(/Closed \/ Not Operating/)).not.toBeInTheDocument();
    });

    it('sorts operating attractions by wait time (longest first by default)', async () => {
      render(<ParkDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Space Mountain')).toBeInTheDocument();
      });

      // Default sort is longest first (sortAsc = false → bWait - aWait)
      const allText = document.body.textContent || '';
      const spaceIdx = allText.indexOf('Space Mountain');
      const jungleIdx = allText.indexOf('Jungle Cruise');
      const hauntedIdx = allText.indexOf('Haunted Mansion');

      // 60 min > 35 min > 20 min
      expect(spaceIdx).toBeLessThan(jungleIdx);
      expect(jungleIdx).toBeLessThan(hauntedIdx);
    });

    it('groups operating attractions before closed ones', async () => {
      render(<ParkDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Pirates of the Caribbean')).toBeInTheDocument();
      });

      expect(screen.getByText(/Operating \(3\)/)).toBeInTheDocument();
      expect(screen.getByText(/Closed \/ Not Operating \(1\)/)).toBeInTheDocument();
    });

    it('displays wait time stats (avg wait, longest wait)', async () => {
      render(<ParkDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Avg Wait')).toBeInTheDocument();
        expect(screen.getByText('Longest Wait')).toBeInTheDocument();
      });
    });
  });

  describe('refresh behavior', () => {
    it('has a refresh button', async () => {
      render(<ParkDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Refresh Wait Times')).toBeInTheDocument();
      });
    });

    it('calls API with parkId when refresh is clicked', async () => {
      const user = userEvent.setup();
      render(<ParkDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Refresh Wait Times')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Refresh Wait Times'));

      expect(mockFetch).toHaveBeenCalledWith('/api/wait-times?parkId=magic-kingdom', {
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      });
    });

    it('shows "Refreshing..." during refresh', async () => {
      const user = userEvent.setup();

      render(<ParkDetailPage />);

      await waitFor(() => {
        expect(screen.getByText('Refresh Wait Times')).toBeInTheDocument();
      });

      // Now make fetch hang for the refresh call
      mockFetch.mockReturnValue(new Promise(() => {}));

      await user.click(screen.getByText('Refresh Wait Times'));

      expect(screen.getByText('Refreshing...')).toBeInTheDocument();
    });
  });

  describe('sort toggle', () => {
    it('shows sort label by default', async () => {
      render(<ParkDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/Shortest first/)).toBeInTheDocument();
      });
    });

    it('toggles to "Longest first" when sort button is clicked', async () => {
      const user = userEvent.setup();
      render(<ParkDetailPage />);

      await waitFor(() => {
        expect(screen.getByText(/Shortest first/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/Shortest first/));

      expect(screen.getByText(/Longest first/)).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('offers a supported-parks recovery path when the park slug is not found', async () => {
      mockGetCollection.mockResolvedValue([]);

      render(<ParkDetailPage />);

      expect(await screen.findByRole('heading', { name: 'Park not found' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Browse supported parks →' }))
        .toHaveAttribute('href', '/parks');
      expect(screen.queryByRole('button', { name: /Refresh Wait Times/i })).not.toBeInTheDocument();
    });

    it('shows a recoverable park-level error when core data fails', async () => {
      mockGetCollection.mockRejectedValue(new Error('Network error'));

      render(<ParkDetailPage />);

      expect(await screen.findByRole('heading', { name: 'Park details unavailable' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('distinguishes a permission-denied wait feed from a closed park', async () => {
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockResolvedValueOnce(mockAttractions)
        .mockRejectedValueOnce(Object.assign(new Error('Missing permission'), { code: 'permission-denied' }));

      render(<ParkDetailPage />);

      expect((await screen.findAllByText('Wait times aren’t available yet')).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Retry wait times' })).toBeInTheDocument();
      expect(screen.queryByText(/park is currently closed/i)).not.toBeInTheDocument();
      expect(screen.getAllByText('Unavailable')).toHaveLength(4);
    });

    it('shows a trustworthy empty state when the feed returns no snapshot', async () => {
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockResolvedValueOnce(mockAttractions)
        .mockResolvedValueOnce([]);

      render(<ParkDetailPage />);

      expect(await screen.findByText('No current wait-time snapshot is available')).toBeInTheDocument();
      expect(screen.getByText(/won’t label missing waits as live/i)).toBeInTheDocument();
      expect(screen.getAllByText('Unavailable')).toHaveLength(4);
    });

    it('explains an upstream refresh failure while preserving the current snapshot', async () => {
      const user = userEvent.setup();
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockResolvedValueOnce(mockAttractions)
        .mockResolvedValueOnce(mockWaitTimes);

      render(<ParkDetailPage />);
      await screen.findByRole('button', { name: /Space Mountain, operating, 60 minute wait/i });

      mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
      await user.click(screen.getByRole('button', { name: /Refresh Wait Times/i }));

      expect(await screen.findByText(/upstream wait-time provider is temporarily unavailable/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Space Mountain, operating, 60 minute wait/i })).toBeInTheDocument();
    });

    it('shows the park as found (not "unavailable") when the park doc loads but the attraction directory fails — the Alton Towers scenario', async () => {
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions'), { code: 'permission-denied' }))
        .mockResolvedValueOnce([]);

      render(<ParkDetailPage />);

      // Park header renders — the park itself was found, unlike the old
      // behavior that showed a blanket "Park details unavailable" for any
      // failure downstream of the park lookup.
      expect(await screen.findByRole('heading', { level: 1, name: 'Magic Kingdom' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Park details unavailable' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Park not found' })).not.toBeInTheDocument();

      // The attraction-directory failure is called out distinctly, with its own retry.
      expect(await screen.findByText('Attraction directory isn’t available yet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry attraction list' })).toBeInTheDocument();
    });

    it('retries only the attraction directory (not the whole park) when "Retry attraction list" is clicked', async () => {
      const user = userEvent.setup();
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockRejectedValueOnce(new Error('temporary network blip'))
        .mockResolvedValueOnce([]);

      render(<ParkDetailPage />);

      const retryButton = await screen.findByRole('button', { name: 'Retry attraction list' });

      mockGetCollection.mockResolvedValueOnce(mockAttractions);
      await user.click(retryButton);

      expect(await screen.findByText('Space Mountain')).toBeInTheDocument();
      expect(screen.queryByText('Attraction directory isn’t available yet')).not.toBeInTheDocument();
      expect(screen.queryByText('Couldn’t load the attraction directory')).not.toBeInTheDocument();
    });

    it('non-blockingly refreshes wait times on arrival when the cached snapshot is already stale', async () => {
      const staleWaitTimes = mockWaitTimes.map((w) => ({
        ...w,
        fetchedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min old — past the 2 min threshold
      }));
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockResolvedValueOnce(mockAttractions)
        .mockResolvedValueOnce(staleWaitTimes);

      render(<ParkDetailPage />);

      await screen.findByRole('button', { name: /Space Mountain, operating, 60 minute wait/i });

      // A background refresh should fire automatically on arrival (without a
      // manual click and without a hidden→visible transition), re-querying
      // wait times through the same getCollection path used for a normal refresh.
      await waitFor(() => {
        const waitTimesCalls = mockGetCollection.mock.calls.filter(
          (call) => call[0] === 'waitTimes/magic-kingdom/current'
        );
        expect(waitTimesCalls.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('does not auto-refresh on arrival when the cached wait-time snapshot is already fresh', async () => {
      const freshWaitTimes = mockWaitTimes.map((w) => ({
        ...w,
        fetchedAt: new Date(Date.now() - 30 * 1000).toISOString(), // 30s old — well under 2 min
      }));
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockResolvedValueOnce(mockAttractions)
        .mockResolvedValueOnce(freshWaitTimes);

      render(<ParkDetailPage />);

      await screen.findByRole('button', { name: /Space Mountain, operating, 60 minute wait/i });

      // Give any stray async work a tick, then confirm no extra wait-times fetch occurred.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const waitTimesCalls = mockGetCollection.mock.calls.filter(
        (call) => call[0] === 'waitTimes/magic-kingdom/current'
      );
      expect(waitTimesCalls.length).toBe(1);
    });
  });

  describe('schedule/wait-time decoupling', () => {
    // Regression coverage for the production bug where `/api/park-schedule`
    // hanging indefinitely left `waitTimesLoading` stuck forever (header said
    // "Loading wait times…" while every row said "Unavailable"). Schedule and
    // wait times must now resolve completely independently of one another.
    const scheduleWithHours = {
      segments: [{
        type: 'OPERATING',
        openingTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        closingTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }],
      timezone: 'America/New_York',
    };

    function mockFetchByUrl(handlers: { schedule?: () => Promise<unknown>; waitTimes?: () => Promise<unknown> }) {
      mockFetch.mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/park-schedule')) {
          return handlers.schedule ? handlers.schedule() : Promise.resolve({ ok: true, json: () => Promise.resolve(mockSchedule) });
        }
        if (typeof url === 'string' && url.includes('/api/wait-times')) {
          return handlers.waitTimes ? handlers.waitTimes() : Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
    }

    it('renders wait times fully and settles waitTimesLoading when the schedule fetch hangs/times out', async () => {
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockResolvedValueOnce(mockAttractions)
        .mockResolvedValueOnce(mockWaitTimes)
        .mockResolvedValue(mockWaitTimes);
      mockFetchByUrl({
        schedule: () => Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
      });

      render(<ParkDetailPage />);

      // Wait times render fully and the "Loading wait times…" indicator clears —
      // the schedule timeout never blocks this.
      expect(await screen.findByRole('button', { name: /Space Mountain, operating, 60 minute wait/i })).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByText(/^Loading wait times…$/i)).not.toBeInTheDocument();
      });

      // Schedule shows its own distinct, retryable issue instead of an eternal skeleton.
      expect(await screen.findByText(/Park hours are taking a while to load/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('shows the schedule normally when wait times fail to load', async () => {
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockResolvedValueOnce(mockAttractions)
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue([]);
      mockFetchByUrl({
        schedule: () => Promise.resolve({ ok: true, json: () => Promise.resolve(scheduleWithHours) }),
      });

      render(<ParkDetailPage />);

      expect((await screen.findAllByText(/Couldn.t reach the wait-time feed/i)).length).toBeGreaterThan(0);
      // Schedule bar still renders — a wait-times failure never hides it.
      await waitFor(() => {
        expect(screen.queryByText(/Park hours are taking a while to load/i)).not.toBeInTheDocument();
      });
    });

    it('renders both wait times and schedule successfully with no contradictory or stuck state', async () => {
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockResolvedValueOnce(mockAttractions)
        .mockResolvedValueOnce(mockWaitTimes)
        .mockResolvedValue(mockWaitTimes);
      mockFetchByUrl({
        schedule: () => Promise.resolve({ ok: true, json: () => Promise.resolve(scheduleWithHours) }),
      });

      render(<ParkDetailPage />);

      expect(await screen.findByRole('button', { name: /Space Mountain, operating, 60 minute wait/i })).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByText(/^Loading wait times…$/i)).not.toBeInTheDocument();
      });
      expect(screen.queryByText('Checking…')).not.toBeInTheDocument();
    });

    it('shows independent, retryable failures for both wait times and schedule — never an indefinite loading state', async () => {
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockResolvedValueOnce(mockAttractions)
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue([]);
      mockFetchByUrl({
        schedule: () => Promise.reject(new Error('schedule backend error')),
      });

      render(<ParkDetailPage />);

      expect((await screen.findAllByText(/Couldn.t reach the wait-time feed/i)).length).toBeGreaterThan(0);
      expect(await screen.findByText(/Couldn.t load park hours/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Retry wait times/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('recovers the schedule via its Retry button without touching wait-time state', async () => {
      const user = userEvent.setup();
      mockGetCollection
        .mockResolvedValueOnce([mockPark])
        .mockResolvedValueOnce(mockAttractions)
        .mockResolvedValueOnce(mockWaitTimes)
        .mockResolvedValue(mockWaitTimes);
      mockFetchByUrl({
        schedule: () => Promise.reject(new Error('schedule backend error')),
      });

      render(<ParkDetailPage />);

      expect(await screen.findByRole('button', { name: /Space Mountain, operating, 60 minute wait/i })).toBeInTheDocument();
      const retryButton = await screen.findByRole('button', { name: 'Retry' });

      mockFetchByUrl({
        schedule: () => Promise.resolve({ ok: true, json: () => Promise.resolve(scheduleWithHours) }),
      });
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.queryByText(/Couldn.t load park hours/i)).not.toBeInTheDocument();
      });
      // Wait times remain untouched by the schedule retry.
      expect(screen.getByRole('button', { name: /Space Mountain, operating, 60 minute wait/i })).toBeInTheDocument();
    });

    it('never shows a definitive "Unavailable" attraction label while wait times are still loading', async () => {
      mockGetCollection.mockImplementation((collectionPath: string) => {
        if (collectionPath === 'parks') return Promise.resolve([mockPark]);
        if (collectionPath === 'attractions') return Promise.resolve(mockAttractions);
        if (collectionPath === 'waitTimes/magic-kingdom/current') return new Promise(() => {});
        return Promise.resolve([]);
      });

      render(<ParkDetailPage />);

      expect(await screen.findByText('Space Mountain')).toBeInTheDocument();
      expect(screen.getAllByText(/loading wait times/i).length).toBeGreaterThan(0);
      // The provisional/pending state must never claim a definitive "Unavailable".
      expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
    });
  });
});
