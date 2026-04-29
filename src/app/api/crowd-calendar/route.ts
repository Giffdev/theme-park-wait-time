import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  getParkFamily,
  computeParkCrowdDay,
  buildFamilyCrowdDay,
  computeBestPlan,
  type ForecastEntry,
} from '@/lib/crowd-calendar';
import { PARK_FAMILIES } from '@/lib/constants';
import type { FamilyCrowdMonth, CrowdDay, CrowdDayPark } from '@/types/crowd-calendar';
import type { FamilyCrowdDay } from '@/types/parkFamily';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * GET /api/crowd-calendar?familyId={id}&month={YYYY-MM}
 *
 * Returns FamilyCrowdMonth data with best plan recommendation.
 * Derives crowd levels from forecast data in Firestore.
 * Falls back to deterministic placeholder data when Firestore is unavailable.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const familyId = searchParams.get('familyId');
    const month = searchParams.get('month');

    if (!familyId || !month) {
      return NextResponse.json(
        { error: 'Missing required parameters: familyId, month (YYYY-MM)' },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: 'Invalid month format. Use YYYY-MM.' },
        { status: 400 }
      );
    }

    const family = getParkFamily(familyId);
    const constantsFamily = PARK_FAMILIES.find((f) => f.id === familyId);
    if (!family && !constantsFamily) {
      return NextResponse.json(
        { error: `Unknown park family: ${familyId}` },
        { status: 404 }
      );
    }

    // Try Firestore-based computation
    try {
      const cacheRef = adminDb
        .collection('crowdCalendar')
        .doc(familyId)
        .collection('monthly')
        .doc(month);

      const cached = await cacheRef.get();
      if (cached.exists) {
        const cachedData = cached.data() as FamilyCrowdMonth & { generatedAt?: string };
        const generatedTime = new Date(cachedData.generatedAt ?? 0).getTime();
        if (Date.now() - generatedTime < CACHE_TTL_MS) {
          return NextResponse.json(cachedData);
        }
      }

      // Compute from live forecast data
      if (family) {
        const rawDays = await computeFamilyCrowdDays(family.parks, month);

        // Check if we got meaningful data (non-zero waits)
        const hasRealData = rawDays.some((d) => d.parks.some((p) => p.avgWaitMinutes > 0));

        if (hasRealData) {
          const days = rawDays.map(toCrowdDay);
          const bestPlan = computeBestPlan(rawDays, 3);

          const response: FamilyCrowdMonth = {
            familyId,
            familyName: family.name,
            month,
            parks: family.parks.map((p) => ({ id: p.parkId, name: p.parkName })),
            days,
            bestPlan,
          };

          // Cache in Firestore
          await cacheRef.set({ ...response, generatedAt: new Date().toISOString() });
          return NextResponse.json(response);
        }
      }

      // Serve stale cache if available
      if (cached.exists) {
        return NextResponse.json({ ...(cached.data() as FamilyCrowdMonth), stale: true });
      }
    } catch (error) {
      console.warn('Firestore unavailable, using placeholder data:', (error as Error).message);
    }

    // Fallback: generate deterministic placeholder data
    const response = generatePlaceholderData(familyId, month);
    return NextResponse.json(response);
  } catch (error) {
    console.error('Crowd calendar API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch crowd calendar' },
      { status: 500 }
    );
  }
}

/** Transform FamilyCrowdDay (aggregation type) to CrowdDay (UI type). */
function toCrowdDay(fcd: FamilyCrowdDay): CrowdDay {
  const parks: CrowdDayPark[] = fcd.parks.map((p) => ({
    parkId: p.parkId,
    parkName: p.parkName,
    crowdLevel: p.crowdLevel as 1 | 2 | 3 | 4,
    avgWaitMinutes: p.avgWaitMinutes,
  }));
  const avg = parks.length > 0
    ? parks.reduce((sum, p) => sum + p.crowdLevel, 0) / parks.length
    : 1;
  const aggregateCrowdLevel = Math.max(1, Math.min(4, Math.round(avg))) as 1 | 2 | 3 | 4;
  return { date: fcd.date, parks, aggregateCrowdLevel };
}

/** Generate deterministic placeholder data for development. */
function generatePlaceholderData(familyId: string, monthStr: string): FamilyCrowdMonth {
  const family = PARK_FAMILIES.find((f) => f.id === familyId) ?? PARK_FAMILIES[0];
  const [year, month] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  const days: CrowdDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayOfWeek = new Date(year, month - 1, d).getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    const parks: CrowdDayPark[] = family.parks.map((park, pi) => {
      const base = ((d * 7 + pi * 13 + month * 3) % 4) + 1;
      const weekendBoost = isWeekend ? 1 : 0;
      const crowdLevel = Math.min(4, Math.max(1, base + weekendBoost - (d % 3 === 0 ? 1 : 0))) as 1 | 2 | 3 | 4;
      const avgWaitMinutes = crowdLevel * 15 + ((d * pi) % 10);
      return { parkId: park.id, parkName: park.name, crowdLevel, avgWaitMinutes };
    });

    const aggregateCrowdLevel = Math.round(
      parks.reduce((sum, p) => sum + p.crowdLevel, 0) / parks.length
    ) as 1 | 2 | 3 | 4;
    days.push({ date: dateStr, parks, aggregateCrowdLevel });
  }

  // Best 3-day plan
  const sortedDays = [...days].sort((a, b) => a.aggregateCrowdLevel - b.aggregateCrowdLevel);
  const bestDays = sortedDays.slice(0, 3);
  const usedParks = new Set<string>();
  const bestPlan = {
    days: bestDays.map((day) => {
      const bestPark = day.parks
        .filter((p) => !usedParks.has(p.parkId))
        .sort((a, b) => a.crowdLevel - b.crowdLevel)[0] ?? day.parks[0];
      usedParks.add(bestPark.parkId);
      return { date: day.date, parkId: bestPark.parkId, parkName: bestPark.parkName, crowdLevel: bestPark.crowdLevel };
    }).sort((a, b) => a.date.localeCompare(b.date)),
  };

  return {
    familyId: family.id,
    familyName: family.name,
    month: monthStr,
    parks: family.parks.map((p) => ({ id: p.id, name: p.name })),
    days,
    bestPlan,
  };
}

/**
 * Compute crowd days for all parks in a family for the given month.
 * Reads forecast data from waitTimes/{parkId}/current/{attractionId} docs.
 */
async function computeFamilyCrowdDays(
  parks: Array<{ parkId: string; parkName: string }>,
  month: string
): Promise<FamilyCrowdDay[]> {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${month}-${String(d).padStart(2, '0')}`);
  }

  // Fetch forecast data for all parks in parallel
  const parkDateForecasts = new Map<string, Map<string, Map<string, ForecastEntry[]>>>();

  await Promise.all(
    parks.map(async (park) => {
      const attractionsSnapshot = await adminDb
        .collection('waitTimes')
        .doc(park.parkId)
        .collection('current')
        .get();

      const dateForecasts = new Map<string, Map<string, ForecastEntry[]>>();

      for (const doc of attractionsSnapshot.docs) {
        const data = doc.data();
        const forecast = data.forecast as ForecastEntry[] | null;
        if (!forecast || forecast.length === 0) continue;

        for (const entry of forecast) {
          const entryDate = entry.time.slice(0, 10);
          if (!entryDate.startsWith(month)) continue;

          if (!dateForecasts.has(entryDate)) {
            dateForecasts.set(entryDate, new Map());
          }
          const dayMap = dateForecasts.get(entryDate)!;
          if (!dayMap.has(doc.id)) {
            dayMap.set(doc.id, []);
          }
          dayMap.get(doc.id)!.push(entry);
        }
      }

      parkDateForecasts.set(park.parkId, dateForecasts);
    })
  );

  // Build FamilyCrowdDay for each date
  const familyDays: FamilyCrowdDay[] = [];

  for (const date of dates) {
    const parkCrowdDays = parks.map((park) => {
      const dateForecasts = parkDateForecasts.get(park.parkId);
      const attractionMap = dateForecasts?.get(date) ?? new Map<string, ForecastEntry[]>();
      return computeParkCrowdDay(park.parkId, park.parkName, attractionMap);
    });

    familyDays.push(buildFamilyCrowdDay(date, parkCrowdDays));
  }

  return familyDays;
}
