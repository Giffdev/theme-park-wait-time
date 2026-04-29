import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { CrowdAggregate, CrowdReport } from '@/types/ride-log';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function reportsPath(parkId: string): string {
  return `crowdsourcedWaitTimes/${parkId}/reports`;
}

function aggregatesPath(parkId: string): string {
  return `crowdsourcedWaitTimes/${parkId}/aggregates`;
}

// ---------------------------------------------------------------------------
// Read Operations (client-safe — but we use Admin SDK here for consistency)
// ---------------------------------------------------------------------------

/** Get the pre-computed aggregate for a single attraction. */
export async function getCrowdAggregate(
  parkId: string,
  attractionId: string,
): Promise<CrowdAggregate | null> {
  const doc = await adminDb.doc(`${aggregatesPath(parkId)}/${attractionId}`).get();
  if (!doc.exists) return null;
  return { ...(doc.data() as CrowdAggregate), attractionId: doc.id };
}

/** Get all crowd aggregates for a park. */
export async function getCrowdAggregatesForPark(
  parkId: string,
): Promise<CrowdAggregate[]> {
  const snap = await adminDb.collection(aggregatesPath(parkId)).get();
  return snap.docs.map((d) => ({ ...(d.data() as CrowdAggregate), attractionId: d.id }));
}

// ---------------------------------------------------------------------------
// Write Operations (server-side only — Admin SDK)
// ---------------------------------------------------------------------------

interface SubmitCrowdReportData {
  attractionId: string;
  waitTimeMinutes: number;
}

/**
 * Submit an anonymized crowd report and re-aggregate.
 * Called from the /api/queue-report route after stripping userId.
 */
export async function submitCrowdReport(
  parkId: string,
  data: SubmitCrowdReportData,
): Promise<void> {
  const now = new Date();

  // 1. Write the anonymized report
  const reportData = {
    attractionId: data.attractionId,
    waitTimeMinutes: data.waitTimeMinutes,
    reportedAt: Timestamp.fromDate(now),
    dayOfWeek: now.getDay(),
    hourOfDay: now.getHours(),
    createdAt: FieldValue.serverTimestamp(),
  };

  await adminDb.collection(reportsPath(parkId)).add(reportData);

  // 2. Re-aggregate: query reports from last 2 hours for this attraction
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const recentSnap = await adminDb
    .collection(reportsPath(parkId))
    .where('attractionId', '==', data.attractionId)
    .where('reportedAt', '>=', Timestamp.fromDate(twoHoursAgo))
    .orderBy('reportedAt', 'desc')
    .get();

  const reports = recentSnap.docs.map((d) => d.data() as CrowdReport);

  // 3. Compute aggregate (simple average as placeholder)
  // TODO: Import Chunk's weighted-average algorithm from @/lib/aggregation when available
  const estimate = computeSimpleAverage(reports);
  const reportCount = reports.length;
  const confidence = getConfidence(reportCount);

  // 4. Write/update aggregate doc
  const aggregateData = {
    attractionId: data.attractionId,
    parkId,
    currentEstimateMinutes: estimate,
    reportCount,
    lastReportedAt: Timestamp.fromDate(now),
    confidence,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await adminDb
    .doc(`${aggregatesPath(parkId)}/${data.attractionId}`)
    .set(aggregateData, { merge: true });
}

// ---------------------------------------------------------------------------
// Aggregation Helpers (placeholder — will be replaced by Chunk's module)
// ---------------------------------------------------------------------------

function computeSimpleAverage(reports: CrowdReport[]): number | null {
  if (reports.length === 0) return null;
  const sum = reports.reduce((acc, r) => acc + r.waitTimeMinutes, 0);
  return Math.round(sum / reports.length);
}

function getConfidence(reportCount: number): 'low' | 'medium' | 'high' | 'none' {
  if (reportCount === 0) return 'none';
  if (reportCount >= 6) return 'high';
  if (reportCount >= 3) return 'medium';
  return 'low';
}
