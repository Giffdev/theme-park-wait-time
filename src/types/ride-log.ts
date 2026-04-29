/**
 * Types for ride logging and crowdsourced wait time features.
 * These use plain Date objects for pure-function compatibility.
 * The Firestore layer converts to/from Timestamps.
 */

// ---------------------------------------------------------------------------
// Ride Log — personal ride history (users/{userId}/rideLogs/{logId})
// ---------------------------------------------------------------------------

/** Personal ride history entry. */
export interface RideLog {
  id: string;
  parkId: string;
  attractionId: string;
  parkName: string;
  attractionName: string;
  rodeAt: Date;
  waitTimeMinutes: number | null;
  source: 'timer' | 'manual';
  rating: number | null;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Data required to create a new ride log (id + timestamps added server-side). */
export type RideLogCreateData = Omit<RideLog, 'id' | 'createdAt' | 'updatedAt'>;

/** Fields that can be updated on an existing ride log. */
export type RideLogUpdateData = Partial<
  Pick<RideLog, 'rating' | 'notes' | 'waitTimeMinutes' | 'rodeAt'>
>;

// ---------------------------------------------------------------------------
// Active Timer — single doc at users/{userId}/activeTimer
// ---------------------------------------------------------------------------

/** Active queue timer state. */
export interface ActiveTimer {
  parkId: string;
  attractionId: string;
  parkName: string;
  attractionName: string;
  startedAt: Date;
  clientStartedAt: number; // client epoch ms (for offline resilience)
  status: 'active' | 'completed' | 'abandoned';
  updatedAt: Date;
}

/** Data required to start a new timer. */
export type TimerStartData = Pick<
  ActiveTimer,
  'parkId' | 'attractionId' | 'parkName' | 'attractionName' | 'clientStartedAt'
>;

// ---------------------------------------------------------------------------
// Crowdsourced Wait Times
// ---------------------------------------------------------------------------

/** Individual anonymized report (crowdsourcedWaitTimes/{parkId}/reports/{reportId}). */
export interface CrowdReport {
  id: string;
  attractionId: string;
  waitTimeMinutes: number;
  reportedAt: Date;
  dayOfWeek: number; // 0-6
  hourOfDay: number; // 0-23
  createdAt: Date;
}

/** Pre-computed aggregate for an attraction's crowdsourced wait time. */
export interface CrowdAggregate {
  attractionId: string;
  parkId: string;
  currentEstimateMinutes: number | null;
  reportCount: number;
  lastReportedAt: Date | null;
  confidence: 'low' | 'medium' | 'high' | 'none';
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// API Request Types
// ---------------------------------------------------------------------------

/** Body for POST /api/queue-report. */
export interface QueueReportRequest {
  parkId: string;
  attractionId: string;
  waitTimeMinutes: number;
}
