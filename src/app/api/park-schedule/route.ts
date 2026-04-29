import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

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

interface ParkDaySchedule {
  parkId: string;
  date: string;
  timezone: string;
  segments: Array<{
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
  }>;
  fetchedAt: string;
  stale?: boolean;
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

  return { parkId, date, timezone, segments, fetchedAt };
}

async function fetchScheduleFromApi(parkId: string): Promise<ScheduleApiResponse> {
  const res = await fetch(`${API_BASE}/entity/${parkId}/schedule`, {
    next: { revalidate: 0 },
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

    // Check Firestore cache
    const cacheRef = adminDb
      .collection('parkSchedules')
      .doc(parkId)
      .collection('daily')
      .doc(date);

    const cached = await cacheRef.get();

    if (cached.exists) {
      const cachedData = cached.data() as ParkDaySchedule;
      if (isCacheFresh(cachedData.fetchedAt)) {
        return NextResponse.json(cachedData);
      }
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
        if (cached.exists) {
          const staleData = cached.data() as ParkDaySchedule;
          return NextResponse.json({ ...staleData, stale: true });
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

    // Cache in Firestore
    await cacheRef.set(schedule);

    return NextResponse.json(schedule);
  } catch (error) {
    console.error('Park schedule API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch park schedule' },
      { status: 500 }
    );
  }
}
