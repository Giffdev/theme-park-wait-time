// This service has been removed as part of simplifying the app to focus on wait time reporting only

export class TripService {
  /**
   * Generate a simple, safe trip ID that passes KV validation
   */
  static generateTripId(): string {
    const timestamp = Date.now().toString()
    const random = Math.random().toString(36).substring(2, 6)
    const tripId = `trip-${timestamp}-${random}`
    
    // Validate the generated trip ID
    const validation = KVService.validateKey(tripId)
    if (!validation.isValid) {
      throw new Error(`Generated trip ID is invalid: ${validation.error}`)
    }
    
    return validation.cleanKey!
  }

  /**
   * Generate a safe storage key for user trips using KVService validation
   */
  static getUserTripsKey(userId: string): string {
    try {
      return KVService.generateUserKey(userId, 'trips')
    } catch (error) {
      console.error('Failed to generate user trips key:', error)
      throw new Error('Invalid user ID for trip storage')
    }
  }

  /**
   * Get current trip key using KVService validation
   */
  static getCurrentTripKey(userId: string): string {
    try {
      return KVService.generateUserKey(userId, 'current-trip')
    } catch (error) {
      console.error('Failed to generate current trip key:', error)
      throw new Error('Invalid user ID for current trip storage')
    }
  }

  /**
   * Create a new trip
   */
  static createTrip(userId: string, username: string, visitDate: string): Trip {
    const tripId = this.generateTripId()
    const now = new Date().toISOString()
    
    return {
      id: tripId,
      userId,
      visitDate,
      parks: [],
      rideLogs: [],
      totalRides: 0,
      createdAt: now,
      updatedAt: now,
      notes: ''
    }
  }

  /**
   * Save a trip to storage using safe KV operations
   */
  static async saveTrip(trip: Trip): Promise<void> {
    try {
      // Validate trip data before saving
      if (!trip.id || !trip.userId) {
        throw new Error('Invalid trip data: missing ID or user ID')
      }

      // Save trip data using validated key
      await KVService.set(trip.id, trip)

      // Update user's trip list
      const userTripsKey = this.getUserTripsKey(trip.userId)
      const existingTripIds = await KVService.get<string[]>(userTripsKey) || []
      
      if (!existingTripIds.includes(trip.id)) {
        existingTripIds.push(trip.id)
        await KVService.set(userTripsKey, existingTripIds)
      }
      
      console.log('✅ Trip saved successfully:', trip.id)
    } catch (error) {
      console.error('❌ Failed to save trip:', error)
      throw new Error(`Failed to save trip data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get all trips for a user using safe KV operations
   */
  static async getUserTrips(userId: string): Promise<Trip[]> {
    try {
      const userTripsKey = this.getUserTripsKey(userId)
      const tripIds = await KVService.get<string[]>(userTripsKey) || []
      
      const trips: Trip[] = []
      
      // Load each trip
      for (const tripId of tripIds) {
        try {
          const trip = await KVService.get<Trip>(tripId)
          if (trip) {
            trips.push(trip)
          }
        } catch (error) {
          console.warn(`Failed to load trip ${tripId}:`, error)
        }
      }
      
      // Sort by visit date (newest first)
      return trips.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
    } catch (error) {
      console.error('❌ Failed to get user trips:', error)
      throw new Error(`Failed to load trip data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Delete a trip using safe KV operations
   */
  static async deleteTrip(userId: string, tripId: string): Promise<void> {
    try {
      // Remove from user's trip list
      const userTripsKey = this.getUserTripsKey(userId)
      const tripIds = await KVService.get<string[]>(userTripsKey) || []
      const updatedTripIds = tripIds.filter(id => id !== tripId)
      await KVService.set(userTripsKey, updatedTripIds)

      // Delete the trip data
      await KVService.delete(tripId)
      
      console.log('✅ Trip deleted successfully:', tripId)
    } catch (error) {
      console.error('❌ Failed to delete trip:', error)
      throw new Error(`Failed to delete trip: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Clear all user data (recovery option) using safe KV operations
   */
  static async clearUserData(userId: string): Promise<void> {
    try {
      const userTripsKey = this.getUserTripsKey(userId)
      const currentTripKey = this.getCurrentTripKey(userId)
      
      // Get all trip IDs
      const tripIds = await KVService.get<string[]>(userTripsKey) || []
      
      // Delete all trips
      for (const tripId of tripIds) {
        try {
          await KVService.delete(tripId)
        } catch (error) {
          console.warn(`Could not delete trip ${tripId}:`, error)
        }
      }
      
      // Delete user keys
      await KVService.delete(userTripsKey)
      await KVService.delete(currentTripKey)
      
      console.log('✅ All user data cleared successfully')
    } catch (error) {
      console.error('❌ Failed to clear user data:', error)
      throw new Error(`Failed to clear user data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Save current trip (in progress) using safe KV operations
   */
  static async saveCurrentTrip(userId: string, trip: Trip): Promise<void> {
    try {
      // Validate trip data
      if (!trip.id || !trip.userId) {
        throw new Error('Invalid trip data: missing ID or user ID')
      }

      const currentTripKey = this.getCurrentTripKey(userId)
      await KVService.set(currentTripKey, trip)
      console.log('✅ Current trip saved successfully:', trip.id)
    } catch (error) {
      console.error('❌ Failed to save current trip:', error)
      throw new Error(`Failed to save current trip: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get current trip (in progress) using safe KV operations
   */
  static async getCurrentTrip(userId: string): Promise<Trip | null> {
    try {
      const currentTripKey = this.getCurrentTripKey(userId)
      const trip = await KVService.get<Trip>(currentTripKey)
      return trip || null
    } catch (error) {
      console.error('❌ Failed to get current trip:', error)
      return null
    }
  }

  /**
   * Clear current trip using safe KV operations
   */
  static async clearCurrentTrip(userId: string): Promise<void> {
    try {
      const currentTripKey = this.getCurrentTripKey(userId)
      await KVService.delete(currentTripKey)
      console.log('✅ Current trip cleared successfully')
    } catch (error) {
      console.error('❌ Failed to clear current trip:', error)
      // Don't throw here as this is often called during cleanup
    }
  }
}