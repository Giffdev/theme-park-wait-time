import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { authenticateRequest, readBoundedJson, RequestError } from '@/lib/server/authenticated-json';
import {
  getTripCommandStatus,
  SaveCommandConflictError,
  SaveCommandAmbiguousError,
  saveTripCommand,
  TripSaveCommand,
} from '@/lib/services/save-command-service';
import { InvalidFirestorePathSegmentError } from '@/lib/server/firestore-path';
import { adminInitializationMs } from '@/lib/firebase/admin';

const MAX_BODY_BYTES = 8_192;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const MIN_SUPPORTED_DATE = '2000-01-01';
const MAX_SUPPORTED_DATE = '2100-12-31';
const TRIP_KEYS = new Set([
  'requestId', 'name', 'startDate', 'endDate', 'parkIds', 'parkNames',
  'status', 'shareId', 'notes',
]);

function requestHash(requestId: string | null): string {
  return requestId && ID_PATTERN.test(requestId)
    ? createHash('sha256').update(requestId).digest('hex').slice(0, 12)
    : 'unavailable';
}

function logResult(
  operation: 'create' | 'status',
  result: string,
  requestId: string | null,
  startedAt: number,
  timings: Record<string, number>,
  error?: unknown,
): void {
  const errorCode = error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : error instanceof Error ? error.name : undefined;
  console.info('[trip-commands]', JSON.stringify({
    operation,
    result,
    requestHash: requestHash(requestId),
    adminInitializationMs,
    ...timings,
    totalMs: Math.round(performance.now() - startedAt),
    errorCode,
  }));
}

function isRealSupportedDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)
      || value < MIN_SUPPORTED_DATE || value > MAX_SUPPORTED_DATE) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function validate(command: TripSaveCommand): string | null {
  if (Object.keys(command).some((key) => !TRIP_KEYS.has(key))) return 'Unknown trip creation field';
  if (!ID_PATTERN.test(command.requestId ?? '')) return 'Invalid trip creation request ID';
  if (typeof command.name !== 'string' || !command.name.trim() || command.name.length > 200) {
    return 'Invalid trip name';
  }
  if (!isRealSupportedDate(command.startDate) || !isRealSupportedDate(command.endDate)
      || command.endDate < command.startDate) return 'Invalid trip dates';
  if (!['planning', 'active', 'completed'].includes(command.status)) return 'Invalid trip status';
  if (typeof command.notes !== 'string' || command.notes.length > 2000) return 'Notes are too long';
  if (!Array.isArray(command.parkIds) || command.parkIds.length > 32
      || command.parkIds.some((id) => typeof id !== 'string' || !id || id.length > 128)) {
    return 'Invalid park list';
  }
  if (!command.parkNames || typeof command.parkNames !== 'object'
      || Array.isArray(command.parkNames)
      || Object.keys(command.parkNames).length > 32
      || Object.entries(command.parkNames).some(([id, name]) => (
        id.length > 128 || typeof name !== 'string' || name.length > 200
      ))) return 'Invalid park names';
  if (command.shareId !== null
      && (typeof command.shareId !== 'string' || !ID_PATTERN.test(command.shareId))) {
    return 'Invalid share ID';
  }
  return null;
}

function statusResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const startedAt = performance.now();
  const timings: Record<string, number> = {};
  let requestId: string | null = null;
  try {
    const authStartedAt = performance.now();
    const uid = await authenticateRequest(request);
    timings.authMs = Math.round(performance.now() - authStartedAt);
    const bodyStartedAt = performance.now();
    const command = await readBoundedJson<TripSaveCommand>(request, MAX_BODY_BYTES);
    timings.bodyMs = Math.round(performance.now() - bodyStartedAt);
    requestId = command.requestId ?? null;
    const validationError = validate(command);
    if (validationError) {
      logResult('create', 'invalid', requestId, startedAt, timings);
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    const writeStartedAt = performance.now();
    const result = await saveTripCommand(uid, command);
    timings.writeMs = Math.round(performance.now() - writeStartedAt);
    logResult('create', result, requestId, startedAt, timings);
    return NextResponse.json({ id: command.requestId, result });
  } catch (error) {
    if (error instanceof RequestError) {
      logResult('create', `request-error-${error.status}`, requestId, startedAt, timings, error);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SaveCommandConflictError) {
      logResult('create', 'conflict', requestId, startedAt, timings, error);
      return NextResponse.json(
        {
          error: 'This trip request has conflicting server state. Retry the same request ID or contact support; do not start a new trip request.',
          outcome: 'ambiguous',
          retryable: true,
        },
        { status: 409 },
      );
    }
    if (error instanceof SaveCommandAmbiguousError) {
      logResult('create', 'ambiguous', requestId, startedAt, timings, error.cause);
      return NextResponse.json(
        { error: error.message, outcome: 'ambiguous', retryable: true },
        { status: 503 },
      );
    }
    if (error instanceof InvalidFirestorePathSegmentError) {
      logResult('create', 'invalid-path', requestId, startedAt, timings, error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    logResult('create', 'failed', requestId, startedAt, timings, error);
    return NextResponse.json({ error: 'Trip creation is temporarily unavailable' }, { status: 503 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = performance.now();
  const timings: Record<string, number> = {};
  const requestId = request.nextUrl.searchParams.get('requestId');
  const expectedFingerprint = request.nextUrl.searchParams.get('fingerprint');
  try {
    if (!requestId || !ID_PATTERN.test(requestId)
        || !expectedFingerprint || !FINGERPRINT_PATTERN.test(expectedFingerprint)) {
      logResult('status', 'invalid', requestId, startedAt, timings);
      return statusResponse({ error: 'Invalid trip creation status request' }, 400);
    }
    const authStartedAt = performance.now();
    const uid = await authenticateRequest(request);
    timings.authMs = Math.round(performance.now() - authStartedAt);
    const readStartedAt = performance.now();
    const status = await getTripCommandStatus(uid, requestId, expectedFingerprint);
    timings.readMs = Math.round(performance.now() - readStartedAt);
    logResult('status', status, requestId, startedAt, timings);
    return statusResponse({ status, id: status === 'committed' ? requestId : undefined });
  } catch (error) {
    if (error instanceof RequestError) {
      logResult('status', `request-error-${error.status}`, requestId, startedAt, timings, error);
      return statusResponse({ error: error.message }, error.status);
    }
    if (error instanceof InvalidFirestorePathSegmentError) {
      logResult('status', 'invalid-path', requestId, startedAt, timings, error);
      return statusResponse({ error: error.message }, 400);
    }
    logResult('status', 'pending', requestId, startedAt, timings, error);
    return statusResponse(
      { status: 'pending', retryable: true },
      503,
    );
  }
}
