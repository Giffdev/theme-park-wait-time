import { adminDb } from '../src/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

const API_BASE = 'https://api.themeparks.wiki/v1';

interface ParkDoc {
  id: string;
  name: string;
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

interface ReturnTimeQueue {
  state: string;
  returnStart: string | null;
  returnEnd: string | null;
}

interface PaidReturnTimeQueue extends ReturnTimeQueue {
  price: { amount: number; currency: string; formatted: string } | null;
}

interface BoardingGroupQueue {
  state: string;
  currentGroupStart: number | null;
  currentGroupEnd: number | null;
  estimatedWait: number | null;
}

interface LiveEntry {
  id: string;
  name: string;
  entityType: string;
  status?: string;
  queue?: {
    STANDBY?: { waitTime: number | null };
    RETURN_TIME?: ReturnTimeQueue;
    PAID_RETURN_TIME?: PaidReturnTimeQueue;
    BOARDING_GROUP?: BoardingGroupQueue;
  };
  forecast?: ForecastEntry[];
  operatingHours?: OperatingHoursEntry[];
  lastUpdated?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function fetchAndStoreWaitTimes(): Promise<void> {
  // Read all parks from Firestore
  const parksSnapshot = await adminDb.collection('parks').get();
  const parks: ParkDoc[] = parksSnapshot.docs.map((doc) => doc.data() as ParkDoc);

  console.log(`Found ${parks.length} parks in Firestore`);

  for (const park of parks) {
    console.log(`\nFetching live data for: ${park.name}...`);

    let liveData: { liveData: LiveEntry[] };
    try {
      liveData = await fetchJson<{ liveData: LiveEntry[] }>(
        `${API_BASE}/entity/${park.id}/live`
      );
    } catch (e) {
      console.warn(`  Warning: Could not fetch live data for ${park.name}: ${e}`);
      continue;
    }

    const entries = liveData.liveData || [];
    const fetchedAt = Timestamp.now();
    const historyTimestamp = Date.now().toString();

    console.log(`  Got ${entries.length} live entries`);

    // Batch write current wait times
    const BATCH_SIZE = 499;
    let written = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = adminDb.batch();
      const chunk = entries.slice(i, i + BATCH_SIZE);

      for (const entry of chunk) {
        const waitMinutes = entry.queue?.STANDBY?.waitTime ?? null;
        const status = entry.status || 'UNKNOWN';

        const waitDoc: Record<string, unknown> = {
          attractionId: entry.id,
          attractionName: entry.name,
          status,
          waitMinutes,
          lastUpdated: entry.lastUpdated || null,
          fetchedAt: fetchedAt.toDate().toISOString(),
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
          forecast: entry.forecast?.length
            ? entry.forecast.map((f) => ({
                time: f.time,
                waitTime: f.waitTime,
                percentage: f.percentage,
              }))
            : null,
          operatingHours: entry.operatingHours?.length
            ? entry.operatingHours.map((h) => ({
                type: h.type,
                startTime: h.startTime,
                endTime: h.endTime,
              }))
            : null,
        };

        // Write to current subcollection
        const currentRef = adminDb
          .collection('waitTimes')
          .doc(park.id)
          .collection('current')
          .doc(entry.id);
        batch.set(currentRef, waitDoc, { merge: true });

        // Write to history subcollection
        const historyRef = adminDb
          .collection('waitTimes')
          .doc(park.id)
          .collection('history')
          .doc(`${historyTimestamp}_${entry.id}`);
        batch.set(historyRef, waitDoc);

        written++;
      }

      await batch.commit();
    }

    console.log(`  ✓ Wrote ${written} wait time entries`);

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log(`\n✓ Wait time fetch complete!`);
}

async function main(): Promise<void> {
  try {
    await fetchAndStoreWaitTimes();
  } catch (error) {
    console.error('Fetch wait times failed:', error);
    process.exit(1);
  }
}

main();
