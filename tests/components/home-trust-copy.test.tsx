import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: null, loading: false }),
}));

import HomePage from '@/app/page';

describe('home page trust copy', () => {
  it('describes crowd estimates honestly and removes the unsupported 365-day claim', () => {
    render(<HomePage />);

    expect(screen.getByText(/clearly labeled historical crowd estimates/i)).toBeInTheDocument();
    expect(screen.getByText('Labeled')).toBeInTheDocument();
    expect(screen.getByText('Crowd Estimates')).toBeInTheDocument();
    expect(screen.queryByText('365')).not.toBeInTheDocument();
    expect(screen.queryByText('Days of Crowd Data')).not.toBeInTheDocument();
  });
});
