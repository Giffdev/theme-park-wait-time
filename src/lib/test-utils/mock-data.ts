/**
 * Factory functions for test data.
 *
 * Usage:
 *   const park = createMockPark({ name: 'EPCOT' });
 *   const ride = createMockAttraction({ parkId: park.id });
 *
 * Every factory returns a fully-typed object with sensible defaults.
 * Override any field by passing a partial.
 */

import { Timestamp } from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Types (mirroring src/types/ — keep in sync)
// ---------------------------------------------------------------------------

export interface MockPark {
  id: string;
  name: string;
  slug: string;
  family: string;
  location: {
    city: string;
    state: string;
    country: string;
    lat: number;
    lng: number;
  };
  timezone: string;
  imageUrl: string;
  description: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MockAttraction {
  id: string;
  parkId: string;
  name: string;
  type: string;
  area: string;
  description: string;
  hasWaitTime: boolean;
  heightRequirement: number | null;
  thrillLevel: number;
  tags: string[];
  currentStatus: string;
  availability: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MockWaitTime {
  waitMinutes: number;
  status: string;
  source: string;
  lastUpdated: Timestamp;
  trend: string | null;
}

export interface MockUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  favoriteParks: string[];
  homepark: string | null;
  contributionCount: number;
  trustLevel: string;
  badges: string[];
  preferences: {
    units: string;
    theme: string;
    notifications: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MockCrowdReport {
  id: string;
  parkId: string;
  attractionId: string;
  userId: string;
  displayName: string;
  waitMinutes: number;
  status: string;
  reportedAt: Timestamp;
  expiresAt: Timestamp;
}

export interface MockTrip {
  id: string;
  startDate: string;
  endDate: string;
  parks: { parkId: string; parkName: string; rideCount: number }[];
  totalRides: number;
  notes: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const now = () => Timestamp.now();
let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function createMockPark(overrides: Partial<MockPark> = {}): MockPark {
  const id = overrides.id ?? nextId('park');
  return {
    id,
    name: 'Magic Kingdom',
    slug: id,
    family: 'walt-disney-world',
    location: {
      city: 'Orlando',
      state: 'FL',
      country: 'US',
      lat: 28.4177,
      lng: -81.5812,
    },
    timezone: 'America/New_York',
    imageUrl: 'https://example.com/magic-kingdom.jpg',
    description: 'The most magical place on earth',
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

export function createMockAttraction(
  overrides: Partial<MockAttraction> = {},
): MockAttraction {
  const id = overrides.id ?? nextId('attraction');
  return {
    id,
    parkId: 'magic-kingdom',
    name: 'Space Mountain',
    type: 'thrill',
    area: 'Tomorrowland',
    description: 'Blast through the cosmos on this iconic indoor coaster',
    hasWaitTime: true,
    heightRequirement: 44,
    thrillLevel: 4,
    tags: ['indoor', 'dark', 'fast-pass-eligible'],
    currentStatus: 'operating',
    availability: 'year-round',
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

export function createMockWaitTime(
  overrides: Partial<MockWaitTime> = {},
): MockWaitTime {
  return {
    waitMinutes: 45,
    status: 'operating',
    source: 'api',
    lastUpdated: now(),
    trend: 'stable',
    ...overrides,
  };
}

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const uid = overrides.uid ?? nextId('user');
  return {
    uid,
    email: `${uid}@test.example.com`,
    displayName: 'Test User',
    photoURL: null,
    favoriteParks: ['magic-kingdom'],
    homepark: 'magic-kingdom',
    contributionCount: 0,
    trustLevel: 'new',
    badges: [],
    preferences: {
      units: 'imperial',
      theme: 'light',
      notifications: true,
    },
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

export function createMockCrowdReport(
  overrides: Partial<MockCrowdReport> = {},
): MockCrowdReport {
  const id = overrides.id ?? nextId('report');
  return {
    id,
    parkId: 'magic-kingdom',
    attractionId: 'space-mountain',
    userId: 'user-1',
    displayName: 'Test Reporter',
    waitMinutes: 30,
    status: 'pending',
    reportedAt: now(),
    expiresAt: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000),
    ...overrides,
  };
}

export function createMockTrip(overrides: Partial<MockTrip> = {}): MockTrip {
  const id = overrides.id ?? nextId('trip');
  return {
    id,
    startDate: '2026-04-28',
    endDate: '2026-04-30',
    parks: [{ parkId: 'magic-kingdom', parkName: 'Magic Kingdom', rideCount: 8 }],
    totalRides: 8,
    notes: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}
