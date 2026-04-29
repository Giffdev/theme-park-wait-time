import { adminDb } from '../src/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

const API_BASE = 'https://api.themeparks.wiki/v1';

interface ParkDoc {
  id: string;
  name: string;
}

interface LiveEntry {
  id: string;
  name: string;
  entityType: string;
  status?: string;
  queue?: {
    STANDBY?: { waitTime: number | null };
    [key: string]: unknown;
  };
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

        const waitDoc = {
          attractionId: entry.id,
          attractionName: entry.name,
          status,
          waitMinutes,
          lastUpdated: entry.lastUpdated ? Timestamp.fromDate(new Date(entry.lastUpdated)) : fetchedAt,
          fetchedAt,
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
