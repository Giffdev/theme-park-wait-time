import { createHash } from 'node:crypto';
import { adminDb } from '@/lib/firebase/admin';

export const QUEUE_REPORT_ACCOUNT_LIMIT = 3;
export const QUEUE_REPORT_WINDOW_MS = 30 * 60 * 1000;

interface RecentRequest {
  requestId: string;
  acceptedAtMs: number;
}

export interface QueueReportBudgetDecision {
  result: 'accepted' | 'replay';
  recentRequests: RecentRequest[];
}

export class QueueReportRateLimitError extends Error {
  constructor() {
    super('Too many wait-time reports. Please try again later.');
    this.name = 'QueueReportRateLimitError';
  }
}

export function queueReportBudgetPath(uid: string): string {
  if (!uid) throw new Error('Verified account identity is unavailable.');
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

export function evaluateQueueReportBudget(
  value: unknown,
  requestId: string,
  nowMs = Date.now(),
): QueueReportBudgetDecision {
  const cutoff = nowMs - QUEUE_REPORT_WINDOW_MS;
  const recentRequests = validRecentRequests(
    (value as { recentRequests?: unknown } | undefined)?.recentRequests,
  ).filter((entry) => entry.acceptedAtMs >= cutoff);

  if (recentRequests.some((entry) => entry.requestId === requestId)) {
    return { result: 'replay', recentRequests };
  }
  if (recentRequests.length >= QUEUE_REPORT_ACCOUNT_LIMIT) {
    throw new QueueReportRateLimitError();
  }
  return {
    result: 'accepted',
    recentRequests: [
      ...recentRequests,
      { requestId, acceptedAtMs: nowMs },
    ],
  };
}

export async function consumeQueueReportBudget(
  uid: string,
  requestId: string,
  nowMs = Date.now(),
): Promise<'accepted' | 'replay'> {
  if (typeof adminDb.runTransaction !== 'function') {
    throw new Error('Queue-report rate-limit storage is unavailable.');
  }

  const budgetRef = adminDb.doc(`queueReportRateLimits/${queueReportBudgetPath(uid)}`);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(budgetRef);
    const decision = evaluateQueueReportBudget(snapshot.data(), requestId, nowMs);
    if (decision.result === 'replay') return 'replay';

    transaction.set(budgetRef, {
      schemaVersion: 1,
      recentRequests: decision.recentRequests,
      updatedAtMs: nowMs,
    });
    return 'accepted';
  });
}
