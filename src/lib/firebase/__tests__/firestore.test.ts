/**
 * Unit tests for Firestore helpers (src/lib/firebase/firestore.ts).
 *
 * Skeleton tests — will pass once the Firestore helpers module is built.
 * Documents the expected CRUD interface for parks, attractions, wait times,
 * crowd reports, and user data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockPark,
  createMockAttraction,
  createMockWaitTime,
  createMockUser,
  createMockCrowdReport,
} from '@/lib/test-utils/mock-data';

// Will resolve once the module exists:
// import { getPark, getAttractions, ... } from '@/lib/firebase/firestore';

describe('Firestore helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Parks', () => {
    it.todo('getPark returns a park document by id');
    it.todo('getAllParks returns all active parks');
    it.todo('returns null for non-existent park id');
  });

  describe('Attractions', () => {
    it.todo('getAttractions returns rides for a given parkId');
    it.todo('filters attractions by type (thrill, family, show)');
    it.todo('filters attractions by area');
    it.todo('excludes inactive attractions by default');
  });

  describe('Wait Times', () => {
    it.todo('getCurrentWaitTimes returns live data for a park');
    it.todo('returns -1 waitMinutes for closed rides');
    it.todo('includes trend data (rising/falling/stable)');
    it.todo('getHistoricalWaitTimes returns entries for a date range');
  });

  describe('Crowd Reports', () => {
    it.todo('submitCrowdReport writes a new document');
    it.todo('requires userId to match the authenticated user');
    it.todo('rejects waitMinutes > 300');
    it.todo('rejects waitMinutes < -1');
    it.todo('getCrowdReports returns recent reports for an attraction');
  });

  describe('User Data', () => {
    it.todo('getUserProfile returns the user document');
    it.todo('updateUserProfile merges changes');
    it.todo('getUserTrips returns all trips for a user');
    it.todo('addRideLog creates a log entry under the trip');
  });

  describe('Real-time subscriptions', () => {
    it.todo('subscribeToWaitTimes calls callback on data change');
    it.todo('unsubscribe stops the listener');
  });

  describe('edge cases', () => {
    it.todo('handles Firestore offline mode gracefully');
    it.todo('handles empty collections without throwing');
    it.todo('sanitises string inputs before writing');
  });
});
