/** Park-family crowd calendar data types */

export type ParkDayStatus = 'OPEN' | 'CLOSED' | 'NO_DATA';

export interface FamilyCrowdMonth {
  familyId: string;
  familyName: string;
  month: string; // YYYY-MM
  parks: { id: string; name: string }[];
  days: CrowdDay[];
  bestPlan: BestPlan | null;
}

export interface CrowdDay {
  date: string; // YYYY-MM-DD
  parks: CrowdDayPark[];
  aggregateCrowdLevel: 1 | 2 | 3 | 4;
}

export interface CrowdDayPark {
  parkId: string;
  parkName: string;
  /** Park operational status for this day. Defaults to 'OPEN' if not provided (backward compat). */
  status?: ParkDayStatus;
  /** Crowd level (present when park is open or status not provided) */
  crowdLevel?: 1 | 2 | 3 | 4;
  /** Average wait in minutes (present when park is open or status not provided) */
  avgWaitMinutes?: number;
}

export interface BestPlan {
  days: BestPlanDay[];
}

export interface BestPlanDay {
  date: string;
  parkId: string;
  parkName: string;
  crowdLevel: 1 | 2 | 3 | 4;
}
