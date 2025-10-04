import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, TrendUp, ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { parkFamilies, type ParkFamily, type ParkInfo } from '@/data/sampleData'

interface FamilyCrowdCalendarProps {
  familyId: string
  selectedParks: string[]
}

export function FamilyCrowdCalendar({ familyId, selectedParks }: FamilyCrowdCalendarProps) {
  const navigate = useNavigate()
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentDate, setCurrentDate] = useState(new Date().getDate()) // For mobile week view
  const [isMobile, setIsMobile] = useState(false)
  const [expandedDays, setExpandedDays] = useState(new Set<string>()) // Track expanded days

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const family = parkFamilies.find(f => f.id === familyId)
  // Include both theme parks and water parks in crowd calendar
  const allParks = family?.parks || []
  
  // Filter parks based on selection - if no parks selected, show all
  const displayParks = selectedParks.length === 0 
    ? allParks 
    : allParks.filter(park => selectedParks.includes(park.id))

  const getDaysInMonth = (month: number, year: number): number => {
    return new Date(year, month + 1, 0).getDate()
  }

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const getCrowdLevel = (date: number, parkId: string): number => {
    try {
      // Create a more predictable seed
      const seed = date + currentMonth * 31 + currentYear * 365
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
      const dayOfWeek = new Date(currentYear, currentMonth, date).getDay()
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

  const getCrowdColor = (level: number): string => {
    if (level <= 30) return 'bg-success text-success-foreground'
    if (level <= 60) return 'bg-accent text-accent-foreground' 
    if (level <= 80) return 'bg-secondary text-secondary-foreground'
    return 'bg-destructive text-destructive-foreground'
  }

  const getCrowdLabel = (level: number): string => {
    if (level <= 30) return 'Low'
    if (level <= 60) return 'Moderate'
    if (level <= 80) return 'High'
    return 'Extreme'
  }

  // Calculate overall busy-ness for a day (average of all parks)
  const getOverallCrowdLevel = (date: number): number => {
    const totalCrowd = displayParks.reduce((sum, park) => {
      return sum + getCrowdLevel(date, park.id)
    }, 0)
    return Math.round(totalCrowd / displayParks.length)
  }

  // Get background color for day card based on overall busy-ness
  const getDayCardColor = (level: number): string => {
    if (level <= 30) return 'bg-success/10 border-success/20'
    if (level <= 60) return 'bg-accent/10 border-accent/20' 
    if (level <= 80) return 'bg-secondary/10 border-secondary/20'
    return 'bg-destructive/10 border-destructive/20'
  }

  const getFirstDayOfMonth = (month: number, year: number): number => {
    return new Date(year, month, 1).getDay()
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      if (currentMonth === 0) {
        setCurrentMonth(11)
        setCurrentYear(currentYear - 1)
      } else {
        setCurrentMonth(currentMonth - 1)
      }
    } else {
      if (currentMonth === 11) {
        setCurrentMonth(0)
        setCurrentYear(currentYear + 1)
      } else {
        setCurrentMonth(currentMonth + 1)
      }
    }
  }

  // Mobile navigation by days
  const navigateDay = (direction: 'prev' | 'next') => {
    const currentDateObj = new Date(currentYear, currentMonth, currentDate)
    const newDate = new Date(currentDateObj)
    
    if (direction === 'prev') {
      newDate.setDate(currentDateObj.getDate() - 3) // Go back 3 days
    } else {
      newDate.setDate(currentDateObj.getDate() + 3) // Go forward 3 days
    }
    
    setCurrentYear(newDate.getFullYear())
    setCurrentMonth(newDate.getMonth())
    setCurrentDate(newDate.getDate())
  }

  // Toggle expanded state for a day
  const toggleDayExpansion = (day: number) => {
    const dayKey = `${currentYear}-${currentMonth}-${day}`
    const newExpandedDays = new Set(expandedDays)
    
    if (expandedDays.has(dayKey)) {
      newExpandedDays.delete(dayKey)
    } else {
      newExpandedDays.add(dayKey)
    }
    
    setExpandedDays(newExpandedDays)
  }

  // Check if a day is expanded
  const isDayExpanded = (day: number): boolean => {
    const dayKey = `${currentYear}-${currentMonth}-${day}`
    return expandedDays.has(dayKey)
  }

  // Clear expanded days when navigating months/days
  useEffect(() => {
    setExpandedDays(new Set())
  }, [currentMonth, currentYear, currentDate])

  // Get 3 consecutive days starting from current date for mobile
  const getMobileDays = (): number[] => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear)
    const days: number[] = []
    
    for (let i = 0; i < 3; i++) {
      let day = currentDate + i
      if (day > daysInMonth) {
        day = day - daysInMonth
      }
      days.push(day)
    }
    
    return days
  }

  // Render mobile day cards (3 days side by side)
  const renderMobileDays = (): React.ReactElement[] => {
    const days = getMobileDays()
    return days.map((day) => {
      const overallCrowdLevel = getOverallCrowdLevel(day)
      const dayCardColor = getDayCardColor(overallCrowdLevel)
      const isExpanded = isDayExpanded(day)
      const hasMore = displayParks.length > 3
      
      return (
        <div
          key={day}
          className={`${isExpanded ? 'min-h-[300px]' : 'min-h-[200px]'} border rounded-lg p-2 ${dayCardColor} ${hasMore ? 'cursor-pointer' : ''} transition-all duration-300`}
          onClick={hasMore ? () => toggleDayExpansion(day) : undefined}
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{day}</span>
              {hasMore && (
                <span className="text-xs text-muted-foreground">
                  {isExpanded ? '▼' : '▶'}
                </span>
              )}
            </div>
            <div className="flex-1 space-y-1">
              {(isExpanded ? displayParks : displayParks.slice(0, 3)).map((park) => {
                const crowdLevel = getCrowdLevel(day, park.id)
                return (
                  <div key={park.id} className="flex flex-col text-xs gap-0.5">
                    <span className="text-muted-foreground truncate text-xs" title={park.shortName}>
                      {park.shortName} {park.type === 'water-park' && '💧'}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-foreground text-xs">({crowdLevel})</span>
                      <Badge 
                        className={`text-xs px-1 py-0.5 ${getCrowdColor(crowdLevel)} text-center`}
                        variant="secondary"
                      >
                        {getCrowdLabel(crowdLevel)}
                      </Badge>
                    </div>
                  </div>
                )
              })}
              {hasMore && !isExpanded && (
                <div className="text-xs text-accent font-medium text-center pt-1 cursor-pointer hover:text-accent/80">
                  +{displayParks.length - 3} more
                </div>
              )}
            </div>
          </div>
        </div>
      )
    })
  }

  const renderCalendarDays = (): React.ReactElement[] => {
    try {
      const daysInMonth = getDaysInMonth(currentMonth, currentYear)
      const firstDay = getFirstDayOfMonth(currentMonth, currentYear)
      const days: React.ReactElement[] = []

      // Add empty cells for days before the first day of the month
      for (let i = 0; i < firstDay; i++) {
        days.push(<div key={`empty-${i}`} className="h-48" />)
      }

      // Add calendar days
      for (let day = 1; day <= daysInMonth; day++) {
        try {
          const overallCrowdLevel = getOverallCrowdLevel(day)
          const dayCardColor = getDayCardColor(overallCrowdLevel)
          const isExpanded = isDayExpanded(day)
          const hasMore = displayParks.length > 4
          
          days.push(
            <div
              key={day}
              className={`${isExpanded ? 'h-auto min-h-[300px]' : 'h-48'} border rounded-lg p-3 hover:shadow-md transition-all duration-300 ${hasMore ? 'cursor-pointer' : ''} ${dayCardColor}`}
              onClick={hasMore ? () => toggleDayExpansion(day) : undefined}
            >
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{day}</span>
                  {hasMore && (
                    <span className="text-xs text-muted-foreground">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  {(isExpanded ? displayParks : displayParks.slice(0, 4)).map((park) => {
                    try {
                      const crowdLevel = getCrowdLevel(day, park.id)
                      return (
                        <div key={park.id} className="flex items-center justify-between text-xs gap-2">
                          <span className="text-muted-foreground truncate min-w-0" title={`${park.shortName} (${crowdLevel})`}>
                            {park.shortName} {park.type === 'water-park' && '💧'}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="font-medium text-foreground">({crowdLevel})</span>
                            <Badge 
                              className={`text-xs px-2 py-0.5 ${getCrowdColor(crowdLevel)} min-w-[70px] text-center`}
                              variant="secondary"
                            >
                              {getCrowdLabel(crowdLevel)}
                            </Badge>
                          </div>
                        </div>
                      )
                    } catch (parkError) {
                      console.warn(`Error rendering park ${park.id}:`, parkError)
                      return (
                        <div key={park.id} className="flex items-center justify-between text-xs gap-2">
                          <span className="text-muted-foreground truncate min-w-0" title={park.shortName}>
                            {park.shortName} {park.type === 'water-park' && '💧'}
                          </span>
                          <Badge className="text-xs px-2 py-0.5 bg-muted text-muted-foreground min-w-[70px] text-center shrink-0">
                            --
                          </Badge>
                        </div>
                      )
                    }
                  })}
                  {hasMore && !isExpanded && (
                    <div 
                      className="text-xs text-accent font-medium text-center pt-1 cursor-pointer hover:text-accent/80"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleDayExpansion(day)
                      }}
                    >
                      +{displayParks.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        } catch (dayError) {
          console.warn(`Error rendering day ${day}:`, dayError)
          // Render a fallback day cell
          days.push(
            <div
              key={day}
              className="h-48 border rounded-lg p-3 bg-card flex items-center justify-center"
            >
              <div className="text-muted-foreground text-sm">{day}</div>
            </div>
          )
        }
      }

      return days
    } catch (error) {
      console.error('Error rendering calendar days:', error)
      // Return empty array to prevent crash
      return []
    }
  }

  if (!family) {
    return <div className="text-center text-muted-foreground">Park family not found</div>
  }

  if (!family.parks || family.parks.length === 0) {
    return <div className="text-center text-muted-foreground">No parks found for this family</div>
  }

  try {

  return (
    <div className="space-y-6">
      {/* Crowd Level Guide - Moved to top */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendUp size={20} />
            Crowd Level Guide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center space-x-2">
              <Badge className="bg-success text-success-foreground px-3 py-1">Low</Badge>
              <span className="text-sm text-muted-foreground">1-30</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className="bg-accent text-accent-foreground px-3 py-1">Moderate</Badge>
              <span className="text-sm text-muted-foreground">31-60</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className="bg-secondary text-secondary-foreground px-3 py-1">High</Badge>
              <span className="text-sm text-muted-foreground">61-80</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className="bg-destructive text-destructive-foreground px-3 py-1">Extreme</Badge>
              <span className="text-sm text-muted-foreground">81-100</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar size={24} />
                {family.name} Crowd Calendar
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {isMobile 
                  ? "Compare busy levels across parks. Swipe to view different days. Click days with 'more' to expand."
                  : "Compare busy levels across all parks to plan your visit. Day colors reflect overall business. Click days with 'more' to expand."
                }
              </p>
            </div>
            <div className="flex items-center justify-center space-x-1 md:space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => isMobile ? navigateDay('prev') : navigateMonth('prev')}
                className="hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft size={16} />
              </Button>
              <h3 className="text-base md:text-lg font-semibold min-w-[140px] md:min-w-[180px] text-center">
                {isMobile 
                  ? `${monthNames[currentMonth]} ${currentDate}, ${currentYear}`
                  : `${monthNames[currentMonth]} ${currentYear}`
                }
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => isMobile ? navigateDay('next') : navigateMonth('next')}
                className="hover:bg-muted hover:text-foreground"
              >
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isMobile ? (
              // Mobile view: 3 days side by side with proper overflow handling
              <div className="w-full">
                <div className="grid grid-cols-3 gap-2">
                  {renderMobileDays()}
                </div>
              </div>
            ) : (
              // Desktop view: Full month calendar
              <>
                <div className="grid grid-cols-7 gap-2 text-center text-sm font-medium text-muted-foreground">
                  <div>Sun</div>
                  <div>Mon</div>
                  <div>Tue</div>
                  <div>Wed</div>
                  <div>Thu</div>
                  <div>Fri</div>
                  <div>Sat</div>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {renderCalendarDays()}
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Park Legend - Always shows all parks (both theme and water) */}
      {allParks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Parks in {family.name}
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({allParks.length} park{allParks.length !== 1 ? 's' : ''})
              </span>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Click any park to view its detailed calendar with weather and individual crowd patterns.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {allParks.map((park) => (
                <div 
                  key={park.id} 
                  className="flex items-center space-x-2 cursor-pointer hover:bg-muted rounded-md p-2 transition-colors"
                  onClick={() => navigate(`/park/${park.id}?tab=crowd-calendar`)}
                >
                  <div className={`w-2 h-2 rounded-full ${park.type === 'water-park' ? 'bg-secondary' : 'bg-primary'}`} />
                  <span className="text-sm hover:text-primary transition-colors">
                    {park.shortName} {park.type === 'water-park' && '💧'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
  } catch (error) {
    console.error('Error rendering FamilyCrowdCalendar:', error)
    return (
      <div className="text-center p-6">
        <p className="text-muted-foreground">Unable to load calendar. Please try again later.</p>
      </div>
    )
  }
}