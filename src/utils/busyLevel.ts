/**
 * Utility functions for calculating and formatting busy levels
 */

/**
 * Calculate crowd level for a specific park on a given date
 * Uses the same algorithm as the crowd calendar
 */
export function getCrowdLevel(date: Date, parkId: string): number {
  try {
    const day = date.getDate()
    const month = date.getMonth()
    const year = date.getFullYear()
    
    // Create a more predictable seed
    const seed = day + month * 31 + year * 365
    let baseCrowd = ((seed * 31) % 100) + 1 // Use modulo for predictable randomness
    
    // Adjust based on park characteristics
    if (parkId.includes('magic-kingdom')) {
      baseCrowd = Math.min(100, baseCrowd + 20) // Magic Kingdom tends to be busier
    } else if (parkId.includes('epcot')) {
      baseCrowd = Math.max(1, baseCrowd - 10) // EPCOT tends to be less crowded
    } else if (parkId.includes('animal-kingdom')) {
      baseCrowd = Math.max(1, baseCrowd - 5) // Animal Kingdom moderately less busy
    } else if (parkId.includes('universal') && parkId.includes('studios')) {
      baseCrowd = Math.min(100, baseCrowd + 10) // Universal Studios busier than Islands
    }
    
    // Weekend adjustments
    const dayOfWeek = date.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) { // Weekend
      baseCrowd = Math.min(100, baseCrowd + 15)
    }
    
    return Math.max(1, Math.min(100, baseCrowd))
  } catch (error) {
    console.warn('Error calculating crowd level:', error)
    // Return a safe default
    return 50
  }
}

/**
 * Get busy level label from numeric crowd level
 */
export function getBusyLevelLabel(level: number): string {
  if (level <= 30) return 'Low'
  if (level <= 60) return 'Moderate'
  if (level <= 80) return 'High'
  return 'Extreme'
}

/**
 * Get color classes for busy level badge
 */
export function getBusyLevelColor(level: number): string {
  if (level <= 30) return 'bg-success text-success-foreground'
  if (level <= 60) return 'bg-accent text-accent-foreground' 
  if (level <= 80) return 'bg-secondary text-secondary-foreground'
  return 'bg-destructive text-destructive-foreground'
}

/**
 * Get today's busy level for a park
 */
export function getTodaysBusyLevel(parkId: string): {
  level: number
  label: string
  colorClass: string
} {
  const today = new Date()
  const level = getCrowdLevel(today, parkId)
  
  return {
    level,
    label: getBusyLevelLabel(level),
    colorClass: getBusyLevelColor(level)
  }
}