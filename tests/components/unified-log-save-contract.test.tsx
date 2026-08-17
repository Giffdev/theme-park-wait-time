import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAddRideLog = vi.fn();
const mockSubmitWaitTimeReport = vi.fn();
const mockGetCollection = vi.fn();
const mockGetActiveTrip = vi.fn();
const mockGetTripRideLogs = vi.fn();

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
    Ban: Icon,
    XCircle: Icon,
  };
});

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'user-123', email: 'private@example.com' } }),
}));

vi.mock('@/lib/firebase/firestore', () => ({
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  whereConstraint: (_field: string, _operator: string, value: string) => ({ value }),
}));

vi.mock('@/lib/services/ride-log-service', () => ({
  addRideLog: (...args: unknown[]) => mockAddRideLog(...args),
  canDiscardRideLogSave: (error: { outcome?: string }) => error?.outcome === 'definitive-non-commit',
}));

vi.mock('@/lib/firebase/waitTimeReports', () => ({
  getOrCreateWaitTimeReportCommand: (input: Record<string, unknown>) => ({
    requestId: 'wait-report-1234',
    attractionId: input.attractionId,
    attractionName: input.attractionName,
    parkId: input.parkId,
    waitTime: input.waitTime,
  }),
  submitWaitTimeReport: (...args: unknown[]) => mockSubmitWaitTimeReport(...args),
}));

vi.mock('@/lib/services/trip-service', () => ({
  getActiveTrip: (...args: unknown[]) => mockGetActiveTrip(...args),
  getTripRideLogs: (...args: unknown[]) => mockGetTripRideLogs(...args),
}));

vi.mock('@/lib/utils/classify-attraction', () => ({
  classifyAttraction: () => 'thrill',
}));

import UnifiedLogSheet from '@/components/UnifiedLogSheet';

describe('UnifiedLogSheet save contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddRideLog.mockResolvedValue('ride-1');
    mockSubmitWaitTimeReport.mockRejectedValue(new Error('permission denied'));
    mockGetActiveTrip.mockResolvedValue({ id: 'trip-1', name: 'August Trip' });
    mockGetTripRideLogs.mockResolvedValue([]);
    mockGetCollection.mockImplementation(
      async (path: string, constraints?: Array<{ value?: string }>) => {
        if (path === 'parks') return [{ id: 'magic-kingdom', name: 'Magic Kingdom' }];
        if (path === 'attractions' && constraints?.[0]?.value === 'magic-kingdom') {
          return [{
            id: 'space-mountain',
            name: 'Space Mountain',
            entityType: 'ATTRACTION',
          }];
        }
        return [];
      },
    );
  });

  it('keeps a successful ride when the optional report fails and uses accurate copy', async () => {
    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);

    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    fireEvent.click(screen.getByRole('button', { name: /No Wait/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));

    expect(await screen.findByText('Ride Logged!')).toBeInTheDocument();
    expect(screen.queryByText('Ride Logged & Wait Reported!')).not.toBeInTheDocument();
    expect(screen.getByText(/Ride saved.*report could not be sent/i)).toBeInTheDocument();
    expect(mockAddRideLog).toHaveBeenCalledTimes(1);
    expect(mockSubmitWaitTimeReport).toHaveBeenCalledWith({
      requestId: 'wait-report-1234',
      attractionId: 'space-mountain',
      attractionName: 'Space Mountain',
      parkId: 'magic-kingdom',
      waitTime: 0,
    });
  });

  it('blocks standalone fallback when active-trip lookup fails and supports retry', async () => {
    mockGetActiveTrip
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(null);

    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);

    expect(await screen.findByText(/Could not check for an active trip/i)).toBeInTheDocument();
    expect(screen.queryByText('No active trip')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Standalone' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Retry trip check/i }));
    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    expect(await screen.findByText('No active trip')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Standalone' })).toBeInTheDocument();
  });

  it('keeps the same ride command after an ambiguous failure and never offers start-over', async () => {
    mockAddRideLog
      .mockRejectedValueOnce(Object.assign(new Error('network unavailable'), {
        outcome: 'ambiguous',
      }))
      .mockResolvedValueOnce('ride-1');
    render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);

    const parkSelect = await screen.findByLabelText('Logging at');
    await waitFor(() => expect(parkSelect).toBeEnabled());
    fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
    fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
    fireEvent.click(screen.getByRole('button', { name: /No Wait/i }));
    fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));

    expect(await screen.findByText('network unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Discard failed save/i })).not.toBeInTheDocument();
    const firstRequestId = mockAddRideLog.mock.calls[0][3].requestId;

    fireEvent.click(screen.getByRole('button', { name: /Retry Save/i }));
    expect(await screen.findByText('Ride Logged!')).toBeInTheDocument();
    expect(mockAddRideLog.mock.calls[1][3].requestId).toBe(firstRequestId);
  });

  it.each(['-1', '1', '181', '12.5'])(
    'rejects invalid ride wait %s before the unified save entrypoint',
    async (waitTime) => {
      render(<UnifiedLogSheet open expandedByDefault onClose={vi.fn()} />);
      const parkSelect = await screen.findByLabelText('Logging at');
      await waitFor(() => expect(parkSelect).toBeEnabled());
      fireEvent.change(parkSelect, { target: { value: 'magic-kingdom' } });
      fireEvent.click(await screen.findByRole('button', { name: /Space Mountain/i }));
      fireEvent.change(screen.getByLabelText('Wait time in minutes'), {
        target: { value: waitTime },
      });
      fireEvent.click(screen.getByRole('button', { name: /Submit & Log Ride/i }));

      expect(await screen.findByText(/Wait time must be/i)).toBeInTheDocument();
      expect(mockAddRideLog).not.toHaveBeenCalled();
    },
  );
});
