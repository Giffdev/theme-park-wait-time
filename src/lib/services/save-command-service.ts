import { createHash } from 'crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb, getAdminServiceAccount } from '@/lib/firebase/admin';
import {
  batchGetFirestoreDocuments,
  beginFirestoreTransaction,
  commitFirestoreDocuments,
  createServiceAccountAccessTokenProvider,
  FIRESTORE_REST_COMMIT_ABORT_MS,
  FIRESTORE_REST_READ_ABORT_MS,
  FirestoreRestCommitError,
  rollbackFirestoreTransaction,
  runFirestoreEqualityQuery,
  type FirestoreCommitDocument,
  type FirestoreCommitResult,
  type FirestoreRestCommitDependencies,
  type FirestoreReadDocument,
} from '@/lib/firebase/firestore-rest-commit';
import { assertFirestorePathSegment } from '@/lib/server/firestore-path';
import {
  canonicalTripCommandPayload,
  tripCommandFingerprint,
} from '@/lib/services/trip-command-fingerprint';
import type { TripStats } from '@/types/trip';

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
  declare readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'SaveCommandDeadlineError';
  }
}

export class SaveCommandConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveCommandConfigurationError';
  }
}

export class TripStatsRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Trip summary refresh rate limit exceeded.');
    this.name = 'TripStatsRateLimitError';
  }
}

/** Milliseconds before the physical REST commit request is aborted. */
export const COMMIT_DEADLINE_MS = FIRESTORE_REST_COMMIT_ABORT_MS;
export const CLASSIFICATION_DEADLINE_MS = FIRESTORE_REST_READ_ABORT_MS;

export interface SaveCommandDependencies {
  commitDocuments?: (
    documents: FirestoreCommitDocument[],
    dependencies?: FirestoreRestCommitDependencies,
    transaction?: string,
  ) => Promise<void | FirestoreCommitResult | null>;
  readDocuments?: (
    paths: string[],
    dependencies?: FirestoreRestCommitDependencies,
    transaction?: string,
  ) => Promise<Map<string, FirestoreReadDocument | null>>;
  queryDocuments?: typeof runFirestoreEqualityQuery;
  beginTransaction?: typeof beginFirestoreTransaction;
  rollbackTransaction?: typeof rollbackFirestoreTransaction;
  deadlineAt?: number;
  now?: () => number;
}

const operationTransports = new WeakMap<
  SaveCommandDependencies,
  FirestoreRestCommitDependencies
>();

function transportDependencies(
  dependencies: SaveCommandDependencies,
): FirestoreRestCommitDependencies {
  if (dependencies.deadlineAt === undefined) return {};
  const existing = operationTransports.get(dependencies);
  if (existing) return existing;
  let accessTokenProvider: () => Promise<string>;
  try {
    accessTokenProvider = createServiceAccountAccessTokenProvider(
      getAdminServiceAccount(),
      { deadlineAt: dependencies.deadlineAt },
    );
  } catch {
    throw new SaveCommandConfigurationError(
      'The save service credentials are not configured correctly.',
    );
  }
  const transport = { deadlineAt: dependencies.deadlineAt, accessTokenProvider };
  operationTransports.set(dependencies, transport);
  return transport;
}

function isConfigurationFailure(error: unknown): boolean {
  return error instanceof FirestoreRestCommitError
    && [
      'FAILED_PRECONDITION',
      'INVALID_ARGUMENT',
      'UNAUTHENTICATED',
      'PERMISSION_DENIED',
    ].includes(error.code);
}

async function commitWithTelemetry(
  documents: FirestoreCommitDocument[],
  requestHash: string,
  logPrefix: string,
  dependencies: SaveCommandDependencies,
): Promise<void> {
  const startedAt = performance.now();
  console.info(`[${logPrefix}]`, JSON.stringify({
    event: 'firestore.commit.attempt',
    requestHash,
  }));

  try {
    await (dependencies.commitDocuments ?? commitFirestoreDocuments)(
      documents,
      transportDependencies(dependencies),
    );
    console.info(`[${logPrefix}]`, JSON.stringify({
      event: 'firestore.commit.success',
      outcome: 'created',
      requestHash,
      durationMs: Math.round(performance.now() - startedAt),
    }));
  } catch (error) {
    const errorCode = error && typeof error === 'object' && 'code' in error
      ? String((error as { code: unknown }).code)
      : error instanceof Error ? error.name : 'unknown';
    console.info(`[${logPrefix}]`, JSON.stringify({
      event: 'firestore.commit.failure',
      outcome: errorCode === 'DEADLINE_EXCEEDED'
        ? 'deadline'
        : isAlreadyExists(error) ? 'already-exists' : 'ambiguous',
      errorCode,
      requestHash,
      durationMs: Math.round(performance.now() - startedAt),
    }));
    if (error instanceof FirestoreRestCommitError && error.code === 'DEADLINE_EXCEEDED') {
      throw new SaveCommandDeadlineError(
        'The Firestore commit was aborted at its local deadline.',
        error,
      );
    }
    if (isConfigurationFailure(error)) {
      throw new SaveCommandConfigurationError(
        'The save service is not configured correctly.',
      );
    }
    throw error;
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
    || value.code === 'ALREADY_EXISTS'
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

function fields(document: FirestoreReadDocument | null | undefined): Record<string, unknown> | null {
  return document?.fields ?? null;
}

function createTripStatsAccumulator() {
  const parks = new Set<string>();
  const attractions = new Set<string>();
  const attractionCounts = new Map<string, number>();
  const parkNames: Record<string, string> = {};
  let totalWaitMinutes = 0;
  let totalRides = 0;
  return {
    add({ fields: log }: FirestoreReadDocument) {
    if (typeof log.parkId !== 'string' || !log.parkId || log.parkId.length > 128
        || typeof log.parkName !== 'string' || log.parkName.length > 256
        || typeof log.attractionId !== 'string' || !log.attractionId
        || log.attractionId.length > 128
        || typeof log.attractionName !== 'string' || log.attractionName.length > 256
        || (log.waitTimeMinutes !== null
          && (typeof log.waitTimeMinutes !== 'number'
            || !Number.isSafeInteger(log.waitTimeMinutes)
            || log.waitTimeMinutes < 0
            || log.waitTimeMinutes > 1_440))) {
      throw new FirestoreRestCommitError(
        'DATA_LOSS',
        'Trip summary input fields exceeded their validated bounds.',
      );
    }
    totalRides += 1;
    parks.add(log.parkId);
    if (log.parkName && !parkNames[log.parkId]) {
      parkNames[log.parkId] = log.parkName;
    }
    attractions.add(log.attractionId);
    if (log.attractionName) {
      attractionCounts.set(
        log.attractionName,
        (attractionCounts.get(log.attractionName) ?? 0) + 1,
      );
    }
    if (typeof log.waitTimeMinutes === 'number') {
      totalWaitMinutes += log.waitTimeMinutes;
      if (!Number.isSafeInteger(totalWaitMinutes)) {
        throw new FirestoreRestCommitError(
          'DATA_LOSS',
          'Trip summary wait total exceeded safe numeric bounds.',
        );
      }
    }
    },
    finish() {
      const favoriteAttraction = [...attractionCounts.entries()]
        .sort(([leftName, leftCount], [rightName, rightCount]) => (
          rightCount - leftCount || leftName.localeCompare(rightName)
        ))[0]?.[0] ?? null;
      return {
        stats: {
          totalRides,
          totalWaitMinutes,
          parksVisited: parks.size,
          uniqueAttractions: attractions.size,
          favoriteAttraction,
        },
        parkNames,
      };
    },
  };
}

function timestampFromReadTime(readTime: string): Timestamp {
  const match = readTime.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/,
  );
  if (!match) {
    throw new FirestoreRestCommitError('DATA_LOSS', 'Firestore returned an invalid read time.');
  }
  const seconds = Date.parse(`${match[1]}Z`) / 1_000;
  if (!Number.isSafeInteger(seconds)) {
    throw new FirestoreRestCommitError('DATA_LOSS', 'Firestore returned an invalid read time.');
  }
  const nanoseconds = Number((match[2] ?? '').padEnd(9, '0'));
  return new Timestamp(seconds, nanoseconds);
}

const TRIP_STATS_THROTTLE_BUCKET_MS = 10_000;

export async function claimTripStatsRefreshSlot(
  uid: string,
  tripId: string,
  dependencies: SaveCommandDependencies = {},
): Promise<void> {
  assertFirestorePathSegment(uid, 'authenticated user ID');
  assertFirestorePathSegment(tripId, 'trip ID');
  const tripPath = `users/${uid}/trips/${tripId}`;
  const transport = transportDependencies(dependencies);
  const ownedTrip = await (dependencies.readDocuments ?? batchGetFirestoreDocuments)(
    [tripPath],
    transport,
  );
  if (!fields(ownedTrip.get(tripPath))) {
    throw new SaveCommandConflictError('The trip does not exist.');
  }
  const now = (dependencies.now ?? Date.now)();
  const bucket = Math.floor(now / TRIP_STATS_THROTTLE_BUCKET_MS);
  const key = createHash('sha256')
    .update(`${uid}\u0000${tripId}\u0000${bucket}`)
    .digest('hex');
  try {
    await (dependencies.commitDocuments ?? commitFirestoreDocuments)([{
      path: `tripStatsRefreshThrottle/${key}`,
      fields: {
        expiresAt: new Date((bucket + 2) * TRIP_STATS_THROTTLE_BUCKET_MS),
      },
      serverTimestampFields: ['createdAt'],
    }], transport);
  } catch (error) {
    if (isAlreadyExists(error)) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(((bucket + 1) * TRIP_STATS_THROTTLE_BUCKET_MS - now) / 1_000),
      );
      throw new TripStatsRateLimitError(retryAfterSeconds);
    }
    if (isConfigurationFailure(error)) {
      throw new SaveCommandConfigurationError(
        'The trip stats throttle is not configured correctly.',
      );
    }
    throw error;
  }
}

export interface RefreshedTripStats {
  stats: TripStats;
  statsUpdatedAt: string;
}

export async function refreshTripStats(
  uid: string,
  tripId: string,
  dependencies: SaveCommandDependencies = {},
): Promise<RefreshedTripStats | null> {
  assertFirestorePathSegment(uid, 'authenticated user ID');
  assertFirestorePathSegment(tripId, 'trip ID');
  const tripPath = `users/${uid}/trips/${tripId}`;
  const transport = transportDependencies(dependencies);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let transaction: string | null = null;
    try {
      transaction = await (dependencies.beginTransaction ?? beginFirestoreTransaction)(
        transport,
      );
      const readDocuments = dependencies.readDocuments ?? batchGetFirestoreDocuments;
      const tripDocuments = await readDocuments([tripPath], transport, transaction);
      const tripFields = fields(tripDocuments.get(tripPath));
      if (!tripFields) {
        await (dependencies.rollbackTransaction ?? rollbackFirestoreTransaction)(
          transaction,
          transport,
        );
        return null;
      }
      const accumulator = createTripStatsAccumulator();
      const queryResult = await (dependencies.queryDocuments ?? runFirestoreEqualityQuery)(
        {
          collectionPath: `users/${uid}/rideLogs`,
          field: 'tripId',
          value: tripId,
          projectionFields: [
            'tripId',
            'parkId',
            'parkName',
            'attractionId',
            'attractionName',
            'waitTimeMinutes',
          ],
          transaction,
          onDocument: (document) => accumulator.add(document),
          maxRepresentationBytes: 8 * 1024 * 1024,
          maxDocuments: 10_000,
        },
        transport,
      );
      if (!queryResult.readTime) {
        throw new FirestoreRestCommitError(
          'DATA_LOSS',
          'Firestore query did not provide a snapshot read time.',
        );
      }
      for (const document of queryResult.documents) accumulator.add(document);
      const aggregate = accumulator.finish();
      const generation = timestampFromReadTime(queryResult.readTime);
      const writes: FirestoreCommitDocument[] = [{
        path: tripPath,
        fields: { ...aggregate, statsGeneration: generation },
        operation: 'update',
        updateMaskFields: ['stats', 'parkNames', 'statsGeneration'],
        serverTimestampFields: ['statsUpdatedAt', 'updatedAt'],
      }];
      const shareId = typeof tripFields.shareId === 'string' ? tripFields.shareId : null;
      if (shareId) {
        assertFirestorePathSegment(shareId, 'share ID');
        const sharePath = `sharedTrips/${shareId}`;
        const shareDocuments = await readDocuments([sharePath], transport, transaction);
        const shareFields = fields(shareDocuments.get(sharePath));
        if (!shareFields || shareFields.userId !== uid || shareFields.tripId !== tripId) {
          throw new SaveCommandConflictError('The trip share index is inconsistent.');
        }
        writes.push({
          path: sharePath,
          fields: { ...aggregate, statsGeneration: generation },
          operation: 'update',
          updateMaskFields: ['stats', 'parkNames', 'statsGeneration'],
          serverTimestampFields: ['statsUpdatedAt', 'updatedAt'],
        });
      }
      const commitResult = await (dependencies.commitDocuments ?? commitFirestoreDocuments)(
        writes,
        transport,
        transaction,
      );
      const statsUpdatedAt = commitResult && typeof commitResult === 'object'
        ? commitResult.writes.find(({ path }) => path === tripPath)
          ?.transformResults.statsUpdatedAt
        : undefined;
      if (typeof statsUpdatedAt !== 'string') {
        throw new FirestoreRestCommitError(
          'DATA_LOSS',
          'Firestore commit did not provide the stats update transform time.',
        );
      }
      transaction = null;
      return {
        stats: aggregate.stats,
        statsUpdatedAt,
      };
    } catch (error) {
      if (transaction) {
        try {
          await (dependencies.rollbackTransaction ?? rollbackFirestoreTransaction)(
            transaction,
            transport,
          );
        } catch {
          // Preserve the original refresh failure classification.
        }
      }
      if (error instanceof SaveCommandConflictError) throw error;
      if (isConfigurationFailure(error)) {
        throw new SaveCommandConfigurationError(
          'The trip stats service is not configured correctly.',
        );
      }
      if (error instanceof FirestoreRestCommitError
          && error.code === 'ABORTED'
          && attempt === 0) continue;
      return null;
    }
  }
  return null;
}

export async function saveRideCommand(
  uid: string,
  command: RideSaveCommand,
  dependencies: SaveCommandDependencies = {},
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

  const rodeAt = Timestamp.fromDate(new Date(payload.rodeAt));
  const documents: FirestoreCommitDocument[] = [{
    path: rideRef.path,
    fields: {
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
    },
    serverTimestampFields: ['createdAt', 'updatedAt'],
  }, {
    path: commandRef.path,
    fields: {
      fingerprint: commandFingerprint,
      targetId: command.requestId,
      tripId: resolvedTripId,
    },
    serverTimestampFields: ['createdAt'],
  }];

  const rideCommitHash = createHash('sha256')
    .update(command.requestId)
    .digest('hex')
    .slice(0, 12);

  let saved: { result: 'created' | 'replayed'; tripId: string | null };
  try {
    await commitWithTelemetry(documents, rideCommitHash, 'saveRideCommand', dependencies);
    saved = { result: 'created', tripId: resolvedTripId };
  } catch (writeError) {
    if (writeError instanceof SaveCommandConfigurationError) throw writeError;
    if (!isAlreadyExists(writeError)) {
      throw new SaveCommandAmbiguousError(
        'The ride save was not confirmed. Retry with the same request ID.',
        writeError,
      );
    }
    try {
      const readDocuments = dependencies.readDocuments ?? batchGetFirestoreDocuments;
      const documents = await readDocuments(
        [commandRef.path, rideRef.path],
        transportDependencies(dependencies),
      );
      const commandFields = fields(documents.get(commandRef.path));
      const rideFields = fields(documents.get(rideRef.path));
      if (commandFields && rideFields) {
        if (commandFields.fingerprint !== commandFingerprint
            || commandFields.targetId !== command.requestId) {
          throw new SaveCommandConflictError(
            'This request ID is already bound to a different ride payload.',
          );
        }
        saved = {
          result: 'replayed',
          tripId: (commandFields.tripId as string | null | undefined) ?? null,
        };
      } else {
        throw new SaveCommandConflictError('The ride save ID is already in use.');
      }
    } catch (classificationError) {
      if (classificationError instanceof SaveCommandConflictError
          || classificationError instanceof SaveCommandConfigurationError) {
        throw classificationError;
      }
      if (isConfigurationFailure(classificationError)) {
        throw new SaveCommandConfigurationError(
          'The save classification service is not configured correctly.',
        );
      }
      throw new SaveCommandAmbiguousError(
        'The ride save could not be classified. Retry with the same request ID.',
        classificationError ?? writeError,
      );
    }
  }

  // The ride and command marker are the authoritative save. Derived trip
  // summaries are refreshed separately so their read/query latency cannot
  // turn a committed ride into an ambiguous client outcome.
  return { ...saved, statsUpdated: saved.tripId === null };
}

export async function saveTripCommand(
  uid: string,
  command: TripSaveCommand,
  dependencies: SaveCommandDependencies = {},
): Promise<'created' | 'replayed'> {
  assertFirestorePathSegment(uid, 'authenticated user ID');
  assertFirestorePathSegment(command.requestId, 'trip request ID');
  if (command.shareId) assertFirestorePathSegment(command.shareId, 'share ID');
  const payload = canonicalTripCommandPayload(command);
  const commandFingerprint = await tripCommandFingerprint(command);
  const commandRef = adminDb.doc(`users/${uid}/tripCreateCommands/${command.requestId}`);
  const tripRef = adminDb.doc(`users/${uid}/trips/${command.requestId}`);
  const shareRef = command.shareId ? adminDb.doc(`sharedTrips/${command.shareId}`) : null;

  const documents: FirestoreCommitDocument[] = [{
    path: tripRef.path,
    fields: {
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
    },
    serverTimestampFields: ['createdAt', 'updatedAt'],
  }, {
    path: commandRef.path,
    fields: {
      fingerprint: commandFingerprint,
      targetId: command.requestId,
      shareId: command.shareId,
    },
    serverTimestampFields: ['createdAt'],
  }];
  if (shareRef) {
    documents.push({
      path: shareRef.path,
      fields: {
        userId: uid,
        tripId: command.requestId,
      },
      serverTimestampFields: ['updatedAt'],
    });
  }

  const commitHash = createHash('sha256')
    .update(command.requestId)
    .digest('hex')
    .slice(0, 12);
  try {
    await commitWithTelemetry(documents, commitHash, 'saveTripCommand', dependencies);
    return 'created';
  } catch (writeError) {
    if (writeError instanceof SaveCommandConfigurationError) throw writeError;
    if (!isAlreadyExists(writeError)) {
      // Deadline, network error, or any non-ALREADY_EXISTS failure.
      // The transport already logged a safe, transport-neutral failure event.
      throw new SaveCommandAmbiguousError(
        'The trip creation was not confirmed. Retry with the same request ID.',
        writeError,
      );
    }
    try {
      const paths = [commandRef.path, tripRef.path, ...(shareRef ? [shareRef.path] : [])];
      const readDocuments = dependencies.readDocuments ?? batchGetFirestoreDocuments;
      const documents = await readDocuments(paths, transportDependencies(dependencies));
      const commandFields = fields(documents.get(commandRef.path));
      const tripFields = fields(documents.get(tripRef.path));
      const shareFields = shareRef ? fields(documents.get(shareRef.path)) : null;
      if (commandFields && tripFields) {
        if (commandFields.fingerprint !== commandFingerprint
            || commandFields.targetId !== command.requestId
            || (commandFields.shareId ?? null) !== command.shareId) {
          throw new SaveCommandConflictError(
            'This request ID is already bound to a different trip payload.',
          );
        }
        if (shareRef && (!shareFields
            || shareFields.userId !== uid
            || shareFields.tripId !== command.requestId)) {
          throw new SaveCommandConflictError(
            'This trip share ID is missing or bound to a different trip.',
          );
        }
        return 'replayed';
      }
      throw new SaveCommandConflictError('The trip creation ID is already in use.');
    } catch (classificationError) {
      if (classificationError instanceof SaveCommandConflictError
          || classificationError instanceof SaveCommandConfigurationError) {
        throw classificationError;
      }
      if (isConfigurationFailure(classificationError)) {
        throw new SaveCommandConfigurationError(
          'The save classification service is not configured correctly.',
        );
      }
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
  expectedShareId: string | null = null,
  dependencies: SaveCommandDependencies = {},
): Promise<TripCommandStatus> {
  assertFirestorePathSegment(uid, 'authenticated user ID');
  assertFirestorePathSegment(requestId, 'trip request ID');
  if (expectedShareId) assertFirestorePathSegment(expectedShareId, 'share ID');
  const commandRef = adminDb.doc(`users/${uid}/tripCreateCommands/${requestId}`);
  const tripRef = adminDb.doc(`users/${uid}/trips/${requestId}`);
  const shareRef = expectedShareId ? adminDb.doc(`sharedTrips/${expectedShareId}`) : null;
  const paths = [commandRef.path, tripRef.path, ...(shareRef ? [shareRef.path] : [])];
  const readDocuments = dependencies.readDocuments ?? batchGetFirestoreDocuments;
  let documents: Map<string, FirestoreReadDocument | null>;
  try {
    documents = await readDocuments(paths, transportDependencies(dependencies));
  } catch (error) {
    if (isConfigurationFailure(error)) {
      throw new SaveCommandConfigurationError(
        'The save status service is not configured correctly.',
      );
    }
    throw error;
  }
  const commandFields = fields(documents.get(commandRef.path));
  const tripFields = fields(documents.get(tripRef.path));
  const shareFields = shareRef ? fields(documents.get(shareRef.path)) : null;

  if (!commandFields && !tripFields) return shareFields ? 'payload-conflict' : 'not-found';
  if (!commandFields) return 'target-only';
  if (!tripFields) return 'command-only';
  if (commandFields.targetId !== requestId
      || commandFields.fingerprint !== expectedFingerprint
      || (commandFields.shareId ?? null) !== expectedShareId) {
    return 'payload-conflict';
  }
  if (shareRef && (!shareFields
      || shareFields.userId !== uid
      || shareFields.tripId !== requestId)) return 'payload-conflict';
  return 'committed';
}
