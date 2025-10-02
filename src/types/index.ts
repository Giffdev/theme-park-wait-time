export type WaitTimeReport = {
  id: string
  attractionId: string
  parkId: string
  userId: string
  username: string
  waitTime: number
  reportedAt: string
  verifications: Verification[]
  accuracy?: number // Calculated based on verifications
  status: 'pending' | 'verified' | 'disputed'
}

export type Verification = {
  id: string
  userId: string
  username: string
  reportId: string
  isAccurate: boolean
  reportedWaitTime?: number
  verifiedAt: string
  confidence: 'low' | 'medium' | 'high'
}

export type RealtimeUpdate = {
  type: 'new_report' | 'verification' | 'consensus_update'
  data: WaitTimeReport | Verification | { attractionId: string; newWaitTime: number }
  timestamp: string
}

export type UserContribution = {
  userId: string
  reportsSubmitted: number
  verificationsProvided: number
  accuracyScore: number
  trustLevel: 'new' | 'bronze' | 'silver' | 'gold' | 'platinum'
  badges: string[]
}

export type RideLog = {
  id: string
  userId: string
  tripId: string // Links to the trip
  parkId: string
  attractionId: string
  attractionName: string
  attractionType: 'thrill' | 'family' | 'show' | 'experience'
  rideCount: number
  trackVariant?: string // For rides with multiple tracks
  loggedAt: string
  notes?: string
}

export type Trip = {
  id: string
  userId: string
  visitDate: string // The date of the trip
  parks: TripPark[] // Multiple parks can be visited in one trip
  rideLogs: RideLog[] // All ride logs for this trip
  totalRides: number // Computed total
  createdAt: string
  updatedAt: string
  notes?: string
}

export type TripPark = {
  parkId: string
  parkName: string
  rideCount: number // Number of rides at this park for this trip
}

// Legacy type for backward compatibility
export type ParkVisit = Trip

export type AttractionVariant = {
  id: string
  name: string
  description?: string
}

export type ExtendedAttraction = {
  id: string
  name: string
  type: 'thrill' | 'family' | 'show' | 'experience'
  currentWaitTime: number
  status: 'operating' | 'closed' | 'delayed'
  lastUpdated: string
  isDefunct?: boolean
  isSeasonal?: boolean
  seasonalPeriod?: string // e.g., "Halloween", "Christmas"
  variants?: AttractionVariant[] // For multi-track rides
}