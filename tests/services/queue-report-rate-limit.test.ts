import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockBudgetGet = vi.fn();
const mockTransactionSet = vi.fn();
const mockRunTransaction = vi.fn();
const mockDoc = vi.fn(() => ({ path: 'private-budget' }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    doc: (...args: unknown[]) => mockDoc(...args),
    runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
  },
}));

import {
  consumeQueueReportBudget,
  QUEUE_REPORT_ACCOUNT_LIMIT,
  QUEUE_REPORT_WINDOW_MS,
  QueueReportRateLimitError,
} from '@/lib/services/queue-report-rate-limit';

describe('queue-report per-account rate limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBudgetGet.mockResolvedValue({ data: () => undefined });
    mockRunTransaction.mockImplementation(async (
      update: (transaction: {
        get: typeof mockBudgetGet;
        set: typeof mockTransactionSet;
      }) => Promise<unknown>,
    ) => update({ get: mockBudgetGet, set: mockTransactionSet }));
  });

  it('accepts exactly three distinct reports in the 30-minute window', async () => {
    const now = 1_000_000;
    mockBudgetGet.mockResolvedValue({
      data: () => ({
        recentRequests: Array.from(
          { length: QUEUE_REPORT_ACCOUNT_LIMIT - 1 },
          (_, index) => ({ requestId: `prior-${index}`, acceptedAtMs: now - 1_000 }),
        ),
      }),
    });

    await expect(consumeQueueReportBudget('verified-user', 'third-report', now))
      .resolves.toBe('accepted');
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recentRequests: expect.arrayContaining([
          { requestId: 'third-report', acceptedAtMs: now },
        ]),
      }),
    );
  });

  it('rejects the fourth distinct report, limiting one account to 3 of latest 20', async () => {
    const now = 1_000_000;
    mockBudgetGet.mockResolvedValue({
      data: () => ({
        recentRequests: Array.from(
          { length: QUEUE_REPORT_ACCOUNT_LIMIT },
          (_, index) => ({ requestId: `prior-${index}`, acceptedAtMs: now - 1_000 }),
        ),
      }),
    });

    await expect(consumeQueueReportBudget('verified-user', 'fourth-report', now))
      .rejects.toBeInstanceOf(QueueReportRateLimitError);
    expect(mockTransactionSet).not.toHaveBeenCalled();
  });

  it('does not charge a replay and expires entries at the window boundary', async () => {
    const now = 1_000_000;
    mockBudgetGet.mockResolvedValueOnce({
      data: () => ({
        recentRequests: [
          { requestId: 'same-report', acceptedAtMs: now - 1_000 },
          { requestId: 'old-report', acceptedAtMs: now - QUEUE_REPORT_WINDOW_MS - 1 },
        ],
      }),
    });
    await expect(consumeQueueReportBudget('verified-user', 'same-report', now))
      .resolves.toBe('replay');
    expect(mockTransactionSet).not.toHaveBeenCalled();

    mockBudgetGet.mockResolvedValueOnce({
      data: () => ({
        recentRequests: [
          { requestId: 'old-report', acceptedAtMs: now - QUEUE_REPORT_WINDOW_MS - 1 },
        ],
      }),
    });
    await expect(consumeQueueReportBudget('verified-user', 'new-report', now))
      .resolves.toBe('accepted');
    expect(mockTransactionSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recentRequests: [{ requestId: 'new-report', acceptedAtMs: now }],
      }),
    );
  });
});
