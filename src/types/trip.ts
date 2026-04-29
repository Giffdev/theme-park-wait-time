/**
 * Trip types for the trip planning and tracking feature.
 * Stored at: users/{userId}/trips/{tripId}
 * Shared trips indexed at: sharedTrips/{shareId}
 */

/** Computed statistics for a trip. */
export interface TripStats {
  totalRides: number;
  totalWaitMinutes: number;
  parksVisited: number;
  uniqueAttractions: number;
  favoriteAttraction: string | null;
}

/** Trip status lifecycle. */
export type TripStatus = 'planning' | 'active' | 'completed';

/** A multi-day theme park trip. */
export interface Trip {
  id: string;
  name: string;
  startDate: string; // ISO date (YYYY-MM-DD)
  endDate: string; // ISO date (YYYY-MM-DD)
  parkIds: string[];
  parkNames: Record<string, string>; // parkId → display name
  status: TripStatus;
  shareId: string | null; // unique URL-safe ID for public sharing
  stats: TripStats;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Data required to create a new trip (id + timestamps + stats added automatically). */
export type TripCreateData = Omit<Trip, 'id' | 'createdAt' | 'updatedAt' | 'stats' | 'shareId'> & {
  shareId?: string | null;
};

/** Fields that can be updated on an existing trip. */
export type TripUpdateData = Partial<
  Pick<Trip, 'name' | 'startDate' | 'endDate' | 'parkIds' | 'parkNames' | 'notes' | 'status' | 'shareId'>
>;
