/**
 * Tests for reusable park/wait-time components.
 *
 * Tests the actual implementations of:
 * - WaitTimeBadge: color-coded wait time display
 * - StatusIndicator: attraction operational status
 * - ParkCard: park listing card
 * - AttractionRow: single attraction in the detail list
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import WaitTimeBadge from '@/components/WaitTimeBadge';
import StatusIndicator from '@/components/StatusIndicator';
import ParkCard from '@/components/ParkCard';
import AttractionRow from '@/components/AttractionRow';

// Mock next/link for ParkCard tests
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock Firebase to prevent initialization errors in test environment
vi.mock('@/lib/firebase/config', () => ({
  auth: {},
  db: {},
  storage: {},
  app: {},
}));

describe('WaitTimeBadge', () => {
  it('renders wait time in minutes', () => {
    render(<WaitTimeBadge waitMinutes={25} />);
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('min')).toBeInTheDocument();
  });

  it('shows green color for wait times under 20 minutes', () => {
    const { container } = render(<WaitTimeBadge waitMinutes={10} />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('bg-green-100');
    expect(badge?.className).toContain('text-green-800');
  });

  it('shows green for 0 minutes (walk-on)', () => {
    const { container } = render(<WaitTimeBadge waitMinutes={0} />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('bg-green-100');
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('shows green for 19 minutes (just under boundary)', () => {
    const { container } = render(<WaitTimeBadge waitMinutes={19} />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('bg-green-100');
  });

  it('shows yellow color for wait times 20-45 minutes', () => {
    const { container } = render(<WaitTimeBadge waitMinutes={30} />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('bg-yellow-100');
    expect(badge?.className).toContain('text-yellow-800');
  });

  it('shows yellow at boundary: 20 minutes', () => {
    const { container } = render(<WaitTimeBadge waitMinutes={20} />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('bg-yellow-100');
  });

  it('shows yellow at boundary: 45 minutes', () => {
    const { container } = render(<WaitTimeBadge waitMinutes={45} />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('bg-yellow-100');
  });

  it('shows red color for wait times over 45 minutes', () => {
    const { container } = render(<WaitTimeBadge waitMinutes={60} />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('bg-red-100');
    expect(badge?.className).toContain('text-red-800');
  });

  it('shows red at boundary: 46 minutes', () => {
    const { container } = render(<WaitTimeBadge waitMinutes={46} />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('bg-red-100');
  });

  it('shows "N/A" when waitMinutes is null', () => {
    render(<WaitTimeBadge waitMinutes={null} />);
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('supports different sizes (sm, md, lg)', () => {
    const { container: sm } = render(<WaitTimeBadge waitMinutes={10} size="sm" />);
    const { container: lg } = render(<WaitTimeBadge waitMinutes={10} size="lg" />);

    expect(sm.querySelector('span')?.className).toContain('text-sm');
    expect(lg.querySelector('span')?.className).toContain('text-3xl');
  });
});

describe('StatusIndicator', () => {
  it('shows green dot and "Operating" for OPERATING status', () => {
    const { container } = render(<StatusIndicator status="OPERATING" />);
    expect(screen.getByText('Operating')).toBeInTheDocument();
    const dot = container.querySelector('span > span');
    expect(dot?.className).toContain('bg-green-500');
  });

  it('shows gray dot and "Closed" for CLOSED status', () => {
    const { container } = render(<StatusIndicator status="CLOSED" />);
    expect(screen.getByText('Closed')).toBeInTheDocument();
    const dot = container.querySelector('span > span');
    expect(dot?.className).toContain('bg-gray-400');
  });

  it('shows red dot and "Down" for DOWN status', () => {
    const { container } = render(<StatusIndicator status="DOWN" />);
    expect(screen.getByText('Down')).toBeInTheDocument();
    const dot = container.querySelector('span > span');
    expect(dot?.className).toContain('bg-red-500');
  });

  it('shows yellow dot and "Refurbishment" for REFURBISHMENT status', () => {
    const { container } = render(<StatusIndicator status="REFURBISHMENT" />);
    expect(screen.getByText('Refurbishment')).toBeInTheDocument();
    const dot = container.querySelector('span > span');
    expect(dot?.className).toContain('bg-yellow-500');
  });

  it('handles unknown status gracefully (shows raw status text)', () => {
    render(<StatusIndicator status="SEASONAL_CLOSED" />);
    expect(screen.getByText('SEASONAL_CLOSED')).toBeInTheDocument();
  });

  it('can hide label when showLabel is false', () => {
    render(<StatusIndicator status="OPERATING" showLabel={false} />);
    expect(screen.queryByText('Operating')).not.toBeInTheDocument();
  });
});

describe('ParkCard', () => {
  const defaultProps = {
    id: 'magic-kingdom',
    name: 'Magic Kingdom',
    destinationName: 'Walt Disney World',
    shortestWait: 15,
  };

  it('renders park name', () => {
    render(<ParkCard {...defaultProps} />);
    expect(screen.getByText('Magic Kingdom')).toBeInTheDocument();
  });

  it('renders destination name', () => {
    render(<ParkCard {...defaultProps} />);
    expect(screen.getByText('Walt Disney World')).toBeInTheDocument();
  });

  it('links to the correct park detail page using id', () => {
    render(<ParkCard {...defaultProps} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/parks/magic-kingdom');
  });

  it('shows shortest wait time when available', () => {
    render(<ParkCard {...defaultProps} shortestWait={15} />);
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('Shortest wait')).toBeInTheDocument();
  });

  it('shows "No live data" when shortestWait is null', () => {
    render(<ParkCard {...defaultProps} shortestWait={null} />);
    expect(screen.getByText('No live data')).toBeInTheDocument();
  });

  it('shows attraction count when provided', () => {
    render(<ParkCard {...defaultProps} attractionCount={42} />);
    expect(screen.getByText('42 rides')).toBeInTheDocument();
  });
});

describe('AttractionRow', () => {
  it('displays attraction name', () => {
    render(<AttractionRow name="Space Mountain" entityType="ATTRACTION" status="OPERATING" waitMinutes={45} />);
    expect(screen.getByText('Space Mountain')).toBeInTheDocument();
  });

  it('displays wait time badge for OPERATING attractions', () => {
    render(<AttractionRow name="Space Mountain" entityType="ATTRACTION" status="OPERATING" waitMinutes={45} />);
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('min')).toBeInTheDocument();
  });

  it('shows entity type badge (hidden on mobile via CSS)', () => {
    const { container } = render(<AttractionRow name="Space Mountain" entityType="ATTRACTION" status="OPERATING" waitMinutes={45} />);
    // Entity type badge is rendered with hidden sm:inline-flex classes
    const typeBadge = container.querySelector('[class*="text-coral-700"]');
    expect(typeBadge).not.toBeNull();
  });

  it('does not show wait time badge for CLOSED attractions', () => {
    render(<AttractionRow name="Splash Mountain" entityType="ATTRACTION" status="CLOSED" waitMinutes={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('min')).not.toBeInTheDocument();
  });

  it('does not show wait time badge for REFURBISHMENT attractions', () => {
    render(<AttractionRow name="Tron" entityType="ATTRACTION" status="REFURBISHMENT" waitMinutes={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows entity type badge', () => {
    render(<AttractionRow name="Festival of the Lion King" entityType="SHOW" status="OPERATING" waitMinutes={10} />);
    expect(screen.getByText('SHOW')).toBeInTheDocument();
  });

  it('applies correct color coding to wait time', () => {
    const { container } = render(
      <AttractionRow name="Space Mountain" entityType="ATTRACTION" status="OPERATING" waitMinutes={60} />,
    );
    // 60 min → red badge
    const badge = container.querySelector('[class*="bg-red-100"]');
    expect(badge).not.toBeNull();
  });
});
