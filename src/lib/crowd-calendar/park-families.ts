import type { ParkFamilyDefinition } from '@/types/parkFamily';

/**
 * Static registry of park families (resort destinations).
 * IDs are used as Firestore document paths and API parameters.
 * Park IDs reference ThemeParks Wiki entity UUIDs.
 */
export const PARK_FAMILY_REGISTRY: ParkFamilyDefinition[] = [
  {
    id: 'universal-orlando',
    name: 'Universal Orlando Resort',
    slug: 'uni-orlando',
    parks: [
      { parkId: 'eb3f4560-2383-4a36-9152-6b3e5fbbdf8a', parkName: 'Universal Studios Florida' },
      { parkId: '267615cc-8943-4c2a-ae2c-5da728ca591f', parkName: 'Islands of Adventure' },
      { parkId: '2f982f5c-4854-4c4f-b06d-3e2e88eb4db4', parkName: 'Epic Universe' },
    ],
  },
  {
    id: 'walt-disney-world',
    name: 'Walt Disney World',
    slug: 'wdw',
    parks: [
      { parkId: '75ea578a-adc8-4116-a54d-dccb60765ef9', parkName: 'Magic Kingdom' },
      { parkId: '47f90d2c-e191-4239-a466-5892ef59a88b', parkName: 'EPCOT' },
      { parkId: '288747d1-8b4f-4a64-867e-ea7c9b27f573', parkName: 'Hollywood Studios' },
      { parkId: '1c84a229-8862-4648-9c71-378ddd2c7693', parkName: 'Animal Kingdom' },
    ],
  },
  {
    id: 'disneyland-resort',
    name: 'Disneyland Resort',
    slug: 'dlr',
    parks: [
      { parkId: '7340550b-c14d-4def-80bb-acdb51d49a66', parkName: 'Disneyland' },
      { parkId: '832fcd51-ea19-4e77-85c7-75571f919b36', parkName: 'Disney California Adventure' },
    ],
  },
  {
    id: 'universal-studios-hollywood',
    name: 'Universal Studios Hollywood',
    slug: 'ush',
    parks: [
      { parkId: 'ead53ea5-22e5-4095-9a83-8c29300d7c63', parkName: 'Universal Studios Hollywood' },
    ],
  },
  {
    id: 'seaworld-orlando',
    name: 'SeaWorld Orlando',
    slug: 'swo',
    parks: [
      { parkId: 'a2a5d70e-ebf5-4553-9baf-1ab1f4c47bca', parkName: 'SeaWorld Orlando' },
    ],
  },
  {
    id: 'busch-gardens-tampa',
    name: 'Busch Gardens Tampa Bay',
    slug: 'bgt',
    parks: [
      { parkId: '3a3c0b0e-24c5-4f1c-b34e-ec26c571e4b6', parkName: 'Busch Gardens Tampa Bay' },
    ],
  },
  {
    id: 'worlds-of-fun',
    name: 'Worlds of Fun',
    slug: 'wof',
    parks: [
      { parkId: 'bb731eae-7bd3-4713-bd7b-89d79b031743', parkName: 'Worlds of Fun' },
      { parkId: 'oceans-of-fun-kc', parkName: 'Oceans of Fun' },
    ],
  },
];

/** Find a park family by its ID. */
export function getParkFamily(familyId: string): ParkFamilyDefinition | undefined {
  return PARK_FAMILY_REGISTRY.find((f) => f.id === familyId);
}

/** Get all park family IDs. */
export function getAllFamilyIds(): string[] {
  return PARK_FAMILY_REGISTRY.map((f) => f.id);
}
