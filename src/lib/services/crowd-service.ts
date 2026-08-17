import { createHash } from 'node:crypto';
import { adminDb } from '@/lib/firebase/admin';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { LATEST_WAIT_TIME_REPORT_LIMIT } from '@/lib/wait-time-contract';
import type { CrowdAggregate } from '@/types/ride-log';

const AGGREGATION_WINDOW_MS = 2 * 60 * 60 * 1000;
export const CONSENSUS_CONTRIBUTION_WINDOW_MS = 30 * 60 * 1000;
export const CONSENSUS_CONTRIBUTOR_LIMIT = LATEST_WAIT_TIME_REPORT_LIMIT;
export const CONSENSUS_CONTRIBUTOR_QUERY_LIMIT = CONSENSUS_CONTRIBUTOR_LIMIT + 1;

function aggregatesPath(parkId: string): string {
  return `crowdsourcedWaitTimes/${parkId}/aggregates`;
}

function contributorKey(uid: string, parkId: string, attractionId: string): string {
  return createHash('sha256')
    .update(`${uid}\0${parkId}\0${attractionId}`)
    .digest('hex');
}

function attractionKey(parkId: string, attractionId: string): string {
  return `${encodeURIComponent(parkId)}:${encodeURIComponent(attractionId)}`;
}

interface SubmitCrowdReportData {
  requestId: string;
  uid: string;
  attractionId: string;
  attractionName: string;
  waitTimeMinutes: number;
  reportedAt: Date;
  allowStaleReplay: boolean;
}

interface StoredContribution {
  requestId?: unknown;
  reportId?: unknown;
  waitTimeMinutes?: unknown;
  reportedAtMs?: unknown;
  windowStartedAtMs?: unknown;
}

interface CanonicalContribution {
  contributorId: string;
  requestId: string;
  reportId: string;
  waitTimeMinutes: number;
  reportedAtMs: number;
  windowStartedAtMs: number;
}

interface StoredRequest {
  uidHash?: unknown;
  parkId?: unknown;
  attractionId?: unknown;
  attractionName?: unknown;
  waitTimeMinutes?: unknown;
  reportedAtMs?: unknown;
}

interface StoredPublicReport {
  schemaVersion?: unknown;
  attractionId?: unknown;
  attractionName?: unknown;
  parkId?: unknown;
  waitTime?: unknown;
  reportedAt?: { toDate?: () => Date };
  status?: unknown;
}

export class CrowdReportConflictError extends Error {
  constructor() {
    super('Report request ID conflicts with another report');
    this.name = 'CrowdReportConflictError';
  }
}

export class CrowdReportStaleError extends Error {
  constructor() {
    super('Report timestamp is stale');
    this.name = 'CrowdReportStaleError';
  }
}

function asContribution(
  contributorId: string,
  data: StoredContribution | undefined,
): CanonicalContribution | null {
  if (
    typeof data?.requestId !== 'string'
    || typeof data.reportId !== 'string'
    || typeof data.waitTimeMinutes !== 'number'
    || typeof data.reportedAtMs !== 'number'
    || typeof data.windowStartedAtMs !== 'number'
  ) {
    return null;
  }
  return {
    contributorId,
    requestId: data.requestId,
    reportId: data.reportId,
    waitTimeMinutes: data.waitTimeMinutes,
    reportedAtMs: data.reportedAtMs,
    windowStartedAtMs: data.windowStartedAtMs,
  };
}

function newestConsensusContributions(
  contributions: CanonicalContribution[],
): CanonicalContribution[] {
  return contributions
    .sort((left, right) => (
      right.reportedAtMs - left.reportedAtMs
      || (left.contributorId === right.contributorId
        ? 0
        : left.contributorId < right.contributorId ? 1 : -1)
    ))
    .slice(0, CONSENSUS_CONTRIBUTOR_LIMIT);
}

function requestMatches(
  existing: StoredRequest | undefined,
  expected: {
    uidHash: string;
    parkId: string;
    attractionId: string;
    attractionName: string;
    waitTimeMinutes: number;
    reportedAtMs: number;
  },
): boolean {
  return existing?.uidHash === expected.uidHash
    && existing.parkId === expected.parkId
    && existing.attractionId === expected.attractionId
    && existing.attractionName === expected.attractionName
    && existing.waitTimeMinutes === expected.waitTimeMinutes
    && existing.reportedAtMs === expected.reportedAtMs;
}

function publicReportMatches(
  existing: StoredPublicReport | undefined,
  expected: {
    parkId: string;
    attractionId: string;
    attractionName: string;
    waitTimeMinutes: number;
    reportedAtMs: number;
  },
): boolean {
  return existing?.schemaVersion === 1
    && existing.attractionId === expected.attractionId
    && existing.attractionName === expected.attractionName
    && existing.parkId === expected.parkId
    && existing.waitTime === expected.waitTimeMinutes
    && existing.reportedAt?.toDate?.().getTime() === expected.reportedAtMs
    && existing.status === 'pending';
}

function computeSimpleAverage(contributions: CanonicalContribution[]): number | null {
  if (contributions.length === 0) return null;
  const operating = contributions.filter((report) => report.waitTimeMinutes >= 0);
  if (operating.length === 0) return -1;
  return Math.round(
    operating.reduce((sum, report) => sum + report.waitTimeMinutes, 0) / operating.length,
  );
}

function getConfidence(reportCount: number): 'low' | 'medium' | 'high' | 'none' {
  if (reportCount === 0) return 'none';
  if (reportCount >= 6) return 'high';
  if (reportCount >= 3) return 'medium';
  return 'low';
}

/** Get the pre-computed aggregate for a single attraction. */
export async function getCrowdAggregate(
  parkId: string,
  attractionId: string,
): Promise<CrowdAggregate | null> {
  const document = await adminDb.doc(`${aggregatesPath(parkId)}/${attractionId}`).get();
  if (!document.exists) return null;
  return { ...(document.data() as CrowdAggregate), attractionId: document.id };
}

/** Get all crowd aggregates for a park. */
export async function getCrowdAggregatesForPark(
  parkId: string,
): Promise<CrowdAggregate[]> {
  const snapshot = await adminDb.collection(aggregatesPath(parkId)).get();
  return snapshot.docs.map((document) => ({
    ...(document.data() as CrowdAggregate),
    attractionId: document.id,
  }));
}

/**
 * Atomically records an anonymous public report, replaces the caller's active
 * contribution when it is a correction, and refreshes the canonical aggregate.
 */
export async function submitCrowdReport(
  parkId: string,
  data: SubmitCrowdReportData,
): Promise<'accepted' | 'replay' | 'ignored-older-correction'> {
  const reportedAtMs = data.reportedAt.getTime();
  const uidHash = createHash('sha256').update(data.uid).digest('hex');
  const privateContributorId = contributorKey(data.uid, parkId, data.attractionId);
  const requestRef = adminDb.doc(`queueReportRequests/${data.requestId}`);
  const contributionRef = adminDb.doc(`queueReportContributions/${privateContributorId}`);
  const publicReportRef = adminDb.doc(`waitTimeReports/${data.requestId}`);
  const aggregateRef = adminDb.doc(`${aggregatesPath(parkId)}/${data.attractionId}`);
  const recentCutoffMs = reportedAtMs - AGGREGATION_WINDOW_MS;
  const recentContributionsQuery = adminDb
    .collection('queueReportContributions')
    .where('attractionKey', '==', attractionKey(parkId, data.attractionId))
    .where('reportedAtMs', '>=', recentCutoffMs)
    .orderBy('reportedAtMs', 'desc')
    .orderBy(FieldPath.documentId(), 'desc')
    .limit(CONSENSUS_CONTRIBUTOR_QUERY_LIMIT);

  return adminDb.runTransaction(async (transaction) => {
    const [
      requestSnapshot,
      contributionSnapshot,
      publicReportSnapshot,
      aggregateSnapshot,
      recentSnapshot,
    ] =
      await Promise.all([
        transaction.get(requestRef),
        transaction.get(contributionRef),
        transaction.get(publicReportRef),
        transaction.get(aggregateRef),
        transaction.get(recentContributionsQuery),
      ]);

    const requestIdentity = {
      uidHash,
      parkId,
      attractionId: data.attractionId,
      attractionName: data.attractionName,
      waitTimeMinutes: data.waitTimeMinutes,
      reportedAtMs,
    };
    if (requestSnapshot.exists) {
      if (!requestMatches(requestSnapshot.data() as StoredRequest, requestIdentity)) {
        throw new CrowdReportConflictError();
      }
      return 'replay';
    }
    const adoptingExistingPublicReport = publicReportSnapshot.exists;
    if (
      adoptingExistingPublicReport
      && !publicReportMatches(publicReportSnapshot.data() as StoredPublicReport, requestIdentity)
    ) {
      throw new CrowdReportConflictError();
    }
    if (data.allowStaleReplay && !adoptingExistingPublicReport) {
      throw new CrowdReportStaleError();
    }

    const current = asContribution(
      contributionSnapshot.id,
      contributionSnapshot.data() as StoredContribution | undefined,
    );
    const sameWindow = current !== null
      && reportedAtMs < current.windowStartedAtMs + CONSENSUS_CONTRIBUTION_WINDOW_MS;
    const isOlderCorrection = sameWindow && reportedAtMs < current.reportedAtMs;
    const nextContribution: CanonicalContribution = {
      contributorId: privateContributorId,
      requestId: data.requestId,
      reportId: data.requestId,
      waitTimeMinutes: data.waitTimeMinutes,
      reportedAtMs,
      windowStartedAtMs: sameWindow && current
        ? current.windowStartedAtMs
        : reportedAtMs,
    };

    transaction.set(requestRef, {
      schemaVersion: 1,
      ...requestIdentity,
      outcome: isOlderCorrection ? 'ignored-older-correction' : 'accepted',
      createdAt: FieldValue.serverTimestamp(),
    });
    if (isOlderCorrection) {
      if (adoptingExistingPublicReport) transaction.delete(publicReportRef);
      return 'ignored-older-correction';
    }

    const contributions = recentSnapshot.docs
      .map((document) => asContribution(
        document.id,
        document.data() as StoredContribution,
      ))
      .filter((contribution): contribution is CanonicalContribution => contribution !== null)
      .filter((contribution) => contribution.reportedAtMs >= recentCutoffMs)
      .filter((contribution) => contribution.contributorId !== privateContributorId);
    contributions.push(nextContribution);
    const consensusContributions = newestConsensusContributions(contributions);

    const newestReportedAtMs = Math.max(
      ...consensusContributions.map((contribution) => contribution.reportedAtMs),
      typeof aggregateSnapshot.data()?.lastReportedAtMs === 'number'
        ? aggregateSnapshot.data()!.lastReportedAtMs
        : Number.NEGATIVE_INFINITY,
    );

    if (sameWindow && current?.reportId && current.reportId !== data.requestId) {
      transaction.delete(adminDb.doc(`waitTimeReports/${current.reportId}`));
    }
    if (!adoptingExistingPublicReport) {
      transaction.create(publicReportRef, {
        schemaVersion: 1,
        attractionId: data.attractionId,
        attractionName: data.attractionName,
        parkId,
        waitTime: data.waitTimeMinutes,
        reportedAt: Timestamp.fromDate(data.reportedAt),
        status: 'pending',
      });
    }
    transaction.set(contributionRef, {
      schemaVersion: 1,
      attractionKey: attractionKey(parkId, data.attractionId),
      parkId,
      attractionId: data.attractionId,
      requestId: nextContribution.requestId,
      reportId: nextContribution.reportId,
      waitTimeMinutes: nextContribution.waitTimeMinutes,
      reportedAtMs: nextContribution.reportedAtMs,
      windowStartedAtMs: nextContribution.windowStartedAtMs,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(aggregateRef, {
      attractionId: data.attractionId,
      parkId,
      currentEstimateMinutes: computeSimpleAverage(consensusContributions),
      reportCount: consensusContributions.length,
      lastReportedAt: Timestamp.fromDate(new Date(newestReportedAtMs)),
      lastReportedAtMs: newestReportedAtMs,
      confidence: getConfidence(consensusContributions.length),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return 'accepted';
  });
}
