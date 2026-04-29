import { CrowdLevel, type ParkCrowdDay, type FamilyCrowdDay, type BestPlan, type BestPlanDay } from '@/types/parkFamily';

/**
 * Crowd level thresholds based on average wait time in minutes.
 * <20min = Low, 20-35 = Moderate, 35-50 = High, 50+ = Extreme
 */
const THRESHOLDS = {
  LOW_MAX: 20,
  MODERATE_MAX: 35,
  HIGH_MAX: 50,
} as const;

/** Derive crowd level from average wait time in minutes. */
export function deriveCrowdLevel(avgWaitMinutes: number): CrowdLevel {
  if (avgWaitMinutes < THRESHOLDS.LOW_MAX) return CrowdLevel.Low;
  if (avgWaitMinutes < THRESHOLDS.MODERATE_MAX) return CrowdLevel.Moderate;
  if (avgWaitMinutes < THRESHOLDS.HIGH_MAX) return CrowdLevel.High;
  return CrowdLevel.Extreme;
}

/**
 * Forecast entry from ThemeParks Wiki or Firestore.
 */
export interface ForecastEntry {
  time: string;
  waitTime: number;
}

/**
 * Compute the daily average wait time from hourly forecast entries.
 */
export function computeDailyAverage(forecasts: ForecastEntry[]): number {
  if (forecasts.length === 0) return 0;
  const sum = forecasts.reduce((acc, f) => acc + f.waitTime, 0);
  return Math.round((sum / forecasts.length) * 10) / 10;
}

/**
 * Given forecast data for all attractions in a park for a given day,
 * compute the park-level crowd day data.
 */
export function computeParkCrowdDay(
  parkId: string,
  parkName: string,
  attractionForecasts: Map<string, ForecastEntry[]>
): ParkCrowdDay {
  const dailyAverages: number[] = [];

  for (const forecasts of attractionForecasts.values()) {
    if (forecasts.length > 0) {
      dailyAverages.push(computeDailyAverage(forecasts));
    }
  }

  const avgWaitMinutes =
    dailyAverages.length > 0
      ? Math.round((dailyAverages.reduce((a, b) => a + b, 0) / dailyAverages.length) * 10) / 10
      : 0;

  return {
    parkId,
    parkName,
    crowdLevel: deriveCrowdLevel(avgWaitMinutes),
    avgWaitMinutes,
  };
}

/**
 * Build a FamilyCrowdDay from per-park crowd data.
 */
export function buildFamilyCrowdDay(date: string, parks: ParkCrowdDay[]): FamilyCrowdDay {
  return { date, parks };
}

/**
 * Best Plan algorithm: Given family crowd days and a number of trip days,
 * find the optimal assignment of parks to days minimizing total crowd exposure.
 *
 * Strategy: Sort all (day, park) combos by crowd level, then greedily pick
 * lowest-crowd options with unique dates and prefer unique parks.
 */
export function computeBestPlan(
  days: FamilyCrowdDay[],
  numDays: number = 3
): BestPlan {
  if (days.length === 0) return { days: [] };

  const candidates: Array<{
    date: string;
    parkId: string;
    parkName: string;
    crowdLevel: CrowdLevel;
    avgWait: number;
  }> = [];

  for (const day of days) {
    for (const park of day.parks) {
      candidates.push({
        date: day.date,
        parkId: park.parkId,
        parkName: park.parkName,
        crowdLevel: park.crowdLevel,
        avgWait: park.avgWaitMinutes,
      });
    }
  }

  // Sort by crowd level ascending, then avgWait as tiebreaker
  candidates.sort((a, b) => {
    if (a.crowdLevel !== b.crowdLevel) return a.crowdLevel - b.crowdLevel;
    return a.avgWait - b.avgWait;
  });

  const selectedDays = new Set<string>();
  const selectedParks = new Set<string>();
  const result: BestPlanDay[] = [];

  // First pass: unique parks on unique days
  for (const c of candidates) {
    if (result.length >= numDays) break;
    if (selectedDays.has(c.date)) continue;
    if (selectedParks.has(c.parkId)) continue;

    result.push({
      date: c.date,
      parkId: c.parkId,
      parkName: c.parkName,
      crowdLevel: c.crowdLevel,
    });
    selectedDays.add(c.date);
    selectedParks.add(c.parkId);
  }

  // Second pass: allow park repeats if not enough days found
  if (result.length < numDays) {
    for (const c of candidates) {
      if (result.length >= numDays) break;
      if (selectedDays.has(c.date)) continue;

      result.push({
        date: c.date,
        parkId: c.parkId,
        parkName: c.parkName,
        crowdLevel: c.crowdLevel,
      });
      selectedDays.add(c.date);
    }
  }

  // Sort result chronologically
  result.sort((a, b) => a.date.localeCompare(b.date));

  return { days: result };
}
