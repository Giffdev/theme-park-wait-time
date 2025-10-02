import { sampleAttractions } from '@/data/sampleData'
import type { ExtendedAttraction } from '@/types'

/**
 * Service for reliably loading park attraction data with fallback mechanisms
 */
export class ParkDataService {
  /**
   * Load attractions for a park with multiple fallback strategies
   */
  static async loadAttractions(parkId: string): Promise<ExtendedAttraction[]> {
    console.log(`🔄 ParkDataService loading attractions for ${parkId}`)
    
    // Strategy 1: Load from KV store
    try {
      if (window.spark?.kv) {
        const kvData = await window.spark.kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
        if (kvData && Array.isArray(kvData) && kvData.length > 0) {
          console.log(`✅ ParkDataService loaded from KV: ${kvData.length} attractions`)
          return kvData
        }
      }
    } catch (kvError) {
      console.warn('ParkDataService KV load failed:', kvError)
    }
    
    // Strategy 2: Load from sample data and save to KV
    console.log(`⚡ ParkDataService using sample data fallback for ${parkId}`)
    const sampleData = sampleAttractions[parkId]
    
    if (sampleData && Array.isArray(sampleData) && sampleData.length > 0) {
      console.log(`✅ ParkDataService sample data found: ${sampleData.length} attractions`)
      
      // Try to save to KV for future use
      try {
        if (window.spark?.kv) {
          await window.spark.kv.set(`attractions-${parkId}`, sampleData)
          console.log(`💾 ParkDataService saved sample data to KV`)
        }
      } catch (saveError) {
        console.warn('ParkDataService could not save to KV:', saveError)
      }
      
      return sampleData
    }
    
    // Strategy 3: Return empty array if no data found
    console.error(`❌ ParkDataService no data found for ${parkId}`)
    return []
  }
  
  /**
   * Get list of available park IDs
   */
  static getAvailableParks(): string[] {
    return Object.keys(sampleAttractions)
  }
  
  /**
   * Check if a park exists in our data
   */
  static hasPark(parkId: string): boolean {
    return parkId in sampleAttractions
  }
  
  /**
   * Initialize all park data in KV store
   */
  static async initializeAllParks(): Promise<number> {
    if (!window.spark?.kv) {
      console.error('ParkDataService: KV not available for initialization')
      return 0
    }
    
    let successCount = 0
    const parks = Object.entries(sampleAttractions)
    
    console.log(`🚀 ParkDataService initializing ${parks.length} parks`)
    
    for (const [parkId, attractions] of parks) {
      try {
        // Check if already exists
        const existing = await window.spark.kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
        if (existing && Array.isArray(existing) && existing.length > 0) {
          console.log(`✅ ${parkId} already initialized (${existing.length} attractions)`)
          successCount++
          continue
        }
        
        // Initialize with sample data
        await window.spark.kv.set(`attractions-${parkId}`, attractions)
        console.log(`✅ ParkDataService initialized ${parkId} (${attractions.length} attractions)`)
        successCount++
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 10))
        
      } catch (error) {
        console.error(`❌ ParkDataService failed to initialize ${parkId}:`, error)
      }
    }
    
    console.log(`🎉 ParkDataService initialization complete: ${successCount}/${parks.length} parks`)
    return successCount
  }
}