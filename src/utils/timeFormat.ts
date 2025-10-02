/**
 * Utility functions for time formatting
 */

/**
 * Convert 24-hour time to 12-hour format with AM/PM
 */
export function formatTime12Hour(hour: number, minute: number = 0): string {
  const period = hour >= 12 ? 'PM' : 'AM'
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
  const displayMinute = minute.toString().padStart(2, '0')
  
  return `${displayHour}:${displayMinute} ${period}`
}

/**
 * Convert 24-hour time string to 12-hour format
 */
export function convertTo12Hour(time24: string): string {
  const [hourStr, minuteStr = '00'] = time24.split(':')
  const hour = parseInt(hourStr, 10)
  const minute = parseInt(minuteStr, 10)
  
  return formatTime12Hour(hour, minute)
}

/**
 * Format a date with 12-hour time
 */
export function formatDateTime12Hour(date: Date): string {
  return `${date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  })} ${formatTime12Hour(date.getHours(), date.getMinutes())}`
}

/**
 * Format timestamp for display in charts
 */
export function formatChartTimestamp(timestamp: string, includeDate: boolean = true): string {
  // Handle different timestamp formats
  if (timestamp.includes('/') && timestamp.includes(':')) {
    // Format: "12/15 14:00" -> "12/15 2:00 PM"
    const [datePart, timePart] = timestamp.split(' ')
    if (timePart) {
      const hour24 = parseInt(timePart.split(':')[0], 10)
      const time12 = formatTime12Hour(hour24)
      return includeDate ? `${datePart} ${time12}` : time12
    }
  }
  
  return timestamp
}

/**
 * Format wait time display consistently across the application
 * @param waitTime - Wait time in minutes (-1 for closed rides)
 * @param showUnits - Whether to show "min" suffix for valid wait times
 * @returns Formatted wait time string
 */
export function formatWaitTime(waitTime: number, showUnits: boolean = true): string {
  if (waitTime === -1) {
    return 'Ride is closed'
  }
  
  if (waitTime === 0) {
    return 'Walk-on'
  }
  
  return showUnits ? `${waitTime} min` : waitTime.toString()
}