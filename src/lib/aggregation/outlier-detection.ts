import type { CrowdReport } from '@/types/ride-log';

export interface OutlierDetectionOptions {
  /** Minimum valid wait time in minutes. Default: 2 */
  minWaitMinutes?: number;
  /** Maximum valid wait time in minutes. Default: 180 */
  maxWaitMinutes?: number;
  /** Number of standard deviations for statistical rejection. Default: 2 */
  stdDevThreshold?: number;
  /** Minimum reports needed for statistical rejection. Default: 5 */
  minReportsForStats?: number;
  /** Maximum change in estimate before velocity penalty. Default: 60 */
  velocityThresholdMinutes?: number;
  /** Weight multiplier for velocity-flagged reports. Default: 0.5 */
  velocityPenalty?: number;
}

const DEFAULTS: Required<OutlierDetectionOptions> = {
  minWaitMinutes: 2,
  maxWaitMinutes: 180,
  stdDevThreshold: 2,
  minReportsForStats: 5,
  velocityThresholdMinutes: 60,
  velocityPenalty: 0.5,
};

export interface FilteredReport extends CrowdReport {
  /** Weight modifier applied by outlier detection (1.0 = normal, 0.5 = velocity-penalized) */
  weightModifier: number;
}

/**
 * Filter bad data before aggregation.
 *
 * 1. Hard bounds: reject reports outside [minWait, maxWait]
 * 2. Statistical: if >= minReportsForStats, reject > stdDevThreshold SDs from mean
 * 3. Velocity check: if a report would change estimate by > velocityThreshold, apply penalty weight
 *
 * Returns filtered reports with weight modifiers.
 */
export function filterOutliers(
  reports: CrowdReport[],
  currentEstimate?: number,
  options: OutlierDetectionOptions = {}
): FilteredReport[] {
  const opts = { ...DEFAULTS, ...options };

  // Step 1: Hard bounds filter
  let filtered = reports.filter(
    (r) => r.waitTimeMinutes >= opts.minWaitMinutes && r.waitTimeMinutes <= opts.maxWaitMinutes
  );

  // Step 2: Statistical filter (only if enough reports)
  if (filtered.length >= opts.minReportsForStats) {
    const mean = filtered.reduce((sum, r) => sum + r.waitTimeMinutes, 0) / filtered.length;
    const variance =
      filtered.reduce((sum, r) => sum + Math.pow(r.waitTimeMinutes - mean, 2), 0) /
      filtered.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 0) {
      filtered = filtered.filter(
        (r) => Math.abs(r.waitTimeMinutes - mean) <= opts.stdDevThreshold * stdDev
      );
    }
  }

  // Step 3: Velocity check — apply weight modifier
  return filtered.map((report) => {
    let weightModifier = 1.0;

    if (currentEstimate !== undefined) {
      const delta = Math.abs(report.waitTimeMinutes - currentEstimate);
      if (delta > opts.velocityThresholdMinutes) {
        weightModifier = opts.velocityPenalty;
      }
    }

    return { ...report, weightModifier };
  });
}
