/** App-wide constants */

import { DESTINATION_FAMILIES } from '@/lib/parks/park-registry';

export const APP_NAME = 'ParkFlow';

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

/**
 * Derive PARK_FAMILIES from the canonical park registry.
 * Each destination becomes a "park family" for the crowd calendar.
 * Family IDs strip the '-dest' suffix for backward compatibility with
 * existing Firestore paths (e.g., crowdCalendar/seaworld-orlando/monthly/...).
 */
export const PARK_FAMILIES: ParkFamily[] = DESTINATION_FAMILIES.flatMap((group) =>
  group.destinations.map((dest) => ({
    id: dest.slug.replace(/-dest$/, ''),
    name: dest.name,
    parks: dest.parks.map((p) => ({ id: p.slug, name: p.name })),
  }))
);

export interface ParkFamily {
  id: string;
  name: string;
  parks: { id: string; name: string }[];
}

/** Crowd level colors for the park-family calendar (4-tier scale) */
export const CROWD_LEVEL_COLORS = {
  1: { label: 'Low', hex: '#22c55e', tailwind: 'bg-green-500' },
  2: { label: 'Moderate', hex: '#eab308', tailwind: 'bg-yellow-500' },
  3: { label: 'High', hex: '#f97316', tailwind: 'bg-orange-500' },
  4: { label: 'Extreme', hex: '#ef4444', tailwind: 'bg-red-500' },
} as const;
