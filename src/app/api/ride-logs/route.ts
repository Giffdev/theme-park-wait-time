export const maxDuration = 20;
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, readBoundedJson, RequestError } from '@/lib/server/authenticated-json';
import {
  RideSaveCommand,
  SaveCommandAmbiguousError,
  SaveCommandConflictError,
  saveRideCommand,
} from '@/lib/services/save-command-service';
import { isValidRideWaitTime, RIDE_WAIT_TIME_RANGE_MESSAGE } from '@/lib/wait-time-contract';
import {
  InvalidFirestorePathSegmentError,
  isFirestorePathSegment,
} from '@/lib/server/firestore-path';

const MAX_BODY_BYTES = 8_192;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const CANONICAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MIN_RIDE_TIME = Date.parse('2000-01-01T00:00:00.000Z');
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function validString(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === 'string'
    && value.length <= maximum
    && (allowEmpty || value.trim().length > 0);
}

const RIDE_KEYS = new Set([
  'requestId', 'parkId', 'attractionId', 'parkName', 'attractionName', 'rodeAt',
  'waitTimeMinutes', 'attractionClosed', 'source', 'rating', 'notes', 'tripId',
]);

function validate(command: RideSaveCommand): string | null {
  if (Object.keys(command).some((key) => !RIDE_KEYS.has(key))) return 'Unknown ride save field';
  if (!ID_PATTERN.test(command.requestId ?? '')) return 'Invalid ride save request ID';
  if (!validString(command.parkId, 128) || !validString(command.attractionId, 128)) {
    return 'Invalid park or attraction ID';
  }
  if (!validString(command.parkName, 200, true) || !validString(command.attractionName, 200)) {
    return 'Invalid park or attraction name';
  }
  if (!validString(command.notes, 2000, true)) return 'Notes are too long';
  if (command.tripId !== undefined && command.tripId !== null
      && !isFirestorePathSegment(command.tripId)) return 'Invalid trip ID';
  if (!['timer', 'manual'].includes(command.source)) return 'Invalid ride source';
  if (!isValidRideWaitTime(command.waitTimeMinutes)) return RIDE_WAIT_TIME_RANGE_MESSAGE;
  if (typeof command.attractionClosed !== 'boolean'
      || (command.attractionClosed && command.waitTimeMinutes !== null)) {
    return 'Invalid closed-ride state';
  }
  if (command.rating !== null
      && (!Number.isInteger(command.rating) || command.rating < 1 || command.rating > 5)) {
    return 'Rating must be between 1 and 5';
  }
  const rodeAt = new Date(command.rodeAt);
  if (!validString(command.rodeAt, 64)
      || !CANONICAL_UTC_TIMESTAMP.test(command.rodeAt)
      || Number.isNaN(rodeAt.getTime())
      || rodeAt.toISOString() !== command.rodeAt
      || rodeAt.getTime() < MIN_RIDE_TIME
      || rodeAt.getTime() > Date.now() + MAX_FUTURE_SKEW_MS) {
    return 'Invalid ride timestamp';
  }
  return null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const uid = await authenticateRequest(request);
    const command = await readBoundedJson<RideSaveCommand>(request, MAX_BODY_BYTES);
    const validationError = validate(command);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const saved = await saveRideCommand(uid, command);
    return NextResponse.json({ id: command.requestId, ...saved });
  } catch (error) {
    if (error instanceof RequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SaveCommandConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof SaveCommandAmbiguousError) {
      return NextResponse.json(
        { error: error.message, outcome: 'ambiguous', retryable: true },
        { status: 503 },
      );
    }
    if (error instanceof InvalidFirestorePathSegmentError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[ride-logs] Save failed:', error);
    return NextResponse.json({ error: 'Ride save is temporarily unavailable' }, { status: 503 });
  }
}
