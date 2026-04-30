/**
 * TripDay — A single day within a trip.
 * Stored at: users/{userId}/trips/{tripId}/days/{date}
 * Doc ID = date string (YYYY-MM-DD).
 */
export interface TripDay {
  date: string;           // YYYY-MM-DD (also the doc ID)
  parkIds: string[];      // Parks visited this day, in visit order
  parkNames: Record<string, string>;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}
