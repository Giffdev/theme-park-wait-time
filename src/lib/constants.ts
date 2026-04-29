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
  {
    id: 'walt-disney-world',
    name: 'Walt Disney World',
    parks: [
      { id: 'magic-kingdom', name: 'Magic Kingdom' },
      { id: 'epcot', name: 'EPCOT' },
      { id: 'hollywood-studios', name: 'Hollywood Studios' },
      { id: 'animal-kingdom', name: 'Animal Kingdom' },
    ],
  },
  {
    id: 'universal-orlando',
    name: 'Universal Orlando Resort',
    parks: [
      { id: 'universal-studios', name: 'Universal Studios Florida' },
      { id: 'islands-of-adventure', name: 'Islands of Adventure' },
      { id: 'epic-universe', name: 'Epic Universe' },
    ],
  },
  {
    id: 'disneyland-resort',
    name: 'Disneyland Resort',
    parks: [
      { id: 'disneyland', name: 'Disneyland' },
      { id: 'california-adventure', name: 'Disney California Adventure' },
    ],
  },
  {
    id: 'universal-studios-hollywood',
    name: 'Universal Studios Hollywood',
    parks: [
      { id: 'universal-hollywood', name: 'Universal Studios Hollywood' },
    ],
  },
  {
    id: 'seaworld-orlando',
    name: 'SeaWorld Orlando',
    parks: [
      { id: 'seaworld-orlando', name: 'SeaWorld Orlando' },
    ],
  },
  {
    id: 'busch-gardens-tampa',
    name: 'Busch Gardens Tampa Bay',
    parks: [
      { id: 'busch-gardens-tampa', name: 'Busch Gardens Tampa Bay' },
    ],
  },
  {
    id: 'worlds-of-fun',
    name: 'Worlds of Fun',
    parks: [
      { id: 'worlds-of-fun', name: 'Worlds of Fun' },
    ],
  },
] as const;

export type ParkFamily = (typeof PARK_FAMILIES)[number];

/** Crowd level colors for the park-family calendar (4-tier scale) */
export const CROWD_LEVEL_COLORS = {
  1: { label: 'Low', hex: '#22c55e', tailwind: 'bg-green-500' },
  2: { label: 'Moderate', hex: '#eab308', tailwind: 'bg-yellow-500' },
  3: { label: 'High', hex: '#f97316', tailwind: 'bg-orange-500' },
  4: { label: 'Extreme', hex: '#ef4444', tailwind: 'bg-red-500' },
} as const;
