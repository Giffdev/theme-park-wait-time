import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ActiveTimer, TimerStartData } from '@/types/ride-log';

// Firestore stores Timestamps; we convert to Dates for the UI layer
function toActiveTimer(data: Record<string, unknown>): ActiveTimer {
  return {
    parkId: data.parkId as string,
    attractionId: data.attractionId as string,
    parkName: data.parkName as string,
    parkSlug: (data.parkSlug as string) || undefined,
    attractionName: data.attractionName as string,
    startedAt: data.startedAt instanceof Timestamp ? data.startedAt.toDate() : new Date(data.startedAt as number),
    clientStartedAt: data.clientStartedAt as number,
    status: data.status as ActiveTimer['status'],
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date(),
  };
}

/**
 * Start a queue timer for the current user.
 */
export async function startTimer(userId: string, params: TimerStartData): Promise<void> {
  const timerRef = doc(db, `users/${userId}/activeTimer`, 'current');
  await setDoc(timerRef, {
    parkId: params.parkId,
    attractionId: params.attractionId,
    parkName: params.parkName,
    parkSlug: params.parkSlug || null,
    attractionName: params.attractionName,
    startedAt: serverTimestamp(),
    clientStartedAt: params.clientStartedAt,
    status: 'active',
    updatedAt: serverTimestamp(),
  });
}

/**
 * Stop the active timer and return elapsed minutes.
 */
export async function stopTimer(userId: string): Promise<{ elapsedMinutes: number; timer: ActiveTimer } | null> {
  const timerRef = doc(db, `users/${userId}/activeTimer`, 'current');
  const snap = await getDoc(timerRef);
  if (!snap.exists()) return null;

  const timer = toActiveTimer(snap.data());
  const startMs = timer.clientStartedAt || timer.startedAt.getTime();
  const elapsedMinutes = Math.round((Date.now() - startMs) / 60000);

  await deleteDoc(timerRef);
  return { elapsedMinutes, timer };
}

/**
 * Get the current active timer for a user.
 */
export async function getActiveTimer(userId: string): Promise<ActiveTimer | null> {
  const timerRef = doc(db, `users/${userId}/activeTimer`, 'current');
  const snap = await getDoc(timerRef);
  if (!snap.exists()) return null;
  return toActiveTimer(snap.data());
}

/**
 * Subscribe to real-time updates of the active timer.
 */
export function subscribeToActiveTimer(
  userId: string,
  callback: (timer: ActiveTimer | null) => void,
): () => void {
  const timerRef = doc(db, `users/${userId}/activeTimer`, 'current');
  return onSnapshot(timerRef, (snap) => {
    if (!snap.exists()) {
      callback(null);
    } else {
      callback(toActiveTimer(snap.data()));
    }
  });
}

/**
 * Abandon a timer (mark as abandoned and delete).
 */
export async function abandonTimer(userId: string): Promise<void> {
  const timerRef = doc(db, `users/${userId}/activeTimer`, 'current');
  await deleteDoc(timerRef);
}

const ABANDONED_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Check if the user has an abandoned timer (active > 4 hours).
 * Returns the timer if it should be flagged for the user to resolve, null otherwise.
 */
export async function checkForAbandonedTimer(userId: string): Promise<ActiveTimer | null> {
  const timer = await getActiveTimer(userId);
  if (!timer) return null;

  const startMs = timer.clientStartedAt || timer.startedAt.getTime();
  const elapsed = Date.now() - startMs;

  if (elapsed > ABANDONED_THRESHOLD_MS) {
    return timer;
  }

  return null;
}
