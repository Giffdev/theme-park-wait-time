/** Source of a wait time reading. */
export type WaitTimeSource = 'api' | 'crowd-report' | 'estimated';

/** Trend direction. */
export type WaitTimeTrend = 'rising' | 'falling' | 'stable';

/** Current wait time for a single attraction (real-time). */
export interface CurrentWaitTime {
  attractionId: string;
  waitMinutes: number;
  status: 'operating' | 'closed' | 'delayed';
  source: WaitTimeSource;
  lastUpdated: Date;
  trend?: WaitTimeTrend;
}

/** A single reading within a day's historical record. */
export interface WaitTimeReading {
  time: string;
  waitMinutes: number;
  source: WaitTimeSource;
}

/** Historical wait times for one attraction on one day. */
export interface WaitTimeHistory {
  parkId: string;
  attractionId: string;
  date: string;
  readings: WaitTimeReading[];
}

/** Crowd report status. */
export type CrowdReportStatus = 'pending' | 'verified' | 'disputed';

/** A crowd-sourced wait time report. */
export interface CrowdReport {
  id: string;
  parkId: string;
  attractionId: string;
  userId: string;
  displayName: string;
  waitMinutes: number;
  status: CrowdReportStatus;
  accuracy?: number;
  reportedAt: Date;
  expiresAt: Date;
}

/** A verification of a crowd report. */
export interface Verification {
  id: string;
  userId: string;
  isAccurate: boolean;
  alternateWait?: number;
  confidence: 'low' | 'medium' | 'high';
  verifiedAt: Date;
}
