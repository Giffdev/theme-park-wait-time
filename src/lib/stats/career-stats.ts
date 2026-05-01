/**
 * Career Stats Aggregation
 *
 * Client-side utilities for computing all-time and date-filtered statistics
 * from a user's ride logs. Designed to be called by UI components with
 * pre-fetched RideLog arrays — no Firestore calls happen here.
 */

import type { RideLog } from '@/types/ride-log';

// ---------------------------------------------------------------------------
// Return Types
// ---------------------------------------------------------------------------

export interface CareerStats {
  totalRides: number;
  totalParksVisited: number;
  averageWaitMinutes: number | null;
  mostVisitedPark: { parkName: string; rideCount: number } | null;
  favoriteAttraction: { attractionName: string; parkName: string; rideCount: number } | null;
  topAttractions: AttractionRideCount[];
  rideDistributionByPark: Record<string, number>;
}

export interface AttractionRideCount {
  attractionName: string;
  parkName: string;
  rideCount: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

// ---------------------------------------------------------------------------
// Core Computation
// ---------------------------------------------------------------------------

/**
 * Compute career-wide stats from an array of ride logs.
 * Optionally filter by date range before computing.
 */
export function computeCareerStats(
  rideLogs: RideLog[],
  dateRange?: DateRange
): CareerStats {
  const filtered = dateRange ? filterByDateRange(rideLogs, dateRange) : rideLogs;

  const totalRides = filtered.length;

  if (totalRides === 0) {
    return {
      totalRides: 0,
      totalParksVisited: 0,
      averageWaitMinutes: null,
      mostVisitedPark: null,
      favoriteAttraction: null,
      topAttractions: [],
      rideDistributionByPark: {},
    };
  }

  // Unique parks
  const parkSet = new Set<string>();
  filtered.forEach((r) => parkSet.add(r.parkName));
  const totalParksVisited = parkSet.size;

  // Average wait time (exclude nulls — unknown waits)
  const waits = filtered
    .map((r) => r.waitTimeMinutes)
    .filter((w): w is number => w !== null);
  const averageWaitMinutes =
    waits.length > 0
      ? Math.round((waits.reduce((sum, w) => sum + w, 0) / waits.length) * 10) / 10
      : null;

  // Ride distribution by park
  const rideDistributionByPark = computeRideDistributionByPark(filtered);

  // Most visited park
  const mostVisitedPark = computeMostVisitedPark(rideDistributionByPark);

  // Attraction frequency
  const attractionCounts = computeAttractionCounts(filtered);

  // Favorite attraction (most-ridden overall)
  const favoriteAttraction = attractionCounts.length > 0 ? attractionCounts[0] : null;

  // Top 5
  const topAttractions = attractionCounts.slice(0, 5);

  return {
    totalRides,
    totalParksVisited,
    averageWaitMinutes,
    mostVisitedPark,
    favoriteAttraction,
    topAttractions,
    rideDistributionByPark,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Filter ride logs to a specific date range (inclusive). */
export function filterByDateRange(rideLogs: RideLog[], range: DateRange): RideLog[] {
  const startTime = range.start.getTime();
  const endTime = range.end.getTime();
  return rideLogs.filter((r) => {
    const t = r.rodeAt.getTime();
    return t >= startTime && t <= endTime;
  });
}

/** Count rides per park, returned as a name→count map. */
export function computeRideDistributionByPark(rideLogs: RideLog[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const log of rideLogs) {
    map[log.parkName] = (map[log.parkName] ?? 0) + 1;
  }
  return map;
}

/** Determine the park with the most rides. */
function computeMostVisitedPark(
  distribution: Record<string, number>
): { parkName: string; rideCount: number } | null {
  let best: { parkName: string; rideCount: number } | null = null;
  for (const [parkName, rideCount] of Object.entries(distribution)) {
    if (!best || rideCount > best.rideCount) {
      best = { parkName, rideCount };
    }
  }
  return best;
}

/** Rank attractions by ride count (descending). */
export function computeAttractionCounts(rideLogs: RideLog[]): AttractionRideCount[] {
  const map = new Map<string, { attractionName: string; parkName: string; count: number }>();
  for (const log of rideLogs) {
    const key = `${log.parkName}::${log.attractionName}`;
    const existing = map.get(key);
    if (existing) {
      existing.count++;
    } else {
      map.set(key, { attractionName: log.attractionName, parkName: log.parkName, count: 1 });
    }
  }
  return Array.from(map.values())
    .map((v) => ({ attractionName: v.attractionName, parkName: v.parkName, rideCount: v.count }))
    .sort((a, b) => b.rideCount - a.rideCount);
}
