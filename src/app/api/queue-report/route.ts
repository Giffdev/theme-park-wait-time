import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { adminApp } from '@/lib/firebase/admin';
import { submitCrowdReport } from '@/lib/services/crowd-service';
import type { QueueReportRequest } from '@/types/ride-log';

// ---------------------------------------------------------------------------
// POST /api/queue-report
// Receives timer completion data, validates, anonymizes, writes crowd report.
// ---------------------------------------------------------------------------

const MIN_WAIT_MINUTES = 2;
const MAX_WAIT_MINUTES = 180;

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
  try {
    await getAuth(adminApp).verifyIdToken(idToken);
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 },
    );
  }

  // 2. Parse and validate request body
  let body: QueueReportRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const { parkId, attractionId, waitTimeMinutes } = body;

  if (!parkId || !attractionId || waitTimeMinutes == null) {
    return NextResponse.json(
      { error: 'Missing required fields: parkId, attractionId, waitTimeMinutes' },
      { status: 400 },
    );
  }

  if (typeof waitTimeMinutes !== 'number' || !Number.isFinite(waitTimeMinutes)) {
    return NextResponse.json(
      { error: 'waitTimeMinutes must be a finite number' },
      { status: 400 },
    );
  }

  // 3. Validate data bounds
  if (waitTimeMinutes < MIN_WAIT_MINUTES || waitTimeMinutes > MAX_WAIT_MINUTES) {
    return NextResponse.json(
      { error: `waitTimeMinutes must be between ${MIN_WAIT_MINUTES} and ${MAX_WAIT_MINUTES}` },
      { status: 400 },
    );
  }

  // 4. Submit anonymized report (userId is NOT passed — privacy by design)
  try {
    await submitCrowdReport(parkId, {
      attractionId,
      waitTimeMinutes: Math.round(waitTimeMinutes),
    });
  } catch (err) {
    console.error('[queue-report] Failed to submit crowd report:', err);
    return NextResponse.json(
      { error: 'Failed to submit report' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
