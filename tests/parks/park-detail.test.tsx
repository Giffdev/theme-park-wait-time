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

// Mock Firestore
const mockGetDocument = vi.fn();
const mockGetCollection = vi.fn();
vi.mock('@/lib/firebase/firestore', () => ({
  getDocument: (...args: unknown[]) => mockGetDocument(...args),
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
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

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
  { id: 'wt-1', attractionId: 'space-mountain', attractionName: 'Space Mountain', status: 'OPERATING', waitMinutes: 60, lastUpdated: '2026-04-29T09:00:00Z', fetchedAt: '2026-04-29T09:05:00Z' },
  { id: 'wt-2', attractionId: 'haunted-mansion', attractionName: 'Haunted Mansion', status: 'OPERATING', waitMinutes: 20, lastUpdated: '2026-04-29T09:00:00Z', fetchedAt: '2026-04-29T09:05:00Z' },
  { id: 'wt-3', attractionId: 'pirates', attractionName: 'Pirates of the Caribbean', status: 'CLOSED', waitMinutes: null, lastUpdated: null, fetchedAt: '2026-04-29T09:05:00Z' },
  { id: 'wt-4', attractionId: 'jungle-cruise', attractionName: 'Jungle Cruise', status: 'OPERATING', waitMinutes: 35, lastUpdated: '2026-04-29T09:00:00Z', fetchedAt: '2026-04-29T09:05:00Z' },
];

describe('Park Detail Page', () => {
  let ParkDetailPage: React.ComponentType;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
    const mod = await import('@/app/parks/[parkId]/page');
    ParkDetailPage = mod.default;
  });

  describe('loading state', () => {
    it('shows loading skeletons while data loads', () => {
      mockGetDocument.mockReturnValue(new Promise(() => {}));
      mockGetCollection.mockReturnValue(new Promise(() => {}));

      const { container } = render(<ParkDetailPage />);

      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('after data loads', () => {
    beforeEach(() => {
      mockGetDocument.mockResolvedValue(mockPark);
      mockGetCollection
        .mockResolvedValueOnce(mockAttractions)
        .mockResolvedValueOnce(mockWaitTimes);
    });

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
        expect(screen.getByText('Walt Disney World')).toBeInTheDocument();
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
    beforeEach(() => {
      mockGetDocument.mockResolvedValue(mockPark);
      mockGetCollection
        .mockResolvedValueOnce(mockAttractions)
        .mockResolvedValueOnce(mockWaitTimes)
        .mockResolvedValue([]);
    });

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

      expect(mockFetch).toHaveBeenCalledWith('/api/wait-times?parkId=magic-kingdom');
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
    beforeEach(() => {
      mockGetDocument.mockResolvedValue(mockPark);
      mockGetCollection
        .mockResolvedValueOnce(mockAttractions)
        .mockResolvedValueOnce(mockWaitTimes);
    });

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
    it('handles Firestore fetch errors gracefully (no crash)', async () => {
      mockGetDocument.mockRejectedValue(new Error('Network error'));
      mockGetCollection.mockRejectedValue(new Error('Network error'));

      render(<ParkDetailPage />);

      await waitFor(() => {
        const skeletons = document.querySelectorAll('.animate-pulse');
        expect(skeletons.length).toBe(0);
      });
    });
  });
});
