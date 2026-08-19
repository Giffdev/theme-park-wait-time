import {
  addDocument,
  getDocument,
  getCollection,
  updateDocument,
  deleteDocument,
  setDocument,
  orderByConstraint,
  whereConstraint,
  limitConstraint,
} from '@/lib/firebase/firestore';
import { auth } from '@/lib/firebase/config';
import { getParkById } from '@/lib/parks';
import type { Trip, TripCreateData, TripUpdateData, TripStats } from '@/types/trip';
import type { RideLog } from '@/types/ride-log';
import type { QueryConstraint } from 'firebase/firestore';
import { tripCommandFingerprint } from '@/lib/services/trip-command-fingerprint';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function tripsPath(userId: string): string {
  return `users/${userId}/trips`;
}

function rideLogsPath(userId: string): string {
  return `users/${userId}/rideLogs`;
}

const SHARED_TRIPS_COLLECTION = 'sharedTrips';

// ---------------------------------------------------------------------------
// Share ID Generation
// ---------------------------------------------------------------------------

/** Generate a crypto-safe URL-friendly unique ID for sharing. */
export function generateShareId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // URL-safe base64 without padding
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Default Stats
// ---------------------------------------------------------------------------

function emptyStats(): TripStats {
  return {
    totalRides: 0,
    totalWaitMinutes: 0,
    parksVisited: 0,
    uniqueAttractions: 0,
    favoriteAttraction: null,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface GetTripsOptions {
  status?: Trip['status'];
  limit?: number;
}

export interface CreateTripOptions {
  requestId?: string;
  timeoutMs?: number;
}

export type TripCreateOutcome = 'definitive-non-commit' | 'ambiguous';
export type TripCreationStatus =
  | 'committed'
  | 'pending'
  | 'not-found'
  | 'target-only'
  | 'command-only'
  | 'payload-conflict';

export class TripCreateError extends Error {
  readonly code:
    | 'auth-required'
    | 'invalid-data'
    | 'configuration-error'
    | 'conflicting-replay'
    | 'timeout'
    | 'write-failed';
  readonly outcome: TripCreateOutcome;
  readonly cause?: unknown;

  constructor(
    code: TripCreateError['code'],
    message: string,
    outcome: TripCreateOutcome,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'TripCreateError';
    this.code = code;
    this.outcome = outcome;
    this.cause = cause;
  }
}

const inFlightTripCreates = new Map<string, Promise<string>>();
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

async function getIdTokenWithRefreshDeadline(
  currentUser: NonNullable<typeof auth.currentUser>,
  timeoutMs: number,
): Promise<string> {
  const cachedBudget = Math.min(4_000, Math.max(25, Math.floor(timeoutMs / 2)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      currentUser.getIdToken(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TripCreateError(
          'timeout',
          'Authentication refresh is taking longer than expected.',
          'ambiguous',
        )), cachedBudget);
      }),
    ]);
  } catch (error) {
    if (!(error instanceof TripCreateError) || error.code !== 'timeout') throw error;
    return currentUser.getIdToken(true);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function assertTripCreateAuth(userId: string): void {
  if (!auth.currentUser || auth.currentUser.uid !== userId) {
    throw new TripCreateError(
      'auth-required',
      'Your session expired. Sign in again before creating this trip.',
      'definitive-non-commit',
    );
  }
}

async function postTripCommand(
    data: TripCreateData,
    requestId: string,
    timeoutMs: number,
    externalSignal?: AbortSignal,
  ): Promise<string> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new TripCreateError(
        'auth-required',
        'Sign in before creating this trip.',
        'definitive-non-commit',
      );
    }
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const requestPromise = (async () => {
          const idToken = await getIdTokenWithRefreshDeadline(currentUser, timeoutMs);
          return fetch('/api/trip-commands', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${idToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requestId,
              name: data.name,
              startDate: data.startDate,
              endDate: data.endDate,
              parkIds: data.parkIds ?? [],
              parkNames: data.parkNames ?? {},
              status: data.status,
              shareId: data.shareId ?? null,
              notes: data.notes,
            }),
            signal: controller.signal,
          });
        })();
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new TripCreateError(
            'timeout',
            'Trip creation was not confirmed. Retry will reuse the same trip ID.',
            'ambiguous',
          ));
        }, timeoutMs);
      });
      const boundedRequest = (async () => {
        let response = await requestPromise;
        if (response.status === 401) {
          const refreshedToken = await currentUser.getIdToken(true);
          response = await fetch('/api/trip-commands', {
            method: 'POST',
            headers: {
              Authorization: ['Bearer', refreshedToken].join(' '),
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requestId,
              name: data.name,
              startDate: data.startDate,
              endDate: data.endDate,
              parkIds: data.parkIds ?? [],
              parkNames: data.parkNames ?? {},
              status: data.status,
              shareId: data.shareId ?? null,
              notes: data.notes,
            }),
            signal: controller.signal,
          });
        }
        const body = await response.json().catch(() => null) as {
          id?: unknown;
          result?: unknown;
          error?: string;
          retryable?: boolean;
        } | null;
        return { response, body };
      })();
      const { response, body } = await Promise.race([boundedRequest, deadline]);
      if (response.status === 409) {
        throw new TripCreateError(
          'conflicting-replay',
          body?.error ?? 'This trip request has conflicting server state. Retry the same request ID or contact support; do not start a new trip request.',
          'ambiguous',
        );
      }
      if (response.status === 412 && body?.retryable === false) {
        throw new TripCreateError(
          'configuration-error',
          body.error ?? 'Trip creation is not configured. Contact support before trying again.',
          'definitive-non-commit',
        );
      }
      if (!response.ok) {
        throw new TripCreateError(
          response.status === 401 ? 'auth-required' : 'write-failed',
          body?.error ?? 'Trip creation was not confirmed. Retry with the same trip ID.',
          'ambiguous',
        );
      }
      const validSuccess = response.status === 200
        && body !== null
        && typeof body === 'object'
        && body.id === requestId
        && (body.result === 'created' || body.result === 'replayed');
      if (!validSuccess) {
        throw new TripCreateError(
          'write-failed',
          'Trip creation returned an unrecognized confirmation. Retry will reconcile the same trip ID.',
          'ambiguous',
        );
      }
      return requestId;
    } catch (error) {
      if (error instanceof TripCreateError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TripCreateError(
          'timeout',
          'Trip creation was not confirmed. Retry will reuse the same trip ID.',
          'ambiguous',
          error,
        );
      }
      throw new TripCreateError(
        'write-failed',
        'Trip creation was not confirmed. Retry will reuse the same trip ID.',
        'ambiguous',
        error,
      );
    } finally {
      if (timer) clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function getTripCreationStatus(
  userId: string,
  data: TripCreateData,
  requestId: string,
  timeoutMs = 8_000,
  externalSignal?: AbortSignal,
): Promise<TripCreationStatus> {
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new TripCreateError(
      'invalid-data',
      'The trip creation request ID is invalid.',
      'definitive-non-commit',
    );
  }
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== userId) {
    throw new TripCreateError(
      'auth-required',
      'Your session expired. Sign in again to continue confirming this trip.',
      'ambiguous',
    );
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new TripCreateError(
          'timeout',
          'Trip creation status is still pending. Automatic confirmation will retry.',
          'ambiguous',
        ));
      }, timeoutMs);
    });
    const send = async (forceRefresh: boolean): Promise<Response> => {
      const idToken = forceRefresh
        ? await currentUser.getIdToken(true)
        : await getIdTokenWithRefreshDeadline(currentUser, timeoutMs);
      const fingerprint = await tripCommandFingerprint(data);
      const query = new URLSearchParams({ requestId, fingerprint });
      if (data.shareId) query.set('shareId', data.shareId);
      return fetch(`/api/trip-commands?${query.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: ['Bearer', idToken].join(' '),
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    };
    const requestPromise = (async () => {
      let response = await send(false);
      if (response.status === 401) response = await send(true);
      const body = await response.json().catch(() => ({})) as {
        status?: TripCreationStatus;
        id?: unknown;
        error?: string;
        retryable?: boolean;
      };
      return { response, body };
    })();
    const { response, body } = await Promise.race([requestPromise, deadline]);
    if (response.status === 401) {
      throw new TripCreateError(
        'auth-required',
        'Your session expired. Sign in again to continue confirming this trip.',
        'ambiguous',
      );
    }
    if (response.status === 412 && body.retryable === false) {
      throw new TripCreateError(
        'configuration-error',
        body.error ?? 'Trip creation status is not configured. Contact support before trying again.',
        'definitive-non-commit',
      );
    }
    if (response.status === 503 && body.status === 'pending') return 'pending';
    if (response.status !== 200 || !body.status
        || ![
          'committed',
          'pending',
          'not-found',
          'target-only',
          'command-only',
          'payload-conflict',
        ].includes(body.status)) {
      throw new TripCreateError(
        'write-failed',
        body.error ?? 'Trip creation status could not be confirmed yet.',
        'ambiguous',
      );
    }
    if (body.status === 'committed'
        && (typeof body.id !== 'string'
          || !REQUEST_ID_PATTERN.test(body.id)
          || body.id !== requestId)) {
      throw new TripCreateError(
        'write-failed',
        'Trip creation status could not be confirmed yet. Automatic confirmation will retry.',
        'ambiguous',
      );
    }
    return body.status;
  } catch (error) {
    if (error instanceof TripCreateError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TripCreateError(
        'timeout',
        'Trip creation status is still pending. Automatic confirmation will retry.',
        'ambiguous',
        error,
      );
    }
    throw new TripCreateError(
      'write-failed',
      'Trip creation status could not be confirmed yet. Automatic confirmation will retry.',
      'ambiguous',
      error,
    );
  } finally {
    if (timer) clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function reconcileTripCreation(
  userId: string,
  data: TripCreateData,
  requestId: string,
  timeoutMs = 8_000,
  signal?: AbortSignal,
): Promise<string> {
  const status = await getTripCreationStatus(userId, data, requestId, timeoutMs, signal);
  if (status === 'committed') return requestId;
  if (status === 'target-only'
      || status === 'command-only'
      || status === 'payload-conflict') {
    throw new TripCreateError(
      'conflicting-replay',
      'This trip request has conflicting server state. Keep this page and request ID, retry confirmation, and contact support if it persists. Do not start a new trip request.',
      'ambiguous',
    );
  }
  if (status === 'pending') {
    throw new TripCreateError(
      'write-failed',
      'Trip creation is still being confirmed. Automatic confirmation will retry.',
      'ambiguous',
    );
  }
  return postTripCommand(data, requestId, timeoutMs, signal);
}

/** Create a new trip for the user. Returns the new document ID. */
export async function createTrip(
  userId: string,
  data: TripCreateData,
  options: CreateTripOptions = {},
): Promise<string> {
  assertTripCreateAuth(userId);
  if (options.requestId && !REQUEST_ID_PATTERN.test(options.requestId)) {
    throw new TripCreateError(
      'invalid-data',
      'The trip creation request ID is invalid.',
      'definitive-non-commit',
    );
  }

  const requestKey = options.requestId ? `${userId}:${options.requestId}` : null;
  if (requestKey) {
    const existing = inFlightTripCreates.get(requestKey);
    if (existing) return existing;
  }

  const createPromise = createTripDocument(userId, data, options);
  if (!requestKey) return createPromise;

  inFlightTripCreates.set(requestKey, createPromise);
  try {
    return await createPromise;
  } finally {
    if (inFlightTripCreates.get(requestKey) === createPromise) {
      inFlightTripCreates.delete(requestKey);
    }
  }
}

async function createTripDocument(
  userId: string,
  data: TripCreateData,
  options: CreateTripOptions,
): Promise<string> {
  const shareId = data.shareId !== undefined ? data.shareId : null;

  const tripData: Record<string, unknown> = {
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    parkIds: [...(data.parkIds ?? [])],
    parkNames: { ...(data.parkNames ?? {}) },
    status: data.status,
    shareId,
    stats: emptyStats(),
    notes: data.notes,
  };

  let tripId: string;
  if (options.requestId) {
    tripId = await postTripCommand(data, options.requestId, options.timeoutMs ?? 30_000);
  } else {
    const ref = await addDocument(tripsPath(userId), tripData);
    tripId = ref.id;
  }

  // If sharing is enabled, create the private index resolved by the public API route.
  if (shareId && !options.requestId) {
    await setDocument(SHARED_TRIPS_COLLECTION, shareId, {
      userId,
      tripId,
    });
  }

  return tripId;
}

/** Get a user's trips with optional status filter. */
export async function getTrips(
  userId: string,
  options: GetTripsOptions = {},
): Promise<(Trip & { id: string })[]> {
  const constraints: QueryConstraint[] = [];

  if (options.status) {
    constraints.push(whereConstraint('status', '==', options.status));
  }

  constraints.push(orderByConstraint('createdAt', 'desc'));

  if (options.limit) {
    constraints.push(limitConstraint(options.limit));
  }

  let trips: (Trip & { id: string })[];
  try {
    trips = await getCollection<Trip>(tripsPath(userId), constraints);
  } catch (error) {
    // Fallback: if the composite index isn't built yet, fetch all and filter client-side
    console.warn('[getTrips] Query failed (missing index?), falling back to client-side filter:', error);
    const allTrips = await getCollection<Trip>(tripsPath(userId), [
      orderByConstraint('createdAt', 'desc'),
    ]);

    let results = allTrips;
    if (options.status) {
      results = results.filter((t) => t.status === options.status);
    }
    if (options.limit) {
      results = results.slice(0, options.limit);
    }
    trips = results;
  }

  return trips;
}

/** Get a single trip by ID. */
export async function getTrip(
  userId: string,
  tripId: string,
): Promise<(Trip & { id: string }) | null> {
  return getDocument<Trip>(tripsPath(userId), tripId);
}

/** Partially update a trip. */
export async function updateTrip(
  userId: string,
  tripId: string,
  data: TripUpdateData,
): Promise<void> {
  await updateDocument(tripsPath(userId), tripId, data);

  // If shareId was added or removed, update the shared index
  if ('shareId' in data) {
    const trip = await getTrip(userId, tripId);
    if (!trip) return;

    if (data.shareId) {
      await setDocument(SHARED_TRIPS_COLLECTION, data.shareId, {
        userId,
        tripId,
      });
    }
    // Note: removing old shareId index would require knowing the old value.
    // For v1, we accept orphaned share docs (they point to trips that no longer share).
  }
}

/** Delete a trip, its associated ride logs, and its share index entry. */
export async function deleteTrip(userId: string, tripId: string): Promise<void> {
  const trip = await getTrip(userId, tripId);

  // Delete all ride logs associated with this trip
  const rideLogs = await getCollection<RideLog>(rideLogsPath(userId), [
    whereConstraint('tripId', '==', tripId),
  ]);
  await Promise.all(
    rideLogs.map((log) => deleteDocument(rideLogsPath(userId), log.id)),
  );

  // Delete the trip document
  await deleteDocument(tripsPath(userId), tripId);

  // Clean up shared index
  if (trip?.shareId) {
    await deleteDocument(SHARED_TRIPS_COLLECTION, trip.shareId);
  }
}

// ---------------------------------------------------------------------------
// Quick Trip Creation (for organic "log first" flow)
// ---------------------------------------------------------------------------

/**
 * Create a minimal trip with just a name and start date, status = 'active'.
 * Used for the auto-trip creation flow when a user logs their first ride.
 * Returns the new trip ID.
 */
export async function quickCreateTrip(
  userId: string,
  name: string,
  startDate: string,
): Promise<string> {
  // Deactivate any currently active trip first
  const current = await getActiveTrip(userId);
  if (current) {
    await updateDocument(tripsPath(userId), current.id, { status: 'completed' });
  }

  const tripData = {
    name,
    startDate,
    endDate: startDate, // Same day to start; extends as days are added
    parkIds: [],
    parkNames: {},
    status: 'active' as const,
    shareId: null,
    stats: emptyStats(),
    notes: '',
  };

  const ref = await addDocument(tripsPath(userId), tripData);
  return ref.id;
}

// ---------------------------------------------------------------------------
// Status Management
// ---------------------------------------------------------------------------

/** Get the currently active trip (status === 'active'). Returns null if none. */
export async function getActiveTrip(
  userId: string,
): Promise<(Trip & { id: string }) | null> {
  const constraints: QueryConstraint[] = [
    whereConstraint('status', '==', 'active'),
    limitConstraint(1),
  ];
  const results = await getCollection<Trip>(tripsPath(userId), constraints);
  return results[0] ?? null;
}

/** Activate a trip. Deactivates any currently active trip first. */
export async function activateTrip(userId: string, tripId: string): Promise<void> {
  // Deactivate any currently active trip
  const current = await getActiveTrip(userId);
  if (current && current.id !== tripId) {
    await updateDocument(tripsPath(userId), current.id, { status: 'completed' });
  }

  await updateDocument(tripsPath(userId), tripId, { status: 'active' });
}

/** Complete a trip and compute final stats from ride logs. */
export async function completeTrip(userId: string, tripId: string): Promise<void> {
  await updateDocument(tripsPath(userId), tripId, { status: 'completed' });
}

// ---------------------------------------------------------------------------
// Ride Logs for Trip
// ---------------------------------------------------------------------------

/** Get all ride logs associated with a trip. */
export async function getTripRideLogs(
  userId: string,
  tripId: string,
): Promise<(RideLog & { id: string })[]> {
  const constraints: QueryConstraint[] = [
    whereConstraint('tripId', '==', tripId),
    orderByConstraint('rodeAt', 'desc'),
  ];

  try {
    return await getCollection<RideLog>(rideLogsPath(userId), constraints);
  } catch (error) {
    // Fallback: if composite index isn't deployed yet, fetch without ordering and sort client-side
    console.warn('[getTripRideLogs] Query failed (missing index?), falling back to client-side sort:', error);
    const logs = await getCollection<RideLog>(rideLogsPath(userId), [
      whereConstraint('tripId', '==', tripId),
    ]);
    return logs.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aRaw = a.rodeAt as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bRaw = b.rodeAt as any;
      const aTime = aRaw instanceof Date ? aRaw.getTime() : (aRaw && typeof aRaw.toDate === 'function') ? aRaw.toDate().getTime() : new Date(aRaw).getTime();
      const bTime = bRaw instanceof Date ? bRaw.getTime() : (bRaw && typeof bRaw.toDate === 'function') ? bRaw.toDate().getTime() : new Date(bRaw).getTime();
      return bTime - aTime;
    });
  }
}

// ---------------------------------------------------------------------------
// Stats Computation
// ---------------------------------------------------------------------------

/** Recompute and persist trip stats from its ride logs. */
export async function updateTripStats(userId: string, tripId: string): Promise<void> {
  const logs = await getTripRideLogs(userId, tripId);

  const parks = new Set<string>();
  const parkNames: Record<string, string> = {};
  const attractions = new Set<string>();
  const attractionCounts: Record<string, number> = {};
  let totalWaitMinutes = 0;

  for (const log of logs) {
    parks.add(log.parkId);
    if (!parkNames[log.parkId]) {
      const name = log.parkName || getParkById(log.parkId)?.name;
      if (name) parkNames[log.parkId] = name;
    }
    attractions.add(log.attractionId);
    attractionCounts[log.attractionName] = (attractionCounts[log.attractionName] || 0) + 1;
    if (log.waitTimeMinutes != null) {
      totalWaitMinutes += log.waitTimeMinutes;
    }
  }

  // Find favorite (most-ridden) attraction
  let favoriteAttraction: string | null = null;
  let maxCount = 0;
  for (const [name, count] of Object.entries(attractionCounts)) {
    if (count > maxCount) {
      maxCount = count;
      favoriteAttraction = name;
    }
  }

  const stats: TripStats = {
    totalRides: logs.length,
    totalWaitMinutes,
    parksVisited: parks.size,
    uniqueAttractions: attractions.size,
    favoriteAttraction,
  };

  await updateDocument(tripsPath(userId), tripId, { stats, parkNames });
}
