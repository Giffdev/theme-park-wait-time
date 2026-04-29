/** A theme park resort family (e.g., Walt Disney World). */
export interface ParkFamily {
  id: string;
  name: string;
  slug: string;
  parks: string[];
}

/** Operating hours for a specific date. */
export interface OperatingHours {
  date: string;
  openTime: string;
  closeTime: string;
  earlyEntry?: string;
  extendedHours?: string;
  specialEvent?: string;
  isClosed: boolean;
}

/** A theme park. */
export interface Park {
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
  createdAt: Date;
  updatedAt: Date;
}
