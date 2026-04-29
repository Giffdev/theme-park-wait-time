import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WaitTimeReport {
  id: string;
  attractionId: string;
  attractionName: string;
  parkId: string;
  userId: string;
  username: string;
  /** Wait time in minutes. -1 means ride is closed. 0 means walk-on. */
  waitTime: number;
  reportedAt: string;
  status: 'pending' | 'verified' | 'disputed';
}

// ---------------------------------------------------------------------------
// Collection reference
// ---------------------------------------------------------------------------

const COLLECTION = 'waitTimeReports';

// ---------------------------------------------------------------------------
// Submit a new wait time report
// ---------------------------------------------------------------------------

export async function submitWaitTimeReport(params: {
  attractionId: string;
  attractionName: string;
  parkId: string;
  userId: string;
  username: string;
  waitTime: number;
}): Promise<string> {
  const { attractionId, attractionName, parkId, userId, username, waitTime } = params;

  if (waitTime < -1 || waitTime > 300) {
    throw new Error('Wait time must be between 0 and 300 minutes (or -1 for closed).');
  }

  const docRef = await addDoc(collection(db, COLLECTION), {
    attractionId,
    attractionName,
    parkId,
    userId,
    username,
    waitTime,
    reportedAt: serverTimestamp(),
    status: 'pending',
  });

  return docRef.id;
}

// ---------------------------------------------------------------------------
// Get recent reports for an attraction
// ---------------------------------------------------------------------------

export async function getRecentReports(
  attractionId: string,
  maxResults: number = 5,
): Promise<WaitTimeReport[]> {
  const q = query(
    collection(db, COLLECTION),
    where('attractionId', '==', attractionId),
    orderBy('reportedAt', 'desc'),
    firestoreLimit(maxResults),
  );

  const snap = await getDocs(q);
  return snap.docs.map((doc) => {
    const data = doc.data();
    const reportedAt = data.reportedAt instanceof Timestamp
      ? data.reportedAt.toDate().toISOString()
      : data.reportedAt ?? new Date().toISOString();

    return {
      id: doc.id,
      attractionId: data.attractionId,
      attractionName: data.attractionName ?? '',
      parkId: data.parkId,
      userId: data.userId,
      username: data.username,
      waitTime: data.waitTime,
      reportedAt,
      status: data.status ?? 'pending',
    } as WaitTimeReport;
  });
}

// ---------------------------------------------------------------------------
// Get consensus wait time (median of recent reports within last 30 min)
// ---------------------------------------------------------------------------

export async function getConsensusWaitTime(
  attractionId: string,
): Promise<number | null> {
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

  const q = query(
    collection(db, COLLECTION),
    where('attractionId', '==', attractionId),
    where('reportedAt', '>=', Timestamp.fromDate(thirtyMinAgo)),
    orderBy('reportedAt', 'desc'),
    firestoreLimit(20),
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const times = snap.docs
    .map((d) => d.data().waitTime as number)
    .filter((t) => t >= 0); // exclude "closed" reports for consensus

  if (times.length === 0) {
    // Check if all reports say closed
    const allClosed = snap.docs.every((d) => d.data().waitTime === -1);
    return allClosed ? -1 : null;
  }

  // Return median
  times.sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  return times.length % 2 !== 0
    ? times[mid]
    : Math.round((times[mid - 1] + times[mid]) / 2);
}
