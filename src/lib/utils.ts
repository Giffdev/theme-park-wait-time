import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ExtendedAttraction } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Filter function to determine if an attraction is actually a ride/show/experience
 * and not a dining establishment. Restaurants and dining venues should be excluded
 * from attraction lists.
 */
export function isAttractionNotDining(attraction: ExtendedAttraction): boolean {
  // Always include thrill rides, family rides, shows, parades, and character meets
  if (attraction.type === 'thrill' || 
      attraction.type === 'family' || 
      attraction.type === 'show' ||
      attraction.type === 'parade' ||
      attraction.type === 'character-meet') {
    return true
  }
  
  // For experience type, check if it's actually a dining establishment
  if (attraction.type === 'experience') {
    const name = attraction.name.toLowerCase()
    const isDining = name.includes('restaurant') || 
                    name.includes('dining') || 
                    name.includes('steakhaus') ||
                    name.includes('stakehaus') ||
                    name.includes('tavern') ||
                    name.includes('café') ||
                    name.includes('cafe') ||
                    name.includes('bar') ||
                    name.includes('grill') ||
                    name.includes('kitchen') ||
                    name.includes('eatery') ||
                    name.includes('cantina') ||
                    name.includes('bistro') ||
                    name.includes('lounge') ||
                    name.includes('food') ||
                    name.includes('snack')
    return !isDining
  }
  
  // Exclude dining-experience type attractions
  if (attraction.type === 'dining-experience') {
    return false
  }
  
  return false
}

/**
 * Filter function specifically for park overview - only shows attractions
 * with meaningful wait times (thrill, family, and non-dining experiences).
 * Excludes shows, parades, character meets, retired attractions, and inactive seasonal/limited attractions.
 */
export function isAttractionForOverview(attraction: ExtendedAttraction): boolean {
  // First check if the attraction is active (not retired)
  // If availability is not specified, assume it's active
  if (attraction.availability === 'retired') {
    return false
  }
  
  // Filter out limited/seasonal attractions that are currently closed
  // These are only active during specific periods and shouldn't show when closed
  if (attraction.availability === 'limited' && 
      (attraction.status === 'closed' || attraction.currentWaitTime === 0)) {
    return false
  }
  
  // Include thrill and family rides - these are the core wait-time attractions
  if (attraction.type === 'thrill' || attraction.type === 'family') {
    return true
  }
  
  // Include experiences that aren't dining and have meaningful wait times
  if (attraction.type === 'experience') {
    const name = attraction.name.toLowerCase()
    const isDining = name.includes('restaurant') || 
                    name.includes('dining') || 
                    name.includes('steakhaus') ||
                    name.includes('stakehaus') ||
                    name.includes('tavern') ||
                    name.includes('café') ||
                    name.includes('cafe') ||
                    name.includes('bar') ||
                    name.includes('grill') ||
                    name.includes('kitchen') ||
                    name.includes('eatery') ||
                    name.includes('cantina') ||
                    name.includes('bistro') ||
                    name.includes('lounge') ||
                    name.includes('food') ||
                    name.includes('snack')
    
    // Only include non-dining experiences that typically have wait times
    return !isDining
  }
  
  // Exclude shows, parades, character meets, and dining experiences
  // These are better for the live times section where scheduling is more relevant
  return false
}

/**
 * Filter function for wait time reporting - only shows attractions that can have wait times
 * This excludes shows, parades, and other experiences that don't have queues
 */
export function canReportWaitTime(attraction: ExtendedAttraction): boolean {
  // Check if the attraction is not a dining establishment first
  if (!isAttractionNotDining(attraction)) {
    return false
  }
  
  // New system: use hasWaitTime property if available
  if (typeof attraction.hasWaitTime === 'boolean') {
    return attraction.hasWaitTime
  }
  
  // Backward compatibility: exclude shows and some experiences
  if (attraction.type === 'show') {
    return false
  }
  
  // For experiences, be more selective - only certain ones can have wait times
  if (attraction.type === 'experience') {
    const name = attraction.name.toLowerCase()
    // Exclude shows, parades, and street performances
    const isShow = name.includes('show') || 
                   name.includes('parade') || 
                   name.includes('performance') ||
                   name.includes('band') ||
                   name.includes('dans') ||
                   name.includes('fantasmic') ||
                   name.includes('fireworks') ||
                   name.includes('spectacular') ||
                   name.includes('celebration')
    return !isShow
  }
  
  // Thrill and family rides can always have wait times
  return attraction.type === 'thrill' || attraction.type === 'family'
}

/**
 * Filter function for trip logging - shows all experiences including rides, shows, parades
 * This is used when users are logging what they experienced during their visit
 */
export function canLogInTrip(attraction: ExtendedAttraction): boolean {
  // Must not be a dining establishment
  if (!isAttractionNotDining(attraction)) {
    return false
  }
  
  // New system: check category if available
  if (attraction.category) {
    // Only show active and limited attractions for trip logging
    // Retired attractions can be shown in a separate "Retired" section
    return attraction.category === 'active' || attraction.category === 'limited'
  }
  
  // Backward compatibility: exclude defunct attractions
  if (attraction.isDefunct) {
    return false
  }
  
  // All non-dining attractions can be logged
  return true
}

/**
 * Check if an attraction is retired/defunct
 */
export function isRetiredAttraction(attraction: ExtendedAttraction): boolean {
  // New system: check category
  if (attraction.category) {
    return attraction.category === 'retired'
  }
  
  // Backward compatibility
  return attraction.isDefunct === true
}
