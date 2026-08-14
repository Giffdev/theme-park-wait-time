/**
 * Tests for the Parks listing page.
 *
 * The parks page is a client component that:
 * - Fetches parks from Firestore via getCollection
 * - Shows loading skeletons while data loads
 * - Groups parks by destination and renders ParkCards
 * - Has a refresh button that calls the wait-times API
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock Firebase config
vi.mock('@/lib/firebase/config', () => ({
  auth: {},
  db: {},
  storage: {},
  app: {},
}));

// Mock Firestore
const mockGetCollection = vi.fn();
vi.mock('@/lib/firebase/firestore', () => ({
  getCollection: async (...args: unknown[]) => {
    const docs = await mockGetCollection(...args);
    if (args[0] !== 'parks') return docs;
    return docs.filter((doc: { id: string }) =>
      doc.id !== '951987f7-3387-4221-8368-2859469aebcd'
    );
  },
  getDocument: vi.fn(),
  whereConstraint: vi.fn(),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  RefreshCw: ({ className }: { className?: string }) => <span data-testid="refresh-icon" className={className}>↻</span>,
  Search: () => <span data-testid="search-icon">🔍</span>,
  ChevronDown: ({ className }: { className?: string }) => <span data-testid="chevron-icon" className={className}>▼</span>,
  X: ({ className }: { className?: string }) => <span data-testid="x-icon" className={className}>✕</span>,
  Star: ({ className }: { className?: string }) => <span data-testid="star-icon" className={className}>★</span>,
}));

// Mock park registry and locations
vi.mock('@/lib/parks/park-registry', () => ({
  DESTINATION_FAMILIES: [],
}));

vi.mock('@/lib/parks/park-locations', () => ({
  getLocationByDestinationId: () => null,
  formatLocation: () => '',
}));

// Mock ParkCard component
vi.mock('@/components/ParkCard', () => ({
  default: ({ name, destinationName }: { name: string; destinationName: string; slug?: string; shortestWait?: number | null; isOpen?: boolean; todayHours?: unknown; timezone?: string; localTime?: string; location?: string }) => (
    <div data-testid={`park-card-${name}`}>
      <span>{name}</span>
      <span>{destinationName}</span>
    </div>
  ),
}));

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const mockParks = [
  { id: 'magic-kingdom', name: 'Magic Kingdom', slug: 'magic-kingdom', destinationName: 'Walt Disney World', destinationId: 'wdw' },
  { id: 'epcot', name: 'EPCOT', slug: 'epcot', destinationName: 'Walt Disney World', destinationId: 'wdw' },
  { id: 'universal-studios', name: 'Universal Studios', slug: 'universal-studios', destinationName: 'Universal Orlando', destinationId: 'uni' },
];

describe('Parks Listing Page', () => {
  let ParksPage: React.ComponentType;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    const mod = await import('@/app/parks/page');
    ParksPage = mod.default;
  });

  describe('loading state', () => {
    it('renders loading skeletons while parks data is fetching', () => {
      mockGetCollection.mockReturnValue(new Promise(() => {}));

      const { container } = render(<ParksPage />);

      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('renders the page heading even during loading', () => {
      mockGetCollection.mockReturnValue(new Promise(() => {}));

      render(<ParksPage />);

      expect(screen.getByText('Theme Parks')).toBeInTheDocument();
    });
  });

  describe('after data loads', () => {
    beforeEach(() => {
      mockGetCollection
        .mockResolvedValueOnce(mockParks)
        .mockResolvedValue([]);
    });

    it('displays parks grouped by destination', async () => {
      render(<ParksPage />);

      await waitFor(() => {
        // Section headings for each destination group
        const headings = screen.getAllByRole('heading', { level: 2 });
        const headingTexts = headings.map((h) => h.textContent);
        expect(headingTexts).toContain('Walt Disney World');
        expect(headingTexts).toContain('Universal Orlando');
      });
    });

    it('renders park names', async () => {
      render(<ParksPage />);

      await waitFor(() => {
        expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
        expect(screen.getByText('EPCOT')).toBeInTheDocument();
        expect(screen.getByText('Universal Studios')).toBeInTheDocument();
      });
    });

    it('hides loading skeletons once data arrives', async () => {
      const { container } = render(<ParksPage />);

      await waitFor(() => {
        expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
      });

      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBe(0);
    });

    it('removes a retired Oceans of Fun document before rendering park cards', async () => {
      mockGetCollection.mockReset();
      mockGetCollection
        .mockResolvedValueOnce([
          {
            id: '951987f7-3387-4221-8368-2859469aebcd',
            name: 'Oceans of Fun',
            slug: 'oceans-of-fun',
            destinationName: 'Worlds of Fun',
            destinationId: 'wof',
          },
          {
            id: 'b5a89552-3381-47ad-88cc-ab0087019c8b',
            name: 'Oceans of Fun',
            slug: 'oceans-of-fun',
            destinationName: 'Worlds of Fun',
            destinationId: 'wof',
          },
        ])
        .mockResolvedValue([]);

      render(<ParksPage />);

      await waitFor(() => {
        expect(screen.getAllByTestId('park-card-Oceans of Fun')).toHaveLength(1);
      });
    });
  });

  describe('refresh button', () => {
    beforeEach(() => {
      mockGetCollection
        .mockResolvedValueOnce(mockParks)
        .mockResolvedValue([]);
    });

    it('renders the refresh button', async () => {
      render(<ParksPage />);

      await waitFor(() => {
        expect(screen.getByText('Refresh Data')).toBeInTheDocument();
      });
    });

    it('calls the wait-times API when refresh is clicked', async () => {
      const user = userEvent.setup();
      render(<ParksPage />);

      await waitFor(() => {
        expect(screen.getByText('Refresh Data')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Refresh Data'));

      expect(mockFetch).toHaveBeenCalledWith('/api/wait-times', {
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      });
    });

    it('shows "Refreshing..." text while refresh is in progress', async () => {
      const user = userEvent.setup();
      mockFetch.mockReturnValue(new Promise(() => {}));

      render(<ParksPage />);

      await waitFor(() => {
        expect(screen.getByText('Refresh Data')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Refresh Data'));

      expect(screen.getByText('Refreshing...')).toBeInTheDocument();
    });
  });

  describe('initial-arrival refresh', () => {
    it('automatically refreshes the wait-time feed on arrival when the cached snapshot is stale', async () => {
      const staleFetchedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min old — past the 10 min threshold
      mockGetCollection.mockImplementation((collectionPath: string) => {
        if (collectionPath === 'parks') return Promise.resolve(mockParks);
        if (typeof collectionPath === 'string' && collectionPath.startsWith('waitTimes/')) {
          return Promise.resolve([
            { attractionId: 'a1', attractionName: 'Ride', status: 'OPERATING', waitMinutes: 20, fetchedAt: staleFetchedAt },
          ]);
        }
        return Promise.resolve([]);
      });

      render(<ParksPage />);

      await waitFor(() => {
        expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
      });

      // A background refresh should fire automatically on arrival (without a
      // manual click), re-querying the wait-times collections a second time —
      // i.e. more than the single initial-load round (3 parks × 1 round).
      await waitFor(() => {
        const waitTimesCalls = mockGetCollection.mock.calls.filter(
          (call) => typeof call[0] === 'string' && call[0].startsWith('waitTimes/')
        ).length;
        expect(waitTimesCalls).toBeGreaterThan(mockParks.length);
      });
    });

    it('does not auto-refresh on arrival when the cached snapshot is already fresh', async () => {
      const freshFetchedAt = new Date(Date.now() - 30 * 1000).toISOString(); // 30s old
      mockGetCollection.mockImplementation((collectionPath: string) => {
        if (collectionPath === 'parks') return Promise.resolve(mockParks);
        if (typeof collectionPath === 'string' && collectionPath.startsWith('waitTimes/')) {
          return Promise.resolve([
            { attractionId: 'a1', attractionName: 'Ride', status: 'OPERATING', waitMinutes: 20, fetchedAt: freshFetchedAt },
          ]);
        }
        return Promise.resolve([]);
      });

      render(<ParksPage />);

      await waitFor(() => {
        expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
      });

      const waitTimesCallsAfterLoad = mockGetCollection.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('waitTimes/')
      ).length;

      // Give any stray async work a tick, then confirm no extra fetch occurred.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const waitTimesCallsAfterWait = mockGetCollection.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('waitTimes/')
      ).length;
      expect(waitTimesCallsAfterWait).toBe(waitTimesCallsAfterLoad);
    });
  });

  describe('error handling', () => {
    it('shows a retryable directory error when the parks query fails', async () => {
      mockGetCollection.mockRejectedValue(new Error('Network error'));

      render(<ParksPage />);

      expect(await screen.findByRole('alert')).toHaveTextContent('Park directory unavailable');
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(screen.queryByText(/No parks match/)).not.toBeInTheDocument();
    });

    it('keeps the directory useful when every live wait-time read fails', async () => {
      mockGetCollection
        .mockResolvedValueOnce(mockParks)
        .mockRejectedValue(new Error('Missing permission'));

      render(<ParksPage />);

      expect(await screen.findByText('Live wait times are temporarily unavailable')).toBeInTheDocument();
      expect(screen.getByText(/Park hours and directory links still work/i)).toBeInTheDocument();
      expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
    });
  });
});
