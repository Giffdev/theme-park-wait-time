import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, TrendUp, ArrowLeft, ArrowRight, Sun, Cloud, CloudRain, CloudSnow, CloudLightning } from '@phosphor-icons/react'
import { getWeatherForDate } from '@/services/weatherService'

interface CrowdCalendarProps {
  parkId: string
}

export function CrowdCalendar({ parkId }: CrowdCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [weatherData, setWeatherData] = useState<Record<string, any>>({})

  const getDaysInMonth = (month: number, year: number): number => {
    return new Date(year, month + 1, 0).getDate()
  }

  // Load weather data when month changes
  useEffect(() => {
    const loadWeatherData = async () => {
      const daysInMonth = getDaysInMonth(currentMonth, currentYear)
      const newWeatherData: Record<string, any> = {}
      
      // Load weather for the first 10 days of the month (to avoid rate limiting)
      const maxDays = Math.min(daysInMonth, 10)
      const promises: Promise<void>[] = []
      
      for (let day = 1; day <= maxDays; day++) {
        const date = new Date(currentYear, currentMonth, day)
        const dateKey = `${currentYear}-${currentMonth}-${day}`
        
        const promise = getWeatherForDate(parkId, date)
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
      
      // Load all weather data in parallel but with a reasonable limit
      await Promise.allSettled(promises)
      setWeatherData(newWeatherData)
    }

    loadWeatherData()
  }, [parkId, currentMonth, currentYear])

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const getCrowdLevel = (date: number): number => {
    const seed = date + currentMonth + currentYear
    return Math.floor(Math.random() * seed % 100) + 1
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
        return <Sun size={14} className="text-yellow-500" />
      case 'cloudy':
        return <Cloud size={14} className="text-gray-500" />
      case 'rainy':
        return <CloudRain size={14} className="text-blue-500" />
      case 'stormy':
        return <CloudLightning size={14} className="text-purple-600" />
      case 'snowy':
        return <CloudSnow size={14} className="text-blue-300" />
      default:
        return <Sun size={14} className="text-yellow-500" />
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
      days.push(<div key={`empty-${i}`} className="h-20" />)
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const crowdLevel = getCrowdLevel(day)
      const weatherType = getWeatherType(day)
      days.push(
        <div
          key={day}
          className="h-20 border rounded-lg p-2 hover:shadow-md transition-shadow cursor-pointer"
        >
          <div className="flex flex-col h-full justify-between">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{day}</span>
              {getWeatherIcon(weatherType)}
            </div>
            <Badge 
              className={`text-xs ${getCrowdColor(crowdLevel)} w-fit`}
              variant="secondary"
            >
              {getCrowdLabel(crowdLevel)}
            </Badge>
          </div>
        </div>
      )
    }

    return days
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar size={24} />
              Crowd Calendar
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateMonth('prev')}
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