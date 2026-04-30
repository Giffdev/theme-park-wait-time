import {
  getDocument,
  getCollection,
  setDocument,
  deleteDocument,
  orderByConstraint,
} from '@/lib/firebase/firestore';
import type { TripDay } from '@/types/trip-day';
import type { QueryConstraint } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function tripDaysPath(userId: string, tripId: string): string {
  return `users/${userId}/trips/${tripId}/days`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Get all TripDay documents for a trip, ordered by date ascending. */
export async function getTripDays(
  userId: string,
  tripId: string,
): Promise<(TripDay & { id: string })[]> {
  const constraints: QueryConstraint[] = [
    orderByConstraint('date', 'asc'),
  ];
  return getCollection<TripDay>(tripDaysPath(userId, tripId), constraints);
}

/** Get a specific TripDay by date (YYYY-MM-DD). */
export async function getTripDay(
  userId: string,
  tripId: string,
  date: string,
): Promise<(TripDay & { id: string }) | null> {
  return getDocument<TripDay>(tripDaysPath(userId, tripId), date);
}

/**
 * Create or update a TripDay, adding the park to parkIds if not already present.
 * Uses setDocument with merge semantics — the date string is the doc ID.
 */
export async function createOrUpdateTripDay(
  userId: string,
  tripId: string,
  date: string,
  parkId: string,
  parkName: string,
): Promise<void> {
  const existing = await getTripDay(userId, tripId, date);

  if (existing) {
    // Add park if not already in the list
    const parkIds = existing.parkIds.includes(parkId)
      ? existing.parkIds
      : [...existing.parkIds, parkId];
    const parkNames = { ...existing.parkNames, [parkId]: parkName };

    await setDocument(tripDaysPath(userId, tripId), date, {
      date,
      parkIds,
      parkNames,
      notes: existing.notes,
    });
  } else {
    // Create new TripDay
    await setDocument(tripDaysPath(userId, tripId), date, {
      date,
      parkIds: [parkId],
      parkNames: { [parkId]: parkName },
      notes: '',
    });
  }
}

/** Delete a TripDay document. */
export async function deleteTripDay(
  userId: string,
  tripId: string,
  date: string,
): Promise<void> {
  await deleteDocument(tripDaysPath(userId, tripId), date);
}

// ---------------------------------------------------------------------------
// Integration Helper
// ---------------------------------------------------------------------------

/**
 * Ensure a TripDay exists for the date of a ride log.
 * Called after logging a ride to keep TripDay.parkIds in sync.
 */
export async function ensureTripDayForLog(
  userId: string,
  tripId: string,
  parkId: string,
  parkName: string,
  rodeAt: Date,
): Promise<void> {
  const date = rodeAt.toISOString().split('T')[0]; // YYYY-MM-DD
  await createOrUpdateTripDay(userId, tripId, date, parkId, parkName);
}
