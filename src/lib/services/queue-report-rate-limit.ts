import { createHash } from 'node:crypto';
import { adminDb } from '@/lib/firebase/admin';

export const QUEUE_REPORT_ACCOUNT_LIMIT = 3;
export const QUEUE_REPORT_WINDOW_MS = 30 * 60 * 1000;

interface RecentRequest {
  requestId: string;
  acceptedAtMs: number;
}

export class QueueReportRateLimitError extends Error {
  constructor() {
    super('Too many wait-time reports. Please try again later.');
    this.name = 'QueueReportRateLimitError';
  }
}

function accountBudgetKey(uid: string): string {
  return createHash('sha256').update(uid).digest('hex');
}

function validRecentRequests(value: unknown): RecentRequest[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is RecentRequest => (
    Boolean(entry)
    && typeof entry === 'object'
    && typeof (entry as RecentRequest).requestId === 'string'
    && typeof (entry as RecentRequest).acceptedAtMs === 'number'
  ));
}

export async function consumeQueueReportBudget(
  uid: string,
  requestId: string,
  nowMs = Date.now(),
): Promise<'accepted' | 'replay'> {
  if (!uid) throw new Error('Verified account identity is unavailable.');
  if (typeof adminDb.runTransaction !== 'function') {
    throw new Error('Queue-report rate-limit storage is unavailable.');
  }

  const budgetRef = adminDb.doc(`queueReportRateLimits/${accountBudgetKey(uid)}`);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(budgetRef);
    const cutoff = nowMs - QUEUE_REPORT_WINDOW_MS;
    const recentRequests = validRecentRequests(snapshot.data()?.recentRequests)
      .filter((entry) => entry.acceptedAtMs >= cutoff);

    if (recentRequests.some((entry) => entry.requestId === requestId)) {
      return 'replay';
    }
    if (recentRequests.length >= QUEUE_REPORT_ACCOUNT_LIMIT) {
      throw new QueueReportRateLimitError();
    }

    transaction.set(budgetRef, {
      schemaVersion: 1,
      recentRequests: [
        ...recentRequests,
        { requestId, acceptedAtMs: nowMs },
      ],
      updatedAtMs: nowMs,
    });
    return 'accepted';
  });
}
