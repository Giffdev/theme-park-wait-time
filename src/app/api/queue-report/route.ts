import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { adminApp, adminDb } from '@/lib/firebase/admin';
import {
  CrowdReportConflictError,
  CrowdReportStaleError,
  submitCrowdReport,
} from '@/lib/services/crowd-service';
import {
  consumeQueueReportBudget,
  QueueReportRateLimitError,
} from '@/lib/services/queue-report-rate-limit';
import {
  isValidReportedWaitTime,
  LATEST_WAIT_TIME_REPORT_LIMIT,
  WAIT_TIME_RANGE_MESSAGE,
} from '@/lib/wait-time-contract';
import type { QueueReportRequest } from '@/types/ride-log';

// ---------------------------------------------------------------------------
// POST /api/queue-report
// Receives timer completion data, validates, anonymizes, writes crowd report.
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 4_096;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const LOGGABLE_ENTITY_TYPES = new Set(['ATTRACTION', 'RIDE', 'SHOW', 'MEET_AND_GREET']);

type AnonymousQueueReportRequest = QueueReportRequest & {
  requestId?: string;
  attractionName?: string;
  reportedAtMs?: number;
};

const PUBLIC_REPORT_KEYS = [
  'schemaVersion',
  'attractionId',
  'attractionName',
  'parkId',
  'waitTime',
  'reportedAt',
  'status',
] as const;

function isExactPublicReport(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data).sort();
  if (
    keys.length !== PUBLIC_REPORT_KEYS.length
    || keys.some((key, index) => key !== [...PUBLIC_REPORT_KEYS].sort()[index])
  ) {
    return false;
  }
  return data.schemaVersion === 1
    && typeof data.attractionId === 'string'
    && typeof data.attractionName === 'string'
    && typeof data.parkId === 'string'
    && isValidReportedWaitTime(data.waitTime)
    && typeof (data.reportedAt as { toDate?: unknown })?.toDate === 'function'
    && ['pending', 'verified', 'disputed'].includes(String(data.status));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const attractionId = request.nextUrl.searchParams.get('attractionId')?.trim() ?? '';
  const requestedLimit = Number(
    request.nextUrl.searchParams.get('limit') ?? LATEST_WAIT_TIME_REPORT_LIMIT,
  );
  if (
    !attractionId
    || attractionId.length > 128
    || !Number.isInteger(requestedLimit)
    || requestedLimit < 1
    || requestedLimit > LATEST_WAIT_TIME_REPORT_LIMIT
  ) {
    return NextResponse.json({ error: 'Invalid report query' }, { status: 400 });
  }

  try {
    const snapshot = await adminDb
      .collection('waitTimeReports')
      .where('attractionId', '==', attractionId)
      .orderBy('reportedAt', 'desc')
      .limit(100)
      .get();
    const reports = snapshot.docs
      .map((document) => ({ id: document.id, data: document.data() as Record<string, unknown> }))
      .filter(({ data }) => isExactPublicReport(data))
      .slice(0, requestedLimit)
      .map(({ id, data }) => ({
        id,
        schemaVersion: 1,
        attractionId: data.attractionId,
        attractionName: data.attractionName,
        parkId: data.parkId,
        waitTime: data.waitTime,
        reportedAt: (data.reportedAt as { toDate: () => Date }).toDate().toISOString(),
        status: data.status,
      }));
    return NextResponse.json({ reports });
  } catch (error) {
    console.error('[queue-report] Public report query failed:', error);
    return NextResponse.json({ error: 'Could not load wait-time reports' }, { status: 503 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Verify Firebase ID token from Authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header' },
      { status: 401 },
    );
  }

  const idToken = authHeader.slice(7);
  let verifiedUid: string;
  try {
    const decodedToken = await getAuth(adminApp).verifyIdToken(idToken);
    if (!decodedToken.uid) throw new Error('Verified UID missing');
    verifiedUid = decodedToken.uid;
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 },
    );
  }

  // 2. Parse and validate request body
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body is too large' }, { status: 413 });
  }

  let rawBody = '';
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('Missing body');
    const decoder = new TextDecoder();
    let bytesRead = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_BODY_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: 'Request body is too large' }, { status: 413 });
      }
      rawBody += decoder.decode(value, { stream: true });
    }
    rawBody += decoder.decode();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  let body: AnonymousQueueReportRequest;
  try {
    body = JSON.parse(rawBody) as AnonymousQueueReportRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    parkId,
    attractionId,
    attractionName,
    waitTimeMinutes,
    reportedAtMs,
  } = body;
  const requestId = body.requestId ?? `queue-${crypto.randomUUID()}`;

  if (!parkId || !attractionId || waitTimeMinutes == null) {
    return NextResponse.json(
      { error: 'Missing required fields: parkId, attractionId, waitTimeMinutes' },
      { status: 400 },
    );
  }
  if (
    !REQUEST_ID_PATTERN.test(requestId)
    || parkId.length > 128
    || attractionId.length > 128
    || (attractionName != null && (!attractionName.trim() || attractionName.length > 200))
  ) {
    return NextResponse.json({ error: 'Invalid report identity or attraction fields' }, { status: 400 });
  }

  if (!isValidReportedWaitTime(waitTimeMinutes)) {
    return NextResponse.json({ error: WAIT_TIME_RANGE_MESSAGE }, { status: 400 });
  }

  const reportDate = reportedAtMs == null ? new Date() : new Date(reportedAtMs);
  if (Number.isNaN(reportDate.getTime())) {
    return NextResponse.json({ error: 'Report timestamp is invalid' }, { status: 400 });
  }
  const reportTimestampIsStale = Math.abs(Date.now() - reportDate.getTime()) > 5 * 60 * 1000;

  // 4. Resolve the canonical attraction server-side.
  let attractionSnapshot;
  try {
    attractionSnapshot = await adminDb.doc(`attractions/${attractionId}`).get();
  } catch (error) {
    console.error('[queue-report] Canonical attraction lookup failed:', error);
    return NextResponse.json({ error: 'Could not validate attraction' }, { status: 503 });
  }
  if (!attractionSnapshot.exists) {
    return NextResponse.json({ error: 'Attraction not found' }, { status: 400 });
  }
  const canonicalAttraction = attractionSnapshot.data() as {
    name?: string;
    parkId?: string;
    entityType?: string;
  };
  if (
    canonicalAttraction.parkId !== parkId
    || !canonicalAttraction.name
    || (attractionName != null && canonicalAttraction.name !== attractionName)
    || !LOGGABLE_ENTITY_TYPES.has(canonicalAttraction.entityType ?? '')
  ) {
    return NextResponse.json({ error: 'Attraction does not belong to the selected park' }, { status: 400 });
  }

  try {
    await consumeQueueReportBudget(verifiedUid, requestId);
  } catch (error) {
    if (error instanceof QueueReportRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error('[queue-report] Account rate-limit check failed:', error);
    return NextResponse.json(
      { error: 'Wait-time reporting is temporarily unavailable' },
      { status: 503 },
    );
  }

  // 5. Atomically write the anonymous report, private contributor state, and
  // canonical aggregate. Stable replays are reconciled inside the transaction.
  try {
    await submitCrowdReport(parkId, {
      requestId,
      uid: verifiedUid,
      attractionId,
      attractionName: canonicalAttraction.name,
      waitTimeMinutes,
      reportedAt: reportDate,
      allowStaleReplay: reportTimestampIsStale,
    });
  } catch (error) {
    if (error instanceof CrowdReportConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof CrowdReportStaleError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[queue-report] Failed to submit crowd report:', error);
    return NextResponse.json(
      { error: 'Failed to submit report' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
