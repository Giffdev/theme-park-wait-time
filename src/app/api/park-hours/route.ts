import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

const API_BASE = 'https://api.themeparks.wiki/v1';

interface WikiScheduleEntry {
  date: string;
  type: string;
  openingTime: string;
  closingTime: string;
}

interface WikiScheduleResponse {
  id: string;
  name: string;
  timezone: string;
  schedule: WikiScheduleEntry[];
}

interface ParkHoursResult {
  parkId: string;
  slug: string;
  name: string;
  timezone: string;
  status: 'OPEN' | 'CLOSED' | 'NO_DATA' | 'ERROR';
  openingTime: string | null;
  closingTime: string | null;
}

/**
 * GET /api/park-hours
 * Returns current open/closed status and operating hours for ALL parks.
 * Designed for the parks listing page to show status at a glance.
 */
export async function GET() {
  try {
    const parksSnapshot = await adminDb.collection('parks').get();
    const parks = parksSnapshot.docs.map(
      (doc) => doc.data() as { id: string; name: string; slug: string; timezone: string }
    );

    // Fetch schedules in parallel for all parks
    const results: ParkHoursResult[] = await Promise.all(
      parks.map(async (park): Promise<ParkHoursResult> => {
        const base: Omit<ParkHoursResult, 'status' | 'openingTime' | 'closingTime'> = {
          parkId: park.id,
          slug: park.slug,
          name: park.name,
          timezone: park.timezone,
        };

        try {
          const res = await fetch(`${API_BASE}/entity/${park.id}/schedule`, {
            next: { revalidate: 300 },
          });

          if (!res.ok) {
            return { ...base, status: res.status === 404 ? 'NO_DATA' : 'ERROR', openingTime: null, closingTime: null };
          }

          const data = (await res.json()) as WikiScheduleResponse;
          const allEntries = data.schedule || [];

          // Get today in park's local timezone
          const now = new Date();
          const todayStr = now.toLocaleDateString('en-CA', { timeZone: park.timezone });

          const operatingEntry = allEntries.find(
            (e) => e.date === todayStr && e.type === 'OPERATING'
          );

          if (!operatingEntry) {
            return { ...base, status: 'CLOSED', openingTime: null, closingTime: null };
          }

          return {
            ...base,
            status: 'OPEN',
            openingTime: operatingEntry.openingTime,
            closingTime: operatingEntry.closingTime,
          };
        } catch (err) {
          console.error(`Failed to fetch schedule for ${park.name} (${park.id}):`, err);
          return { ...base, status: 'ERROR', openingTime: null, closingTime: null };
        }
      })
    );

    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      parks: results,
    });
  } catch (error) {
    console.error('Park hours batch API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch park hours' },
      { status: 500 }
    );
  }
}
