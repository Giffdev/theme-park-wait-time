import {
  addDocument,
  getDocument,
  getCollection,
  updateDocument,
  deleteDocument,
  orderByConstraint,
  whereConstraint,
  limitConstraint,
  dateToTimestamp,
  getServerTimestamp,
} from '@/lib/firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { getActiveTrip, updateTripStats } from '@/lib/services/trip-service';
import type { RideLog, RideLogCreateData, RideLogUpdateData } from '@/types/ride-log';
import { doc, runTransaction, type QueryConstraint } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function rideLogsPath(userId: string): string {
  return `users/${userId}/rideLogs`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface GetRideLogsOptions {
  parkId?: string;
  attractionId?: string;
  limit?: number;
}

export const RIDE_LOG_SAVE_TIMEOUT_MS = 10_000;
const ACTIVE_TRIP_LOOKUP_TIMEOUT_MS = 3_000;
const TRIP_STATS_TIMEOUT_MS = 5_000;
const CROWD_REPORT_TIMEOUT_MS = 5_000;

export type RideLogSaveErrorCode =
  | 'auth-required'
  | 'invalid-data'
  | 'timeout'
  | 'write-failed'
  | 'post-write-refresh-failed';

export class RideLogSaveError extends Error {
  readonly code: RideLogSaveErrorCode;
  readonly cause?: unknown;
  readonly savedLogId?: string;

  constructor(
    code: RideLogSaveErrorCode,
    message: string,
    cause?: unknown,
    savedLogId?: string,
  ) {
    super(message);
    this.name = 'RideLogSaveError';
    this.code = code;
    this.cause = cause;
    this.savedLogId = savedLogId;
  }
}

export interface AddRideLogOptions {
  /**
   * Stable client-generated ID for retry-safe writes. The first call freezes
   * the complete command, and later calls confirm rather than replace it.
   */
  requestId?: string;
  timeoutMs?: number;
  /** Wait for a bounded trip-summary refresh and report partial success. */
  waitForTripStats?: boolean;
}

const inFlightRideLogs = new Map<string, Promise<string>>();

interface StoredRequestRide {
  tripId?: string | null;
}

interface PreparedRideLogCommand {
  readonly resolvedTripId: string | null;
  readonly writeData: Record<string, unknown>;
}

interface ConfirmedRideLogWrite {
  readonly logId: string;
  readonly resolvedTripId: string | null;
}

interface RideLogRequestState {
  readonly userId: string;
  readonly requestId: string;
  readonly data: RideLogCreateData;
  readonly tripId: string | null | undefined;
  existingLookup?: Promise<StoredRequestRide | null>;
  preparedCommand?: Promise<PreparedRideLogCommand>;
  confirmedWrite?: Promise<ConfirmedRideLogWrite>;
}

const rideLogRequestStates = new Map<string, RideLogRequestState>();

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RideLogSaveError('timeout', message));
    }, Math.max(1, timeoutMs));
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function assertAuthenticatedUser(userId: string): void {
  if (!auth.currentUser || auth.currentUser.uid !== userId) {
    throw new RideLogSaveError(
      'auth-required',
      'Your session expired. Sign in again before saving this ride.',
    );
  }
}

function validateRideLog(userId: string, data: RideLogCreateData, requestId?: string): void {
  if (!userId.trim() || !data.parkId.trim() || !data.attractionId.trim()) {
    throw new RideLogSaveError('invalid-data', 'Select a valid park and attraction.');
  }
  if (!(data.rodeAt instanceof Date) || Number.isNaN(data.rodeAt.getTime())) {
    throw new RideLogSaveError('invalid-data', 'Choose a valid ride date and time.');
  }
  if (
    data.waitTimeMinutes != null
    && (!Number.isFinite(data.waitTimeMinutes) || data.waitTimeMinutes < 0)
  ) {
    throw new RideLogSaveError('invalid-data', 'Wait time must be zero or greater.');
  }
  if (data.rating != null && (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5)) {
    throw new RideLogSaveError('invalid-data', 'Rating must be between 1 and 5.');
  }
  if (requestId && !/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) {
    throw new RideLogSaveError('invalid-data', 'The ride save request ID is invalid.');
  }
}

function remainingTime(deadline: number, stageMaximum: number): number {
  return Math.max(1, Math.min(stageMaximum, deadline - Date.now()));
}

function getStoredTripId(data: StoredRequestRide | undefined): string | null {
  return typeof data?.tripId === 'string' && data.tripId ? data.tripId : null;
}

function getOrCreateRequestState(
  userId: string,
  data: RideLogCreateData,
  tripId: string | null | undefined,
  requestId: string,
): RideLogRequestState {
  const requestKey = `${userId}:${requestId}`;
  const existing = rideLogRequestStates.get(requestKey);
  if (existing) return existing;

  validateRideLog(userId, data, requestId);
  const state: RideLogRequestState = {
    userId,
    requestId,
    data: {
      ...data,
      rodeAt: new Date(data.rodeAt.getTime()),
    },
    tripId,
  };
  rideLogRequestStates.set(requestKey, state);
  return state;
}

function lookupExistingRequestRide(
  state: RideLogRequestState,
): Promise<StoredRequestRide | null> {
  if (state.existingLookup) return state.existingLookup;

  const lookup = getDocument<StoredRequestRide>(
    rideLogsPath(state.userId),
    state.requestId,
  );
  state.existingLookup = lookup;
  void lookup.then(
    () => {
      if (state.existingLookup === lookup) state.existingLookup = undefined;
    },
    () => {
      if (state.existingLookup === lookup) state.existingLookup = undefined;
    },
  );
  return lookup;
}

function prepareRideLogCommand(
  state: RideLogRequestState,
): Promise<PreparedRideLogCommand> {
  if (state.preparedCommand) return state.preparedCommand;

  const preparation = (async () => {
    let resolvedTripId: string | null = null;
    if (state.tripId !== undefined) {
      resolvedTripId = state.tripId;
    } else if (state.data.tripId !== undefined) {
      resolvedTripId = state.data.tripId ?? null;
    } else {
      const activeTrip = await getActiveTrip(state.userId);
      resolvedTripId = activeTrip?.id ?? null;
    }

    return {
      resolvedTripId,
      writeData: {
        ...state.data,
        rodeAt: dateToTimestamp(state.data.rodeAt),
        tripId: resolvedTripId,
        clientRequestId: state.requestId,
        createdAt: getServerTimestamp(),
        updatedAt: getServerTimestamp(),
      },
    };
  })();

  state.preparedCommand = preparation;
  void preparation.catch(() => {
    if (state.preparedCommand === preparation) {
      state.preparedCommand = undefined;
    }
  });
  return preparation;
}

function confirmRequestRideWrite(
  state: RideLogRequestState,
  command: PreparedRideLogCommand,
): Promise<ConfirmedRideLogWrite> {
  if (state.confirmedWrite) return state.confirmedWrite;

  const write = runTransaction(db, async (transaction) => {
    const documentRef = doc(db, rideLogsPath(state.userId), state.requestId);
    const existingSnapshot = await transaction.get(documentRef);
    if (existingSnapshot.exists()) {
      return {
        logId: state.requestId,
        resolvedTripId: getStoredTripId(existingSnapshot.data() as StoredRequestRide),
      };
    }

    transaction.set(documentRef, command.writeData);
    return {
      logId: state.requestId,
      resolvedTripId: command.resolvedTripId,
    };
  });

  state.confirmedWrite = write;
  void write.catch(() => {
    if (state.confirmedWrite === write) {
      state.confirmedWrite = undefined;
    }
  });
  return write;
}

function confirmExistingRequestRide(
  state: RideLogRequestState,
  existing: StoredRequestRide,
): ConfirmedRideLogWrite {
  const confirmed = {
    logId: state.requestId,
    resolvedTripId: getStoredTripId(existing),
  };
  state.confirmedWrite = Promise.resolve(confirmed);
  return confirmed;
}

/**
 * Create a new ride log entry for the user. Returns the new document ID.
 * Automatically associates with the user's active trip if one exists.
 * Pass explicit tripId to override, or null to skip trip association.
 */
export async function addRideLog(
  userId: string,
  data: RideLogCreateData,
  tripId?: string | null,
  options: AddRideLogOptions = {},
): Promise<string> {
  const requestKey = options.requestId ? `${userId}:${options.requestId}` : null;
  if (requestKey) {
    const existing = inFlightRideLogs.get(requestKey);
    if (existing) return existing;
  }

  const savePromise = saveRideLog(userId, data, tripId, options);
  if (!requestKey) return savePromise;

  inFlightRideLogs.set(requestKey, savePromise);
  try {
    return await savePromise;
  } finally {
    if (inFlightRideLogs.get(requestKey) === savePromise) {
      inFlightRideLogs.delete(requestKey);
    }
  }
}

async function saveRideLog(
  userId: string,
  data: RideLogCreateData,
  tripId: string | null | undefined,
  options: AddRideLogOptions,
): Promise<string> {
  if (!options.requestId) {
    validateRideLog(userId, data);
  }
  assertAuthenticatedUser(userId);

  const timeoutMs = Math.max(1, options.timeoutMs ?? RIDE_LOG_SAVE_TIMEOUT_MS);
  const deadline = Date.now() + timeoutMs;

  let logId: string;
  let resolvedTripId: string | null = null;

  if (options.requestId) {
    const state = getOrCreateRequestState(userId, data, tripId, options.requestId);
    try {
      let confirmed: ConfirmedRideLogWrite;
      if (state.confirmedWrite) {
        confirmed = await withTimeout(
          state.confirmedWrite,
          remainingTime(deadline, timeoutMs),
          'Saving the ride took too long. It was not confirmed; retrying is safe.',
        );
      } else {
        const existing = await withTimeout(
          lookupExistingRequestRide(state),
          remainingTime(deadline, timeoutMs),
          'Saving the ride took too long while checking for an earlier attempt. Please retry.',
        );

        if (existing) {
          confirmed = confirmExistingRequestRide(state, existing);
        } else {
          const command = await withTimeout(
            prepareRideLogCommand(state),
            remainingTime(deadline, ACTIVE_TRIP_LOOKUP_TIMEOUT_MS),
            'Saving took too long while checking your active trip. Please retry.',
          );
          assertAuthenticatedUser(userId);
          confirmed = await withTimeout(
            confirmRequestRideWrite(state, command),
            remainingTime(deadline, timeoutMs),
            'Saving the ride took too long. It was not confirmed; retrying is safe.',
          );
        }
      }

      logId = confirmed.logId;
      resolvedTripId = confirmed.resolvedTripId;
    } catch (error) {
      if (error instanceof RideLogSaveError) throw error;
      if (!auth.currentUser || auth.currentUser.uid !== userId) {
        throw new RideLogSaveError(
          'auth-required',
          'Your session expired before the ride could be saved. Sign in and retry.',
          error,
        );
      }
      throw new RideLogSaveError(
        'write-failed',
        'Firestore rejected the ride save. Check your connection and try again.',
        error,
      );
    }
  } else {
    if (tripId !== undefined) {
      resolvedTripId = tripId;
    } else if (data.tripId !== undefined) {
      resolvedTripId = data.tripId ?? null;
    } else {
      const activeTrip = await withTimeout(
        getActiveTrip(userId),
        remainingTime(deadline, ACTIVE_TRIP_LOOKUP_TIMEOUT_MS),
        'Saving took too long while checking your active trip. Please retry.',
      );
      resolvedTripId = activeTrip?.id ?? null;
    }

    assertAuthenticatedUser(userId);
    const writeData = {
      ...data,
      rodeAt: dateToTimestamp(data.rodeAt),
      tripId: resolvedTripId,
    };

    try {
      const ref = await withTimeout(
        addDocument(rideLogsPath(userId), writeData),
        remainingTime(deadline, timeoutMs),
        'Saving the ride took too long. It was not confirmed; please retry.',
      );
      logId = ref.id;
    } catch (error) {
      if (error instanceof RideLogSaveError) throw error;
      if (!auth.currentUser || auth.currentUser.uid !== userId) {
        throw new RideLogSaveError(
          'auth-required',
          'Your session expired before the ride could be saved. Sign in and retry.',
          error,
        );
      }
      throw new RideLogSaveError(
        'write-failed',
        'Firestore rejected the ride save. Check your connection and try again.',
        error,
      );
    }
  }

  // Trip stats are derived data. Callers that need a visible terminal status
  // may wait for the bounded refresh; others keep the non-blocking behavior.
  if (resolvedTripId) {
    const statsRefresh = withTimeout(
      updateTripStats(userId, resolvedTripId),
      TRIP_STATS_TIMEOUT_MS,
      'Trip summary refresh timed out.',
    );

    if (options.waitForTripStats) {
      try {
        await statsRefresh;
      } catch (error) {
        throw new RideLogSaveError(
          'post-write-refresh-failed',
          'Ride saved. The trip summary could not refresh, but retrying will not duplicate this ride.',
          error,
          logId,
        );
      }
    } else {
      void statsRefresh.catch((error) => {
        console.warn('[addRideLog] Ride saved; trip stats refresh failed:', error);
      });
    }
  }

  return logId;
}

/** @deprecated Use addRideLog instead. */
export const createRideLog = addRideLog;

/** Get a user's ride logs sorted by rodeAt DESC, with optional filters. */
export async function getRideLogs(
  userId: string,
  options: GetRideLogsOptions = {},
): Promise<(RideLog & { id: string })[]> {
  const constraints: QueryConstraint[] = [];

  if (options.parkId) {
    constraints.push(whereConstraint('parkId', '==', options.parkId));
  }
  if (options.attractionId) {
    constraints.push(whereConstraint('attractionId', '==', options.attractionId));
  }

  constraints.push(orderByConstraint('rodeAt', 'desc'));

  if (options.limit) {
    constraints.push(limitConstraint(options.limit));
  }

  return getCollection<RideLog>(rideLogsPath(userId), constraints);
}

/** Get a single ride log by ID. */
export async function getRideLog(
  userId: string,
  logId: string,
): Promise<(RideLog & { id: string }) | null> {
  return getDocument<RideLog>(rideLogsPath(userId), logId);
}

/** Update fields on an existing ride log. */
export async function updateRideLog(
  userId: string,
  logId: string,
  data: RideLogUpdateData,
): Promise<void> {
  const updateData: Record<string, unknown> = { ...data };
  if (data.rodeAt) {
    updateData.rodeAt = dateToTimestamp(data.rodeAt);
  }
  return updateDocument(rideLogsPath(userId), logId, updateData);
}

/** Delete a ride log entry. */
export async function deleteRideLog(userId: string, logId: string): Promise<void> {
  return deleteDocument(rideLogsPath(userId), logId);
}

// ---------------------------------------------------------------------------
// Client-side helper for submitting crowd reports via the API route
// ---------------------------------------------------------------------------

/** Submit a crowd report via the API route (server-side write). */
export async function submitCrowdReport(data: {
  parkId: string;
  attractionId: string;
  waitTimeMinutes: number;
}): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new RideLogSaveError('auth-required', 'Sign in to submit a crowd report.');
  }

  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), CROWD_REPORT_TIMEOUT_MS);

  try {
    const idToken = await withTimeout(
      currentUser.getIdToken(),
      CROWD_REPORT_TIMEOUT_MS,
      'Crowd report authentication timed out.',
    );
    const response = await fetch('/api/queue-report', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parkId: data.parkId,
        attractionId: data.attractionId,
        waitTimeMinutes: data.waitTimeMinutes,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Queue report request failed with status ${response.status}`);
    }
  } catch (error) {
    if (error instanceof RideLogSaveError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RideLogSaveError('timeout', 'Crowd report submission timed out.', error);
    }
    throw error;
  } finally {
    clearTimeout(abortTimer);
  }
}
