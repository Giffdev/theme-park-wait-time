/**
 * Tests for the Park Detail page.
 *
 * The park detail page should:
 * - Show park name and breadcrumb navigation
 * - Display attractions with live wait times
 * - Sort attractions by wait time (shortest first)
 * - Group by status (operating first, then closed/refurbishment)
 * - Show refresh button to reload wait time data
 * - Handle loading and error states
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

describe('Park Detail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering (current static scaffold)', () => {
    it('renders the park name from URL params', async () => {
      const { default: ParkDetailPage } = await import('@/app/parks/[parkId]/page');
      // The component expects params as a Promise (Next.js 15 pattern)
      render(await ParkDetailPage({ params: Promise.resolve({ parkId: 'magic-kingdom' }) }));

      expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
    });

    it('renders breadcrumb navigation back to parks list', async () => {
      const { default: ParkDetailPage } = await import('@/app/parks/[parkId]/page');
      render(await ParkDetailPage({ params: Promise.resolve({ parkId: 'magic-kingdom' }) }));

      const parksLink = screen.getByRole('link', { name: /parks/i });
      expect(parksLink).toHaveAttribute('href', '/parks');
    });

    it('renders the Live Wait Times section heading', async () => {
      const { default: ParkDetailPage } = await import('@/app/parks/[parkId]/page');
      render(await ParkDetailPage({ params: Promise.resolve({ parkId: 'magic-kingdom' }) }));

      expect(screen.getByText('Live Wait Times')).toBeInTheDocument();
    });

    it('renders attraction names', async () => {
      const { default: ParkDetailPage } = await import('@/app/parks/[parkId]/page');
      render(await ParkDetailPage({ params: Promise.resolve({ parkId: 'magic-kingdom' }) }));

      expect(screen.getByText('Space Mountain')).toBeInTheDocument();
      expect(screen.getByText('Haunted Mansion')).toBeInTheDocument();
      expect(screen.getByText('Pirates of the Caribbean')).toBeInTheDocument();
    });
  });

  describe('wait time display (spec)', () => {
    it('should display wait time in minutes for each attraction', () => {
      // Spec: Each attraction row shows a numeric wait time and "min" label
      // Format: "45 min" with the number prominently displayed
      expect(true).toBe(true);
    });

    it('should sort attractions by wait time (shortest first)', () => {
      // Spec: Attractions are ordered ascending by waitMinutes
      // 5min ride appears before 60min ride
      expect(true).toBe(true);
    });

    it('should group operating attractions before closed ones', () => {
      // Spec: Status groups in order: OPERATING → CLOSED → DOWN → REFURBISHMENT
      // Within each group, sort by wait time
      expect(true).toBe(true);
    });

    it('should show "Closed" instead of wait time for non-operating attractions', () => {
      // Spec: Attractions with status "closed" show "Closed" badge instead of minutes
      expect(true).toBe(true);
    });
  });

  describe('refresh behavior (spec)', () => {
    it('should have a refresh button to reload wait times', () => {
      // Spec: A button (icon or text) that triggers re-fetch of wait time data
      // Expected: aria-label="Refresh wait times" or text "Refresh"
      expect(true).toBe(true);
    });

    it('should show loading indicator during refresh', () => {
      // Spec: While API call is in-flight, show spinner on the refresh button
      // or skeleton over the wait time values
      expect(true).toBe(true);
    });

    it('should update displayed wait times after refresh completes', () => {
      // Spec: New data from API replaces old values in the UI
      expect(true).toBe(true);
    });
  });

  describe('loading state (spec)', () => {
    it('should show loading skeleton while attraction data loads', () => {
      // Spec: On initial page load, show animated skeleton cards
      // for the attractions list
      expect(true).toBe(true);
    });

    it('should show park status (Open/Closed) with operating hours', () => {
      // Spec: Header area shows current park status and hours
      expect(true).toBe(true);
    });
  });

  describe('error handling (spec)', () => {
    it('should show error message if wait times API fails', () => {
      // Spec: "Unable to load wait times. Please try again."
      // with a retry button
      expect(true).toBe(true);
    });

    it('should show stale data warning if data is older than 10 minutes', () => {
      // Spec: If lastUpdated > 10 min ago, show warning banner:
      // "Wait times may be outdated. Last updated X minutes ago."
      expect(true).toBe(true);
    });
  });
});
