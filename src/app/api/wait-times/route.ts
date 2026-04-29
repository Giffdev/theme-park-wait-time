import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const API_BASE = 'https://api.themeparks.wiki/v1';

// --- Interfaces reflecting the full ThemeParks Wiki API response ---

interface QueuePrice {
  amount: number;
  currency: string;
  formatted: string;
}

interface ReturnTimeQueue {
  state: 'AVAILABLE' | 'TEMPORARILY_FULL' | 'FINISHED' | string;
  returnStart: string | null;
  returnEnd: string | null;
}

interface PaidReturnTimeQueue extends ReturnTimeQueue {
  price: QueuePrice | null;
}

interface BoardingGroupQueue {
  state: 'AVAILABLE' | 'PAUSED' | 'CLOSED' | string;
  currentGroupStart: number | null;
  currentGroupEnd: number | null;
  estimatedWait: number | null;
}

interface LiveEntryQueue {
  STANDBY?: { waitTime: number | null };
  RETURN_TIME?: ReturnTimeQueue;
  PAID_RETURN_TIME?: PaidReturnTimeQueue;
  BOARDING_GROUP?: BoardingGroupQueue;
}

interface ForecastEntry {
  time: string;
  waitTime: number;
  percentage: number;
}

interface OperatingHoursEntry {
  type: string;
  startTime: string;
  endTime: string;
}

interface LiveEntry {
  id: string;
  name: string;
  entityType: string;
  status?: string;
  queue?: LiveEntryQueue;
  forecast?: ForecastEntry[];
  operatingHours?: OperatingHoursEntry[];
  lastUpdated?: string;
}

// --- Stale data cache for resilience ---

interface CachedParkData {
  liveData: LiveEntry[];
  fetchedAt: string;
}

const parkDataCache: Record<string, CachedParkData> = {};

async function fetchLiveDataForPark(parkId: string): Promise<{ liveData: LiveEntry[]; stale: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/entity/${parkId}/live`, { next: { revalidate: 60 } });

    if (res.status === 429 || res.status >= 500) {
      console.warn(`ThemeParks API returned ${res.status} for park ${parkId}, serving stale cache`);
      const cached = parkDataCache[parkId];
      if (cached) {
        return { liveData: cached.liveData, stale: true };
      }
      throw new Error(`ThemeParks API error ${res.status} and no cached data available`);
    }

    if (!res.ok) {
      throw new Error(`ThemeParks API error: ${res.status}`);
    }

    const data = (await res.json()) as { liveData: LiveEntry[] };
    const liveData = data.liveData || [];

    // Update cache on success
    parkDataCache[parkId] = {
      liveData,
      fetchedAt: new Date().toISOString(),
    };

    return { liveData, stale: false };
  } catch (error) {
    // Network errors — try stale cache
    const cached = parkDataCache[parkId];
    if (cached) {
      console.warn(`ThemeParks API unreachable for park ${parkId}, serving stale cache`);
      return { liveData: cached.liveData, stale: true };
    }
    throw error;
  }
}

function formatWaitTimeEntry(entry: LiveEntry, fetchedAt: Timestamp) {
  return {
    attractionId: entry.id,
    attractionName: entry.name,
    status: entry.status || 'UNKNOWN',
    waitMinutes: entry.queue?.STANDBY?.waitTime ?? null,
    lastUpdated: entry.lastUpdated || null,
    fetchedAt: fetchedAt.toDate().toISOString(),
    // Full queue data (virtual queues, paid return time, boarding groups)
    queue: entry.queue
      ? {
          RETURN_TIME: entry.queue.RETURN_TIME
            ? {
                state: entry.queue.RETURN_TIME.state,
                returnStart: entry.queue.RETURN_TIME.returnStart ?? null,
                returnEnd: entry.queue.RETURN_TIME.returnEnd ?? null,
              }
            : null,
          PAID_RETURN_TIME: entry.queue.PAID_RETURN_TIME
            ? {
                state: entry.queue.PAID_RETURN_TIME.state,
                returnStart: entry.queue.PAID_RETURN_TIME.returnStart ?? null,
                returnEnd: entry.queue.PAID_RETURN_TIME.returnEnd ?? null,
                price: entry.queue.PAID_RETURN_TIME.price ?? null,
              }
            : null,
          BOARDING_GROUP: entry.queue.BOARDING_GROUP
            ? {
                state: entry.queue.BOARDING_GROUP.state,
                currentGroupStart: entry.queue.BOARDING_GROUP.currentGroupStart ?? null,
                currentGroupEnd: entry.queue.BOARDING_GROUP.currentGroupEnd ?? null,
                estimatedWait: entry.queue.BOARDING_GROUP.estimatedWait ?? null,
              }
            : null,
        }
      : null,
    // Hourly wait time forecast (~60-70% of attractions have this)
    forecast: entry.forecast?.length
      ? entry.forecast.map((f) => ({
          time: f.time,
          waitTime: f.waitTime,
          percentage: f.percentage,
        }))
      : null,
    // Per-attraction operating hours
    operatingHours: entry.operatingHours?.length
      ? entry.operatingHours.map((h) => ({
          type: h.type,
          startTime: h.startTime,
          endTime: h.endTime,
        }))
      : null,
  };
}

/** Archive a historical snapshot for each attraction (one doc per attraction per day). */
async function archiveHistoricalSnapshot(
  parkId: string,
  liveData: LiveEntry[],
  fetchedAt: Timestamp
) {
  const now = fetchedAt.toDate();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const timeStr = now.toISOString();

  const BATCH_SIZE = 499;
  for (let i = 0; i < liveData.length; i += BATCH_SIZE) {
    const batch = adminDb.batch();
    const chunk = liveData.slice(i, i + BATCH_SIZE);
    for (const entry of chunk) {
      const ref = adminDb
        .collection('waitTimeHistory')
        .doc(parkId)
        .collection('daily')
        .doc(dateStr)
        .collection('attractions')
        .doc(entry.id);

      batch.set(
        ref,
        {
          snapshots: FieldValue.arrayUnion({
            time: timeStr,
            waitMinutes: entry.queue?.STANDBY?.waitTime ?? null,
          }),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get('parkId');

    const fetchedAt = Timestamp.now();
    const results: Record<string, unknown[]> = {};
    let isStale = false;

    if (parkId) {
      const { liveData, stale } = await fetchLiveDataForPark(parkId);
      isStale = stale;
      const formatted = liveData.map((entry) => formatWaitTimeEntry(entry, fetchedAt));
      results[parkId] = formatted;

      // Cache in Firestore
      const BATCH_SIZE = 499;
      for (let i = 0; i < liveData.length; i += BATCH_SIZE) {
        const batch = adminDb.batch();
        const chunk = liveData.slice(i, i + BATCH_SIZE);
        for (const entry of chunk) {
          const ref = adminDb
            .collection('waitTimes')
            .doc(parkId)
            .collection('current')
            .doc(entry.id);
          batch.set(ref, formatWaitTimeEntry(entry, fetchedAt), { merge: true });
        }
        await batch.commit();
      }

      // Archive historical snapshot
      await archiveHistoricalSnapshot(parkId, liveData, fetchedAt);
    } else {
      // Fetch for all parks
      const parksSnapshot = await adminDb.collection('parks').get();
      const parks = parksSnapshot.docs.map((doc) => doc.data() as { id: string; name: string });

      for (const park of parks) {
        try {
          const { liveData, stale } = await fetchLiveDataForPark(park.id);
          if (stale) isStale = true;
          results[park.id] = liveData.map((entry) => formatWaitTimeEntry(entry, fetchedAt));
          // Archive historical snapshot for each park
          await archiveHistoricalSnapshot(park.id, liveData, fetchedAt);
        } catch {
          results[park.id] = [];
        }
      }
    }

    return NextResponse.json({
      fetchedAt: fetchedAt.toDate().toISOString(),
      stale: isStale,
      parks: results,
    });
  } catch (error) {
    console.error('Wait times API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wait times' },
      { status: 500 }
    );
  }
}
