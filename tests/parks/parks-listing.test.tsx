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
  default: ({
    name,
    destinationName,
    averageWait,
    activeRideCount,
  }: {
    name: string;
    destinationName: string;
    averageWait?: number | null;
    activeRideCount?: number;
  }) => (
    <div data-testid={`park-card-${name}`}>
      <span>{name}</span>
      <span>{destinationName}</span>
      <span>{`Average: ${averageWait ?? 'none'}; active rides: ${activeRideCount ?? 0}`}</span>
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

function waitTimesResponse(
  fetchedAt = new Date().toISOString(),
  waitMinutes = 20
) {
  return {
    fetchedAt,
    stale: false,
    parkMeta: Object.fromEntries(
      mockParks.map((park) => [
        park.id,
        {
          stale: false,
          source: 'upstream',
          fetchedAt,
          ageSeconds: 0,
        },
      ])
    ),
    parks: Object.fromEntries(
      mockParks.map((park) => [
        park.id,
        [
          {
            attractionId: 'a1',
            attractionName: 'Ride',
            status: 'OPERATING',
            waitMinutes,
            fetchedAt,
          },
        ],
      ])
    ),
  };
}

function staleWaitTimesByPark(fetchedAt: string) {
  return mockParks.reduce<Record<string, Array<{
    attractionId: string;
    attractionName: string;
    status: string;
    waitMinutes: number;
    fetchedAt: string;
  }>>>((acc, park) => {
    acc[park.id] = [
      {
        attractionId: 'a1',
        attractionName: 'Ride',
        status: 'OPERATING',
        waitMinutes: 20,
        fetchedAt,
      },
    ];
    return acc;
  }, {});
}

describe('Parks Listing Page', () => {
  let ParksPage: React.ComponentType;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockFetch.mockImplementation((url: string) => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => url === '/api/wait-times' ? waitTimesResponse() : [],
    }));
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

    it('disables manual refresh until the supported park directory has loaded', async () => {
      const user = userEvent.setup();
      mockGetCollection.mockReturnValue(new Promise(() => {}));

      render(<ParksPage />);

      const refreshButton = screen.getByRole('button', { name: /Refresh Data/ });
      expect(refreshButton).toBeDisabled();

      await user.click(refreshButton);

      expect(
        mockFetch.mock.calls.filter(([url]) => url === '/api/wait-times')
      ).toHaveLength(0);
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
      await waitFor(() => {
        const initialWaitReads = mockGetCollection.mock.calls.filter(
          (call) => typeof call[0] === 'string' && call[0].startsWith('waitTimes/')
        );
        expect(initialWaitReads).toHaveLength(mockParks.length);
      });
      const waitReadsBeforeRefresh = mockGetCollection.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('waitTimes/')
      ).length;

      await user.click(screen.getByText('Refresh Data'));

      expect(mockFetch).toHaveBeenCalledWith('/api/wait-times', {
        signal: expect.any(AbortSignal),
      });
      await waitFor(() => {
        expect(screen.getByText('Refresh Data')).toBeInTheDocument();
      });
      const waitReadsAfterRefresh = mockGetCollection.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('waitTimes/')
      ).length;
      expect(waitReadsAfterRefresh).toBe(waitReadsBeforeRefresh);
      expect(screen.getAllByText('Average: 20; active rides: 1')).toHaveLength(mockParks.length);
    });

    it('shows "Refreshing..." text while refresh is in progress', async () => {
      const user = userEvent.setup();
      let resolveRefresh!: (response: unknown) => void;
      mockFetch.mockImplementation((url: string) => {
        if (url !== '/api/wait-times') {
          return Promise.resolve({ ok: true, status: 200, json: async () => [] });
        }
        return new Promise((resolve) => {
          resolveRefresh = resolve;
        });
      });

      render(<ParksPage />);

      await waitFor(() => {
        expect(screen.getByText('Refresh Data')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Refresh Data'));

      expect(screen.getByText('Refreshing...')).toBeInTheDocument();

      await act(async () => {
        resolveRefresh({
          ok: true,
          status: 200,
          json: async () => waitTimesResponse(new Date().toISOString(), 35),
        });
      });
    });

    it('counts provider failures only for supported parks rendered by the listing', async () => {
      const user = userEvent.setup();
      const providerResponse = waitTimesResponse();
      delete providerResponse.parkMeta['magic-kingdom'];
      providerResponse.parks['magic-kingdom'] = [];
      providerResponse.parks['unsupported-catalog-park'] = [];
      const responseWithErrors = {
        ...providerResponse,
        errors: {
          'magic-kingdom': 'Wait-time provider and persistent cache are unavailable.',
          'unsupported-catalog-park': 'Park is not present in the supported park registry.',
        },
      };
      mockFetch.mockImplementation((url: string) => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => url === '/api/wait-times' ? responseWithErrors : [],
      }));

      render(<ParksPage />);

      await waitFor(() => {
        expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /Refresh Data/ }));

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(
          'Live wait times are unavailable for 1 parks'
        );
      });
      expect(screen.getByRole('status')).not.toHaveTextContent('2 parks');
    });
  });

  describe('initial-arrival refresh', () => {
    it('automatically refreshes the wait-time feed on arrival when the cached snapshot is stale', async () => {
      const staleFetchedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min old — past the 10 min threshold
      mockFetch.mockImplementation((url: string) => {
        if (url === '/api/wait-times') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => waitTimesResponse(new Date().toISOString(), 35),
          });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });
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

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/wait-times', {
          signal: expect.any(AbortSignal),
        });
      });

      // The provider response is applied directly; stale Firestore data is
      // not reread and allowed to overwrite the fresher server response.
      const waitTimesCalls = mockGetCollection.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('waitTimes/')
      ).length;
      expect(waitTimesCalls).toBe(mockParks.length);
      expect(screen.getAllByText('Oldest wait data updated just now')).toHaveLength(2);
      await waitFor(() => {
        expect(screen.getAllByText('Average: 35; active rides: 1')).toHaveLength(mockParks.length);
      });
    });

    it('hydrates an empty California Adventure cache from the provider even when other park data is fresh', async () => {
      const californiaAdventureId = '832fcd51-ea19-4e77-85c7-75d5843b127c';
      const magicKingdomId = '75ea578a-adc8-4116-a54d-dccb60765ef9';
      const californiaAdventure = {
        id: californiaAdventureId,
        name: 'Disney California Adventure',
        slug: 'disney-california-adventure',
        destinationName: 'Disneyland Resort',
        destinationId: 'bfc89fd6-314d-44b4-b89e-df1a89cf991e',
      };
      const magicKingdom = {
        id: magicKingdomId,
        name: 'Magic Kingdom',
        slug: 'magic-kingdom',
        destinationName: 'Walt Disney World',
        destinationId: 'e957da41-3552-4cf6-b636-5babc5cbc4e5',
      };
      const cachedAt = new Date(Date.now() - 30 * 1000).toISOString();
      const providerFetchedAt = new Date().toISOString();

      mockGetCollection.mockImplementation((collectionPath: string) => {
        if (collectionPath === 'parks') {
          return Promise.resolve([californiaAdventure, magicKingdom]);
        }
        if (collectionPath === `waitTimes/${californiaAdventureId}/current`) {
          return Promise.resolve([]);
        }
        if (collectionPath === `waitTimes/${magicKingdomId}/current`) {
          return Promise.resolve([
            {
              attractionId: 'magic-ride',
              attractionName: 'Magic Ride',
              status: 'OPERATING',
              waitMinutes: 20,
              fetchedAt: cachedAt,
            },
          ]);
        }
        return Promise.resolve([]);
      });
      mockFetch.mockImplementation((url: string) => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => url === '/api/wait-times'
          ? {
              fetchedAt: providerFetchedAt,
              stale: false,
              parkMeta: {
                [californiaAdventureId]: {
                  stale: false,
                  source: 'upstream',
                  fetchedAt: providerFetchedAt,
                  ageSeconds: 0,
                },
                [magicKingdomId]: {
                  stale: false,
                  source: 'upstream',
                  fetchedAt: providerFetchedAt,
                  ageSeconds: 0,
                },
              },
              parks: {
                [californiaAdventureId]: [
                  {
                    attractionId: 'radiator-springs-racers',
                    attractionName: 'Radiator Springs Racers',
                    status: 'OPERATING',
                    waitMinutes: 45,
                    fetchedAt: providerFetchedAt,
                  },
                ],
                [magicKingdomId]: [
                  {
                    attractionId: 'magic-ride',
                    attractionName: 'Magic Ride',
                    status: 'OPERATING',
                    waitMinutes: 20,
                    fetchedAt: providerFetchedAt,
                  },
                ],
              },
            }
          : [],
      }));

      render(<ParksPage />);

      expect(await screen.findByText('Disney California Adventure')).toBeInTheDocument();
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/wait-times', {
          signal: expect.any(AbortSignal),
        });
      });
      await waitFor(() => {
        expect(screen.getByTestId('park-card-Disney California Adventure')).toHaveTextContent(
          'Average: 45; active rides: 1'
        );
      });
    });

    it('keeps California Adventure unavailable when the provider also has no usable waits', async () => {
      const californiaAdventureId = '832fcd51-ea19-4e77-85c7-75d5843b127c';
      const californiaAdventure = {
        id: californiaAdventureId,
        name: 'Disney California Adventure',
        slug: 'disney-california-adventure',
        destinationName: 'Disneyland Resort',
        destinationId: 'bfc89fd6-314d-44b4-b89e-df1a89cf991e',
      };
      const providerFetchedAt = new Date().toISOString();

      mockGetCollection.mockImplementation((collectionPath: string) => {
        if (collectionPath === 'parks') return Promise.resolve([californiaAdventure]);
        if (collectionPath === `waitTimes/${californiaAdventureId}/current`) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });
      mockFetch.mockImplementation((url: string) => Promise.resolve({
        ok: true,
        status: 200,
        json: async () => url === '/api/wait-times'
          ? {
              fetchedAt: providerFetchedAt,
              stale: false,
              parkMeta: {
                [californiaAdventureId]: {
                  stale: false,
                  source: 'upstream',
                  fetchedAt: providerFetchedAt,
                  ageSeconds: 0,
                },
              },
              parks: { [californiaAdventureId]: [] },
            }
          : [],
      }));

      render(<ParksPage />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/wait-times', {
          signal: expect.any(AbortSignal),
        });
      });
      expect(screen.getByTestId('park-card-Disney California Adventure')).toHaveTextContent(
        'Average: none; active rides: 0'
      );
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

    it('keeps the directory useful when both cache reads and the provider fail', async () => {
      mockGetCollection
        .mockResolvedValueOnce(mockParks)
        .mockRejectedValue(new Error('Missing permission'));
      mockFetch.mockImplementation((url: string) => Promise.resolve(
        url === '/api/wait-times'
          ? { ok: false, status: 503, json: async () => ({ message: 'temporarily unavailable' }) }
          : { ok: true, status: 200, json: async () => [] }
      ));

      render(<ParksPage />);

      expect(await screen.findByText('Live wait times are temporarily unavailable')).toBeInTheDocument();
      expect(screen.getByText(/Park hours and directory links still work/i)).toBeInTheDocument();
      expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
    });

    it('keeps the last-known cards visible after a failed provider refresh and recovers on the next success', async () => {
      const staleFetchedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      let waitTimesRefreshCount = 0;

      mockFetch.mockImplementation((url: string) => {
        if (url === '/api/park-hours') {
          return Promise.resolve({ ok: true, status: 200, json: async () => [] });
        }
        if (url !== '/api/wait-times') {
          return Promise.resolve({ ok: true, status: 200, json: async () => [] });
        }

        waitTimesRefreshCount += 1;
        if (waitTimesRefreshCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 503,
            json: async () => ({ message: 'temporarily unavailable' }),
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => waitTimesResponse(),
        });
      });

      mockGetCollection.mockImplementation((collectionPath: string) => {
        if (collectionPath === 'parks') return Promise.resolve(mockParks);
        if (typeof collectionPath === 'string' && collectionPath.startsWith('waitTimes/')) {
          return Promise.resolve(staleWaitTimesByPark(staleFetchedAt)[collectionPath.split('/')[1]]);
        }
        return Promise.resolve([]);
      });

      const user = userEvent.setup();
      render(<ParksPage />);

      await waitFor(() => {
        expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
      });

      expect(screen.getAllByText('Oldest wait data updated 15 min ago')).toHaveLength(2);
      expect(await screen.findByText('Background refresh failed — showing the last known data.')).toBeInTheDocument();

      await user.click(screen.getByText('Refresh Data'));

      await waitFor(() => {
        expect(screen.queryByText('Background refresh failed — showing the last known data.')).not.toBeInTheDocument();
      });
      expect(screen.getAllByText('Oldest wait data updated just now')).toHaveLength(2);
      expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
      expect(screen.getByText('EPCOT')).toBeInTheDocument();
      expect(screen.getByText('Universal Studios')).toBeInTheDocument();
    });
  });
});
