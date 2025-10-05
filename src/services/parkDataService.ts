import { sampleAttractions } from '@/data/sampleData'
import type { ExtendedAttraction } from '@/types'

// Debug the import
console.log('🔍 ParkDataService imported sampleAttractions:', {
  keys: Object.keys(sampleAttractions).slice(0, 10),
  totalCount: Object.keys(sampleAttractions).length,
  hasMagicKingdom: 'magic-kingdom' in sampleAttractions,
  hasEpcot: 'epcot' in sampleAttractions
})

// Version identifier for data updates - increment when data structure changes
const DATA_VERSION = '2024-12-19-v6-attraction-categories'

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
        // Check data version first
        const storedVersion = await window.spark.kv.get<string>('data-version')
        const kvData = await window.spark.kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
        
        if (storedVersion === DATA_VERSION && kvData && Array.isArray(kvData) && kvData.length > 0) {
          console.log(`✅ ParkDataService loaded from KV: ${kvData.length} attractions`)
          return kvData
        } else if (storedVersion !== DATA_VERSION) {
          console.log(`🔄 ParkDataService data version outdated, refreshing data`)
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
          await window.spark.kv.set('data-version', DATA_VERSION)
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
    const parks = Object.keys(sampleAttractions)
    console.log('🔍 ParkDataService.getAvailableParks() called, found parks:', parks.slice(0, 10), '... (total:', parks.length, ')')
    return parks
  }
  
  /**
   * Check if a park exists in our data
   */
  static hasPark(parkId: string): boolean {
    const exists = parkId in sampleAttractions
    console.log(`🔍 ParkDataService.hasPark(${parkId}): ${exists}`)
    if (!exists) {
      console.log('Available parks:', Object.keys(sampleAttractions).slice(0, 10), '...')
    }
    return exists
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
    
    // Check and update data version
    const storedVersion = await window.spark.kv.get<string>('data-version')
    const shouldRefresh = storedVersion !== DATA_VERSION
    
    if (shouldRefresh) {
      console.log(`🔄 ParkDataService updating data from version ${storedVersion} to ${DATA_VERSION}`)
    }
    
    for (const [parkId, attractions] of parks) {
      try {
        // Check if already exists and version is current
        if (!shouldRefresh) {
          const existing = await window.spark.kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
          if (existing && Array.isArray(existing) && existing.length > 0) {
            console.log(`✅ ${parkId} already initialized (${existing.length} attractions)`)
            successCount++
            continue
          }
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
    
    // Update version after successful initialization
    if (shouldRefresh) {
      try {
        await window.spark.kv.set('data-version', DATA_VERSION)
        console.log(`✅ ParkDataService updated data version to ${DATA_VERSION}`)
      } catch (error) {
        console.warn('ParkDataService could not update data version:', error)
      }
    }
    
    console.log(`🎉 ParkDataService initialization complete: ${successCount}/${parks.length} parks`)
    return successCount
  }
}