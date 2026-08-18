import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configurePendingSaveCommandMemoryStorageForTests,
  configurePendingSaveCommandRemovalFailureForTests,
  resetPendingSaveCommandStorageForTests,
  storePendingSaveCommand,
} from '@/lib/services/pending-save-command-storage';

configurePendingSaveCommandMemoryStorageForTests();

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
    errorKind: null,
    retry: vi.fn(),
    continueStandalone: vi.fn(),
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
  beforeEach(async () => {
    await resetPendingSaveCommandStorageForTests();
    configurePendingSaveCommandRemovalFailureForTests(null);
    vi.clearAllMocks();
    localStorage.clear();
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
    await screen.findByRole('option', { name: 'Space Mountain' });
    fireEvent.change(await screen.findByLabelText('Attraction'), {
      target: { value: 'space-mountain' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log Ride/i }));

    await waitFor(() => expect(mockCreateRideLog).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    expect(await screen.findByText(
      /Failed to save ride log/i,
      undefined,
      { timeout: 5_000 },
    )).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Discard failed save/i })).not.toBeInTheDocument();
    const firstRequestId = mockCreateRideLog.mock.calls[0][3].requestId;

    fireEvent.click(screen.getByRole('button', { name: /Retry Save/i }));
    await waitFor(() => expect(mockCreateRideLog).toHaveBeenCalledTimes(2));
    expect(mockCreateRideLog.mock.calls[1][3].requestId).toBe(firstRequestId);
    expect(mockCreateRideLog.mock.calls[1][1].rodeAt.toISOString())
      .toBe(mockCreateRideLog.mock.calls[0][1].rodeAt.toISOString());
  }, 15_000);

  it('restores the complete frozen command after reload', async () => {
    mockCreateRideLog
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { outcome: 'ambiguous' }))
      .mockResolvedValueOnce('ride-1');
    const first = render(<ManualLogForm />);
    fireEvent.change(await screen.findByLabelText('Park'), {
      target: { value: 'magic-kingdom' },
    });
    await screen.findByRole('option', { name: 'Space Mountain' });
    fireEvent.change(await screen.findByLabelText('Attraction'), {
      target: { value: 'space-mountain' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log Ride/i }));
    await waitFor(() => expect(mockCreateRideLog).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    await screen.findByText(/Failed to save ride log/i, undefined, { timeout: 5_000 });
    const firstRequestId = mockCreateRideLog.mock.calls[0][3].requestId;
    const firstRodeAt = mockCreateRideLog.mock.calls[0][1].rodeAt.toISOString();
    first.unmount();

    render(<ManualLogForm />);
    fireEvent.click(await screen.findByRole('button', { name: /Retry Save/i }));
    await waitFor(() => expect(mockCreateRideLog).toHaveBeenCalledTimes(2));

    expect(mockCreateRideLog.mock.calls[1][3].requestId).toBe(firstRequestId);
    expect(mockCreateRideLog.mock.calls[1][1].rodeAt.toISOString()).toBe(firstRodeAt);
    expect(localStorage.length).toBe(0);
  }, 15_000);

  it('does not initiate a save when the frozen command cannot be persisted', async () => {
    for (let index = 0; index < 8; index += 1) {
      await storePendingSaveCommand('user-123', `occupied:${index}`, {
        requestId: `occupied-${index}`,
      });
    }
    render(<ManualLogForm />);
    fireEvent.change(await screen.findByLabelText('Park'), {
      target: { value: 'magic-kingdom' },
    });
    await screen.findByRole('option', { name: 'Space Mountain' });
    fireEvent.change(await screen.findByLabelText('Attraction'), {
      target: { value: 'space-mountain' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log Ride/i }));

    expect(await screen.findByText(
      /pending-save storage is full/i,
      undefined,
      { timeout: 5_000 },
    )).toBeInTheDocument();
    expect(screen.getByText(/no request was sent/i)).toBeInTheDocument();
    expect(mockCreateRideLog).not.toHaveBeenCalled();
  });

  it('retries only cleanup after the ride commit and finalizes after cleanup succeeds', async () => {
    const onSuccess = vi.fn();
    mockCreateRideLog.mockResolvedValue('ride-1');
    configurePendingSaveCommandRemovalFailureForTests(() => {
      throw new Error('cleanup failed');
    });
    render(<ManualLogForm onSuccess={onSuccess} />);

    fireEvent.change(await screen.findByLabelText('Park'), {
      target: { value: 'magic-kingdom' },
    });
    await screen.findByRole('option', { name: 'Space Mountain' });
    fireEvent.change(screen.getByLabelText('Attraction'), {
      target: { value: 'space-mountain' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Log Ride/i }));

    expect(await screen.findByRole('button', { name: /Finish Cleanup/i })).toBeEnabled();
    expect(screen.getByText(/ride is saved/i)).toBeInTheDocument();
    expect(mockCreateRideLog).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();

    configurePendingSaveCommandRemovalFailureForTests(null);
    fireEvent.click(screen.getByRole('button', { name: /Finish Cleanup/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(mockCreateRideLog).toHaveBeenCalledTimes(1);
  });

  it('shows a park load rejection with an independent retry and recovers', async () => {
    mockGetCollection
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(async (path: string) => {
        if (path === 'parks') return [{ id: 'magic-kingdom', name: 'Magic Kingdom' }];
        if (path === 'attractions') {
          return [{ id: 'space-mountain', name: 'Space Mountain', entityType: 'ATTRACTION' }];
        }
        return [];
      });
    render(<ManualLogForm />);

    expect(await screen.findByText(/Parks could not be loaded/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry park loading/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('Park')).toHaveTextContent('Magic Kingdom');
    });
  });

  it('times out a never-settling attraction read and exposes attraction-only retry', async () => {
    mockGetCollection.mockImplementation(
      (path: string) => path === 'parks'
        ? Promise.resolve([{ id: 'magic-kingdom', name: 'Magic Kingdom' }])
        : new Promise(() => {}),
    );
    render(<ManualLogForm />);
    fireEvent.change(await screen.findByLabelText('Park'), {
      target: { value: 'magic-kingdom' },
    });

    expect(await screen.findByText(/Attractions could not be loaded/i, {}, {
      timeout: 9_000,
    })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry attraction loading/i })).toBeEnabled();
  }, 10_000);

  it.each(['-1', '1', '181', '12.5', 'not-a-number'])(
    'rejects invalid ride wait %s before the save entrypoint',
    async (waitTime) => {
      render(<ManualLogForm />);
      fireEvent.change(await screen.findByLabelText('Park'), {
        target: { value: 'magic-kingdom' },
      });
      await screen.findByRole('option', { name: 'Space Mountain' });
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
