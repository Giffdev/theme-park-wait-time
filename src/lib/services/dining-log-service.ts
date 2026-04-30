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
import type { DiningLog, DiningLogCreateData, DiningLogUpdateData } from '@/types/dining-log';
import type { QueryConstraint } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function diningLogsPath(userId: string): string {
  return `users/${userId}/diningLogs`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface GetDiningLogsOptions {
  parkId?: string;
  tripId?: string;
  limit?: number;
}

/**
 * Create a new dining log entry. Returns the new document ID.
 */
export async function addDiningLog(
  userId: string,
  data: DiningLogCreateData,
  tripId?: string | null,
): Promise<string> {
  const resolvedTripId = tripId !== undefined ? tripId : (data.tripId ?? null);

  const ref = await addDocument(diningLogsPath(userId), {
    ...data,
    diningAt: dateToTimestamp(data.diningAt),
    tripId: resolvedTripId,
  });

  return ref.id;
}

/** Get a user's dining logs sorted by diningAt DESC, with optional filters. */
export async function getDiningLogs(
  userId: string,
  options: GetDiningLogsOptions = {},
): Promise<(DiningLog & { id: string })[]> {
  const constraints: QueryConstraint[] = [];

  if (options.parkId) {
    constraints.push(whereConstraint('parkId', '==', options.parkId));
  }
  if (options.tripId) {
    constraints.push(whereConstraint('tripId', '==', options.tripId));
  }

  constraints.push(orderByConstraint('diningAt', 'desc'));

  if (options.limit) {
    constraints.push(limitConstraint(options.limit));
  }

  return getCollection<DiningLog>(diningLogsPath(userId), constraints);
}

/** Get dining logs for a specific trip. */
export async function getTripDiningLogs(
  userId: string,
  tripId: string,
): Promise<(DiningLog & { id: string })[]> {
  return getDiningLogs(userId, { tripId });
}

/** Get a single dining log by ID. */
export async function getDiningLog(
  userId: string,
  logId: string,
): Promise<(DiningLog & { id: string }) | null> {
  return getDocument<DiningLog>(diningLogsPath(userId), logId);
}

/** Update fields on an existing dining log. */
export async function updateDiningLog(
  userId: string,
  logId: string,
  data: DiningLogUpdateData,
): Promise<void> {
  const updateData: Record<string, unknown> = { ...data };
  if (data.diningAt) {
    updateData.diningAt = dateToTimestamp(data.diningAt);
  }
  return updateDocument(diningLogsPath(userId), logId, updateData);
}

/** Delete a dining log entry. */
export async function deleteDiningLog(userId: string, logId: string): Promise<void> {
  return deleteDocument(diningLogsPath(userId), logId);
}
