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
