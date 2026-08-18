import { createHash } from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { assertFirestorePathSegment } from '@/lib/server/firestore-path';

export class SaveCommandConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveCommandConflictError';
  }
}

export class SaveCommandAmbiguousError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'SaveCommandAmbiguousError';
  }
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

function normalizedTripPayload(command: TripSaveCommand) {
  return {
    name: command.name,
    startDate: command.startDate,
    endDate: command.endDate,
    parkIds: [...command.parkIds],
    parkNames: Object.fromEntries(
      Object.entries(command.parkNames).sort(([left], [right]) => left.localeCompare(right)),
    ),
    status: command.status,
    shareId: command.shareId,
    notes: command.notes,
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

  let saved: { result: 'created' | 'replayed'; tripId: string | null };
  try {
    await batch.commit();
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
  const payload = normalizedTripPayload(command);
  const commandFingerprint = fingerprint(payload);
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

  try {
    await batch.commit();
    return 'created';
  } catch (writeError) {
    if (!isAlreadyExists(writeError)) {
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
