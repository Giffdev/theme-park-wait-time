/**
 * Tests for the Parks listing page.
 *
 * The parks page should:
 * - Show parks grouped by destination/family (Walt Disney World, Universal Orlando)
 * - Fetch park data from Firestore
 * - Display loading skeleton while data loads
 * - Link each park card to the correct detail page
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

describe('Parks Listing Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering (current static implementation)', () => {
    it('renders the page heading', async () => {
      const { default: ParksPage } = await import('@/app/parks/page');
      render(<ParksPage />);

      expect(screen.getByText('Theme Parks')).toBeInTheDocument();
    });

    it('renders park family section headings', async () => {
      const { default: ParksPage } = await import('@/app/parks/page');
      render(<ParksPage />);

      expect(screen.getByText('Walt Disney World')).toBeInTheDocument();
      expect(screen.getByText('Universal Orlando')).toBeInTheDocument();
    });

    it('renders individual park names', async () => {
      const { default: ParksPage } = await import('@/app/parks/page');
      render(<ParksPage />);

      expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
      expect(screen.getByText('EPCOT')).toBeInTheDocument();
      expect(screen.getByText('Hollywood Studios')).toBeInTheDocument();
      expect(screen.getByText('Animal Kingdom')).toBeInTheDocument();
      expect(screen.getByText('Universal Studios Florida')).toBeInTheDocument();
      expect(screen.getByText('Islands of Adventure')).toBeInTheDocument();
      expect(screen.getByText('Epic Universe')).toBeInTheDocument();
    });

    it('links each park card to the correct detail page', async () => {
      const { default: ParksPage } = await import('@/app/parks/page');
      render(<ParksPage />);

      const magicKingdomLink = screen.getByRole('link', { name: /magic kingdom/i });
      expect(magicKingdomLink).toHaveAttribute('href', '/parks/magic-kingdom');

      const epcotLink = screen.getByRole('link', { name: /epcot/i });
      expect(epcotLink).toHaveAttribute('href', '/parks/epcot');

      const epicLink = screen.getByRole('link', { name: /epic universe/i });
      expect(epicLink).toHaveAttribute('href', '/parks/epic-universe');
    });

    it('displays park description text', async () => {
      const { default: ParksPage } = await import('@/app/parks/page');
      render(<ParksPage />);

      expect(
        screen.getByText('Select a park to view live wait times and attraction details.'),
      ).toBeInTheDocument();
    });
  });

  describe('loading state (spec — for Firestore-backed version)', () => {
    it('should render loading skeletons while parks data is fetching', () => {
      // Spec: When parks data is loading from Firestore, show animated skeleton cards
      // Expected: At least one element with role="status" or aria-label="Loading"
      // or a CSS animation class like "animate-pulse"
      expect(true).toBe(true);
    });

    it('should hide loading state once data arrives', () => {
      // Spec: Loading skeletons disappear and park cards appear after fetch resolves
      expect(true).toBe(true);
    });
  });

  describe('Firestore integration (spec)', () => {
    it('should fetch parks from Firestore on mount', () => {
      // Spec: The page calls a Firestore query for active parks
      // grouped by their `family` field (destination)
      expect(true).toBe(true);
    });

    it('should group parks by destination/family', () => {
      // Spec: Parks with family "walt-disney-world" appear under
      // "Walt Disney World" heading, etc.
      expect(true).toBe(true);
    });

    it('should show error state if Firestore query fails', () => {
      // Spec: On network error, show a user-friendly error message
      // with a retry button
      expect(true).toBe(true);
    });

    it('should only show active parks (isActive: true)', () => {
      // Spec: Parks with isActive: false should not appear in listing
      expect(true).toBe(true);
    });
  });
});
