import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, readBoundedJson, RequestError } from '@/lib/server/authenticated-json';
import {
  SaveCommandConflictError,
  SaveCommandAmbiguousError,
  saveTripCommand,
  TripSaveCommand,
} from '@/lib/services/save-command-service';
import { InvalidFirestorePathSegmentError } from '@/lib/server/firestore-path';

const MAX_BODY_BYTES = 8_192;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_SUPPORTED_DATE = '2000-01-01';
const MAX_SUPPORTED_DATE = '2100-12-31';
const TRIP_KEYS = new Set([
  'requestId', 'name', 'startDate', 'endDate', 'parkIds', 'parkNames',
  'status', 'shareId', 'notes',
]);

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const uid = await authenticateRequest(request);
    const command = await readBoundedJson<TripSaveCommand>(request, MAX_BODY_BYTES);
    const validationError = validate(command);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const result = await saveTripCommand(uid, command);
    return NextResponse.json({ id: command.requestId, result });
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
    console.error('[trip-commands] Save failed:', error);
    return NextResponse.json({ error: 'Trip creation is temporarily unavailable' }, { status: 503 });
  }
}
