import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import React from 'react';

let mockUser: { uid: string } | null;

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

vi.mock('@/components/UnifiedLogSheet', () => ({
  default: () => null,
}));

import { AuthNavMobile } from '@/components/AuthNav';

describe('authenticated mobile navigation', () => {
  beforeEach(() => {
    mockUser = { uid: 'user-123' };
  });

  it('keeps Calendar directly available after sign-in', () => {
    render(<AuthNavMobile />);

    const nav = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent?.trim()))
      .toEqual(['Parks', 'Calendar', 'Trips', 'Account']);
    expect(within(nav).getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/calendar');
    expect(within(nav).getByRole('button', { name: '+ Log' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('keeps the guest navigation focused on discovery and sign-in', () => {
    mockUser = null;

    render(<AuthNavMobile />);

    const nav = screen.getByRole('navigation', { name: 'Primary navigation' });
    expect(within(nav).getAllByRole('link').map((link) => link.textContent?.trim()))
      .toEqual(['Home', 'Parks', 'Calendar', 'Sign In']);
    expect(within(nav).queryByRole('button', { name: '+ Log' })).not.toBeInTheDocument();
  });
});
