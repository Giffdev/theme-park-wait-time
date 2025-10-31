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

export type AttractionVariant = {
  id: string
  name: string
  description?: string
}

export type ExtendedAttraction = {
  id: string
  name: string
  type: 'thrill' | 'family' | 'show' | 'experience' | 'parade' | 'character-meet' | 'dining-experience'
  category: 'active' | 'limited' | 'retired'
  hasWaitTime: boolean // true for rides, false for shows/parades
  currentWaitTime: number
  status: 'operating' | 'closed' | 'delayed'
  lastUpdated: string
  isDefunct?: boolean
  isSeasonal?: boolean
  seasonalPeriod?: string // e.g., "Halloween", "Christmas"
  variants?: AttractionVariant[] // For multi-track rides
  availability?: 'active' | 'limited' | 'retired'
  description?: string
  openingYear?: number
  closingYear?: number
}

export type TripPark = {
  parkId: string
  parkName: string
  rideCount: number
}

export type RideLog = {
  id: string
  userId: string
  tripId: string
  parkId: string
  attractionId: string
  attractionName: string
  attractionType: string
  rideCount: number
  trackVariant?: string
  loggedAt: string
  notes?: string
}

export type Trip = {
  id: string
  userId: string
  visitDate: string
  parks: TripPark[]
  rideLogs: RideLog[]
  totalRides: number
  createdAt: string
  updatedAt: string
  notes?: string
}

export type User = {
  id: string
  username: string
  email: string
  contributionCount: number
  joinDate: string
}