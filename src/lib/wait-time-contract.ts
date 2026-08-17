export const WAIT_TIME_CLOSED = -1;
export const WAIT_TIME_WALK_ON = 0;
export const MIN_OPERATING_WAIT_MINUTES = 2;
export const MAX_OPERATING_WAIT_MINUTES = 180;
export const LATEST_WAIT_TIME_REPORT_LIMIT = 20;

export function isValidReportedWaitTime(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && (
      value === WAIT_TIME_CLOSED
      || value === WAIT_TIME_WALK_ON
      || (
        value >= MIN_OPERATING_WAIT_MINUTES
        && value <= MAX_OPERATING_WAIT_MINUTES
      )
    );
}

/** Ride logs use null for unknown/closed; numeric values use the shared range. */
export function isValidRideWaitTime(value: unknown): value is number | null {
  return value === null
    || (
      typeof value === 'number'
      && value !== WAIT_TIME_CLOSED
      && isValidReportedWaitTime(value)
    );
}

export const WAIT_TIME_RANGE_MESSAGE =
  `Wait time must be ${WAIT_TIME_WALK_ON} for walk-on, `
  + `${WAIT_TIME_CLOSED} for closed, or between `
  + `${MIN_OPERATING_WAIT_MINUTES} and ${MAX_OPERATING_WAIT_MINUTES} minutes.`;

export const RIDE_WAIT_TIME_RANGE_MESSAGE =
  `Ride wait time must be unknown, ${WAIT_TIME_WALK_ON} for walk-on, or an integer between `
  + `${MIN_OPERATING_WAIT_MINUTES} and ${MAX_OPERATING_WAIT_MINUTES} minutes.`;
