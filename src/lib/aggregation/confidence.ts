import type { CrowdReport } from '@/types/ride-log';

export interface ConfidenceOptions {
  /** Time window in minutes to count recent reports. Default: 60 */
  windowMinutes?: number;
  /** Threshold for medium confidence. Default: 3 */
  mediumThreshold?: number;
  /** Threshold for high confidence. Default: 6 */
  highThreshold?: number;
}

const DEFAULT_WINDOW = 60;
const DEFAULT_MEDIUM = 3;
const DEFAULT_HIGH = 6;

export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'none';

/**
 * Compute confidence level based on number of reports in the recent time window.
 *
 * | Reports in window | Confidence |
 * |-------------------|------------|
 * | 0                 | none       |
 * | 1-2               | low        |
 * | 3-5               | medium     |
 * | 6+                | high       |
 */
export function computeConfidence(
  reports: CrowdReport[],
  now: Date,
  options: ConfidenceOptions = {}
): ConfidenceLevel {
  const window = options.windowMinutes ?? DEFAULT_WINDOW;
  const mediumThreshold = options.mediumThreshold ?? DEFAULT_MEDIUM;
  const highThreshold = options.highThreshold ?? DEFAULT_HIGH;

  const cutoff = new Date(now.getTime() - window * 60000);

  const recentCount = reports.filter(
    (r) => r.reportedAt >= cutoff && r.reportedAt <= now
  ).length;

  if (recentCount === 0) return 'none';
  if (recentCount < mediumThreshold) return 'low';
  if (recentCount < highThreshold) return 'medium';
  return 'high';
}
