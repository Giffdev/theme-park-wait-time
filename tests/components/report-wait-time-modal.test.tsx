import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSubmitWaitTimeReport = vi.fn();
let frozenCommand: {
  requestId: string;
  attractionId: string;
  attractionName: string;
  parkId: string;
  waitTime: number;
} | null;

vi.mock('lucide-react', () => {
  const Icon = () => <span aria-hidden="true" />;
  return {
    X: Icon,
    Clock: Icon,
    Play: Icon,
    Pause: Icon,
    Square: Icon,
    RotateCcw: Icon,
    CheckCircle2: Icon,
    Timer: Icon,
  };
});

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'user-123' } }),
}));

vi.mock('@/lib/firebase/waitTimeReports', () => ({
  getOrCreateWaitTimeReportCommand: (input: Omit<NonNullable<typeof frozenCommand>, 'requestId'>) => {
    frozenCommand ??= {
      requestId: 'stable-report-command',
      attractionId: input.attractionId,
      attractionName: input.attractionName,
      parkId: input.parkId,
      waitTime: input.waitTime,
    };
    return frozenCommand;
  },
  submitWaitTimeReport: (...args: unknown[]) => mockSubmitWaitTimeReport(...args),
}));

import ReportWaitTimeModal from '@/components/parks/ReportWaitTimeModal';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ReportWaitTimeModal durable command lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    frozenCommand = null;
  });

  it('reuses the frozen report after close/reopen while the first request completes late', async () => {
    const first = deferred<string>();
    mockSubmitWaitTimeReport
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce('stable-report-command');
    const firstClose = vi.fn();
    const firstRender = render(
      <ReportWaitTimeModal
        attractionId="space-mountain"
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        onClose={firstClose}
      />,
    );

    fireEvent.change(screen.getByLabelText('Wait Time (minutes)'), { target: { value: '35' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(firstClose).toHaveBeenCalled();
    firstRender.unmount();

    render(
      <ReportWaitTimeModal
        attractionId="space-mountain"
        attractionName="Space Mountain"
        parkId="magic-kingdom"
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Wait Time (minutes)'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Report' }));

    expect(mockSubmitWaitTimeReport).toHaveBeenNthCalledWith(1, {
      requestId: 'stable-report-command',
      attractionId: 'space-mountain',
      attractionName: 'Space Mountain',
      parkId: 'magic-kingdom',
      waitTime: 35,
    });
    expect(mockSubmitWaitTimeReport).toHaveBeenNthCalledWith(2, {
      requestId: 'stable-report-command',
      attractionId: 'space-mountain',
      attractionName: 'Space Mountain',
      parkId: 'magic-kingdom',
      waitTime: 35,
    });

    await act(async () => first.resolve('stable-report-command'));
    expect(await screen.findByText('Wait Time Reported!')).toBeInTheDocument();
  });
});
