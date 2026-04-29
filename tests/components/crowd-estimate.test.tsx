/**
 * Tests for crowd-estimate UI components.
 *
 * Components tested:
 * - CrowdBadge: "Users report: ~X min" badge with confidence
 * - ConfidenceIndicator: dot-based confidence visual
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock Firebase
vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: {},
}));

import CrowdBadge from '@/components/crowd-estimate/CrowdBadge';
import ConfidenceIndicator from '@/components/crowd-estimate/ConfidenceIndicator';

describe('CrowdBadge', () => {
  it('renders estimate with people emoji and minutes', () => {
    const { container } = render(
      <CrowdBadge
        estimateMinutes={35}
        reportCount={7}
        confidence="high"
      />,
    );

    expect(screen.getByText(/~35 min/)).toBeInTheDocument();
    expect(screen.getByText('👥')).toBeInTheDocument();
  });

  it('does not render when estimate is null', () => {
    const { container } = render(
      <CrowdBadge
        estimateMinutes={null}
        reportCount={0}
        confidence="low"
      />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('does not render when report count is 0', () => {
    const { container } = render(
      <CrowdBadge
        estimateMinutes={20}
        reportCount={0}
        confidence="low"
      />,
    );

    expect(container.innerHTML).toBe('');
  });

  it('shows report count in parentheses', () => {
    render(
      <CrowdBadge
        estimateMinutes={20}
        reportCount={3}
        confidence="medium"
      />,
    );

    expect(screen.getByText('(3)')).toBeInTheDocument();
  });

  it('shows checkmark for high confidence', () => {
    render(
      <CrowdBadge
        estimateMinutes={35}
        reportCount={7}
        confidence="high"
      />,
    );

    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('does not show checkmark for low/medium confidence', () => {
    const { container } = render(
      <CrowdBadge
        estimateMinutes={35}
        reportCount={2}
        confidence="low"
      />,
    );

    expect(container.textContent).not.toContain('✓');
  });
});

describe('ConfidenceIndicator', () => {
  it('renders 3 dots total', () => {
    const { container } = render(<ConfidenceIndicator confidence="medium" reportCount={4} />);

    const dots = container.querySelectorAll('span.inline-block');
    expect(dots).toHaveLength(3);
  });

  it('shows 1 filled dot for low confidence', () => {
    const { container } = render(<ConfidenceIndicator confidence="low" reportCount={1} />);

    const dots = container.querySelectorAll('span.inline-block');
    const filled = Array.from(dots).filter((d) => d.className.includes('bg-primary-500'));
    expect(filled).toHaveLength(1);
  });

  it('shows 2 filled dots for medium confidence', () => {
    const { container } = render(<ConfidenceIndicator confidence="medium" reportCount={4} />);

    const dots = container.querySelectorAll('span.inline-block');
    const filled = Array.from(dots).filter((d) => d.className.includes('bg-primary-500'));
    expect(filled).toHaveLength(2);
  });

  it('shows 3 filled dots for high confidence', () => {
    const { container } = render(<ConfidenceIndicator confidence="high" reportCount={8} />);

    const dots = container.querySelectorAll('span.inline-block');
    const filled = Array.from(dots).filter((d) => d.className.includes('bg-primary-500'));
    expect(filled).toHaveLength(3);
  });

  it('shows checkmark for high confidence', () => {
    render(<ConfidenceIndicator confidence="high" reportCount={8} />);

    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('does not show checkmark for low/medium', () => {
    const { container } = render(<ConfidenceIndicator confidence="medium" reportCount={4} />);

    expect(container.textContent).not.toContain('✓');
  });
});
