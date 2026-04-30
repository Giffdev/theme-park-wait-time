/**
 * Tests for QuickLogFAB component.
 *
 * The FAB (Floating Action Button) is the primary entry point for ride logging.
 * It appears on all authenticated pages EXCEPT /trips/[id]/log (the old log page).
 *
 * Component file: src/components/QuickLogFAB.tsx (being built in parallel)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// --- Mock Firebase config ---
vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: { currentUser: { uid: 'user-123' } },
}));

// --- Mock lucide-react ---
vi.mock('lucide-react', () => ({
  Plus: () => <span data-testid="icon-plus" />,
}));

// --- Mock next/navigation ---
let mockPathname = '/parks';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => mockPathname,
}));

// --- Mock auth context ---
let mockAuthState: { user: { uid: string; email: string } | null; loading: boolean } = {
  user: { uid: 'user-123', email: 'test@example.com' },
  loading: false,
};
vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => mockAuthState,
}));

/**
 * Stub component for contract testing.
 * When the real QuickLogFAB lands, swap this for the real import.
 *
 * Contract:
 * - Renders a floating button when user is authenticated
 * - Does NOT render when user is null (not authenticated)
 * - Does NOT render on /trips/[id]/log pages
 * - Clicking it triggers onOpen callback (which opens QuickLogSheet)
 */
function QuickLogFAB({ onOpen }: { onOpen: () => void }) {
  const user = mockAuthState.user;
  const pathname = mockPathname;

  // Don't show for unauthenticated users
  if (!user) return null;

  // Don't show on legacy log pages
  if (pathname.match(/\/trips\/[^/]+\/log/)) return null;

  return (
    <button
      data-testid="quick-log-fab"
      aria-label="Log a ride"
      onClick={onOpen}
      className="fixed bottom-6 right-6 z-50 rounded-full bg-primary-500 p-4 text-white shadow-lg"
    >
      <span data-testid="icon-plus" />
    </button>
  );
}

describe('QuickLogFAB', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/parks';
    mockAuthState = { user: { uid: 'user-123', email: 'test@example.com' }, loading: false };
  });

  it('renders when user is authenticated', () => {
    render(<QuickLogFAB onOpen={vi.fn()} />);

    expect(screen.getByTestId('quick-log-fab')).toBeInTheDocument();
    expect(screen.getByLabelText('Log a ride')).toBeInTheDocument();
  });

  it('does NOT render when user is not authenticated', () => {
    mockAuthState = { user: null, loading: false };

    render(<QuickLogFAB onOpen={vi.fn()} />);

    expect(screen.queryByTestId('quick-log-fab')).not.toBeInTheDocument();
  });

  it('does NOT render on the /trips/[id]/log page', () => {
    mockPathname = '/trips/trip-abc123/log';

    render(<QuickLogFAB onOpen={vi.fn()} />);

    expect(screen.queryByTestId('quick-log-fab')).not.toBeInTheDocument();
  });

  it('opens QuickLogSheet when tapped', () => {
    const onOpen = vi.fn();

    render(<QuickLogFAB onOpen={onOpen} />);

    fireEvent.click(screen.getByTestId('quick-log-fab'));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('renders on /parks page', () => {
    mockPathname = '/parks';

    render(<QuickLogFAB onOpen={vi.fn()} />);

    expect(screen.getByTestId('quick-log-fab')).toBeInTheDocument();
  });

  it('renders on /trips page (list view is fine)', () => {
    mockPathname = '/trips';

    render(<QuickLogFAB onOpen={vi.fn()} />);

    expect(screen.getByTestId('quick-log-fab')).toBeInTheDocument();
  });

  it('renders on trip detail page (not the log subpage)', () => {
    mockPathname = '/trips/trip-abc123';

    render(<QuickLogFAB onOpen={vi.fn()} />);

    expect(screen.getByTestId('quick-log-fab')).toBeInTheDocument();
  });
});
