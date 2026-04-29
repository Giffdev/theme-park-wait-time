/** Park-family crowd calendar data types */

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
  crowdLevel: 1 | 2 | 3 | 4;
  avgWaitMinutes: number;
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
