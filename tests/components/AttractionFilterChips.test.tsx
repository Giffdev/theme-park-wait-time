/**
 * Tests for AttractionFilterChips component.
 *
 * Tests the chip-based filter bar for the park detail page.
 * - Tier 1 (entityType): All Rides | Shows | Dining | Shops
 * - Tier 2 (attractionType): Thrill | Family | Experience | Character Meet | Parade
 * - Default behavior: hide RESTAURANT and MERCHANDISE (shops + dining hidden)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock Firebase config
vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: {},
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Filter: () => <span data-testid="icon-filter" />,
  X: () => <span data-testid="icon-x" />,
  Ticket: () => <span data-testid="icon-ticket" />,
  Theater: () => <span data-testid="icon-theater" />,
  Utensils: () => <span data-testid="icon-utensils" />,
  ShoppingBag: () => <span data-testid="icon-shopping" />,
  Zap: () => <span data-testid="icon-zap" />,
  Users: () => <span data-testid="icon-users" />,
  Star: () => <span data-testid="icon-star" />,
  Sparkles: () => <span data-testid="icon-sparkles" />,
  Flag: () => <span data-testid="icon-flag" />,
}));

import AttractionFilterChips from '@/components/park/AttractionFilterChips';

// Filter value types expected by the component
interface FilterState {
  entityTypes: string[];
  attractionTypes: string[];
}

describe('AttractionFilterChips', () => {
  const mockOnChange = vi.fn();

  const defaultProps = {
    onChange: mockOnChange,
    filters: {
      entityTypes: ['RIDE', 'SHOW'] as string[],
      attractionTypes: [] as string[],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Rendering
  // =========================================================================

  describe('rendering', () => {
    it('renders all Tier 1 filter chips', () => {
      render(<AttractionFilterChips {...defaultProps} />);

      expect(screen.getByRole('button', { name: /rides/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /shows/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /dining/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /shops/i })).toBeInTheDocument();
    });

    it('renders Tier 2 sub-filter chips', () => {
      render(<AttractionFilterChips {...defaultProps} />);

      expect(screen.getByRole('button', { name: /thrill/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /family/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /experience/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /character meet/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /parade/i })).toBeInTheDocument();
    });

    it('renders an "All" chip to reset filters', () => {
      render(<AttractionFilterChips {...defaultProps} />);

      expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    });

    it('highlights active filter chips visually', () => {
      const filters = {
        entityTypes: ['RIDE'],
        attractionTypes: ['thrill'],
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      const ridesChip = screen.getByRole('button', { name: /rides/i });
      const thrillChip = screen.getByRole('button', { name: /thrill/i });

      // Active chips should have a distinct styling (data-active or aria-pressed)
      expect(
        ridesChip.getAttribute('aria-pressed') === 'true' ||
        ridesChip.getAttribute('data-active') === 'true' ||
        ridesChip.classList.toString().includes('active') ||
        ridesChip.classList.toString().includes('selected'),
      ).toBe(true);

      expect(
        thrillChip.getAttribute('aria-pressed') === 'true' ||
        thrillChip.getAttribute('data-active') === 'true' ||
        thrillChip.classList.toString().includes('active') ||
        thrillChip.classList.toString().includes('selected'),
      ).toBe(true);
    });
  });

  // =========================================================================
  // Interaction — Tier 1 (Entity Type)
  // =========================================================================

  describe('Tier 1 chip interactions', () => {
    it('clicking a Tier 1 chip toggles it on', () => {
      const filters = { entityTypes: ['RIDE', 'SHOW'], attractionTypes: [] };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /dining/i }));

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityTypes: expect.arrayContaining(['RESTAURANT']),
        }),
      );
    });

    it('clicking an active Tier 1 chip toggles it off', () => {
      const filters = { entityTypes: ['RIDE', 'SHOW'], attractionTypes: [] };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /rides/i }));

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityTypes: expect.not.arrayContaining(['RIDE']),
        }),
      );
    });

    it('multiple Tier 1 chips can be active simultaneously', () => {
      const filters = { entityTypes: ['RIDE'], attractionTypes: [] };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /shows/i }));

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityTypes: expect.arrayContaining(['RIDE', 'SHOW']),
        }),
      );
    });
  });

  // =========================================================================
  // Interaction — Tier 2 (Attraction Type)
  // =========================================================================

  describe('Tier 2 chip interactions', () => {
    it('clicking a Tier 2 chip toggles it on', () => {
      const filters = { entityTypes: ['RIDE'], attractionTypes: [] };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /thrill/i }));

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          attractionTypes: expect.arrayContaining(['thrill']),
        }),
      );
    });

    it('clicking an active Tier 2 chip toggles it off', () => {
      const filters = { entityTypes: ['RIDE'], attractionTypes: ['thrill', 'family'] };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /thrill/i }));

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          attractionTypes: expect.not.arrayContaining(['thrill']),
        }),
      );
    });

    it('multiple Tier 2 chips can be selected together', () => {
      const filters = { entityTypes: ['RIDE'], attractionTypes: ['thrill'] };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /family/i }));

      expect(mockOnChange).toHaveBeenCalledWith(
        expect.objectContaining({
          attractionTypes: expect.arrayContaining(['thrill', 'family']),
        }),
      );
    });
  });

  // =========================================================================
  // "All" Chip Behavior
  // =========================================================================

  describe('"All" chip behavior', () => {
    it('clicking "All" clears all entity type and attraction type filters', () => {
      const filters = { entityTypes: ['RIDE'], attractionTypes: ['thrill'] };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /all/i }));

      expect(mockOnChange).toHaveBeenCalledWith({
        entityTypes: [],
        attractionTypes: [],
      });
    });

    it('"All" chip appears active when no filters are selected', () => {
      const filters = { entityTypes: [], attractionTypes: [] };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      const allChip = screen.getByRole('button', { name: /all/i });
      expect(
        allChip.getAttribute('aria-pressed') === 'true' ||
        allChip.getAttribute('data-active') === 'true' ||
        allChip.classList.toString().includes('active') ||
        allChip.classList.toString().includes('selected'),
      ).toBe(true);
    });

    it('"All" chip is not active when filters are selected', () => {
      const filters = { entityTypes: ['RIDE'], attractionTypes: [] };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      const allChip = screen.getByRole('button', { name: /all/i });
      // "All" should NOT be marked active when specific filters are applied
      expect(
        allChip.getAttribute('aria-pressed') !== 'true' ||
        allChip.getAttribute('data-active') !== 'true',
      ).toBe(true);
    });
  });

  // =========================================================================
  // Default State
  // =========================================================================

  describe('default state', () => {
    it('default filter state hides restaurants and merchandise', () => {
      // The default filters passed from the parent page should NOT include
      // RESTAURANT or MERCHANDISE entity types — they show RIDE + SHOW only
      const defaultFilters = { entityTypes: ['RIDE', 'SHOW'], attractionTypes: [] };
      render(<AttractionFilterChips {...defaultProps} filters={defaultFilters} />);

      // Rides and Shows should be active
      const ridesChip = screen.getByRole('button', { name: /rides/i });
      const showsChip = screen.getByRole('button', { name: /shows/i });
      expect(
        ridesChip.getAttribute('aria-pressed') === 'true' ||
        ridesChip.getAttribute('data-active') === 'true' ||
        ridesChip.classList.toString().includes('active') ||
        ridesChip.classList.toString().includes('selected'),
      ).toBe(true);
      expect(
        showsChip.getAttribute('aria-pressed') === 'true' ||
        showsChip.getAttribute('data-active') === 'true' ||
        showsChip.classList.toString().includes('active') ||
        showsChip.classList.toString().includes('selected'),
      ).toBe(true);
    });

    it('dining and shops chips are not active in default state', () => {
      const defaultFilters = { entityTypes: ['RIDE', 'SHOW'], attractionTypes: [] };
      render(<AttractionFilterChips {...defaultProps} filters={defaultFilters} />);

      const diningChip = screen.getByRole('button', { name: /dining/i });
      const shopsChip = screen.getByRole('button', { name: /shops/i });

      // These should NOT be active since restaurants/shops are hidden by default
      expect(
        diningChip.getAttribute('aria-pressed') !== 'true' &&
        !diningChip.classList.toString().includes('active') &&
        !diningChip.classList.toString().includes('selected'),
      ).toBe(true);
      expect(
        shopsChip.getAttribute('aria-pressed') !== 'true' &&
        !shopsChip.classList.toString().includes('active') &&
        !shopsChip.classList.toString().includes('selected'),
      ).toBe(true);
    });
  });

  // =========================================================================
  // Callback Contract
  // =========================================================================

  describe('onChange callback contract', () => {
    it('fires onChange with both entityTypes and attractionTypes', () => {
      const filters = { entityTypes: ['RIDE'], attractionTypes: [] };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /thrill/i }));

      const callArg = mockOnChange.mock.calls[0][0];
      expect(callArg).toHaveProperty('entityTypes');
      expect(callArg).toHaveProperty('attractionTypes');
    });

    it('does not mutate the original filters object', () => {
      const filters = { entityTypes: ['RIDE'], attractionTypes: [] };
      const originalEntityTypes = [...filters.entityTypes];
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /shows/i }));

      // Original should not be mutated
      expect(filters.entityTypes).toEqual(originalEntityTypes);
    });
  });
});
