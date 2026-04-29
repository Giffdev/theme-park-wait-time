import type { CrowdReport, CrowdAggregate } from '@/types/ride-log';
import { filterOutliers, type OutlierDetectionOptions } from './outlier-detection';
import { computeWeightedAverage, type WeightedAverageOptions } from './weighted-average';
import { computeConfidence, type ConfidenceOptions } from './confidence';

export { filterOutliers } from './outlier-detection';
export { computeWeightedAverage } from './weighted-average';
export { computeConfidence } from './confidence';

export type { OutlierDetectionOptions } from './outlier-detection';
export type { WeightedAverageOptions } from './weighted-average';
export type { ConfidenceOptions, ConfidenceLevel } from './confidence';
export type { FilteredReport } from './outlier-detection';

export interface AggregateOptions {
  outlier?: OutlierDetectionOptions;
  weightedAverage?: WeightedAverageOptions;
  confidence?: ConfidenceOptions;
}

/**
 * Full aggregation pipeline: filterOutliers → computeWeightedAverage → computeConfidence.
 *
 * Returns null if no valid reports remain after filtering.
 */
export function aggregateWaitTime(
  reports: CrowdReport[],
  now: Date,
  options: AggregateOptions = {}
): Omit<CrowdAggregate, 'attractionId' | 'parkId' | 'updatedAt'> | null {
  if (reports.length === 0) return null;

  // Step 1: Filter outliers
  const currentEstimate = undefined; // No prior estimate for fresh aggregation
  const filtered = filterOutliers(reports, currentEstimate, options.outlier);

  if (filtered.length === 0) return null;

  // Step 2: Compute weighted average (using weight modifiers from outlier detection)
  // Create adjusted reports with the weight modifier baked in via a custom compute
  const estimate = computeWeightedAverageWithModifiers(filtered, now, options.weightedAverage);

  if (estimate === null) return null;

  // Step 3: Compute confidence on the filtered set
  const confidence = computeConfidence(filtered, now, options.confidence);

  // Find last reported time
  const sortedByTime = [...filtered].sort(
    (a, b) => b.reportedAt.getTime() - a.reportedAt.getTime()
  );
  const lastReportedAt = sortedByTime.length > 0 ? sortedByTime[0].reportedAt : null;

  return {
    currentEstimateMinutes: estimate,
    reportCount: filtered.length,
    lastReportedAt,
    confidence,
  };
}

/**
 * Weighted average that respects the weightModifier from outlier detection.
 */
function computeWeightedAverageWithModifiers(
  reports: Array<CrowdReport & { weightModifier: number }>,
  now: Date,
  options: WeightedAverageOptions = {}
): number | null {
  const halfLife = options.halfLifeMinutes ?? 30;
  const maxAge = options.maxAgeMinutes ?? 120;

  const validReports = reports.filter((report) => {
    const ageMinutes = (now.getTime() - report.reportedAt.getTime()) / 60000;
    if (ageMinutes < 0 || ageMinutes > maxAge) return false;
    return isSameCalendarDay(report.reportedAt, now);
  });

  if (validReports.length === 0) return null;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const report of validReports) {
    const ageMinutes = (now.getTime() - report.reportedAt.getTime()) / 60000;
    const timeWeight = 1 / (1 + ageMinutes / halfLife);
    const weight = timeWeight * report.weightModifier;
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
