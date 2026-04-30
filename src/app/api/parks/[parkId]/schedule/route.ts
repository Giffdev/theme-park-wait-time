import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

const API_BASE = 'https://api.themeparks.wiki/v1';

interface WikiScheduleEntry {
  date: string;
  type: string;
  openingTime: string;
  closingTime: string;
  description?: string;
}

interface WikiScheduleResponse {
  id: string;
  name: string;
  timezone: string;
  schedule: WikiScheduleEntry[];
}

type Props = { params: Promise<{ parkId: string }> };

export async function GET(_request: Request, { params }: Props) {
  const { parkId: slug } = await params;

  try {
    // Look up park by slug in Firestore
    const parksRef = adminDb.collection('parks');
    const snapshot = await parksRef.where('slug', '==', slug).limit(1).get();

    if (snapshot.empty) {
      return NextResponse.json(
        { error: 'Park not found', slug },
        { status: 404 }
      );
    }

    const parkDoc = snapshot.docs[0].data() as { id: string; name: string; timezone: string };
    const wikiId = parkDoc.id;
    const timezone = parkDoc.timezone;

    // Fetch schedule from ThemeParks Wiki API
    const res = await fetch(`${API_BASE}/entity/${wikiId}/schedule`, {
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (res.status === 404) {
      return NextResponse.json({
        parkId: wikiId,
        slug,
        name: parkDoc.name,
        timezone,
        status: 'NO_DATA',
        today: null,
        schedule: [],
      });
    }

    if (!res.ok) {
      console.error(`ThemeParks Wiki schedule API returned ${res.status} for ${wikiId}`);
      return NextResponse.json(
        { error: 'Failed to fetch schedule from upstream API' },
        { status: 502 }
      );
    }

    const data = (await res.json()) as WikiScheduleResponse;
    const allEntries = data.schedule || [];

    // Get today's date in the park's local timezone
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD

    // Filter today's entries
    const todayEntries = allEntries.filter((entry) => entry.date === todayStr);

    // Determine park status from today's entries
    const operatingEntry = todayEntries.find((e) => e.type === 'OPERATING');
    const isOpen = !!operatingEntry;

    return NextResponse.json({
      parkId: wikiId,
      slug,
      name: parkDoc.name,
      timezone,
      status: isOpen ? 'OPEN' : 'CLOSED',
      today: operatingEntry
        ? {
            date: todayStr,
            openingTime: operatingEntry.openingTime,
            closingTime: operatingEntry.closingTime,
          }
        : null,
      schedule: todayEntries.map((entry) => ({
        date: entry.date,
        type: entry.type,
        openingTime: entry.openingTime,
        closingTime: entry.closingTime,
        description: entry.description ?? null,
      })),
    });
  } catch (error) {
    console.error('Park schedule API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
