import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateTrip = vi.fn();
const mockReconcileTripCreation = vi.fn();
const mockPush = vi.fn();
const mockAuthState: {
  user: { uid: string } | null;
  loading: boolean;
} = {
  user: { uid: 'user-123' },
  loading: false,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('@/lib/services/trip-service', () => ({
  createTrip: (...args: unknown[]) => mockCreateTrip(...args),
  reconcileTripCreation: (...args: unknown[]) => mockReconcileTripCreation(...args),
}));

import CreateTripPage from '@/app/trips/new/page';
import {
  configurePendingSaveCommandMemoryStorageForTests,
  configurePendingSaveCommandRemovalDelayForTests,
  configurePendingSaveCommandRemovalFailureForTests,
  loadPendingSaveCommand,
  removePendingSaveCommand,
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

const frozenTrip = (requestId: string, name = 'Frozen Trip') => ({
  requestId,
  data: {
    name,
    startDate: '2026-08-18',
    endDate: '2026-08-18',
    parkIds: [],
    parkNames: {},
    status: 'active' as const,
    notes: '',
  },
});

describe('trip creation page save contract', () => {
  beforeEach(async () => {
    await resetPendingSaveCommandStorageForTests();
    configurePendingSaveCommandRemovalFailureForTests(null);
    configurePendingSaveCommandRemovalDelayForTests(null);
    vi.clearAllMocks();
    mockCreateTrip.mockReset();
    mockReconcileTripCreation.mockReset();
    mockPush.mockReset();
    mockReconcileTripCreation.mockImplementation(
      async (_uid: string, _data: unknown, requestId: string) => requestId,
    );
    mockAuthState.user = { uid: 'user-123' };
    mockAuthState.loading = false;
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('automatically confirms when the create response never settles after commit', async () => {
    mockCreateTrip.mockReturnValue(new Promise(() => {}));
    render(<CreateTripPage />);
    const startTrip = await screen.findByRole('button', { name: /Start Trip/i });
    await waitFor(() => expect(startTrip).toBeEnabled());
    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText('Trip Name'), {
      target: { value: 'Neverland Trip' },
    });
    fireEvent.click(startTrip);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(mockCreateTrip).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_001);
    });

    const firstRequestId = mockCreateTrip.mock.calls[0][2].requestId;
    expect(mockReconcileTripCreation).toHaveBeenCalledWith(
      'user-123',
      expect.any(Object),
      firstRequestId,
      8_000,
      expect.any(AbortSignal),
    );
    expect(mockPush).toHaveBeenCalledWith(`/trips/${firstRequestId}`);
    expect(mockCreateTrip).toHaveBeenCalledTimes(1);
  });

  it('automatically reconciles a lost create response', async () => {
    mockCreateTrip.mockRejectedValue(Object.assign(new Error('response lost'), {
      outcome: 'ambiguous',
    }));
    render(<CreateTripPage />);
    const startTrip = await screen.findByRole('button', { name: /Start Trip/i });
    await waitFor(() => expect(startTrip).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Trip Name'), {
      target: { value: 'Lost Response Trip' },
    });
    fireEvent.click(startTrip);

    await waitFor(() => expect(mockCreateTrip).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    await waitFor(() => expect(mockReconcileTripCreation).toHaveBeenCalledTimes(1));
    const requestId = mockCreateTrip.mock.calls[0][2].requestId;
    expect(mockReconcileTripCreation.mock.calls[0][2]).toBe(requestId);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/trips/${requestId}`));
  });

  it('cleans up and navigates after exact committed request ID confirmation', async () => {
    mockCreateTrip.mockRejectedValueOnce(Object.assign(new Error('offline'), {
      outcome: 'ambiguous',
    }));
    mockReconcileTripCreation.mockReturnValueOnce(new Promise(() => {}));
    const firstRender = render(<CreateTripPage />);
    const startTrip = await screen.findByRole('button', { name: /Start Trip/i });
    await waitFor(() => expect(startTrip).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Trip Name'), {
      target: { value: 'Frozen Trip' },
    });
    fireEvent.click(startTrip);
    await waitFor(() => expect(mockCreateTrip).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    await screen.findByRole('button', { name: /Still confirming/i });
    const firstCommand = mockCreateTrip.mock.calls[0];
    firstRender.unmount();

    mockReconcileTripCreation.mockImplementationOnce(
      async (_uid: string, _data: unknown, requestId: string) => requestId,
    );
    render(<CreateTripPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(`/trips/${firstCommand[2].requestId}`);
      expect(localStorage.length).toBe(0);
    });
    expect(mockCreateTrip).toHaveBeenCalledTimes(1);
    expect(mockReconcileTripCreation.mock.calls.at(-1)?.[2]).toBe(firstCommand[2].requestId);
  });

  it('finishes cleanup after creation without calling createTrip again', async () => {
    mockCreateTrip.mockResolvedValue('trip-created');
    configurePendingSaveCommandRemovalFailureForTests(() => {
      throw new Error('cleanup failed');
    });
    render(<CreateTripPage />);
    const startTrip = await screen.findByRole('button', { name: /Start Trip/i });
    await waitFor(() => expect(startTrip).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Trip Name'), {
      target: { value: 'Cleanup Trip' },
    });
    fireEvent.click(startTrip);

    await waitFor(() => expect(mockCreateTrip).toHaveBeenCalledTimes(1), { timeout: 5_000 });
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
    const startTrip = await screen.findByRole('button', { name: /Start Trip/i });
    await waitFor(() => expect(startTrip).toBeEnabled());
    fireEvent.click(startTrip);

    expect(await screen.findByText(/pending-save storage is full/i, {}, { timeout: 5_000 }))
      .toBeInTheDocument();
    expect(screen.getByText(/no request was sent/i)).toBeInTheDocument();
    expect(mockCreateTrip).not.toHaveBeenCalled();
  });

  it('retains structural conflict state and only retries the same request ID', async () => {
    const command = frozenTrip('trip-structural-conflict');
    await storePendingSaveCommand('user-123', 'trip:create', command);
    mockReconcileTripCreation.mockRejectedValue(Object.assign(
      new Error(
        'This trip request has conflicting server state. Retry this request or contact support; do not start a new trip request.',
      ),
      { code: 'conflicting-replay', outcome: 'ambiguous' },
    ));

    render(<CreateTripPage />);

    expect(await screen.findByText(/contact support/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Trip Name')).toBeDisabled();
    const retry = screen.getByRole('button', { name: /Confirm Again/i });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await waitFor(() => expect(mockReconcileTripCreation).toHaveBeenCalledTimes(2));
    expect(mockReconcileTripCreation.mock.calls.map((call) => call[2]))
      .toEqual([command.requestId, command.requestId]);
    await expect(loadPendingSaveCommand(
      'user-123',
      'trip:create',
      () => true,
    )).resolves.toEqual(command);
    expect(mockCreateTrip).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', 'malformed-json', undefined],
    ['missing committed ID', 'missing-id', undefined],
    ['mismatched committed ID', 'mismatched-id', 'different-request-id'],
    ['malformed numeric committed ID', 'malformed-id', 42],
  ])(
    'retains the frozen command without cleanup or navigation for %s evidence',
    async (_label, failure, evidenceId) => {
      const command = frozenTrip(`trip-${failure}-retained`);
      await storePendingSaveCommand('user-123', 'trip:create', command);
      mockReconcileTripCreation.mockRejectedValue(Object.assign(
        new Error(`Trip creation status could not be confirmed yet: ${String(evidenceId)}`),
        { code: 'write-failed', outcome: 'ambiguous', evidenceId },
      ));

      const rendered = render(<CreateTripPage />);
      await waitFor(() => expect(mockReconcileTripCreation).toHaveBeenCalled());
      await expect(loadPendingSaveCommand('user-123', 'trip:create', () => true))
        .resolves.toEqual(command);
      expect(mockPush).not.toHaveBeenCalled();
      rendered.unmount();
    },
  );

  it('does not clean up or navigate when reconciliation resolves after unmount', async () => {
    const command = frozenTrip('trip-resolve-after-unmount');
    const reconciliation = deferred<string>();
    await storePendingSaveCommand('user-123', 'trip:create', command);
    mockReconcileTripCreation.mockReturnValueOnce(reconciliation.promise);

    const rendered = render(<CreateTripPage />);
    await waitFor(() => expect(mockReconcileTripCreation).toHaveBeenCalledTimes(1));
    rendered.unmount();
    await act(async () => {
      reconciliation.resolve(command.requestId);
      await Promise.resolve();
      await Promise.resolve();
    });

    await expect(loadPendingSaveCommand(
      'user-123',
      'trip:create',
      () => true,
    )).resolves.toEqual(command);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('retains the command when unmounted while durable removal is delayed', async () => {
    const command = frozenTrip('trip-removal-unmount');
    const removalStarted = deferred<void>();
    const releaseRemoval = deferred<void>();
    await storePendingSaveCommand('user-123', 'trip:create', command);
    configurePendingSaveCommandRemovalDelayForTests(async () => {
      removalStarted.resolve(undefined);
      await releaseRemoval.promise;
    });

    const rendered = render(<CreateTripPage />);
    await removalStarted.promise;
    rendered.unmount();
    releaseRemoval.resolve(undefined);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await expect(loadPendingSaveCommand('user-123', 'trip:create', () => true))
      .resolves.toEqual(command);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('retains the old account command when UID changes during delayed removal', async () => {
    const command = frozenTrip('trip-removal-uid-change');
    const removalStarted = deferred<void>();
    const releaseRemoval = deferred<void>();
    await storePendingSaveCommand('user-123', 'trip:create', command);
    configurePendingSaveCommandRemovalDelayForTests(async () => {
      removalStarted.resolve(undefined);
      await releaseRemoval.promise;
    });

    const rendered = render(<CreateTripPage />);
    await removalStarted.promise;
    mockAuthState.user = { uid: 'user-456' };
    rendered.rerender(<CreateTripPage />);
    releaseRemoval.resolve(undefined);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await expect(loadPendingSaveCommand('user-123', 'trip:create', () => true))
      .resolves.toEqual(command);
    expect(mockPush).not.toHaveBeenCalled();
    rendered.unmount();
  });

  it('preserves a superseding request when stale removal resumes', async () => {
    const oldCommand = frozenTrip('trip-removal-old');
    const newCommand = frozenTrip('trip-removal-new');
    const removalStarted = deferred<void>();
    const releaseRemoval = deferred<void>();
    await storePendingSaveCommand('user-123', 'trip:create', oldCommand);
    configurePendingSaveCommandRemovalDelayForTests(async () => {
      removalStarted.resolve(undefined);
      await releaseRemoval.promise;
    });

    const rendered = render(<CreateTripPage />);
    await removalStarted.promise;
    configurePendingSaveCommandRemovalDelayForTests(null);
    await removePendingSaveCommand('user-123', 'trip:create', oldCommand.requestId);
    await storePendingSaveCommand('user-123', 'trip:create', newCommand);
    releaseRemoval.resolve(undefined);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await expect(loadPendingSaveCommand('user-123', 'trip:create', () => true))
      .resolves.toEqual(newCommand);
    expect(mockPush).not.toHaveBeenCalled();
    rendered.unmount();
  });

  it('ignores a stale confirmation run even when UID and request ID match again', async () => {
    const command = frozenTrip('trip-stale-run');
    const firstRun = deferred<string>();
    const otherUserRun = deferred<string>();
    const currentRun = deferred<string>();
    await storePendingSaveCommand('user-123', 'trip:create', command);
    mockReconcileTripCreation
      .mockReturnValueOnce(firstRun.promise)
      .mockReturnValueOnce(otherUserRun.promise)
      .mockReturnValueOnce(currentRun.promise);

    const rendered = render(<CreateTripPage />);
    await waitFor(() => expect(mockReconcileTripCreation).toHaveBeenCalledTimes(1));

    mockAuthState.user = { uid: 'user-456' };
    rendered.rerender(<CreateTripPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Start Trip/i })).toBeEnabled());

    mockAuthState.user = { uid: 'user-123' };
    rendered.rerender(<CreateTripPage />);
    await waitFor(() => expect(mockReconcileTripCreation).toHaveBeenCalledTimes(2));
    await act(async () => {
      firstRun.resolve(command.requestId);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPush).not.toHaveBeenCalled();
    await expect(loadPendingSaveCommand(
      'user-123',
      'trip:create',
      () => true,
    )).resolves.toEqual(command);
    rendered.unmount();
  });

  it('does not let an old UID completion clean up the current account', async () => {
    const requestId = 'trip-same-id-different-uid';
    const firstUserCommand = frozenTrip(requestId, 'First User Trip');
    const secondUserCommand = frozenTrip(requestId, 'Second User Trip');
    const firstUserRun = deferred<string>();
    const secondUserRun = deferred<string>();
    await storePendingSaveCommand('user-123', 'trip:create', firstUserCommand);
    await storePendingSaveCommand('user-456', 'trip:create', secondUserCommand);
    mockReconcileTripCreation
      .mockReturnValueOnce(firstUserRun.promise)
      .mockReturnValueOnce(secondUserRun.promise);

    const rendered = render(<CreateTripPage />);
    await waitFor(() => expect(mockReconcileTripCreation).toHaveBeenCalledTimes(1));
    mockAuthState.user = { uid: 'user-456' };
    rendered.rerender(<CreateTripPage />);
    await waitFor(() => expect(mockReconcileTripCreation).toHaveBeenCalledTimes(2));
    await act(async () => {
      firstUserRun.resolve(requestId);
      await Promise.resolve();
      await Promise.resolve();
    });

    await expect(loadPendingSaveCommand(
      'user-456',
      'trip:create',
      () => true,
    )).resolves.toEqual(secondUserCommand);
    expect(mockPush).not.toHaveBeenCalled();
    rendered.unmount();
  });

  it('does not clean up a superseded request when the old request resolves', async () => {
    const oldCommand = frozenTrip('trip-superseded-old');
    const newCommand = frozenTrip('trip-superseded-new');
    const oldRun = deferred<string>();
    const otherUserRun = deferred<string>();
    const newRun = deferred<string>();
    await storePendingSaveCommand('user-123', 'trip:create', oldCommand);
    mockReconcileTripCreation
      .mockReturnValueOnce(oldRun.promise)
      .mockReturnValueOnce(otherUserRun.promise)
      .mockReturnValueOnce(newRun.promise);

    const rendered = render(<CreateTripPage />);
    await waitFor(() => expect(mockReconcileTripCreation).toHaveBeenCalledTimes(1));
    mockAuthState.user = { uid: 'user-456' };
    rendered.rerender(<CreateTripPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Start Trip/i })).toBeEnabled());

    await removePendingSaveCommand('user-123', 'trip:create', oldCommand.requestId);
    await storePendingSaveCommand('user-123', 'trip:create', newCommand);
    mockAuthState.user = { uid: 'user-123' };
    rendered.rerender(<CreateTripPage />);
    await waitFor(() => expect(mockReconcileTripCreation).toHaveBeenCalledTimes(2));
    await act(async () => {
      oldRun.resolve(oldCommand.requestId);
      await Promise.resolve();
      await Promise.resolve();
    });

    await expect(loadPendingSaveCommand(
      'user-123',
      'trip:create',
      () => true,
    )).resolves.toEqual(newCommand);
    expect(mockPush).not.toHaveBeenCalled();
    rendered.unmount();
  });
});
