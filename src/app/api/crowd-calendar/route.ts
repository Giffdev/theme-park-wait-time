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
import type { ForecastAggregate } from '@/types/queue';

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
        // Validate cache quality: at least 50% of days should have non-zero waits
        const cachedDaysWithData = cachedData.days?.filter(
          (d) => d.parks?.some((p) => p.avgWaitMinutes > 0)
        ) ?? [];
        const cacheHasQuality = cachedDaysWithData.length >= Math.ceil((cachedData.days?.length ?? 1) * 0.5);
        if (Date.now() - generatedTime < CACHE_TTL_MS && cacheHasQuality) {
          return NextResponse.json(cachedData);
        }
      }

      // Compute from aggregate + live forecast data
      if (family) {
        const rawDays = await computeFamilyCrowdDays(family.parks, month);

        // Check if we got meaningful data — aggregates cover most days
        const daysWithData = rawDays.filter((d) => d.parks.some((p) => p.avgWaitMinutes > 0));
        const hasRealData = daysWithData.length >= Math.ceil(rawDays.length * 0.5);

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

      // Serve stale cache if available AND quality
      if (cached.exists) {
        const staleData = cached.data() as FamilyCrowdMonth;
        const staleDaysWithData = staleData.days?.filter(
          (d) => d.parks?.some((p) => p.avgWaitMinutes > 0)
        ) ?? [];
        if (staleDaysWithData.length >= Math.ceil((staleData.days?.length ?? 1) * 0.5)) {
          return NextResponse.json({ ...staleData, stale: true });
        }
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
 * Uses historical aggregate data from forecastAggregates/{parkId}/byDayOfWeek/{dow}/attractions/
 * for all days, with live forecast data from waitTimes/{parkId}/current/ taking priority for today.
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

  const todayStr = new Date().toISOString().slice(0, 10);

  // For each park, fetch aggregate data per day-of-week (0-6) and live data for today
  const parkAggregates = new Map<string, Map<number, ForecastAggregate[]>>();
  const parkLiveForecasts = new Map<string, Map<string, ForecastEntry[]>>();

  await Promise.all(
    parks.map(async (park) => {
      // Fetch all 7 day-of-week aggregate collections in parallel
      const dowAggregates = new Map<number, ForecastAggregate[]>();
      const dowFetches = Array.from({ length: 7 }, (_, dow) =>
        adminDb
          .collection('forecastAggregates')
          .doc(park.parkId)
          .collection('byDayOfWeek')
          .doc(String(dow))
          .collection('attractions')
          .get()
          .then((snap) => {
            const aggregates: ForecastAggregate[] = [];
            for (const doc of snap.docs) {
              const data = doc.data() as ForecastAggregate;
              // Only use aggregates with sufficient sample size
              if (data.totalSamples >= 15) {
                aggregates.push(data);
              }
            }
            dowAggregates.set(dow, aggregates);
          })
          .catch((err) => {
            console.warn(`Failed to fetch aggregates for park ${park.parkId} dow ${dow}:`, err.message);
            dowAggregates.set(dow, []);
          })
      );

      // Fetch live forecast data (for today only)
      const liveFetch = adminDb
        .collection('waitTimes')
        .doc(park.parkId)
        .collection('current')
        .get()
        .then((snap) => {
          const attractionMap = new Map<string, ForecastEntry[]>();
          for (const doc of snap.docs) {
            const data = doc.data();
            const forecast = data.forecast as ForecastEntry[] | null;
            if (!forecast || forecast.length === 0) continue;

            const todayEntries = forecast.filter((e) => e.time.startsWith(todayStr));
            if (todayEntries.length > 0) {
              attractionMap.set(doc.id, todayEntries);
            }
          }
          return attractionMap;
        })
        .catch((err) => {
          console.warn(`Failed to fetch live forecast for park ${park.parkId}:`, err.message);
          return new Map<string, ForecastEntry[]>();
        });

      const [liveData] = await Promise.all([liveFetch, ...dowFetches]);
      parkAggregates.set(park.parkId, dowAggregates);
      parkLiveForecasts.set(park.parkId, liveData);
    })
  );

  // Build FamilyCrowdDay for each date
  const familyDays: FamilyCrowdDay[] = [];

  for (const date of dates) {
    const isToday = date === todayStr;
    const dayOfWeek = new Date(date + 'T12:00:00').getDay();

    const parkCrowdDays = parks.map((park) => {
      // For today, prefer live forecast data if available
      if (isToday) {
        const liveData = parkLiveForecasts.get(park.parkId);
        if (liveData && liveData.size > 0) {
          return computeParkCrowdDay(park.parkId, park.parkName, liveData);
        }
      }

      // Use historical aggregates for this day-of-week
      const dowMap = parkAggregates.get(park.parkId);
      const aggregates = dowMap?.get(dayOfWeek) ?? [];

      if (aggregates.length === 0) {
        // No aggregate data — return zero (will trigger placeholder fallback)
        return computeParkCrowdDay(park.parkId, park.parkName, new Map());
      }

      // Convert aggregates to ForecastEntry[] per attraction for computeParkCrowdDay
      const attractionForecasts = new Map<string, ForecastEntry[]>();
      for (const agg of aggregates) {
        const entries: ForecastEntry[] = [];
        for (const [hour, stats] of Object.entries(agg.hourlyAverages)) {
          if (stats.sampleCount >= 3) {
            entries.push({
              time: `${date}T${hour.padStart(2, '0')}:00:00`,
              waitTime: stats.avgWait,
            });
          }
        }
        if (entries.length > 0) {
          attractionForecasts.set(agg.attractionId, entries);
        }
      }

      return computeParkCrowdDay(park.parkId, park.parkName, attractionForecasts);
    });

    familyDays.push(buildFamilyCrowdDay(date, parkCrowdDays));
  }

  return familyDays;
}
