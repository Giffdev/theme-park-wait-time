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
import type { RideLog, RideLogCreateData, RideLogUpdateData } from '@/types/ride-log';
import type { QueryConstraint } from 'firebase/firestore';

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

/** Create a new ride log entry for the user. Returns the new document ID. */
export async function addRideLog(
  userId: string,
  data: RideLogCreateData,
): Promise<string> {
  const ref = await addDocument(rideLogsPath(userId), {
    ...data,
    rodeAt: dateToTimestamp(data.rodeAt),
  });
  return ref.id;
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
  await fetch('/api/queue-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parkId: data.parkId,
      attractionId: data.attractionId,
      waitTimeMinutes: data.waitTimeMinutes,
    }),
  });
}
