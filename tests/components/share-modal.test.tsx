/**
 * Tests for ShareModal component (src/components/trips/ShareModal.tsx)
 *
 * Covers:
 * - Modal renders when open, doesn't render when closed
 * - Toggle switch enables/disables sharing
 * - Copy button copies the share URL to clipboard
 * - Share URL format is correct
 * - Accessibility (ARIA labels, roles)
 *
 * Written 2026-05-01 by Stef (QA)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/firebase/config', () => ({
  db: {},
  auth: {},
}));

vi.mock('lucide-react', () => ({
  X: ({ className }: { className?: string }) => <span data-testid="icon-x" className={className} />,
  Copy: ({ className }: { className?: string }) => <span data-testid="icon-copy" className={className} />,
  Check: ({ className }: { className?: string }) => <span data-testid="icon-check" className={className} />,
  Link2: ({ className }: { className?: string }) => <span data-testid="icon-link2" className={className} />,
  Loader2: ({ className }: { className?: string }) => <span data-testid="icon-loader" className={className} />,
}));

// Mock clipboard API
const mockClipboardWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockClipboardWriteText },
  writable: true,
});

// Mock window.location.origin
Object.defineProperty(window, 'location', {
  value: { ...window.location, origin: 'https://example.com' },
  writable: true,
});

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import ShareModal from '@/components/trips/ShareModal';

// ---------------------------------------------------------------------------
// Test Fixtures
// ---------------------------------------------------------------------------

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  tripName: 'My Disney Vacation',
  shareId: null as string | null,
  onEnableSharing: vi.fn().mockResolvedValue('share-abc-123'),
  onDisableSharing: vi.fn().mockResolvedValue(undefined),
};

function renderModal(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  return render(<ShareModal {...props} />);
}

// ---------------------------------------------------------------------------
// Render / Visibility
// ---------------------------------------------------------------------------

describe('ShareModal — visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal content when isOpen is true', () => {
    renderModal({ isOpen: true });
    expect(screen.getByText('Share Trip')).toBeInTheDocument();
    expect(screen.getByText('My Disney Vacation')).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByText('Share Trip')).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = renderModal({ onClose });
    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Toggle Switch
// ---------------------------------------------------------------------------

describe('ShareModal — toggle switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows toggle in off state when shareId is null', () => {
    renderModal({ shareId: null });
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('shows toggle in on state when shareId is provided', () => {
    renderModal({ shareId: 'existing-share-id' });
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onEnableSharing when toggling on', async () => {
    const onEnableSharing = vi.fn().mockResolvedValue('new-share-id');
    renderModal({ shareId: null, onEnableSharing });

    const toggle = screen.getByRole('switch');
    await act(async () => {
      fireEvent.click(toggle);
    });

    await waitFor(() => {
      expect(onEnableSharing).toHaveBeenCalledTimes(1);
    });
  });

  it('calls onDisableSharing when toggling off', async () => {
    const onDisableSharing = vi.fn().mockResolvedValue(undefined);
    renderModal({ shareId: 'existing-id', onDisableSharing });

    const toggle = screen.getByRole('switch');
    await act(async () => {
      fireEvent.click(toggle);
    });

    await waitFor(() => {
      expect(onDisableSharing).toHaveBeenCalledTimes(1);
    });
  });

  it('shows share URL input after enabling sharing', async () => {
    const onEnableSharing = vi.fn().mockResolvedValue('generated-id');
    renderModal({ shareId: null, onEnableSharing });

    const toggle = screen.getByRole('switch');
    await act(async () => {
      fireEvent.click(toggle);
    });

    await waitFor(() => {
      const input = screen.getByLabelText('Share URL');
      expect(input).toBeInTheDocument();
    });
  });

  it('hides share URL input after disabling sharing', async () => {
    const onDisableSharing = vi.fn().mockResolvedValue(undefined);
    renderModal({ shareId: 'existing-id', onDisableSharing });

    const toggle = screen.getByRole('switch');
    await act(async () => {
      fireEvent.click(toggle);
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Share URL')).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Copy Link
// ---------------------------------------------------------------------------

describe('ShareModal — copy link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('copies share URL to clipboard when copy button clicked', async () => {
    renderModal({ shareId: 'share-xyz' });

    const copyBtn = screen.getByRole('button', { name: /copy link/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(mockClipboardWriteText).toHaveBeenCalledWith(
      'https://example.com/trips/shared/share-xyz'
    );
  });

  it('shows "Copied!" feedback after copying', async () => {
    renderModal({ shareId: 'share-xyz' });

    const copyBtn = screen.getByRole('button', { name: /copy link/i });
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Share URL Format
// ---------------------------------------------------------------------------

describe('ShareModal — URL format', () => {
  it('displays the correct share URL format', () => {
    renderModal({ shareId: 'abc-def-123' });
    const input = screen.getByLabelText('Share URL') as HTMLInputElement;
    expect(input.value).toBe('https://example.com/trips/shared/abc-def-123');
  });

  it('URL includes origin + /trips/shared/ + shareId', () => {
    renderModal({ shareId: 'test-id' });
    const input = screen.getByLabelText('Share URL') as HTMLInputElement;
    expect(input.value).toMatch(/^https:\/\/example\.com\/trips\/shared\/test-id$/);
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('ShareModal — accessibility', () => {
  it('close button has aria-label="Close"', () => {
    renderModal();
    const btn = screen.getByLabelText('Close');
    expect(btn).toBeInTheDocument();
  });

  it('toggle has role="switch" with correct aria-checked', () => {
    renderModal({ shareId: 'id' });
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('share URL input has associated label', () => {
    renderModal({ shareId: 'id' });
    const input = screen.getByLabelText('Share URL');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('readonly');
  });

  it('displays trip name for context', () => {
    renderModal({ tripName: 'Spring Break 2026' });
    expect(screen.getByText('Spring Break 2026')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

describe('ShareModal — error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('handles onEnableSharing failure gracefully', async () => {
    const onEnableSharing = vi.fn().mockRejectedValue(new Error('Network error'));
    renderModal({ shareId: null, onEnableSharing });

    const toggle = screen.getByRole('switch');
    await act(async () => {
      fireEvent.click(toggle);
    });

    // Should not crash, toggle stays off
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('handles onDisableSharing failure gracefully', async () => {
    const onDisableSharing = vi.fn().mockRejectedValue(new Error('Network error'));
    renderModal({ shareId: 'existing', onDisableSharing });

    const toggle = screen.getByRole('switch');
    await act(async () => {
      fireEvent.click(toggle);
    });

    // Should not crash, toggle stays on
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });
  });
});
