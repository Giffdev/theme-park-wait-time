import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

const mockGetCollection = vi.fn().mockResolvedValue([]);

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('lucide-react', () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    X: Icon,
    Search: Icon,
    Clock: Icon,
    Star: Icon,
    Check: Icon,
    MapPin: Icon,
    ChevronDown: Icon,
    ChevronUp: Icon,
  };
});

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'user-123' } }),
}));

vi.mock('@/lib/firebase/firestore', () => ({
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  whereConstraint: vi.fn(),
}));

vi.mock('@/lib/services/ride-log-service', () => ({ addRideLog: vi.fn() }));
vi.mock('@/lib/firebase/waitTimeReports', () => ({ submitWaitTimeReport: vi.fn() }));
vi.mock('@/lib/services/trip-service', () => ({
  getActiveTrip: vi.fn().mockResolvedValue(null),
  getTripRideLogs: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/utils/classify-attraction', () => ({
  classifyAttraction: () => 'thrill',
}));
vi.mock('@/components/ride-log/WaitTimeInput', () => ({
  default: () => null,
}));

import UnifiedLogSheet from '@/components/UnifiedLogSheet';

describe('UnifiedLogSheet storage migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('migrates the legacy last-park value to ParkPulse without losing it', async () => {
    localStorage.setItem('parkflow-last-park', 'magic-kingdom');

    render(<UnifiedLogSheet open onClose={vi.fn()} />);

    await waitFor(() => {
      expect(localStorage.getItem('parkpulse-last-park')).toBe('magic-kingdom');
      expect(localStorage.getItem('parkflow-last-park')).toBeNull();
    });
  });
});
