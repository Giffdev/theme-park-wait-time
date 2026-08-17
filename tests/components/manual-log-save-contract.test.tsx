import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateRideLog = vi.fn();
const mockGetCollection = vi.fn();

vi.mock('lucide-react', () => ({
  Star: () => <span aria-hidden="true" />,
}));

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'user-123' } }),
}));

vi.mock('@/hooks/useActiveRidePark', () => ({
  toLocalDateKey: () => '2026-08-17',
  useActiveRidePark: () => ({
    tripId: 'trip-1',
    tripName: 'August Trip',
    recentParkId: null,
    setRecentParkId: vi.fn(),
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}));

vi.mock('@/lib/services/ride-log-service', () => ({
  createRideLog: (...args: unknown[]) => mockCreateRideLog(...args),
  canDiscardRideLogSave: (error: { outcome?: string }) => error?.outcome === 'definitive-non-commit',
}));

vi.mock('@/lib/firebase/firestore', () => ({
  getCollection: (...args: unknown[]) => mockGetCollection(...args),
  whereConstraint: (_field: string, _operator: string, value: string) => ({ value }),
}));

vi.mock('@/components/ui/SearchableSelect', () => ({
  SearchableSelect: ({
    options,
    value,
    onChange,
    label,
    disabled,
  }: {
    options: Array<{ id: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
    label: string;
    disabled?: boolean;
  }) => (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Select</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>{option.label}</option>
      ))}
    </select>
  ),
}));

vi.mock('@/components/ride-log/WaitTimeInput', () => ({
  default: ({
    value,
    onChange,
    onModeChange,
  }: {
    value: string;
    onChange: (value: string) => void;
    onModeChange: (mode: string) => void;
  }) => (
    <input
      aria-label="Wait time in minutes"
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
        onModeChange(event.target.value ? 'manual' : 'unknown');
      }}
    />
  ),
}));

import ManualLogForm from '@/components/ride-log/ManualLogForm';

describe('ManualLogForm save outcome contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCollection.mockImplementation(async (path: string) => {
      if (path === 'parks') return [{ id: 'magic-kingdom', name: 'Magic Kingdom' }];
      if (path === 'attractions') {
        return [{ id: 'space-mountain', name: 'Space Mountain', entityType: 'ATTRACTION' }];
      }
      return [];
    });
  });

  it('retains the request ID after an ambiguous failure and does not allow discard', async () => {
    mockCreateRideLog
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { outcome: 'ambiguous' }))
      .mockResolvedValueOnce('ride-1');
    render(<ManualLogForm />);

    fireEvent.change(await screen.findByLabelText('Park'), {
      target: { value: 'magic-kingdom' },
    });
    fireEvent.change(await screen.findByLabelText('Attraction'), {
      target: { value: 'space-mountain' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log Ride/i }));

    expect(await screen.findByText(/Failed to save ride log/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Discard failed save/i })).not.toBeInTheDocument();
    const firstRequestId = mockCreateRideLog.mock.calls[0][3].requestId;

    fireEvent.click(screen.getByRole('button', { name: /Retry Save/i }));
    await waitFor(() => expect(mockCreateRideLog).toHaveBeenCalledTimes(2));
    expect(mockCreateRideLog.mock.calls[1][3].requestId).toBe(firstRequestId);
  });

  it.each(['-1', '1', '181', '12.5', 'not-a-number'])(
    'rejects invalid ride wait %s before the save entrypoint',
    async (waitTime) => {
      render(<ManualLogForm />);
      fireEvent.change(await screen.findByLabelText('Park'), {
        target: { value: 'magic-kingdom' },
      });
      fireEvent.change(await screen.findByLabelText('Attraction'), {
        target: { value: 'space-mountain' },
      });
      fireEvent.change(screen.getByLabelText('Wait time in minutes'), {
        target: { value: waitTime },
      });
      fireEvent.click(screen.getByRole('button', { name: /Log Ride/i }));

      expect(await screen.findByText(/Ride wait time must be/i)).toBeInTheDocument();
      expect(mockCreateRideLog).not.toHaveBeenCalled();
    },
  );
});
