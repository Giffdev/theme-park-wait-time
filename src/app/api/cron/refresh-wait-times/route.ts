import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import {
  getConfiguredParkIds,
  refreshParksBounded,
} from '@/lib/wait-times/refresh';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CONCURRENCY = 6;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

function matchesSecret(authorization: string | null, secret: string): boolean {
  if (!authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function authorizeCron(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';

  if (!secret) {
    if (isProduction) {
      return NextResponse.json(
        { error: 'Cron secret is not configured' },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    // Local development and tests may invoke the route without a secret.
    return null;
  }

  if (!matchesSecret(request.headers.get('authorization'), secret)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  return null;
}

export async function GET(request: NextRequest) {
  const authFailure = authorizeCron(request);
  if (authFailure) return authFailure;

  const startedAt = new Date().toISOString();
  try {
    const configured = await getConfiguredParkIds();
    const results = await refreshParksBounded(configured.supported, CONCURRENCY, {
      awaitMaintenance: true,
    });
    const refreshed = results.filter((result) => result.status === 'fresh').length;
    const stale = results.filter((result) => result.status === 'stale').length;
    const failed = results.filter((result) => result.status === 'failed').length;

    return NextResponse.json(
      {
        ok: failed === 0,
        startedAt,
        completedAt: new Date().toISOString(),
        total: results.length,
        refreshed,
        stale,
        failed,
        results,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('Wait-time cron failed:', error);
    return NextResponse.json(
      {
        error: 'Wait-time cron failed',
        startedAt,
        completedAt: new Date().toISOString(),
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
