/** App-wide constants */

export const APP_NAME = 'ParkPulse';

export const CROWD_LEVELS = {
  1: { label: 'Very Low', color: 'sage' },
  2: { label: 'Very Low', color: 'sage' },
  3: { label: 'Low', color: 'sage' },
  4: { label: 'Low', color: 'sage' },
  5: { label: 'Moderate', color: 'accent' },
  6: { label: 'Moderate', color: 'accent' },
  7: { label: 'High', color: 'coral' },
  8: { label: 'High', color: 'coral' },
  9: { label: 'Very High', color: 'coral' },
  10: { label: 'Very High', color: 'coral' },
} as const;

export const PARK_FAMILIES = [
  { id: 'walt-disney-world', name: 'Walt Disney World' },
  { id: 'universal-orlando', name: 'Universal Orlando' },
  { id: 'disneyland-resort', name: 'Disneyland Resort' },
] as const;
