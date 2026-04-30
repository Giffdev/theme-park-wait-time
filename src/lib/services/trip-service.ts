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
import type { Trip, TripCreateData, TripUpdateData, TripStats } from '@/types/trip';
import type { RideLog } from '@/types/ride-log';
import type { QueryConstraint } from 'firebase/firestore';

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

/** Create a new trip for the user. Returns the new document ID. */
export async function createTrip(
  userId: string,
  data: TripCreateData,
): Promise<string> {
  const shareId = data.shareId !== undefined ? data.shareId : null;

  const tripData = {
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    parkIds: data.parkIds ?? [],
    parkNames: data.parkNames ?? {},
    status: data.status,
    shareId,
    stats: emptyStats(),
    notes: data.notes,
  };

  const ref = await addDocument(tripsPath(userId), tripData);

  // If sharing is enabled, index in shared collection for public access
  if (shareId) {
    await setDocument(SHARED_TRIPS_COLLECTION, shareId, {
      userId,
      tripId: ref.id,
    });
  }

  return ref.id;
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

  try {
    return await getCollection<Trip>(tripsPath(userId), constraints);
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
    return results;
  }
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
  try {
    await updateTripStats(userId, tripId);
  } catch (error) {
    // Stats are nice-to-have; trip completion is the critical operation
    console.warn('[completeTrip] Stats update failed, completing trip anyway:', error);
  }
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
  let logs: (RideLog & { id: string })[];
  try {
    logs = await getTripRideLogs(userId, tripId);
  } catch (error) {
    console.warn('[updateTripStats] Failed to fetch ride logs, using empty stats:', error);
    logs = [];
  }

  const parks = new Set<string>();
  const attractions = new Set<string>();
  const attractionCounts: Record<string, number> = {};
  let totalWaitMinutes = 0;

  for (const log of logs) {
    parks.add(log.parkId);
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

  await updateDocument(tripsPath(userId), tripId, { stats });
}

// ---------------------------------------------------------------------------
// Public Sharing
// ---------------------------------------------------------------------------

/**
 * Generate a share link for a trip.
 * - Creates a URL-safe shareId
 * - Writes it to the trip doc
 * - Indexes in sharedTrips collection for public lookup
 * - Returns the full share URL path (caller prepends domain)
 */
export async function generateShareLink(
  userId: string,
  tripId: string,
): Promise<string> {
  const trip = await getTrip(userId, tripId);
  if (!trip) throw new Error('Trip not found');

  // Reuse existing shareId if already generated
  if (trip.shareId) return `/trips/shared/${trip.shareId}`;

  const shareId = generateShareId();

  // Write shareId to trip doc
  await updateDocument(tripsPath(userId), tripId, { shareId });

  // Write public index entry
  await setDocument(SHARED_TRIPS_COLLECTION, shareId, {
    userId,
    tripId,
    createdAt: new Date(),
  });

  return `/trips/shared/${shareId}`;
}

/** Get a shared trip by its shareId (no auth required). */
export async function getSharedTrip(
  shareId: string,
): Promise<(Trip & { id: string }) | null> {
  // Look up the share index to find owner + tripId
  const shareDoc = await getDocument<{ userId: string; tripId: string }>(
    SHARED_TRIPS_COLLECTION,
    shareId,
  );
  if (!shareDoc) return null;

  // Fetch the actual trip
  return getTrip(shareDoc.userId, shareDoc.tripId);
}
