import type { Trip } from '@/types'

export class TripService {
  /**
   * Generate a simple, safe trip ID
   */
  static generateTripId(): string {
    const timestamp = Date.now().toString()
    const random = Math.random().toString(36).substring(2, 6)
    return `trip-${timestamp}-${random}`
  }

  /**
   * Generate a safe storage key for user trips
   */
  static getUserTripsKey(userId: string): string {
    return `user-trips-${userId}`
  }

  /**
   * Get current trip key
   */
  static getCurrentTripKey(userId: string): string {
    return `current-trip-${userId}`
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
   * Save a trip to storage
   */
  static async saveTrip(trip: Trip): Promise<void> {
    try {
      if (!trip.id || !trip.userId) {
        throw new Error('Invalid trip data: missing ID or user ID')
      }

      // Save trip data
      await window.spark.kv.set(trip.id, trip)

      // Update user's trip list
      const userTripsKey = this.getUserTripsKey(trip.userId)
      const existingTripIds = await window.spark.kv.get<string[]>(userTripsKey) || []
      
      if (!existingTripIds.includes(trip.id)) {
        existingTripIds.push(trip.id)
        await window.spark.kv.set(userTripsKey, existingTripIds)
      }
      
      console.log('✅ Trip saved successfully:', trip.id)
    } catch (error) {
      console.error('❌ Failed to save trip:', error)
      throw new Error(`Failed to save trip data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get all trips for a user
   */
  static async getUserTrips(userId: string): Promise<Trip[]> {
    try {
      const userTripsKey = this.getUserTripsKey(userId)
      const tripIds = await window.spark.kv.get<string[]>(userTripsKey) || []
      
      const trips: Trip[] = []
      
      // Load each trip
      for (const tripId of tripIds) {
        try {
          const trip = await window.spark.kv.get<Trip>(tripId)
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
   * Delete a trip
   */
  static async deleteTrip(userId: string, tripId: string): Promise<void> {
    try {
      // Remove from user's trip list
      const userTripsKey = this.getUserTripsKey(userId)
      const tripIds = await window.spark.kv.get<string[]>(userTripsKey) || []
      const updatedTripIds = tripIds.filter(id => id !== tripId)
      await window.spark.kv.set(userTripsKey, updatedTripIds)

      // Delete the trip data
      await window.spark.kv.delete(tripId)
      
      console.log('✅ Trip deleted successfully:', tripId)
    } catch (error) {
      console.error('❌ Failed to delete trip:', error)
      throw new Error(`Failed to delete trip: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Save current trip (in progress)
   */
  static async saveCurrentTrip(userId: string, trip: Trip): Promise<void> {
    try {
      if (!trip.id || !trip.userId) {
        throw new Error('Invalid trip data: missing ID or user ID')
      }

      const currentTripKey = this.getCurrentTripKey(userId)
      await window.spark.kv.set(currentTripKey, trip)
      console.log('✅ Current trip saved successfully:', trip.id)
    } catch (error) {
      console.error('❌ Failed to save current trip:', error)
      throw new Error(`Failed to save current trip: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get current trip (in progress)
   */
  static async getCurrentTrip(userId: string): Promise<Trip | null> {
    try {
      const currentTripKey = this.getCurrentTripKey(userId)
      const trip = await window.spark.kv.get<Trip>(currentTripKey)
      return trip || null
    } catch (error) {
      console.error('❌ Failed to get current trip:', error)
      return null
    }
  }

  /**
   * Clear current trip
   */
  static async clearCurrentTrip(userId: string): Promise<void> {
    try {
      const currentTripKey = this.getCurrentTripKey(userId)
      await window.spark.kv.delete(currentTripKey)
      console.log('✅ Current trip cleared successfully')
    } catch (error) {
      console.error('❌ Failed to clear current trip:', error)
    }
  }
}