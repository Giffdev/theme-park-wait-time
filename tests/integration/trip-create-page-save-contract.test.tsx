import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateTrip = vi.fn();
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'user-123' }, loading: false }),
}));

vi.mock('@/lib/services/trip-service', () => ({
  createTrip: (...args: unknown[]) => mockCreateTrip(...args),
}));

import CreateTripPage from '@/app/trips/new/page';
import {
  configurePendingSaveCommandMemoryStorageForTests,
  configurePendingSaveCommandRemovalFailureForTests,
  resetPendingSaveCommandStorageForTests,
  storePendingSaveCommand,
} from '@/lib/services/pending-save-command-storage';

configurePendingSaveCommandMemoryStorageForTests();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('trip creation page save contract', () => {
  beforeEach(async () => {
    await resetPendingSaveCommandStorageForTests();
    configurePendingSaveCommandRemovalFailureForTests(null);
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exits Creating when the production-style create dependency never settles', async () => {
    mockCreateTrip.mockReturnValue(new Promise(() => {}));
    await storePendingSaveCommand('user-123', 'trip:create', {
      requestId: 'trip-deadline',
      data: {
        name: 'Neverland Trip',
        startDate: '2026-08-18',
        endDate: '2026-08-18',
        parkIds: [],
        parkNames: {},
        status: 'active' as const,
        notes: '',
      },
    });
    render(<CreateTripPage />);
    const retry = await screen.findByRole('button', { name: /Retry Create Trip/i });
    vi.useFakeTimers();
    fireEvent.click(retry);
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(mockCreateTrip).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_001);
    });

    const retryAfterDeadline = screen.getByRole('button', { name: /Retry Create Trip/i });
    expect(retryAfterDeadline).toBeEnabled();
    expect(screen.getByText(/reuse the same trip ID/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Trip Name')).toBeDisabled();

    const firstRequestId = mockCreateTrip.mock.calls[0][2].requestId;
    fireEvent.click(retryAfterDeadline);
    expect(mockCreateTrip).toHaveBeenCalledTimes(2);
    expect(mockCreateTrip.mock.calls[1][2].requestId).toBe(firstRequestId);
  });

  it('navigates when a timed-out trip creation is confirmed late', async () => {
    const create = deferred<string>();
    mockCreateTrip.mockReturnValue(create.promise);
    await storePendingSaveCommand('user-123', 'trip:create', {
      requestId: 'trip-late',
      data: {
        name: 'Late Trip',
        startDate: '2026-08-18',
        endDate: '2026-08-18',
        parkIds: [],
        parkNames: {},
        status: 'active' as const,
        notes: '',
      },
    });
    render(<CreateTripPage />);
    const retry = await screen.findByRole('button', { name: /Retry Create Trip/i });
    vi.useFakeTimers();

    fireEvent.click(retry);
    expect(mockCreateTrip).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_001);
    });

    vi.useRealTimers();
    await act(async () => create.resolve('trip-late'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/trips/trip-late'));
  });

  it('restores the exact trip command after reload and clears it on success', async () => {
    mockCreateTrip.mockRejectedValueOnce(Object.assign(new Error('offline'), {
      outcome: 'ambiguous',
    }));
    const firstRender = render(<CreateTripPage />);
    fireEvent.change(screen.getByLabelText('Trip Name'), {
      target: { value: 'Frozen Trip' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Start Trip/i }));
    await screen.findByText(/offline/i);
    const firstCommand = mockCreateTrip.mock.calls[0];
    firstRender.unmount();

    mockCreateTrip.mockResolvedValueOnce('trip-restored');
    render(<CreateTripPage />);
    expect(await screen.findByDisplayValue('Frozen Trip')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Retry Create Trip/i }));

    expect(mockCreateTrip.mock.calls[1][1]).toEqual(firstCommand[1]);
    expect(mockCreateTrip.mock.calls[1][2].requestId).toBe(firstCommand[2].requestId);
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/trips/trip-restored');
      expect(localStorage.length).toBe(0);
    });
  });

  it('finishes cleanup after creation without calling createTrip again', async () => {
    mockCreateTrip.mockResolvedValue('trip-created');
    configurePendingSaveCommandRemovalFailureForTests(() => {
      throw new Error('cleanup failed');
    });
    render(<CreateTripPage />);
    fireEvent.change(screen.getByLabelText('Trip Name'), {
      target: { value: 'Cleanup Trip' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Start Trip/i }));

    expect(await screen.findByRole('button', { name: /Finish Cleanup/i })).toBeEnabled();
    expect(screen.getByText(/trip is created/i)).toBeInTheDocument();
    expect(mockCreateTrip).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();

    configurePendingSaveCommandRemovalFailureForTests(null);
    fireEvent.click(screen.getByRole('button', { name: /Finish Cleanup/i }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/trips/trip-created'));
    expect(mockCreateTrip).toHaveBeenCalledTimes(1);
  });

  it('shows capacity guidance and does not start trip creation', async () => {
    for (let index = 0; index < 8; index += 1) {
      expect((await storePendingSaveCommand('user-123', `occupied:${index}`, {
        requestId: `occupied-${index}`,
      })).ok).toBe(true);
    }
    render(<CreateTripPage />);
    fireEvent.click(screen.getByRole('button', { name: /Start Trip/i }));

    expect(await screen.findByText(/pending-save storage is full/i)).toBeInTheDocument();
    expect(screen.getByText(/no request was sent/i)).toBeInTheDocument();
    expect(mockCreateTrip).not.toHaveBeenCalled();
  });
});
