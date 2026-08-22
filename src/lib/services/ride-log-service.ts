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
} from '@/lib/firebase/firestore';
import { auth } from '@/lib/firebase/config';
import { getActiveTrip } from '@/lib/services/trip-service';
import type { RideLog, RideLogCreateData, RideLogUpdateData } from '@/types/ride-log';
import type { TripStats } from '@/types/trip';
import { parseFirestoreTimestamp } from '@/lib/firestore-timestamp';
import { increment, type QueryConstraint } from 'firebase/firestore';
import {
  isValidReportedWaitTime,
  isValidRideWaitTime,
  RIDE_WAIT_TIME_RANGE_MESSAGE,
  WAIT_TIME_RANGE_MESSAGE,
} from '@/lib/wait-time-contract';

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
const CROWD_REPORT_AUTH_TIMEOUT_MS = 5_000;
export const CROWD_REPORT_REQUEST_TIMEOUT_MS = 10_000;

export type RideLogSaveErrorCode =
  | 'auth-required'
  | 'invalid-data'
  | 'configuration-error'
  | 'conflicting-replay'
  | 'timeout'
  | 'write-failed'
  | 'post-write-refresh-failed';

export type RideLogSaveOutcome =
  | 'definitive-non-commit'
  | 'ambiguous'
  | 'committed';

export class RideLogSaveError extends Error {
  readonly code: RideLogSaveErrorCode;
  readonly cause?: unknown;
  readonly savedLogId?: string;
  readonly outcome: RideLogSaveOutcome;

  constructor(
    code: RideLogSaveErrorCode,
    message: string,
    cause?: unknown,
    savedLogId?: string,
    outcome?: RideLogSaveOutcome,
  ) {
    super(message);
    this.name = 'RideLogSaveError';
    this.code = code;
    this.cause = cause;
    this.savedLogId = savedLogId;
    this.outcome = outcome ?? (
      code === 'post-write-refresh-failed'
        ? 'committed'
        : code === 'auth-required' || code === 'invalid-data' || code === 'configuration-error'
          ? 'definitive-non-commit'
          : 'ambiguous'
    );
  }
}

export function canDiscardRideLogSave(error: unknown): boolean {
  return error instanceof RideLogSaveError
    && error.outcome === 'definitive-non-commit';
}

export interface AddRideLogOptions {
  /**
   * Stable client-generated ID for retry-safe writes. The first call freezes
   * the complete command, and later calls confirm rather than replace it.
   */
  requestId?: string;
  timeoutMs?: number;
  /** Legacy opt-in for callers that still require synchronous derived stats. */
  waitForTripStats?: boolean;
}

const inFlightRideLogs = new Map<string, Promise<string>>();

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  outcome: RideLogSaveOutcome = 'ambiguous',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RideLogSaveError('timeout', message, undefined, undefined, outcome));
    }, Math.max(1, timeoutMs));
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function firestoreErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return typeof error.code === 'string' ? error.code.replace(/^firestore\//, '') : '';
}

function writeFailureOutcome(error: unknown): RideLogSaveOutcome {
  return [
    'permission-denied',
    'unauthenticated',
    'invalid-argument',
    'failed-precondition',
    'not-found',
  ].includes(firestoreErrorCode(error))
    ? 'definitive-non-commit'
    : 'ambiguous';
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
  if (!isValidRideWaitTime(data.waitTimeMinutes)) {
    throw new RideLogSaveError('invalid-data', RIDE_WAIT_TIME_RANGE_MESSAGE);
  }
  if (data.attractionClosed != null && typeof data.attractionClosed !== 'boolean') {
    throw new RideLogSaveError('invalid-data', 'Ride closed status is invalid.');
  }
  if (data.attractionClosed && data.waitTimeMinutes !== null) {
    throw new RideLogSaveError(
      'invalid-data',
      'Closed rides must use the closed status instead of a numeric wait.',
    );
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

export type TripStatsRefreshResult =
  | { status: 'updated'; stats: TripStats; statsUpdatedAt: string }
  | 'stale'
  | { status: 'throttled'; retryAt: number };

interface TripStatsRefreshEntry {
  controller: AbortController;
  promise: Promise<TripStatsRefreshResult>;
  subscribers: Set<symbol>;
  settled: boolean;
}

const TRIP_STATS_REFRESH_DEADLINE_MS = 15_000;
const TRIP_STATS_ATTEMPT_DEADLINE_MS = 5_000;
const tripStatsRefreshes = new Map<string, TripStatsRefreshEntry>();

function retryAfterTime(response: Response, now: number): number | null {
  const raw = response.headers?.get('retry-after')?.trim();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const seconds = Number(raw);
    return Number.isFinite(seconds) ? now + Math.ceil(seconds * 1_000) : null;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? Math.max(now, parsed) : null;
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (completed: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(completed);
    };
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(true), delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isTripStats(value: unknown): value is TripStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const stats = value as Partial<Record<keyof TripStats, unknown>>;
  const countKeys: Array<keyof TripStats> = [
    'totalRides',
    'totalWaitMinutes',
    'parksVisited',
    'uniqueAttractions',
  ];
  return countKeys.every((key) => (
    Number.isSafeInteger(stats[key]) && (stats[key] as number) >= 0
  )) && (
    stats.favoriteAttraction === null || typeof stats.favoriteAttraction === 'string'
  );
}

async function updatedTripStats(response: Response): Promise<TripStatsRefreshResult> {
  if (response.status !== 200) return 'stale';
  try {
    const body = await response.json() as {
      updated?: unknown;
      stats?: unknown;
      statsUpdatedAt?: unknown;
    };
    if (body.updated !== true || !isTripStats(body.stats)
        || typeof body.statsUpdatedAt !== 'string'
        || !parseFirestoreTimestamp(body.statsUpdatedAt)) return 'stale';
    return {
      status: 'updated',
      stats: body.stats,
      statsUpdatedAt: body.statsUpdatedAt,
    };
  } catch {
    return 'stale';
  }
}

function createTripStatsRefresh(
  refreshKey: string,
  tripId: string,
  idToken: string,
): TripStatsRefreshEntry {
  const controller = new AbortController();
  const entry: TripStatsRefreshEntry = {
    controller,
    promise: Promise.resolve('stale'),
    subscribers: new Set(),
    settled: false,
  };
  const deadlineAt = Date.now() + TRIP_STATS_REFRESH_DEADLINE_MS;
  const deadlineTimer = setTimeout(() => controller.abort(), TRIP_STATS_REFRESH_DEADLINE_MS);
  entry.promise = (async (): Promise<TripStatsRefreshResult> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (controller.signal.aborted) return 'stale';
      const remaining = deadlineAt - Date.now();
      if (remaining <= 0) return 'stale';
      const attemptController = new AbortController();
      const abortAttempt = () => attemptController.abort();
      controller.signal.addEventListener('abort', abortAttempt, { once: true });
      const attemptTimer = setTimeout(
        () => attemptController.abort(),
        Math.min(TRIP_STATS_ATTEMPT_DEADLINE_MS, remaining),
      );
      try {
        const response = await fetch('/api/trip-stats', {
          method: 'POST',
          headers: {
            Authorization: ['Bearer', idToken].join(' '),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tripId }),
          signal: attemptController.signal,
        });
        if (response.status === 200) return updatedTripStats(response);
        if (response.ok) return 'stale';
        if (response.status !== 429) return 'stale';
        const retryAt = retryAfterTime(response, Date.now());
        if (retryAt === null) return 'stale';
        if (attempt === 1 || retryAt >= deadlineAt) {
          return { status: 'throttled', retryAt };
        }
        const waited = await waitForRetry(Math.max(0, retryAt - Date.now()), controller.signal);
        if (!waited) return 'stale';
      } catch {
        if (controller.signal.aborted || attempt === 1) return 'stale';
      } finally {
        controller.signal.removeEventListener('abort', abortAttempt);
        clearTimeout(attemptTimer);
      }
    }
    return 'stale';
  })().finally(() => {
    clearTimeout(deadlineTimer);
    entry.settled = true;
    if (tripStatsRefreshes.get(refreshKey) === entry) {
      tripStatsRefreshes.delete(refreshKey);
    }
  });
  tripStatsRefreshes.set(refreshKey, entry);
  return entry;
}

function subscribeToTripStatsRefresh(
  refreshKey: string,
  entry: TripStatsRefreshEntry,
  signal?: AbortSignal,
): Promise<TripStatsRefreshResult> {
  if (signal?.aborted) return Promise.resolve('stale');
  const subscriber = Symbol(refreshKey);
  entry.subscribers.add(subscriber);
  return new Promise((resolve) => {
    let complete = false;
    const finish = (result: TripStatsRefreshResult, aborted: boolean) => {
      if (complete) return;
      complete = true;
      signal?.removeEventListener('abort', onAbort);
      entry.subscribers.delete(subscriber);
      if (aborted && entry.subscribers.size === 0 && !entry.settled) {
        if (tripStatsRefreshes.get(refreshKey) === entry) {
          tripStatsRefreshes.delete(refreshKey);
        }
        entry.controller.abort();
      }
      resolve(result);
    };
    const onAbort = () => finish('stale', true);
    signal?.addEventListener('abort', onAbort, { once: true });
    entry.promise.then(
      (result) => finish(result, false),
      () => finish('stale', false),
    );
  });
}

async function requestTripStatsRefresh(
  uid: string,
  tripId: string,
  idToken: string,
  signal?: AbortSignal,
): Promise<TripStatsRefreshResult> {
  const refreshKey = `${uid}\u0000${tripId}`;
  let entry = tripStatsRefreshes.get(refreshKey);
  if (entry?.settled || entry?.controller.signal.aborted) {
    if (tripStatsRefreshes.get(refreshKey) === entry) tripStatsRefreshes.delete(refreshKey);
    entry = undefined;
  }
  if (!entry) {
    entry = createTripStatsRefresh(refreshKey, tripId, idToken);
  }
  return subscribeToTripStatsRefresh(refreshKey, entry, signal);
}

export async function refreshTripStatsAfterMutation(
  tripId: string,
  signal?: AbortSignal,
): Promise<TripStatsRefreshResult> {
  const currentUser = auth.currentUser;
  if (!currentUser || signal?.aborted) return 'stale';
  try {
    return await requestTripStatsRefresh(
      currentUser.uid,
      tripId,
      await currentUser.getIdToken(),
      signal,
    );
  } catch {
    return 'stale';
  }
}

function scheduleTripStatsRefresh(tripId: string): void {
  // The refresh transport is deadline-bounded and coalesces concurrent work per trip.
  void refreshTripStatsAfterMutation(tripId).then(
    (result) => {
      if (result === 'stale') {
        console.warn(
          '[ride-log-service] Background trip summary refresh did not confirm an update.',
        );
      } else if (result.status === 'throttled') {
        console.warn(
          '[ride-log-service] Background trip summary refresh was throttled.',
        );
      }
    },
    (error) => {
      console.warn('[ride-log-service] Background trip summary refresh failed:', error);
    },
  );
}

async function postRideCommand(
  data: RideLogCreateData,
  tripId: string | null | undefined,
  requestId: string,
  timeoutMs: number,
): Promise<{ id: string; tripId: string | null; statsUpdated: boolean }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new RideLogSaveError('auth-required', 'Sign in before saving this ride.');
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const requestPromise = (async () => {
      const idToken = await currentUser.getIdToken();
      return fetch('/api/ride-logs', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId,
          parkId: data.parkId,
          attractionId: data.attractionId,
          parkName: data.parkName,
          attractionName: data.attractionName,
          rodeAt: data.rodeAt.toISOString(),
          waitTimeMinutes: data.waitTimeMinutes,
          attractionClosed: data.attractionClosed,
          source: data.source,
          rating: data.rating,
          notes: data.notes,
          ...(tripId !== undefined || data.tripId !== undefined
            ? { tripId: tripId !== undefined ? tripId : data.tripId }
            : {}),
        }),
        signal: controller.signal,
      });
    })();
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new RideLogSaveError(
          'timeout',
          'Saving the ride took too long. It was not confirmed; retrying is safe.',
        ));
      }, timeoutMs);
    });
    const response = await Promise.race([requestPromise, deadline]);
    const body = await response.json().catch(() => ({})) as {
      id?: unknown;
      result?: unknown;
      tripId?: unknown;
      statsUpdated?: unknown;
      error?: string;
      retryable?: boolean;
    };
    if (response.status === 409) {
      throw new RideLogSaveError(
        'conflicting-replay',
        body.error ?? 'This request ID is bound to a different ride.',
        undefined,
        undefined,
        'definitive-non-commit',
      );
    }
    if (!response.ok) {
      if (response.status === 412 && body.retryable === false) {
        throw new RideLogSaveError(
          'configuration-error',
          body.error ?? 'Ride saving is not configured. Contact support before trying again.',
          undefined,
          undefined,
          'definitive-non-commit',
        );
      }
      throw new RideLogSaveError(
        response.status === 401 ? 'auth-required' : response.status < 500 ? 'invalid-data' : 'write-failed',
        body.error ?? 'The ride save was not confirmed. Retry with the same request ID.',
        undefined,
        undefined,
        response.status < 500 ? 'definitive-non-commit' : 'ambiguous',
      );
    }
    const expectedTripId = tripId !== undefined
      ? tripId
      : data.tripId ?? null;
    const confirmedId = body.id;
    const confirmedResult = body.result;
    const confirmedTripId = body.tripId;
    const statsUpdated = body.statsUpdated;
    if (response.status !== 200
        || typeof confirmedId !== 'string'
        || confirmedId !== requestId
        || (confirmedResult !== 'created' && confirmedResult !== 'replayed')
        || (confirmedTripId !== null && typeof confirmedTripId !== 'string')
        || confirmedTripId !== expectedTripId
        || typeof statsUpdated !== 'boolean') {
      throw new RideLogSaveError(
        'write-failed',
        'Ride saving returned an unrecognized confirmation. Retry will reconcile the same ride ID.',
        undefined,
        undefined,
        'ambiguous',
      );
    }
    return {
      id: confirmedId,
      tripId: confirmedTripId,
      statsUpdated,
    };
  } catch (error) {
    if (error instanceof RideLogSaveError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RideLogSaveError(
        'timeout',
        'Saving the ride took too long. It was not confirmed; retrying is safe.',
      );
    }
    throw new RideLogSaveError(
      'write-failed',
      'The ride save was not confirmed. Check your connection and retry.',
      error,
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  if (requestKey) assertAuthenticatedUser(userId);
  validateRideLog(userId, data, options.requestId);
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
    const saved = await postRideCommand(data, tripId, options.requestId, timeoutMs);
    logId = saved.id;
    resolvedTripId = saved.tripId;
    if (resolvedTripId && options.waitForTripStats && !saved.statsUpdated) {
      const refreshed = await refreshTripStatsAfterMutation(resolvedTripId);
      if (typeof refreshed === 'object' && refreshed.status === 'updated') {
        return logId;
      }
      throw new RideLogSaveError(
        'post-write-refresh-failed',
        'Ride saved. The trip summary could not refresh, but retrying will not duplicate this ride.',
        undefined,
        logId,
        'committed',
      );
    }
    if (resolvedTripId && !saved.statsUpdated) {
      scheduleTripStatsRefresh(resolvedTripId);
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
        'definitive-non-commit',
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
        undefined,
        writeFailureOutcome(error),
      );
    }
    if (resolvedTripId) {
      scheduleTripStatsRefresh(resolvedTripId);
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
  const changesWait = Object.prototype.hasOwnProperty.call(data, 'waitTimeMinutes');
  const changesClosed = Object.prototype.hasOwnProperty.call(data, 'attractionClosed');
  if (changesWait !== changesClosed) {
    throw new RideLogSaveError(
      'invalid-data',
      'Update wait time and closed status together.',
    );
  }
  if (changesWait) {
    if (!isValidRideWaitTime(data.waitTimeMinutes)) {
      throw new RideLogSaveError('invalid-data', RIDE_WAIT_TIME_RANGE_MESSAGE);
    }
    if (typeof data.attractionClosed !== 'boolean') {
      throw new RideLogSaveError('invalid-data', 'Ride closed status is invalid.');
    }
    if (data.attractionClosed && data.waitTimeMinutes !== null) {
      throw new RideLogSaveError(
        'invalid-data',
        'Closed rides must use the closed status instead of a numeric wait.',
      );
    }
  }
  const updateData: Record<string, unknown> = { ...data };
  if (data.rodeAt) {
    updateData.rodeAt = dateToTimestamp(data.rodeAt);
  }
  const existingForStatsRefresh = getRideLog(userId, logId).catch(() => null);
  await updateDocument(rideLogsPath(userId), logId, {
    ...updateData,
    revision: increment(1),
  });
  void existingForStatsRefresh.then((existing) => {
    if (existing?.tripId && auth.currentUser?.uid === userId) {
      scheduleTripStatsRefresh(existing.tripId);
    }
  });
}

/** Delete a ride log entry. */
export async function deleteRideLog(userId: string, logId: string): Promise<void> {
  const existingForStatsRefresh = getRideLog(userId, logId).catch(() => null);
  await deleteDocument(rideLogsPath(userId), logId);
  void existingForStatsRefresh.then((existing) => {
    if (existing?.tripId && auth.currentUser?.uid === userId) {
      scheduleTripStatsRefresh(existing.tripId);
    }
  });
}

// ---------------------------------------------------------------------------
// Client-side helper for submitting crowd reports via the API route
// ---------------------------------------------------------------------------

/** Submit a crowd report via the API route (server-side write). */
export async function submitCrowdReport(data: {
  requestId: string;
  reportedAtMs: number;
  parkId: string;
  attractionId: string;
  waitTimeMinutes: number;
}): Promise<void> {
  if (
    !/^[A-Za-z0-9_-]{8,128}$/.test(data.requestId)
    || !Number.isFinite(data.reportedAtMs)
    || !data.parkId.trim()
    || !data.attractionId.trim()
    || !isValidReportedWaitTime(data.waitTimeMinutes)
  ) {
    throw new RideLogSaveError('invalid-data', WAIT_TIME_RANGE_MESSAGE);
  }
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new RideLogSaveError('auth-required', 'Sign in to submit a crowd report.');
  }

  try {
    const idToken = await withTimeout(
      currentUser.getIdToken(),
      CROWD_REPORT_AUTH_TIMEOUT_MS,
      'Crowd report authentication timed out.',
    );
    const controller = new AbortController();
    const abortTimer = setTimeout(
      () => controller.abort(),
      CROWD_REPORT_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch('/api/queue-report', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId: data.requestId,
          reportedAtMs: data.reportedAtMs,
          parkId: data.parkId,
          attractionId: data.attractionId,
          waitTimeMinutes: data.waitTimeMinutes,
        }),
        signal: controller.signal,
      });

      const body = (
        typeof response.json === 'function'
          ? await response.json().catch(() => ({}))
          : {}
      ) as {
        success?: unknown;
        requestId?: unknown;
        outcome?: unknown;
        error?: string;
      };
      if (!response.ok) {
        const message = body.error
          ?? `Queue report request failed with status ${response.status}`;
        const definitive = [400, 401, 409, 413, 429].includes(response.status);
        throw new RideLogSaveError(
          response.status === 401 ? 'auth-required' : 'write-failed',
          message,
          undefined,
          undefined,
          definitive ? 'definitive-non-commit' : 'ambiguous',
        );
      }
      if (
        body.success !== true
        || body.requestId !== data.requestId
        || !['accepted', 'replay', 'ignored-older-correction'].includes(String(body.outcome))
      ) {
        throw new RideLogSaveError(
          'write-failed',
          'The wait-time report response could not be confirmed. Retrying is safe.',
          undefined,
          undefined,
          'ambiguous',
        );
      }
    } finally {
      clearTimeout(abortTimer);
    }
  } catch (error) {
    if (error instanceof RideLogSaveError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RideLogSaveError('timeout', 'Crowd report submission timed out.', error);
    }
    throw error;
  }
}
