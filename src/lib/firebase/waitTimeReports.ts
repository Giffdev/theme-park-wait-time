import { auth } from './config';
import {
  isValidReportedWaitTime,
  WAIT_TIME_RANGE_MESSAGE,
} from '@/lib/wait-time-contract';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WaitTimeReport {
  id: string;
  schemaVersion: 1;
  attractionId: string;
  attractionName: string;
  parkId: string;
  /** Wait time in minutes. -1 means ride is closed. 0 means walk-on. */
  waitTime: number;
  reportedAt: string;
  status: 'pending' | 'verified' | 'disputed';
}

// ---------------------------------------------------------------------------
// Collection reference
// ---------------------------------------------------------------------------

const REPORT_SAVE_TIMEOUT_MS = 10_000;
const REPORT_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const REPORT_COMMAND_SCHEMA_VERSION = 1;
const REPORT_COMMAND_TTL_MS = 30 * 60 * 1000;
const REPORT_COMMAND_STORAGE_PREFIX = 'parkpulse:wait-time-report:v1:';

interface WaitTimeReportWrite {
  schemaVersion: 1;
  attractionId: string;
  attractionName: string;
  parkId: string;
  waitTime: number;
  reportedAtMs: number;
  status: 'pending';
}

const reportRequests = new Map<string, WaitTimeReportWrite>();
const reportStorageKeys = new Map<string, string>();

interface StoredWaitTimeReportCommand {
  schemaVersion: 1;
  createdAtMs: number;
  expiresAtMs: number;
  command: WaitTimeReportWrite & { requestId: string };
}

export interface WaitTimeReportCommand {
  requestId: string;
  attractionId: string;
  attractionName: string;
  parkId: string;
  waitTime: number;
}

export function createWaitTimeReportRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `wait-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export type WaitTimeReportErrorCode =
  | 'auth-required'
  | 'invalid-data'
  | 'permission-denied'
  | 'offline'
  | 'rate-limited'
  | 'timeout'
  | 'write-failed';

export class WaitTimeReportError extends Error {
  readonly code: WaitTimeReportErrorCode;
  readonly cause?: unknown;

  constructor(code: WaitTimeReportErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'WaitTimeReportError';
    this.code = code;
    this.cause = cause;
  }
}

function withReportTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new WaitTimeReportError(
        'timeout',
        'The wait-time report could not be confirmed. Check your connection and try again.',
      ));
    }, REPORT_SAVE_TIMEOUT_MS);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function getFirestoreErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function reportScopeKey(params: {
  accountId: string;
  attractionId: string;
  parkId: string;
}): string {
  return `${REPORT_COMMAND_STORAGE_PREFIX}${encodeURIComponent(params.accountId)}:`
    + `${encodeURIComponent(params.parkId)}:${encodeURIComponent(params.attractionId)}`;
}

function removeStoredReportCommand(requestId: string): void {
  reportRequests.delete(requestId);
  const storageKey = reportStorageKeys.get(requestId);
  reportStorageKeys.delete(requestId);
  if (!storageKey) return;
  try {
    getSessionStorage()?.removeItem(storageKey);
  } catch {
    // A completed command is still safe if browser storage cannot be cleaned.
  }
}

function readStoredReportCommand(storageKey: string): StoredWaitTimeReportCommand | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const record = JSON.parse(raw) as StoredWaitTimeReportCommand;
    if (
      record.schemaVersion !== REPORT_COMMAND_SCHEMA_VERSION
      || !record.command
      || !REPORT_ID_PATTERN.test(record.command.requestId)
      || record.expiresAtMs <= Date.now()
      || !isValidReportedWaitTime(record.command.waitTime)
    ) {
      storage.removeItem(storageKey);
      return null;
    }
    return record;
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

export function getOrCreateWaitTimeReportCommand(params: {
  accountId: string;
  attractionId: string;
  attractionName: string;
  parkId: string;
  waitTime: number;
}): WaitTimeReportCommand {
  const storageKey = reportScopeKey(params);
  const stored = readStoredReportCommand(storageKey);
  if (stored) {
    const { requestId, ...writeData } = stored.command;
    reportRequests.set(requestId, writeData);
    reportStorageKeys.set(requestId, storageKey);
    return {
      requestId,
      attractionId: writeData.attractionId,
      attractionName: writeData.attractionName,
      parkId: writeData.parkId,
      waitTime: writeData.waitTime,
    };
  }

  const requestId = createWaitTimeReportRequestId();
  const writeData: WaitTimeReportWrite = {
    schemaVersion: 1,
    attractionId: params.attractionId,
    attractionName: params.attractionName,
    parkId: params.parkId,
    waitTime: params.waitTime,
    reportedAtMs: Date.now(),
    status: 'pending',
  };
  reportRequests.set(requestId, writeData);
  reportStorageKeys.set(requestId, storageKey);

  const now = Date.now();
  const record: StoredWaitTimeReportCommand = {
    schemaVersion: REPORT_COMMAND_SCHEMA_VERSION,
    createdAtMs: now,
    expiresAtMs: now + REPORT_COMMAND_TTL_MS,
    command: { requestId, ...writeData },
  };
  try {
    getSessionStorage()?.setItem(storageKey, JSON.stringify(record));
  } catch {
    // In-memory freezing still preserves retries within the mounted session.
  }

  return {
    requestId,
    attractionId: writeData.attractionId,
    attractionName: writeData.attractionName,
    parkId: writeData.parkId,
    waitTime: writeData.waitTime,
  };
}

// ---------------------------------------------------------------------------
// Submit a new wait time report
// ---------------------------------------------------------------------------

export async function submitWaitTimeReport(params: {
  requestId: string;
  attractionId: string;
  attractionName: string;
  parkId: string;
  waitTime: number;
}): Promise<string> {
  const { requestId, attractionId, attractionName, parkId, waitTime } = params;

  if (
    !REPORT_ID_PATTERN.test(requestId)
    ||
    !attractionId.trim()
    || attractionId.length > 128
    || !attractionName.trim()
    || attractionName.length > 200
    || !parkId.trim()
    || parkId.length > 128
    || !isValidReportedWaitTime(waitTime)
  ) {
    throw new WaitTimeReportError(
      'invalid-data',
      `Select a valid attraction. ${WAIT_TIME_RANGE_MESSAGE}`,
    );
  }

  if (!auth.currentUser) {
    throw new WaitTimeReportError(
      'auth-required',
      'Your session expired. Sign in again before submitting this wait time.',
    );
  }

  const writeData = reportRequests.get(requestId) ?? {
    schemaVersion: 1 as const,
    attractionId,
    attractionName,
    parkId,
    waitTime,
    reportedAtMs: Date.now(),
    status: 'pending' as const,
  };
  reportRequests.set(requestId, writeData);

  try {
    const token = await withReportTimeout(auth.currentUser.getIdToken());
    const response = await withReportTimeout(fetch('/api/queue-report', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestId,
        attractionId: writeData.attractionId,
        attractionName: writeData.attractionName,
        parkId: writeData.parkId,
        waitTimeMinutes: writeData.waitTime,
        reportedAtMs: writeData.reportedAtMs,
      }),
    }));
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      const message = body.error || 'The wait-time report could not be saved.';
      if (response.status === 401) {
        throw new WaitTimeReportError('auth-required', message);
      }
      if (response.status === 400 || response.status === 409 || response.status === 413) {
        removeStoredReportCommand(requestId);
        throw new WaitTimeReportError('invalid-data', message);
      }
      if (response.status === 429) {
        throw new WaitTimeReportError('rate-limited', message);
      }
      if (response.status === 403) {
        throw new WaitTimeReportError('permission-denied', message);
      }
      throw new WaitTimeReportError('write-failed', message);
    }
    removeStoredReportCommand(requestId);
    return requestId;
  } catch (error) {
    if (error instanceof WaitTimeReportError) throw error;

    const code = getFirestoreErrorCode(error);
    if (code === 'permission-denied') {
      throw new WaitTimeReportError(
        'permission-denied',
        'The wait-time report was rejected by Firestore. Refresh the app, then sign in and retry.',
        error,
      );
    }
    if (code === 'unavailable' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      throw new WaitTimeReportError(
        'offline',
        'You appear to be offline. Reconnect before submitting this wait time.',
        error,
      );
    }
    throw new WaitTimeReportError(
      'write-failed',
      'The wait-time report could not be saved. Check your connection and try again.',
      error,
    );
  }
}

// ---------------------------------------------------------------------------
// Get recent reports for an attraction
// ---------------------------------------------------------------------------

export async function getRecentReports(
  attractionId: string,
  maxResults: number = 5,
): Promise<WaitTimeReport[]> {
  const safeLimit = Math.max(1, Math.min(20, Math.floor(maxResults)));
  const response = await fetch(
    `/api/queue-report?attractionId=${encodeURIComponent(attractionId)}&limit=${safeLimit}`,
  );
  if (!response.ok) throw new Error('Could not load wait-time reports.');
  const body = await response.json() as { reports?: WaitTimeReport[] };
  return body.reports ?? [];
}

// ---------------------------------------------------------------------------
// Get consensus wait time (median of recent reports within last 30 min)
// ---------------------------------------------------------------------------

export async function getConsensusWaitTime(
  attractionId: string,
): Promise<number | null> {
  const thirtyMinAgoMs = Date.now() - 30 * 60 * 1000;
  const reports = (await getRecentReports(attractionId, 20))
    .filter((report) => new Date(report.reportedAt).getTime() >= thirtyMinAgoMs);
  if (reports.length === 0) return null;

  const times = reports
    .map((report) => report.waitTime)
    .filter((t) => t >= 0); // exclude "closed" reports for consensus

  if (times.length === 0) {
    // Check if all reports say closed
    const allClosed = reports.every((report) => report.waitTime === -1);
    return allClosed ? -1 : null;
  }

  // Return median
  times.sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  return times.length % 2 !== 0
    ? times[mid]
    : Math.round((times[mid - 1] + times[mid]) / 2);
}
