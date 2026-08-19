export const maxDuration = 20;
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  createRequestDeadline,
  readBoundedJson,
  RequestError,
} from '@/lib/server/authenticated-json';
import {
  claimTripStatsRefreshSlot,
  refreshTripStats,
  SaveCommandConfigurationError,
  SaveCommandConflictError,
  TripStatsRateLimitError,
} from '@/lib/services/save-command-service';
import { isFirestorePathSegment } from '@/lib/server/firestore-path';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const deadlineAt = createRequestDeadline();
  try {
    const uid = await authenticateRequest(request, deadlineAt);
    const body = await readBoundedJson<{ tripId?: unknown }>(request, 1_024, deadlineAt);
    if (typeof body.tripId !== 'string' || !isFirestorePathSegment(body.tripId)) {
      return NextResponse.json({ error: 'Invalid trip ID' }, { status: 400 });
    }
    const dependencies = { deadlineAt };
    await claimTripStatsRefreshSlot(uid, body.tripId, dependencies);
    const refreshed = await refreshTripStats(uid, body.tripId, dependencies);
    return NextResponse.json(
      refreshed ? { updated: true, ...refreshed } : { updated: false },
      { status: refreshed ? 200 : 202, headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SaveCommandConfigurationError) {
      return NextResponse.json(
        { error: 'Trip summary refresh is not configured', retryable: false },
        { status: 412 },
      );
    }
    if (error instanceof TripStatsRateLimitError) {
      return NextResponse.json(
        { error: 'Trip summary refresh rate limit exceeded', retryable: true },
        {
          status: 429,
          headers: {
            'Cache-Control': 'private, no-store',
            'Retry-After': String(error.retryAfterSeconds),
          },
        },
      );
    }
    if (error instanceof SaveCommandConflictError) {
      return NextResponse.json({ error: 'Trip summary state is inconsistent' }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'Trip summary refresh is temporarily unavailable', retryable: true },
      { status: 503 },
    );
  }
}
