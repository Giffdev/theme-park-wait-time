/**
 * Mock fixture data for E2E tests.
 * Represents Islands of Adventure with a mix of attraction types.
 */

export const MOCK_PARK_ID = 'ioa-uuid-001';
export const MOCK_PARK_SLUG = 'islands-of-adventure';

export const MOCK_PARK = {
  id: MOCK_PARK_ID,
  name: 'Islands of Adventure',
  slug: MOCK_PARK_SLUG,
  destinationName: 'Universal Orlando Resort',
  destinationId: 'universal-orlando',
};

export const MOCK_ATTRACTIONS = [
  {
    id: 'attr-001',
    name: 'Hagrid\'s Magical Creatures Motorbike Adventure',
    parkId: MOCK_PARK_ID,
    parkName: 'Islands of Adventure',
    entityType: 'ATTRACTION',
    attractionType: 'thrill',
    slug: 'hagrids-motorbike',
  },
  {
    id: 'attr-002',
    name: 'Velocicoaster',
    parkId: MOCK_PARK_ID,
    parkName: 'Islands of Adventure',
    entityType: 'ATTRACTION',
    attractionType: 'thrill',
    slug: 'velocicoaster',
  },
  {
    id: 'attr-003',
    name: 'The Cat in the Hat',
    parkId: MOCK_PARK_ID,
    parkName: 'Islands of Adventure',
    entityType: 'ATTRACTION',
    attractionType: 'family',
    slug: 'cat-in-the-hat',
  },
  {
    id: 'attr-004',
    name: 'Poseidon\'s Fury',
    parkId: MOCK_PARK_ID,
    parkName: 'Islands of Adventure',
    entityType: 'SHOW',
    attractionType: null,
    slug: 'poseidons-fury',
  },
  {
    id: 'attr-005',
    name: 'The Mystic Fountain',
    parkId: MOCK_PARK_ID,
    parkName: 'Islands of Adventure',
    entityType: 'SHOW',
    attractionType: null,
    slug: 'mystic-fountain',
  },
  {
    id: 'attr-006',
    name: 'Flight of the Hippogriff',
    parkId: MOCK_PARK_ID,
    parkName: 'Islands of Adventure',
    entityType: 'ATTRACTION',
    attractionType: 'family',
    slug: 'flight-of-hippogriff',
  },
];

export const MOCK_WAIT_TIMES = [
  {
    id: 'wt-001',
    attractionId: 'attr-001',
    attractionName: 'Hagrid\'s Magical Creatures Motorbike Adventure',
    status: 'OPERATING',
    waitMinutes: 75,
    lastUpdated: '2026-04-30T12:00:00Z',
    fetchedAt: '2026-04-30T12:01:00Z',
    queue: { STANDBY: { waitTime: 75 } },
    forecast: [{ time: '2026-04-30T12:00:00Z', waitMinutes: 75 }],
    forecastMeta: null,
    operatingHours: null,
  },
  {
    id: 'wt-002',
    attractionId: 'attr-002',
    attractionName: 'Velocicoaster',
    status: 'OPERATING',
    waitMinutes: 60,
    lastUpdated: '2026-04-30T12:00:00Z',
    fetchedAt: '2026-04-30T12:01:00Z',
    queue: { STANDBY: { waitTime: 60 } },
    forecast: null,
    forecastMeta: null,
    operatingHours: null,
  },
  {
    id: 'wt-003',
    attractionId: 'attr-003',
    attractionName: 'The Cat in the Hat',
    status: 'OPERATING',
    waitMinutes: 15,
    lastUpdated: '2026-04-30T12:00:00Z',
    fetchedAt: '2026-04-30T12:01:00Z',
    queue: { STANDBY: { waitTime: 15 } },
    forecast: null,
    forecastMeta: null,
    operatingHours: null,
  },
  {
    id: 'wt-004',
    attractionId: 'attr-004',
    attractionName: 'Poseidon\'s Fury',
    status: 'OPERATING',
    waitMinutes: null,
    lastUpdated: '2026-04-30T12:00:00Z',
    fetchedAt: '2026-04-30T12:01:00Z',
    queue: null,
    forecast: null,
    forecastMeta: null,
    operatingHours: null,
  },
  {
    id: 'wt-005',
    attractionId: 'attr-005',
    attractionName: 'The Mystic Fountain',
    status: 'OPERATING',
    waitMinutes: null,
    lastUpdated: '2026-04-30T12:00:00Z',
    fetchedAt: '2026-04-30T12:01:00Z',
    queue: null,
    forecast: null,
    forecastMeta: null,
    operatingHours: null,
  },
  {
    id: 'wt-006',
    attractionId: 'attr-006',
    attractionName: 'Flight of the Hippogriff',
    status: 'OPERATING',
    waitMinutes: 25,
    lastUpdated: '2026-04-30T12:00:00Z',
    fetchedAt: '2026-04-30T12:01:00Z',
    queue: { STANDBY: { waitTime: 25 } },
    forecast: null,
    forecastMeta: null,
    operatingHours: null,
  },
];

export const MOCK_PARK_SCHEDULE = {
  segments: [
    { type: 'OPERATING', openingTime: '2026-04-30T08:00:00-04:00', closingTime: '2026-04-30T22:00:00-04:00' },
  ],
  timezone: 'America/New_York',
};

/** Mock authenticated user for routes that need auth context */
export const MOCK_USER = {
  uid: 'user-e2e-001',
  email: 'tester@parkpulse.dev',
  displayName: 'E2E Tester',
};
