import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

const API_BASE = 'https://api.themeparks.wiki/v1';

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

async function fetchLiveDataForPark(parkId: string) {
  const res = await fetch(`${API_BASE}/entity/${parkId}/live`, { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(`ThemeParks API error: ${res.status}`);
  }
  const data = (await res.json()) as { liveData: LiveEntry[] };
  return data.liveData || [];
}

function formatWaitTimeEntry(entry: LiveEntry, fetchedAt: Timestamp) {
  return {
    attractionId: entry.id,
    attractionName: entry.name,
    status: entry.status || 'UNKNOWN',
    waitMinutes: entry.queue?.STANDBY?.waitTime ?? null,
    lastUpdated: entry.lastUpdated || null,
    fetchedAt: fetchedAt.toDate().toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parkId = searchParams.get('parkId');

    const fetchedAt = Timestamp.now();
    const results: Record<string, unknown[]> = {};

    if (parkId) {
      // Fetch for a specific park
      const liveData = await fetchLiveDataForPark(parkId);
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
    } else {
      // Fetch for all parks
      const parksSnapshot = await adminDb.collection('parks').get();
      const parks = parksSnapshot.docs.map((doc) => doc.data() as { id: string; name: string });

      for (const park of parks) {
        try {
          const liveData = await fetchLiveDataForPark(park.id);
          results[park.id] = liveData.map((entry) => formatWaitTimeEntry(entry, fetchedAt));
        } catch {
          results[park.id] = [];
        }
      }
    }

    return NextResponse.json({
      fetchedAt: fetchedAt.toDate().toISOString(),
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
