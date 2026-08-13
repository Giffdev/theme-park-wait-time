import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/font/google', () => ({
  Inter: () => ({ variable: 'mock-inter' }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/app/providers', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/AuthNav', () => ({
  AuthNavDesktop: () => null,
  AuthNavMobile: () => null,
}));

import RootLayout, { metadata as rootMetadata } from '@/app/layout';
import AboutPage, { metadata as aboutMetadata } from '@/app/about/page';

describe('ParkPulse branding surfaces', () => {
  it('renders the canonical About heading and metadata', () => {
    render(<AboutPage />);

    expect(screen.getByRole('heading', { name: 'About ParkPulse' })).toBeInTheDocument();
    expect(aboutMetadata.description).toContain('About ParkPulse');
    expect(document.body).not.toHaveTextContent('ParkFlow');
  });

  it('uses ParkPulse in root metadata, header, and footer', () => {
    const title = rootMetadata.title as { default: string; template: string };
    expect(title.default).toContain('ParkPulse');
    expect(title.template).toBe('%s | ParkPulse');

    const markup = renderToStaticMarkup(
      <RootLayout><div>Page content</div></RootLayout>,
    );

    expect(markup.match(/ParkPulse/g)?.length).toBeGreaterThanOrEqual(3);
    expect(markup).toContain('© 2026 ParkPulse');
    expect(markup).not.toContain('ParkFlow');
  });
});
