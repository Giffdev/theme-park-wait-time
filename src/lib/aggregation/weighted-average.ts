import type { CrowdReport } from '@/types/ride-log';

export interface WeightedAverageOptions {
  /** Half-life in minutes for time decay. Default: 30 */
  halfLifeMinutes?: number;
  /** Maximum age in minutes for a report to be included. Default: 120 */
  maxAgeMinutes?: number;
}

const DEFAULT_HALF_LIFE = 30;
const DEFAULT_MAX_AGE = 120;

/**
 * Compute the time-weighted moving average of crowdsourced wait times.
 *
 * Weight function: weight = 1 / (1 + minutesSinceReport / halfLifeMinutes)
 * Only includes reports from the same calendar day and within maxAge.
 *
 * Returns null if no valid reports exist.
 */
export function computeWeightedAverage(
  reports: CrowdReport[],
  now: Date,
  options: WeightedAverageOptions = {}
): number | null {
  const halfLife = options.halfLifeMinutes ?? DEFAULT_HALF_LIFE;
  const maxAge = options.maxAgeMinutes ?? DEFAULT_MAX_AGE;

  const validReports = reports.filter((report) => {
    const ageMinutes = (now.getTime() - report.reportedAt.getTime()) / 60000;
    if (ageMinutes < 0 || ageMinutes > maxAge) return false;
    // Same calendar day check
    return isSameCalendarDay(report.reportedAt, now);
  });

  if (validReports.length === 0) return null;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const report of validReports) {
    const ageMinutes = (now.getTime() - report.reportedAt.getTime()) / 60000;
    const weight = 1 / (1 + ageMinutes / halfLife);
    weightedSum += report.waitTimeMinutes * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;

  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
