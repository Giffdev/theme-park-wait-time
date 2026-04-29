/** Park family crowd calendar types. */

/** Crowd level for a park on a given day. */
export enum CrowdLevel {
  Low = 1,
  Moderate = 2,
  High = 3,
  Extreme = 4,
}

/** Human-readable crowd level labels. */
export const CROWD_LEVEL_LABELS: Record<CrowdLevel, string> = {
  [CrowdLevel.Low]: 'Low',
  [CrowdLevel.Moderate]: 'Moderate',
  [CrowdLevel.High]: 'High',
  [CrowdLevel.Extreme]: 'Extreme',
};

/** A park entry within a family. */
export interface ParkEntry {
  parkId: string;
  parkName: string;
}

/** A park family (resort destination). */
export interface ParkFamilyDefinition {
  id: string;
  name: string;
  slug: string;
  parks: ParkEntry[];
}

/** Per-park crowd data for one day. */
export interface ParkCrowdDay {
  parkId: string;
  parkName: string;
  crowdLevel: CrowdLevel;
  avgWaitMinutes: number;
}

/** All parks' crowd data for a single day in a family. */
export interface FamilyCrowdDay {
  date: string; // YYYY-MM-DD
  parks: ParkCrowdDay[];
}

/** A month of crowd data for a park family. */
export interface FamilyCrowdMonth {
  familyId: string;
  month: string; // YYYY-MM
  days: FamilyCrowdDay[];
  generatedAt: string; // ISO timestamp
}

/** A single day in the best plan recommendation. */
export interface BestPlanDay {
  date: string;
  parkId: string;
  parkName: string;
  crowdLevel: CrowdLevel;
}

/** Best plan recommendation for a trip. */
export interface BestPlan {
  days: BestPlanDay[];
}

/** Full API response for the crowd calendar endpoint. */
export interface CrowdCalendarResponse {
  familyId: string;
  month: string;
  days: FamilyCrowdDay[];
  bestPlan: BestPlan;
  generatedAt: string;
  stale?: boolean;
}
