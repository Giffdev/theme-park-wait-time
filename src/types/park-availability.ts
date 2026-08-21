/**
 * Explicit availability/phase contract for the parks listing surface.
 *
 * OPEN     - Currently within the OPERATING window.
 * UPCOMING - Today has a confirmed OPERATING entry; park has not yet opened.
 * CLOSED   - Today had a confirmed OPERATING entry that has now passed.
 * NO_DATA  - Schedule fetched successfully but no OPERATING entry for today
 *            (schedule horizon, confirmed-closed day, or holiday closure).
 * ERROR    - Upstream schedule API failed or threw; status is unknown.
 */
export type ParkAvailabilityPhase = 'OPEN' | 'UPCOMING' | 'CLOSED' | 'NO_DATA' | 'ERROR';
