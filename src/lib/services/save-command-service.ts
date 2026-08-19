import { createHash } from 'crypto';
import { FieldValue, Timestamp, type WriteBatch } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { assertFirestorePathSegment } from '@/lib/server/firestore-path';
import {
  canonicalTripCommandPayload,
  tripCommandFingerprint,
} from '@/lib/services/trip-command-fingerprint';

export class SaveCommandConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveCommandConflictError';
  }
}

export class SaveCommandAmbiguousError extends Error {
  declare readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'SaveCommandAmbiguousError';
  }
}

export class SaveCommandDeadlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveCommandDeadlineError';
  }
}

/** Milliseconds before an unresolved batch.commit is abandoned. */
export const COMMIT_DEADLINE_MS = 10_000;

/**
 * Races batch.commit() against a deadline. Returns 'created' on success.
 * Throws SaveCommandDeadlineError if the deadline fires first — the underlying
 * commit promise is kept alive internally and its rejection is swallowed to
 * prevent an unhandled rejection, but the caller receives ambiguous/deadline.
 * Throws the raw commit error on any other failure so callers can classify it.
 */
async function commitWithDeadline(
  batch: WriteBatch,
  requestHash: string,
  logPrefix: string,
): Promise<void> {
  const startedAt = performance.now();
  console.info(`[${logPrefix}]`, JSON.stringify({
    event: 'batch.commit.attempt',
    requestHash,
  }));

  const commitPromise = batch.commit();

  let deadlineHandle: ReturnType<typeof setTimeout> | undefined;
  const deadlinePromise = new Promise<never>((_, reject) => {
    deadlineHandle = setTimeout(() => reject(new SaveCommandDeadlineError(
      'The server-side commit wait deadline was reached.',
    )), COMMIT_DEADLINE_MS);
  });

  let result: 'committed' | 'deadline' | 'error' = 'error';
  let thrownError: unknown;

  try {
    await Promise.race([commitPromise, deadlinePromise]);
    result = 'committed';
  } catch (error) {
    thrownError = error;
    result = error instanceof SaveCommandDeadlineError ? 'deadline' : 'error';
  }

  // Always clear the timer — safe to call on an already-fired timer (no-op).
  clearTimeout(deadlineHandle);

  const durationMs = Math.round(performance.now() - startedAt);

  if (result === 'committed') {
    console.info(`[${logPrefix}]`, JSON.stringify({
      event: 'batch.commit.success',
      outcome: 'created',
      requestHash,
      durationMs,
    }));
    // Suppress any late rejection from the resolved commit promise (e.g. stream
    // teardown after acknowledgement) to prevent an unhandled rejection warning.
    commitPromise.catch(() => {});
    return;
  }

  const errorCode = thrownError instanceof SaveCommandDeadlineError
    ? 'deadline'
    : thrownError && typeof thrownError === 'object' && 'code' in thrownError
      ? String((thrownError as { code: unknown }).code)
      : thrownError instanceof Error ? thrownError.name : 'unknown';

  console.info(`[${logPrefix}]`, JSON.stringify({
    event: 'batch.commit.failure',
    outcome: result === 'deadline' ? 'deadline' : isAlreadyExists(thrownError) ? 'already-exists' : 'ambiguous',
    errorCode,
    requestHash,
    durationMs,
  }));

  if (result === 'deadline') {
    // Attach background settlement observers BEFORE returning so late outcomes
    // are logged. These fire only if Vercel keeps the process alive long enough.
    // No raw UID, requestId, or payload is logged — only the outcome and error code.
    commitPromise.then(
      () => {
        console.info(`[${logPrefix}]`, JSON.stringify({
          event: 'batch.commit.late-success',
          outcome: 'created-after-deadline',
          requestHash,
        }));
      },
      (lateError: unknown) => {
        const lateCode = lateError && typeof lateError === 'object' && 'code' in lateError
          ? String((lateError as { code: unknown }).code)
          : lateError instanceof Error ? lateError.name : 'unknown';
        console.info(`[${logPrefix}]`, JSON.stringify({
          event: 'batch.commit.late-failure',
          outcome: 'failed-after-deadline',
          errorCode: lateCode,
          requestHash,
        }));
      },
    );
    throw thrownError;
  }

  throw thrownError;
}

export interface RideSaveCommand {
  requestId: string;
  parkId: string;
  attractionId: string;
  parkName: string;
  attractionName: string;
  rodeAt: string;
  waitTimeMinutes: number | null;
  attractionClosed: boolean;
  source: 'timer' | 'manual';
  rating: number | null;
  notes: string;
  tripId?: string | null;
}

export interface TripSaveCommand {
  requestId: string;
  name: string;
  startDate: string;
  endDate: string;
  parkIds: string[];
  parkNames: Record<string, string>;
  status: 'planning' | 'active' | 'completed';
  shareId: string | null;
  notes: string;
}

interface TripStats {
  totalRides: number;
  totalWaitMinutes: number;
  parksVisited: number;
  uniqueAttractions: number;
  favoriteAttraction: string | null;
}

interface StatsGeneration {
  seconds: number;
  nanoseconds: number;
}

function statsGeneration(readTime: Timestamp | undefined): StatsGeneration {
  if (readTime) {
    return {
      seconds: readTime.seconds,
      nanoseconds: readTime.nanoseconds,
    };
  }
  const now = Timestamp.now();
  return { seconds: now.seconds, nanoseconds: now.nanoseconds };
}

function isGenerationAtLeast(current: unknown, candidate: StatsGeneration): boolean {
  if (typeof current === 'number') {
    return current >= candidate.seconds * 1_000 + Math.floor(candidate.nanoseconds / 1_000_000);
  }
  if (!current || typeof current !== 'object') return false;
  const value = current as Partial<StatsGeneration>;
  if (typeof value.seconds !== 'number' || typeof value.nanoseconds !== 'number') return false;
  return value.seconds > candidate.seconds
    || (value.seconds === candidate.seconds && value.nanoseconds >= candidate.nanoseconds);
}

function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  }
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalSerialize(
      (value as Record<string, unknown>)[key],
    )}`)
    .join(',')}}`;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalSerialize(value)).digest('hex');
}

function isAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; message?: unknown };
  return value.code === 6
    || value.code === 'already-exists'
    || value.code === 'firestore/already-exists'
    || (typeof value.message === 'string' && /\balready exists\b/i.test(value.message));
}


function normalizedRidePayload(command: RideSaveCommand) {
  return {
    parkId: command.parkId,
    attractionId: command.attractionId,
    parkName: command.parkName,
    attractionName: command.attractionName,
    rodeAt: new Date(command.rodeAt).toISOString(),
    waitTimeMinutes: command.waitTimeMinutes,
    attractionClosed: command.attractionClosed,
    source: command.source,
    rating: command.rating,
    notes: command.notes,
    ...(command.tripId === undefined ? {} : { tripId: command.tripId }),
  };
}

function calculateTripStats(
  logs: Array<Record<string, unknown>>,
): { stats: TripStats; parkNames: Record<string, string> } {
  const parks = new Set<string>();
  const attractions = new Set<string>();
  const attractionCounts = new Map<string, number>();
  const parkNames: Record<string, string> = {};
  let totalWaitMinutes = 0;

  for (const log of logs) {
    const parkId = String(log.parkId ?? '');
    const attractionId = String(log.attractionId ?? '');
    const attractionName = String(log.attractionName ?? '');
    if (parkId) parks.add(parkId);
    if (parkId && typeof log.parkName === 'string' && log.parkName && !parkNames[parkId]) {
      parkNames[parkId] = log.parkName;
    }
    if (attractionId) attractions.add(attractionId);
    if (attractionName) {
      attractionCounts.set(attractionName, (attractionCounts.get(attractionName) ?? 0) + 1);
    }
    if (typeof log.waitTimeMinutes === 'number') totalWaitMinutes += log.waitTimeMinutes;
  }

  let favoriteAttraction: string | null = null;
  let favoriteCount = 0;
  for (const [name, count] of attractionCounts) {
    if (count > favoriteCount) {
      favoriteAttraction = name;
      favoriteCount = count;
    }
  }

  return {
    stats: {
      totalRides: logs.length,
      totalWaitMinutes,
      parksVisited: parks.size,
      uniqueAttractions: attractions.size,
      favoriteAttraction,
    },
    parkNames,
  };
}

async function refreshTripStats(uid: string, tripId: string): Promise<void> {
  assertFirestorePathSegment(uid, 'authenticated user ID');
  assertFirestorePathSegment(tripId, 'trip ID');
  const snapshot = await adminDb
    .collection(`users/${uid}/rideLogs`)
    .where('tripId', '==', tripId)
    .get();
  const generation = statsGeneration(snapshot.readTime);
  const calculated = calculateTripStats(snapshot.docs.map((document) => document.data()));
  const tripRef = adminDb.doc(`users/${uid}/trips/${tripId}`);

  await adminDb.runTransaction(async (transaction) => {
    const tripSnapshot = await transaction.get(tripRef);
    if (!tripSnapshot.exists) return;
    const currentGeneration = tripSnapshot.get('statsGeneration');
    if (isGenerationAtLeast(currentGeneration, generation)) return;
    transaction.update(tripRef, {
      ...calculated,
      statsGeneration: generation,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

export async function saveRideCommand(
  uid: string,
  command: RideSaveCommand,
): Promise<{
  result: 'created' | 'replayed';
  tripId: string | null;
  statsUpdated: boolean;
}> {
  assertFirestorePathSegment(uid, 'authenticated user ID');
  assertFirestorePathSegment(command.requestId, 'ride request ID');
  if (command.tripId != null) assertFirestorePathSegment(command.tripId, 'trip ID');
  const payload = normalizedRidePayload(command);
  const commandFingerprint = fingerprint(payload);
  const commandRef = adminDb.doc(`users/${uid}/rideLogCommands/${command.requestId}`);
  const rideRef = adminDb.doc(`users/${uid}/rideLogs/${command.requestId}`);
  const resolvedTripId = command.tripId ?? null;
  if (resolvedTripId) assertFirestorePathSegment(resolvedTripId, 'trip ID');

  const batch = adminDb.batch();
  const rodeAt = Timestamp.fromDate(new Date(payload.rodeAt));
  batch.create(rideRef, {
      parkId: command.parkId,
      attractionId: command.attractionId,
      parkName: command.parkName,
      attractionName: command.attractionName,
      rodeAt,
      waitTimeMinutes: command.waitTimeMinutes,
      attractionClosed: command.attractionClosed,
      source: command.source,
      rating: command.rating,
      notes: command.notes,
      tripId: resolvedTripId,
      clientRequestId: command.requestId,
      revision: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
  });
  batch.create(commandRef, {
      fingerprint: commandFingerprint,
      targetId: command.requestId,
      tripId: resolvedTripId,
      createdAt: FieldValue.serverTimestamp(),
  });

  const rideCommitHash = createHash('sha256')
    .update(command.requestId)
    .digest('hex')
    .slice(0, 12);

  let saved: { result: 'created' | 'replayed'; tripId: string | null };
  try {
    await commitWithDeadline(batch, rideCommitHash, 'saveRideCommand');
    saved = { result: 'created', tripId: resolvedTripId };
  } catch (writeError) {
    if (!isAlreadyExists(writeError)) {
      throw new SaveCommandAmbiguousError(
        'The ride save was not confirmed. Retry with the same request ID.',
        writeError,
      );
    }
    try {
      const [commandSnapshot, rideSnapshot] = await Promise.all([
        commandRef.get(),
        rideRef.get(),
      ]);
      if (commandSnapshot.exists && rideSnapshot.exists) {
        if (commandSnapshot.get('fingerprint') !== commandFingerprint
            || commandSnapshot.get('targetId') !== command.requestId) {
          throw new SaveCommandConflictError(
            'This request ID is already bound to a different ride payload.',
          );
        }
        saved = {
          result: 'replayed',
          tripId: (commandSnapshot.get('tripId') as string | null | undefined) ?? null,
        };
      } else {
        throw new SaveCommandConflictError('The ride save ID is already in use.');
      }
    } catch (classificationError) {
      if (classificationError instanceof SaveCommandConflictError) throw classificationError;
      throw new SaveCommandAmbiguousError(
        'The ride save could not be classified. Retry with the same request ID.',
        classificationError ?? writeError,
      );
    }
  }

  if (!saved.tripId) return { ...saved, statsUpdated: true };
  try {
    await refreshTripStats(uid, saved.tripId);
    return { ...saved, statsUpdated: true };
  } catch (error) {
    console.warn('[saveRideCommand] Ride saved; trip stats refresh failed:', error);
    return { ...saved, statsUpdated: false };
  }
}

export async function saveTripCommand(
  uid: string,
  command: TripSaveCommand,
): Promise<'created' | 'replayed'> {
  assertFirestorePathSegment(uid, 'authenticated user ID');
  assertFirestorePathSegment(command.requestId, 'trip request ID');
  if (command.shareId) assertFirestorePathSegment(command.shareId, 'share ID');
  const payload = canonicalTripCommandPayload(command);
  const commandFingerprint = await tripCommandFingerprint(command);
  const commandRef = adminDb.doc(`users/${uid}/tripCreateCommands/${command.requestId}`);
  const tripRef = adminDb.doc(`users/${uid}/trips/${command.requestId}`);
  const shareRef = command.shareId ? adminDb.doc(`sharedTrips/${command.shareId}`) : null;

  const batch = adminDb.batch();
  batch.create(tripRef, {
      name: command.name,
      startDate: command.startDate,
      endDate: command.endDate,
      parkIds: command.parkIds,
      parkNames: payload.parkNames,
      status: command.status,
      shareId: command.shareId,
      stats: {
        totalRides: 0,
        totalWaitMinutes: 0,
        parksVisited: 0,
        uniqueAttractions: 0,
        favoriteAttraction: null,
      },
      notes: command.notes,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
  });
  batch.create(commandRef, {
      fingerprint: commandFingerprint,
      targetId: command.requestId,
      createdAt: FieldValue.serverTimestamp(),
  });
  if (shareRef) {
    batch.create(shareRef, {
        userId: uid,
        tripId: command.requestId,
        updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const commitHash = createHash('sha256')
    .update(command.requestId)
    .digest('hex')
    .slice(0, 12);
  try {
    await commitWithDeadline(batch, commitHash, 'saveTripCommand');
    return 'created';
  } catch (writeError) {
    if (!isAlreadyExists(writeError)) {
      // Deadline, network error, or any non-ALREADY_EXISTS failure.
      // commitWithDeadline already logged the failure event.
      throw new SaveCommandAmbiguousError(
        'The trip creation was not confirmed. Retry with the same request ID.',
        writeError,
      );
    }
    try {
      const [commandSnapshot, tripSnapshot] = await Promise.all([
        commandRef.get(),
        tripRef.get(),
      ]);
      if (commandSnapshot.exists && tripSnapshot.exists) {
        if (commandSnapshot.get('fingerprint') !== commandFingerprint
            || commandSnapshot.get('targetId') !== command.requestId) {
          throw new SaveCommandConflictError(
            'This request ID is already bound to a different trip payload.',
          );
        }
        return 'replayed';
      }
      throw new SaveCommandConflictError('The trip creation ID is already in use.');
    } catch (classificationError) {
      if (classificationError instanceof SaveCommandConflictError) throw classificationError;
      throw new SaveCommandAmbiguousError(
        'The trip creation could not be classified. Retry with the same request ID.',
        classificationError ?? writeError,
      );
    }
  }
}

export type TripCommandStatus =
  | 'committed'
  | 'not-found'
  | 'target-only'
  | 'command-only'
  | 'payload-conflict';

export async function getTripCommandStatus(
  uid: string,
  requestId: string,
  expectedFingerprint: string,
): Promise<TripCommandStatus> {
  assertFirestorePathSegment(uid, 'authenticated user ID');
  assertFirestorePathSegment(requestId, 'trip request ID');
  const commandRef = adminDb.doc(`users/${uid}/tripCreateCommands/${requestId}`);
  const tripRef = adminDb.doc(`users/${uid}/trips/${requestId}`);
  const [commandSnapshot, tripSnapshot] = await adminDb.getAll(commandRef, tripRef);

  if (!commandSnapshot.exists && !tripSnapshot.exists) return 'not-found';
  if (!commandSnapshot.exists) return 'target-only';
  if (!tripSnapshot.exists) return 'command-only';
  if (commandSnapshot.get('targetId') !== requestId
      || commandSnapshot.get('fingerprint') !== expectedFingerprint) {
    return 'payload-conflict';
  }
  return 'committed';
}
