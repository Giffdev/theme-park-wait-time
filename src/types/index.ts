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
  type: 'thrill' | 'family' | 'show' | 'experience'
  currentWaitTime: number
  status: 'operating' | 'closed' | 'delayed'
  lastUpdated: string
  isDefunct?: boolean
  isSeasonal?: boolean
  seasonalPeriod?: string // e.g., "Halloween", "Christmas"
  variants?: AttractionVariant[] // For multi-track rides
}