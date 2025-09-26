import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, TrendUp, ArrowLeft, ArrowRight, Sun, Cloud, CloudRain, CloudSnow, CloudLightning } from '@phosphor-icons/react'
import { getWeatherForDate } from '@/services/weatherService'
import { parkFamilies, type ParkFamily, type ParkInfo } from '@/data/sampleData'

interface FamilyCrowdCalendarProps {
  familyId: string
}

export function FamilyCrowdCalendar({ familyId }: FamilyCrowdCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [weatherData, setWeatherData] = useState<Record<string, any>>({})

  const family = parkFamilies.find(f => f.id === familyId)
  const themeParks = family?.parks.filter(park => park.type === 'theme-park') || []

  const getDaysInMonth = (month: number, year: number): number => {
    return new Date(year, month + 1, 0).getDate()
  }

  // Load weather data when month changes (using the first theme park as reference for weather)
  useEffect(() => {
    const loadWeatherData = async () => {
      if (themeParks.length === 0) return
      
      const daysInMonth = getDaysInMonth(currentMonth, currentYear)
      const newWeatherData: Record<string, any> = {}
      
      // Load weather for the first 10 days of the month (to avoid rate limiting)
      const maxDays = Math.min(daysInMonth, 10)
      const promises: Promise<void>[] = []
      
      for (let day = 1; day <= maxDays; day++) {
        const date = new Date(currentYear, currentMonth, day)
        const dateKey = `${currentYear}-${currentMonth}-${day}`
        
        // Use the first theme park for weather reference since they're usually in the same area
        const promise = getWeatherForDate(themeParks[0].id, date)
          .then(weather => {
            if (weather) {
              newWeatherData[dateKey] = weather
            }
          })
          .catch(error => {
            console.warn(`Failed to load weather for ${dateKey}:`, error)
          })
        
        promises.push(promise)
      }
      
      await Promise.allSettled(promises)
      setWeatherData(newWeatherData)
    }

    loadWeatherData()
  }, [familyId, currentMonth, currentYear, themeParks])

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  // Generate different crowd levels for each park based on park type and characteristics
  const getCrowdLevel = (date: number, parkId: string): number => {
    const seed = date + currentMonth + currentYear
    let baseCrowd = Math.floor(Math.random() * seed % 100) + 1
    
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
  }

  const getWeatherType = (date: number): 'sunny' | 'cloudy' | 'rainy' | 'stormy' | 'snowy' => {
    const dateKey = `${currentYear}-${currentMonth}-${date}`
    const weather = weatherData[dateKey]
    
    if (weather && weather.condition) {
      switch (weather.condition) {
        case 'clear':
          return 'sunny'
        case 'clouds':
          return 'cloudy'
        case 'rain':
          return 'rainy'
        case 'thunderstorm':
          return 'stormy'
        case 'snow':
          return 'snowy'
        default:
          return 'cloudy'
      }
    }
    
    // Fallback to fake data for dates without real weather data
    const seed = (date * currentMonth * currentYear) % 100
    if (seed < 50) return 'sunny'
    if (seed < 70) return 'cloudy'
    if (seed < 85) return 'rainy'
    if (seed < 95) return 'stormy'
    return 'snowy'
  }

  const getWeatherIcon = (weatherType: 'sunny' | 'cloudy' | 'rainy' | 'stormy' | 'snowy') => {
    switch (weatherType) {
      case 'sunny':
        return <Sun size={12} className="text-yellow-500" />
      case 'cloudy':
        return <Cloud size={12} className="text-gray-500" />
      case 'rainy':
        return <CloudRain size={12} className="text-blue-500" />
      case 'stormy':
        return <CloudLightning size={12} className="text-purple-600" />
      case 'snowy':
        return <CloudSnow size={12} className="text-blue-300" />
      default:
        return <Sun size={12} className="text-yellow-500" />
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
    if (level <= 60) return 'Mod'
    if (level <= 80) return 'High'
    return 'Ext'
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

  const renderCalendarDays = (): React.ReactElement[] => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear)
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear)
    const days: React.ReactElement[] = []

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-32" />)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const weatherType = getWeatherType(day)
      days.push(
        <div
          key={day}
          className="h-32 border rounded-lg p-2 hover:shadow-md transition-shadow cursor-pointer bg-card"
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{day}</span>
              {getWeatherIcon(weatherType)}
            </div>
            <div className="flex-1 space-y-1">
              {themeParks.slice(0, 4).map((park) => {
                const crowdLevel = getCrowdLevel(day, park.id)
                return (
                  <div key={park.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-muted-foreground pr-1" title={park.shortName}>
                      {park.shortName.length > 8 ? park.shortName.substring(0, 8) + '...' : park.shortName}
                    </span>
                    <Badge 
                      className={`text-xs px-1 py-0 ${getCrowdColor(crowdLevel)} min-w-[32px] text-center`}
                      variant="secondary"
                    >
                      {getCrowdLabel(crowdLevel)}
                    </Badge>
                  </div>
                )
              })}
              {themeParks.length > 4 && (
                <div className="text-xs text-muted-foreground text-center">
                  +{themeParks.length - 4} more
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    return days
  }

  if (!family) {
    return <div className="text-center text-muted-foreground">Park family not found</div>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar size={24} />
                {family.name} Crowd Calendar
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Compare busy levels across all parks to plan your visit
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateMonth('prev')}
                className="hover:bg-muted hover:text-foreground"
              >
                <ArrowLeft size={16} />
              </Button>
              <h3 className="text-lg font-semibold min-w-[180px] text-center">
                {monthNames[currentMonth]} {currentYear}
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateMonth('next')}
                className="hover:bg-muted hover:text-foreground"
              >
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
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
          </div>
        </CardContent>
      </Card>

      {/* Park Legend */}
      {themeParks.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Parks in {family.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {themeParks.map((park) => (
                <div key={park.id} className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-primary rounded-full" />
                  <span className="text-sm">{park.shortName}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
              <Badge className="bg-success text-success-foreground">Low</Badge>
              <span className="text-sm text-muted-foreground">1-30</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className="bg-accent text-accent-foreground">Moderate</Badge>
              <span className="text-sm text-muted-foreground">31-60</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className="bg-secondary text-secondary-foreground">High</Badge>
              <span className="text-sm text-muted-foreground">61-80</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge className="bg-destructive text-destructive-foreground">Extreme</Badge>
              <span className="text-sm text-muted-foreground">81-100</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}