/** Crowd level label. */
export type CrowdLevelLabel = 'Very Low' | 'Low' | 'Moderate' | 'High' | 'Very High';

/** Source of crowd level data. */
export type CrowdSource = 'historical' | 'predicted' | 'actual';

/** One day's crowd calendar entry. */
export interface CrowdCalendarDay {
  level: number;
  label: CrowdLevelLabel;
  source: CrowdSource;
  avgWait?: number;
  peakWait?: number;
  specialEvent?: string;
}

/** A month's crowd calendar for a park. */
export interface CrowdCalendarMonth {
  parkId: string;
  month: string;
  days: Record<string, CrowdCalendarDay>;
}
