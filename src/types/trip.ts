/** A park visited during a trip. */
export interface TripPark {
  parkId: string;
  parkName: string;
  rideCount: number;
}

/** A multi-day trip. */
export interface Trip {
  id: string;
  startDate: string;
  endDate: string;
  parks: TripPark[];
  totalRides: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A single ride log entry within a trip. */
export interface RideLog {
  id: string;
  parkId: string;
  attractionId: string;
  attractionName: string;
  date: string;
  time?: string;
  waitTime?: number;
  rideCount: number;
  trackVariant?: string;
  rating?: number;
  notes?: string;
  loggedAt: Date;
}
