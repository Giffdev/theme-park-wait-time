/**
 * Helper to check park operating status for a given date.
 * Checks Firestore cache first, falls back to ThemeParks Wiki API.
 *
 * Every Firestore read/write and upstream fetch below is bounded (see
 * `schedule-timing.ts`). Production evidence showed `/api/park-schedule`
 * hanging 45+ seconds for some parks while the upstream API itself
 * responded in ~253ms — traced to unbounded `cacheRef.get()`/`cacheRef.set()`
 * calls with no timeout. A bounded read/write degrades to a cache-miss /
 * deferred-write instead of hanging, and callers still get an honest
 * `hasData: false` rather than an indefinite wait.
 */
import { adminDb } from '@/lib/firebase/admin';
import {
  scheduleBackgroundWrite,
  withTimeout,
  SCHEDULE_CACHE_READ_TIMEOUT_MS,
  SCHEDULE_UPSTREAM_TIMEOUT_MS,
} from './schedule-timing';

const API_BASE = 'https://api.themeparks.wiki/v1';
const SCHEDULE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ScheduleSegment {
  type: 'OPERATING' | 'TICKETED_EVENT' | 'EXTRA_HOURS';
  description: string | null;
  openingTime: string;
  closingTime: string;
}

export interface ParkOperatingStatus {
  isOpen: boolean;
  hasData: boolean;
  segments?: ScheduleSegment[];
  /** IANA timezone the schedule's dates/segments were reported in, when known. */
  timezone?: string;
}

/**
 * Format a `Date` as a `YYYY-MM-DD` calendar date in a specific IANA
 * timezone. Used so "today" for a given park is computed from that park's
 * own local calendar date rather than the server's (UTC on Vercel) date —
 * evenings in US parks are already the next calendar day in UTC, and the
 * reverse applies to parks east of UTC late in the UTC day.
 */
export function getLocalDateString(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    // Invalid/unknown IANA timezone — fall back to UTC rather than throwing.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}

export interface CachedParkSchedule<TSegment = ScheduleSegment> {
  parkId: string;
  date: string;
  timezone?: string;
  segments: TSegment[];
  hasData?: boolean;
  fetchedAt: string;
  stale?: boolean;
}

type CachedScheduleDoc = CachedParkSchedule<ScheduleSegment>;

interface WikiScheduleEntry {
  date: string;
  type: string;
  description?: string | null;
  openingTime: string;
  closingTime: string;
}

interface WikiScheduleResponse {
  id: string;
  name: string;
  timezone: string;
  schedule: WikiScheduleEntry[];
}

function isScheduleStale(fetchedAt: string): boolean {
  return Date.now() - new Date(fetchedAt).getTime() > SCHEDULE_TTL_MS;
}

export function isReusableScheduleCache(
  data: Pick<CachedParkSchedule<unknown>, 'hasData' | 'segments'>
): boolean {
  // Empty legacy cache entries are ambiguous: older code wrote an empty
  // segment list both for a confirmed closed day and for dates outside the
  // upstream schedule's rolling coverage window. Refetch those entries so
  // confirmed coverage can be rewritten with an explicit hasData value.
  if (data.hasData === undefined) return data.segments.length > 0;

  // The shared document does not distinguish a permanent historical miss
  // from a temporary beyond-horizon miss. Both writers therefore skip
  // hasData:false writes, and readers refetch any older negative documents.
  return data.hasData;
}

function cachedOperatingStatus(data: CachedScheduleDoc): ParkOperatingStatus | null {
  if (!isReusableScheduleCache(data)) return null;

  const hasData = data.hasData ?? true;
  const operatingSegments = data.segments.filter((s) => s.type === 'OPERATING');
  return {
    isOpen: hasData && operatingSegments.length > 0,
    hasData,
    segments: data.segments,
    timezone: data.timezone,
  };
}

export function getScheduleCoverage(
  date: string,
  timezone: string,
  schedule: Array<{ date: string }>
): { hasData: boolean; shouldCache: boolean } {
  if (schedule.some((entry) => entry.date === date)) {
    return { hasData: true, shouldCache: true };
  }

  if (schedule.length === 0) {
    return { hasData: false, shouldCache: false };
  }

  // ThemeParks.wiki schedules are a rolling present/future window, not a
  // historical month archive. A missing date is a confirmed closed day only
  // between the park-local current date and the last published schedule date.
  // Dates before today or beyond the published horizon are unknown. Unknown
  // dates are deliberately not cached because a future date can enter the
  // published horizon well before the normal 24-hour positive-cache TTL.
  const coverageStart = getLocalDateString(new Date(), timezone);
  const coverageEnd = schedule.reduce(
    (latest, entry) => (entry.date > latest ? entry.date : latest),
    schedule[0].date
  );
  const hasData = date >= coverageStart && date <= coverageEnd;
  return { hasData, shouldCache: hasData };
}

/**
 * Check if a park is open on a given date.
 * 1. Check Firestore parkSchedules/{parkId}/daily/{date} cache
 * 2. If not cached or stale, fetch from ThemeParks Wiki API
 * 3. Return operating status
 */
export async function getParkOperatingStatus(
  parkId: string,
  date: string
): Promise<ParkOperatingStatus> {
  try {
    // Check Firestore cache. Bounded: a stalled read is treated exactly like
    // a cache miss (`cached` stays `null`) rather than hanging the request.
    const cacheRef = adminDb
      .collection('parkSchedules')
      .doc(parkId)
      .collection('daily')
      .doc(date);

    const cached = await withTimeout(cacheRef.get(), SCHEDULE_CACHE_READ_TIMEOUT_MS);

    if (cached?.exists) {
      const data = cached.data() as CachedScheduleDoc;
      if (!isScheduleStale(data.fetchedAt)) {
        const cachedStatus = cachedOperatingStatus(data);
        if (cachedStatus) return cachedStatus;
      }
    }

    // Fetch from ThemeParks Wiki API. Bounded so a stalled upstream
    // connection fails fast instead of hanging the request indefinitely.
    const res = await fetch(`${API_BASE}/entity/${parkId}/schedule`, {
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(SCHEDULE_UPSTREAM_TIMEOUT_MS),
    });

    if (!res.ok) {
      // If API fails but we have stale cache, use it
      if (cached?.exists) {
        const data = cached.data() as CachedScheduleDoc;
        const cachedStatus = cachedOperatingStatus(data);
        if (cachedStatus) return cachedStatus;
      }
      return { isOpen: false, hasData: false };
    }

    const apiData = (await res.json()) as WikiScheduleResponse;
    const dayEntries = (apiData.schedule || []).filter((e) => e.date === date);

    const segments: ScheduleSegment[] = dayEntries.map((entry) => ({
      type: mapSegmentType(entry.type),
      description: entry.description ?? null,
      openingTime: entry.openingTime,
      closingTime: entry.closingTime,
    }));
    const coverage = getScheduleCoverage(
      date,
      apiData.timezone,
      apiData.schedule || []
    );
    const hasData = coverage.hasData;

    // Cache in Firestore. Deferred via `after()` (request-lifecycle
    // scheduling) so a slow/cold write can never block the response — the
    // caller already has everything it needs from `apiData` above.
    const cacheDoc: CachedScheduleDoc = {
      parkId,
      date,
      timezone: apiData.timezone,
      segments,
      hasData,
      fetchedAt: new Date().toISOString(),
    };
    if (coverage.shouldCache) {
      scheduleBackgroundWrite(
        cacheRef.set(cacheDoc).catch((err) => {
          console.warn(`Failed to cache schedule for ${parkId}/${date}:`, err.message);
        })
      );
    }

    const operatingSegments = segments.filter((s) => s.type === 'OPERATING');
    return {
      isOpen: hasData && operatingSegments.length > 0,
      hasData,
      segments,
      timezone: apiData.timezone,
    };
  } catch (error) {
    console.warn(`Schedule check failed for ${parkId}/${date}:`, (error as Error).message);
    return { isOpen: false, hasData: false };
  }
}

/**
 * Batch-check operating status for multiple parks on multiple dates.
 * Groups API calls per park (one API call returns full schedule).
 */
export async function batchGetParkOperatingStatus(
  parkIds: string[],
  dates: string[]
): Promise<Map<string, Map<string, ParkOperatingStatus>>> {
  const results = new Map<string, Map<string, ParkOperatingStatus>>();

  await Promise.all(
    parkIds.map(async (parkId) => {
      const parkMap = new Map<string, ParkOperatingStatus>();
      results.set(parkId, parkMap);

      // Try to get all dates from cache first
      const uncachedDates: string[] = [];

      await Promise.all(
        dates.map(async (date) => {
          const cacheRef = adminDb
            .collection('parkSchedules')
            .doc(parkId)
            .collection('daily')
            .doc(date);

          const cached = await withTimeout(
            cacheRef.get().catch(() => null),
            SCHEDULE_CACHE_READ_TIMEOUT_MS
          );
          if (cached?.exists) {
            const data = cached.data() as CachedScheduleDoc;
            if (!isScheduleStale(data.fetchedAt)) {
              const cachedStatus = cachedOperatingStatus(data);
              if (cachedStatus) {
                parkMap.set(date, cachedStatus);
                return;
              }
            }
          }
          uncachedDates.push(date);
        })
      );

      // If we have uncached dates, fetch the full schedule from API (one call per park)
      if (uncachedDates.length > 0) {
        try {
          const res = await fetch(`${API_BASE}/entity/${parkId}/schedule`, {
            next: { revalidate: 0 },
            signal: AbortSignal.timeout(SCHEDULE_UPSTREAM_TIMEOUT_MS),
          });

          if (res.ok) {
            const apiData = (await res.json()) as WikiScheduleResponse;
            const fetchedAt = new Date().toISOString();

            for (const date of uncachedDates) {
              const dayEntries = (apiData.schedule || []).filter((e) => e.date === date);
              const segments: ScheduleSegment[] = dayEntries.map((entry) => ({
                type: mapSegmentType(entry.type),
                description: entry.description ?? null,
                openingTime: entry.openingTime,
                closingTime: entry.closingTime,
              }));

              const coverage = getScheduleCoverage(
                date,
                apiData.timezone,
                apiData.schedule || []
              );
              const hasData = coverage.hasData;
              const operatingSegments = segments.filter((s) => s.type === 'OPERATING');
              parkMap.set(date, {
                isOpen: hasData && operatingSegments.length > 0,
                hasData,
                segments,
                timezone: apiData.timezone,
              });

              // Deferred cache write via `after()` so a slow/cold write
              // can never block returning this park's results.
              const cacheRef = adminDb
                .collection('parkSchedules')
                .doc(parkId)
                .collection('daily')
                .doc(date);
              if (coverage.shouldCache) {
                scheduleBackgroundWrite(
                  cacheRef
                    .set({
                      parkId,
                      date,
                      timezone: apiData.timezone,
                      segments,
                      hasData,
                      fetchedAt,
                    } as CachedScheduleDoc)
                    .catch(() => {})
                );
              }
            }
          } else {
            // API failed — mark uncached dates as NO_DATA
            for (const date of uncachedDates) {
              parkMap.set(date, { isOpen: false, hasData: false });
            }
          }
        } catch {
          for (const date of uncachedDates) {
            parkMap.set(date, { isOpen: false, hasData: false });
          }
        }
      }
    })
  );

  return results;
}

function mapSegmentType(type: string): 'OPERATING' | 'TICKETED_EVENT' | 'EXTRA_HOURS' {
  switch (type) {
    case 'OPERATING':
      return 'OPERATING';
    case 'TICKETED_EVENT':
      return 'TICKETED_EVENT';
    case 'EXTRA_HOURS':
      return 'EXTRA_HOURS';
    default:
      return 'OPERATING';
  }
}
