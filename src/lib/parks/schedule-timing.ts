import { after } from 'next/server';

/**
 * Shared bounded-wait helpers for park-schedule reads/writes.
 *
 * Root cause (production evidence): `/api/park-schedule` was observed to hang
 * 45+ seconds for Islands of Adventure and Magic Kingdom while the upstream
 * ThemeParks Wiki API itself responded in ~253ms — every Firestore
 * Admin call in that route and in `park-schedule-check.ts` was unbounded
 * (`await cacheRef.get()` / `await cacheRef.set()` with no timeout), so a
 * slow/stalled Firestore read or write could hang the whole request
 * indefinitely with no way to fail fast or degrade to a cached/NO_DATA
 * response. These helpers mirror the pattern already proven in
 * `src/lib/wait-times/refresh.ts`.
 */

// Raised when a bounded wait abandons *waiting* on a stage because its
// individual deadline elapsed. Distinct from any upstream/Firestore error so
// callers can report "this stage ran out of budget" honestly.
export class ScheduleDeadlineError extends Error {}

/**
 * Races `promise` against a timer that resolves `null`. Never rejects on
 * timeout — a slow/hung read degrades to "treat as unavailable" so callers
 * can fall through to an honest cached/NO_DATA response instead of hanging.
 * Does not cancel the underlying operation (the Admin SDK doesn't expose
 * that for Firestore reads) — it only stops *waiting* on it.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Rejecting counterpart to `withTimeout`, for callers that must distinguish
 * "this stage ran out of budget" from "this stage found nothing" (e.g. the
 * route handler, which needs to return a distinct explicit timeout status).
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ScheduleDeadlineError(`${label} exceeded ${ms}ms deadline`)),
      ms
    );
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}

// Bounds for each independently-timed stage. Kept well below the route's
// `maxDuration` (20s) so a single stalled stage fails fast instead of
// consuming the whole request budget.
export const SCHEDULE_CACHE_READ_TIMEOUT_MS = 3_000;
export const SCHEDULE_CACHE_WRITE_TIMEOUT_MS = 3_000;
export const SCHEDULE_UPSTREAM_TIMEOUT_MS = 8_000;

/**
 * Schedules fire-and-forget work using Next.js's `after()` when available so
 * Vercel keeps the serverless function instance alive until it completes,
 * without making the caller await it before responding. Falls back to a
 * plain fire-and-forget outside a request scope (e.g. plain unit tests).
 */
export function scheduleBackgroundWrite(work: Promise<unknown>) {
  try {
    after(() => work);
  } catch {
    void work;
  }
}
