/** Types of attractions. */
export type AttractionType =
  | 'thrill'
  | 'family'
  | 'show'
  | 'experience'
  | 'parade'
  | 'character-meet'
  | 'dining-experience';

/** Operational status of an attraction. */
export type AttractionStatus =
  | 'operating'
  | 'closed'
  | 'delayed'
  | 'refurbishment'
  | 'seasonal-closed';

/** Availability lifecycle. */
export type AttractionAvailability = 'year-round' | 'seasonal' | 'retired';

/** Ride capacity tier. */
export type CapacityTier = 'high' | 'medium' | 'low';

/** A ride variant for multi-track attractions. */
export interface AttractionVariant {
  id: string;
  name: string;
  description: string;
}

/** A theme park attraction / ride. */
export interface Attraction {
  id: string;
  name: string;
  type: AttractionType;
  area: string;
  description: string;
  imageUrl?: string;
  hasWaitTime: boolean;
  heightRequirement?: number;
  thrillLevel: number;
  rideVehicle?: string;
  duration?: number;
  capacity?: CapacityTier;
  accessibility: string[];
  tags: string[];
  openingYear?: number;
  closingYear?: number;
  availability: AttractionAvailability;
  seasonalPeriod?: string;
  seasonalStartDate?: string;
  seasonalEndDate?: string;
  variants?: AttractionVariant[];
  currentStatus: AttractionStatus;
  statusUpdatedAt: Date;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
