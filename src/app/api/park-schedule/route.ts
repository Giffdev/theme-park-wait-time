import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ScheduleDeadlineError,
  scheduleBackgroundWrite,
  withDeadline,
  withTimeout,
  SCHEDULE_CACHE_READ_TIMEOUT_MS,
  SCHEDULE_UPSTREAM_TIMEOUT_MS,
} from '@/lib/parks/schedule-timing';
import {
  getScheduleCoverage,
  isReusableScheduleCache,
  type CachedParkSchedule,
} from '@/lib/parks/park-schedule-check';

// Bounds the whole request well below Vercel's function `maxDuration` so a
// stalled stage fails fast with an explicit response instead of the
// platform silently killing the invocation after the client has already
// given up. See `schedule-timing.ts` for the root-cause writeup: this route
// previously had zero timeouts on any Firestore read/write or upstream
// fetch and was observed hanging 45+ seconds in production.
export const maxDuration = 20;
const ROUTE_DEADLINE_MS = 15_000;

const API_BASE = 'https://api.themeparks.wiki/v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface ScheduleEntry {
  date: string;
  type: string;
  description?: string | null;
  openingTime: string;
  closingTime: string;
  purchases?: Array<{
    name: string;
    type: string;
    price: { amount: number; currency: string; formatted: string };
    available: boolean;
  }>;
}

interface ScheduleApiResponse {
  id: string;
  name: string;
  timezone: string;
  schedule: ScheduleEntry[];
}

interface ParkDaySegment {
  type: 'OPERATING' | 'TICKETED_EVENT' | 'EXTRA_HOURS';
  description: string | null;
  openingTime: string;
  closingTime: string;
  purchases?: Array<{
    name: string;
    type: string;
    price: { amount: number; currency: string; formatted: string };
    available: boolean;
  }>;
}

interface ParkDaySchedule extends CachedParkSchedule<ParkDaySegment> {
  timezone: string;
  hasData: boolean;
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function isValidDateFormat(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
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

function transformSchedule(
  parkId: string,
  date: string,
  timezone: string,
  entries: ScheduleEntry[],
  fetchedAt: string
): ParkDaySchedule {
  const dayEntries = entries.filter((e) => e.date === date);

  const segments = dayEntries.map((entry) => ({
    type: mapSegmentType(entry.type),
    description: entry.description ?? null,
    openingTime: entry.openingTime,
    closingTime: entry.closingTime,
    ...(entry.purchases && entry.purchases.length > 0
      ? { purchases: entry.purchases }
      : {}),
  }));
  const { hasData } = getScheduleCoverage(date, timezone, entries);

  return { parkId, date, timezone, segments, hasData, fetchedAt };
}

async function fetchScheduleFromApi(parkId: string): Promise<ScheduleApiResponse> {
  const res = await fetch(`${API_BASE}/entity/${parkId}/schedule`, {
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(SCHEDULE_UPSTREAM_TIMEOUT_MS),
  });

  if (!res.ok) {
    const error = new Error(`ThemeParks API error: ${res.status}`) as Error & { status: number };
    error.status = res.status;
    throw error;
  }

  return res.json() as Promise<ScheduleApiResponse>;
}

function isCacheFresh(fetchedAt: string): boolean {
  const fetchedTime = new Date(fetchedAt).getTime();
  return Date.now() - fetchedTime < CACHE_TTL_MS;
}

function normalizeCachedSchedule(
  data: CachedParkSchedule<ParkDaySegment>
): ParkDaySchedule | null {
  if (!data.timezone || !isReusableScheduleCache(data)) return null;
  return {
    ...data,
    timezone: data.timezone,
    hasData: data.hasData ?? true,
  };
}

async function handleSchedule(parkId: string, date: string): Promise<NextResponse> {
  // Check Firestore cache. Bounded: a stalled read degrades to a cache miss
  // (`cached` stays `null`) rather than hanging the whole request.
  const cacheRef = adminDb
    .collection('parkSchedules')
    .doc(parkId)
    .collection('daily')
    .doc(date);

  const cached = await withTimeout(cacheRef.get(), SCHEDULE_CACHE_READ_TIMEOUT_MS);

  const cachedData = cached?.exists
    ? normalizeCachedSchedule(cached.data() as CachedParkSchedule<ParkDaySegment>)
    : null;

  if (cachedData && isCacheFresh(cachedData.fetchedAt)) {
    return NextResponse.json(cachedData);
  }

  // Fetch fresh data from ThemeParks Wiki
  let apiData: ScheduleApiResponse;
  try {
    apiData = await fetchScheduleFromApi(parkId);
  } catch (err: unknown) {
    const error = err as Error & { status?: number };
    const status = error.status || 0;

    // On 429 or 5xx, return stale cache if available
    if (status === 429 || status >= 500) {
      if (cachedData) {
        return NextResponse.json({ ...cachedData, stale: true });
      }
      return NextResponse.json(
        { error: 'Park schedule data is temporarily unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    throw error;
  }

  const fetchedAt = Timestamp.now().toDate().toISOString();
  const schedule = transformSchedule(
    parkId,
    date,
    apiData.timezone,
    apiData.schedule,
    fetchedAt
  );

  // Cache in Firestore, deferred via `after()` (request-lifecycle
  // scheduling) so a slow/cold write can never block the response.
  if (schedule.hasData) {
    scheduleBackgroundWrite(
      cacheRef.set(schedule).catch((err) => {
        console.warn(`Failed to cache park schedule for ${parkId}/${date}:`, (err as Error).message);
      })
    );
  }

  return NextResponse.json(schedule);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get('parkId');
    const date = searchParams.get('date') || getTodayDate();

    if (!parkId) {
      return NextResponse.json(
        { error: 'Missing required parameter: parkId' },
        { status: 400 }
      );
    }

    if (!isValidDateFormat(date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    return await withDeadline(
      handleSchedule(parkId, date),
      ROUTE_DEADLINE_MS,
      'park-schedule route'
    );
  } catch (error) {
    if (error instanceof ScheduleDeadlineError) {
      // Explicit, honest timeout status rather than hanging until Vercel
      // kills the invocation — matches the deadline pattern already proven
      // in /api/wait-times.
      console.error('Park schedule route exceeded its response deadline:', error.message);
      return NextResponse.json(
        { error: 'Park schedule request exceeded its response deadline.' },
        { status: 504 }
      );
    }
    console.error('Park schedule API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch park schedule' },
      { status: 500 }
    );
  }
}
