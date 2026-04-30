/**
 * Types for dining/restaurant logging during trips.
 * Stored at: users/{userId}/diningLogs/{logId}
 */

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Personal dining log entry. */
export interface DiningLog {
  id: string;
  parkId: string;
  restaurantId: string;
  parkName: string;
  restaurantName: string;
  diningAt: Date;
  mealType: MealType;
  rating: number | null; // 1-5 stars
  notes: string; // what you had, brief review
  tripId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Data required to create a new dining log. */
export type DiningLogCreateData = Omit<DiningLog, 'id' | 'createdAt' | 'updatedAt' | 'tripId'> & {
  tripId?: string | null;
};

/** Fields that can be updated on an existing dining log. */
export type DiningLogUpdateData = Partial<
  Pick<DiningLog, 'rating' | 'notes' | 'mealType' | 'diningAt'>
>;
