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
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  getDocument: vi.fn(),
  whereConstraint: vi.fn(),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  RefreshCw: ({ className }: { className?: string }) => <span data-testid="refresh-icon" className={className}>↻</span>,
}));

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockParks = [
  { id: 'magic-kingdom', name: 'Magic Kingdom', slug: 'magic-kingdom', destinationName: 'Walt Disney World', destinationId: 'wdw' },
  { id: 'epcot', name: 'EPCOT', slug: 'epcot', destinationName: 'Walt Disney World', destinationId: 'wdw' },
  { id: 'universal-studios', name: 'Universal Studios', slug: 'universal-studios', destinationName: 'Universal Orlando', destinationId: 'uni' },
];

describe('Parks Listing Page', () => {
  let ParksPage: React.ComponentType;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
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

      expect(mockFetch).toHaveBeenCalledWith('/api/wait-times');
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

  describe('error handling', () => {
    it('handles Firestore fetch errors gracefully (no crash)', async () => {
      mockGetCollection.mockRejectedValue(new Error('Network error'));

      render(<ParksPage />);

      await waitFor(() => {
        expect(screen.getByText('Theme Parks')).toBeInTheDocument();
      });
    });
  });
});
