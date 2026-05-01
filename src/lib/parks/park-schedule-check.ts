/**
 * Helper to check park operating status for a given date.
 * Checks Firestore cache first, falls back to ThemeParks Wiki API.
 */
import { adminDb } from '@/lib/firebase/admin';

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
}

interface CachedScheduleDoc {
  parkId: string;
  date: string;
  timezone?: string;
  segments: ScheduleSegment[];
  fetchedAt: string;
  stale?: boolean;
}

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
    // Check Firestore cache
    const cacheRef = adminDb
      .collection('parkSchedules')
      .doc(parkId)
      .collection('daily')
      .doc(date);

    const cached = await cacheRef.get();

    if (cached.exists) {
      const data = cached.data() as CachedScheduleDoc;
      if (!isScheduleStale(data.fetchedAt)) {
        const operatingSegments = data.segments.filter((s) => s.type === 'OPERATING');
        return {
          isOpen: operatingSegments.length > 0,
          hasData: true,
          segments: data.segments,
        };
      }
    }

    // Fetch from ThemeParks Wiki API
    const res = await fetch(`${API_BASE}/entity/${parkId}/schedule`, {
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      // If API fails but we have stale cache, use it
      if (cached.exists) {
        const data = cached.data() as CachedScheduleDoc;
        const operatingSegments = data.segments.filter((s) => s.type === 'OPERATING');
        return {
          isOpen: operatingSegments.length > 0,
          hasData: true,
          segments: data.segments,
        };
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

    // Cache in Firestore
    const cacheDoc: CachedScheduleDoc = {
      parkId,
      date,
      timezone: apiData.timezone,
      segments,
      fetchedAt: new Date().toISOString(),
    };
    await cacheRef.set(cacheDoc).catch((err) => {
      console.warn(`Failed to cache schedule for ${parkId}/${date}:`, err.message);
    });

    const operatingSegments = segments.filter((s) => s.type === 'OPERATING');
    return {
      isOpen: operatingSegments.length > 0,
      hasData: true,
      segments,
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

          const cached = await cacheRef.get().catch(() => null);
          if (cached?.exists) {
            const data = cached.data() as CachedScheduleDoc;
            if (!isScheduleStale(data.fetchedAt)) {
              const operatingSegments = data.segments.filter((s) => s.type === 'OPERATING');
              parkMap.set(date, {
                isOpen: operatingSegments.length > 0,
                hasData: true,
                segments: data.segments,
              });
              return;
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

              const operatingSegments = segments.filter((s) => s.type === 'OPERATING');
              parkMap.set(date, {
                isOpen: operatingSegments.length > 0,
                hasData: true,
                segments,
              });

              // Fire-and-forget cache write
              const cacheRef = adminDb
                .collection('parkSchedules')
                .doc(parkId)
                .collection('daily')
                .doc(date);
              cacheRef.set({
                parkId,
                date,
                timezone: apiData.timezone,
                segments,
                fetchedAt,
              } as CachedScheduleDoc).catch(() => {});
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
