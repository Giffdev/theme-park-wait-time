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

import AttractionFilterChips from '@/components/parks/AttractionFilterChips';

// Component uses Set-based FilterState
import type { FilterState } from '@/components/parks/AttractionFilterChips';

describe('AttractionFilterChips', () => {
  const mockOnChange = vi.fn();

  const defaultFilters: FilterState = {
    entityTypes: new Set(['ATTRACTION', 'SHOW']),
    attractionTypes: new Set(),
  };

  const defaultProps = {
    onChange: mockOnChange,
    filters: defaultFilters,
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

      expect(screen.getByRole('button', { name: /all rides/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /shows/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /dining/i })).toBeInTheDocument();
    });

    it('renders Tier 2 sub-filter chips when ATTRACTION is selected', () => {
      render(<AttractionFilterChips {...defaultProps} />);

      expect(screen.getByRole('button', { name: /thrill/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /family/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /experience/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /character meet/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /parade/i })).toBeInTheDocument();
    });

    it('renders an "All" chip to reset filters', () => {
      render(<AttractionFilterChips {...defaultProps} />);

      expect(screen.getByRole('button', { name: /^all$/i })).toBeInTheDocument();
    });

    it('highlights active filter chips with active CSS classes', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION']),
        attractionTypes: new Set(['thrill']),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      const ridesChip = screen.getByRole('button', { name: /all rides/i });
      const thrillChip = screen.getByRole('button', { name: /thrill/i });

      // Active chips get color-specific active classes (bg-coral-500, bg-blue-600, etc.)
      expect(ridesChip.className).toMatch(/bg-coral-500/);
      expect(thrillChip.className).toMatch(/bg-coral-500/);
    });
  });

  // =========================================================================
  // Interaction — Tier 1 (Entity Type)
  // =========================================================================

  describe('Tier 1 chip interactions', () => {
    it('clicking a Tier 1 chip toggles it on', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION', 'SHOW']),
        attractionTypes: new Set(),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /dining/i }));

      const callArg = mockOnChange.mock.calls[0][0] as FilterState;
      expect(callArg.entityTypes.has('RESTAURANT')).toBe(true);
    });

    it('clicking an active Tier 1 chip toggles it off', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION', 'SHOW']),
        attractionTypes: new Set(),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /all rides/i }));

      const callArg = mockOnChange.mock.calls[0][0] as FilterState;
      expect(callArg.entityTypes.has('ATTRACTION')).toBe(false);
    });

    it('multiple Tier 1 chips can be active simultaneously', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION']),
        attractionTypes: new Set(),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /shows/i }));

      const callArg = mockOnChange.mock.calls[0][0] as FilterState;
      expect(callArg.entityTypes.has('ATTRACTION')).toBe(true);
      expect(callArg.entityTypes.has('SHOW')).toBe(true);
    });
  });

  // =========================================================================
  // Interaction — Tier 2 (Attraction Type)
  // =========================================================================

  describe('Tier 2 chip interactions', () => {
    it('clicking a Tier 2 chip toggles it on', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION']),
        attractionTypes: new Set(),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /thrill/i }));

      const callArg = mockOnChange.mock.calls[0][0] as FilterState;
      expect(callArg.attractionTypes.has('thrill')).toBe(true);
    });

    it('clicking an active Tier 2 chip toggles it off', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION']),
        attractionTypes: new Set(['thrill', 'family']),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /thrill/i }));

      const callArg = mockOnChange.mock.calls[0][0] as FilterState;
      expect(callArg.attractionTypes.has('thrill')).toBe(false);
      expect(callArg.attractionTypes.has('family')).toBe(true);
    });

    it('multiple Tier 2 chips can be selected together', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION']),
        attractionTypes: new Set(['thrill']),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /family/i }));

      const callArg = mockOnChange.mock.calls[0][0] as FilterState;
      expect(callArg.attractionTypes.has('thrill')).toBe(true);
      expect(callArg.attractionTypes.has('family')).toBe(true);
    });
  });

  // =========================================================================
  // "All" Chip Behavior
  // =========================================================================

  describe('"All" chip behavior', () => {
    it('clicking "All" clears all entity type and attraction type filters', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION']),
        attractionTypes: new Set(['thrill']),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /^all$/i }));

      const callArg = mockOnChange.mock.calls[0][0] as FilterState;
      expect(callArg.entityTypes.size).toBe(0);
      expect(callArg.attractionTypes.size).toBe(0);
    });

    it('"All" chip appears active when no filters are selected', () => {
      const filters: FilterState = {
        entityTypes: new Set(),
        attractionTypes: new Set(),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      const allChip = screen.getByRole('button', { name: /^all$/i });
      // Active "All" chip gets the primary-800 bg class
      expect(allChip.className).toMatch(/bg-primary-800/);
    });

    it('"All" chip is not active when filters are selected', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION']),
        attractionTypes: new Set(),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      const allChip = screen.getByRole('button', { name: /^all$/i });
      expect(allChip.className).not.toMatch(/bg-primary-800/);
    });
  });

  // =========================================================================
  // Default State
  // =========================================================================

  describe('default state', () => {
    it('default filter state hides restaurants and merchandise', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION', 'SHOW']),
        attractionTypes: new Set(),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      // Rides and Shows should have active styling
      const ridesChip = screen.getByRole('button', { name: /all rides/i });
      const showsChip = screen.getByRole('button', { name: /shows/i });
      expect(ridesChip.className).toMatch(/bg-coral-500/);
      expect(showsChip.className).toMatch(/bg-blue-600/);
    });

    it('dining chip is not active in default state', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION', 'SHOW']),
        attractionTypes: new Set(),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      const diningChip = screen.getByRole('button', { name: /dining/i });

      // Inactive chips should NOT have active bg classes
      expect(diningChip.className).not.toMatch(/bg-green-600/);
    });
  });

  // =========================================================================
  // Callback Contract
  // =========================================================================

  describe('onChange callback contract', () => {
    it('fires onChange with both entityTypes and attractionTypes as Sets', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION']),
        attractionTypes: new Set(),
      };
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /thrill/i }));

      const callArg = mockOnChange.mock.calls[0][0];
      expect(callArg).toHaveProperty('entityTypes');
      expect(callArg).toHaveProperty('attractionTypes');
      expect(callArg.entityTypes).toBeInstanceOf(Set);
      expect(callArg.attractionTypes).toBeInstanceOf(Set);
    });

    it('does not mutate the original filters object', () => {
      const filters: FilterState = {
        entityTypes: new Set(['ATTRACTION']),
        attractionTypes: new Set(),
      };
      const originalSize = filters.entityTypes.size;
      render(<AttractionFilterChips {...defaultProps} filters={filters} />);

      fireEvent.click(screen.getByRole('button', { name: /shows/i }));

      // Original should not be mutated
      expect(filters.entityTypes.size).toBe(originalSize);
    });
  });
});
