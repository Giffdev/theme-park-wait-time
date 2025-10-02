import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Clock, TrendUp, Calendar, Plus, Timer } from '@phosphor-icons/react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { QuickWaitTimeModal } from '@/components/QuickWaitTimeModal'
import { RideTimer } from '@/components/RideTimer'
import { parkFamilies } from '@/data/sampleData'
import { ParkDataService } from '@/services/parkDataService'
import { formatTime12Hour, formatChartTimestamp } from '@/utils/timeFormat'
import { useKV } from '@github/spark/hooks'
import { toast } from 'sonner'
import type { Park, User } from '@/App'
import type { ExtendedAttraction, RideLog, Trip, TripPark } from '@/types'

type TimeRange = 'week' | 'month' | 'year'

type HistoricalData = {
  timestamp: string
  waitTime: number
  trendLine?: number
  dayOfWeek?: string
  hour?: number
  month?: string
}

// Helper function to get park display name
const getParkDisplayName = (parkId: string): string => {
  for (const family of parkFamilies) {
    const park = family.parks.find(p => p.id === parkId)
    if (park) return park.name
  }
  return parkId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

// Helper function to get park location
const getParkLocation = (parkId: string): string => {
  for (const family of parkFamilies) {
    const park = family.parks.find(p => p.id === parkId)
    if (park) return family.location
  }
  return 'Unknown Location'
}

export function AttractionDetailsPage({ user, onLoginRequired }: { user?: User | null, onLoginRequired?: () => void }) {
  const { parkId, attractionId } = useParams<{ parkId: string; attractionId: string }>()
  const navigate = useNavigate()
  const [park, setPark] = useState<Park | null>(null)
  const [attraction, setAttraction] = useState<ExtendedAttraction | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('week')
  const [historicalData, setHistoricalData] = useState<HistoricalData[]>([])
  const [loading, setLoading] = useState(true)
  const [showQuickLog, setShowQuickLog] = useState(false)
  const [showTimer, setShowTimer] = useState(false)
  const [isLogging, setIsLogging] = useState(false)
  
  const [currentTrip, setCurrentTrip] = useKV<Trip | null>(
    user ? `current-trip-${user.id}` : 'current-trip-anonymous', 
    null
  )

  const handleTimerLog = useCallback(async (minutes: number) => {
    if (!user || !attraction || !parkId) return
    
    setIsLogging(true)
    try {
      // Create or update trip if needed
      let tripToUse = currentTrip
      
      if (!tripToUse) {
        // Create a new trip for this single attraction visit
        const newTrip: Trip = {
          id: `trip-${user.id}-${Date.now()}`,
          userId: user.id,
          visitDate: new Date().toISOString().split('T')[0],
          parks: [{
            parkId,
            parkName: getParkDisplayName(parkId),
            rideCount: 0
          }],
          rideLogs: [],
          totalRides: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notes: ''
        }
        setCurrentTrip(newTrip)
        tripToUse = newTrip
      }
      
      // Create ride log entry
      const rideLog: RideLog = {
        id: `log-${user.id}-${attractionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId: user.id,
        tripId: tripToUse.id,
        parkId,
        attractionId: attraction.id,
        attractionName: attraction.name,
        attractionType: attraction.type,
        rideCount: minutes, // Store the timed wait as "ride count" in minutes
        loggedAt: new Date().toISOString(),
        notes: `Timed wait: ${minutes} minutes`
      }
      
      // Update trip with new ride log
      const updatedTrip: Trip = {
        ...tripToUse,
        rideLogs: [...tripToUse.rideLogs, rideLog],
        totalRides: tripToUse.totalRides + minutes,
        updatedAt: new Date().toISOString(),
        parks: tripToUse.parks.map(p => 
          p.parkId === parkId 
            ? { ...p, rideCount: p.rideCount + minutes }  
            : p
        )
      }
      
      // Save to storage
      await window.spark.kv.set(`current-trip-${user.id}`, updatedTrip)
      await window.spark.kv.set(`trip-${updatedTrip.id}`, updatedTrip)
      
      // Update user's trip history
      const userTrips = await window.spark.kv.get<string[]>(`user-trips-${user.id}`) || []
      if (!userTrips.includes(updatedTrip.id)) {
        userTrips.push(updatedTrip.id)
        await window.spark.kv.set(`user-trips-${user.id}`, userTrips)
      }
      
      setCurrentTrip(updatedTrip)
      toast.success(`Logged ${minutes}-minute wait for ${attraction.name}!`)
      setShowTimer(false)
    } catch (error) {
      console.error('Failed to log timer result:', error)
      toast.error('Failed to log your wait time. Please try again.')
    } finally {
      setIsLogging(false)
    }
  }, [user, attraction, parkId, attractionId, currentTrip, setCurrentTrip])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        
        if (!parkId || !attractionId) return
        
        console.log(`Loading attraction data for park: ${parkId}, attraction: ${attractionId}`)
        
        // Use ParkDataService for better fallback handling
        const attractionsData = await ParkDataService.loadAttractions(parkId)
        console.log(`Found attractions data:`, attractionsData?.length || 0, 'attractions')
        
        if (attractionsData && Array.isArray(attractionsData) && attractionsData.length > 0) {
          // Find the specific attraction
          const foundAttraction = attractionsData.find(a => a.id === attractionId)
          console.log(`Looking for attraction ID: ${attractionId}`)
          console.log(`Available attraction IDs:`, attractionsData.map(a => `${a.id} (${a.name})`))
          
          if (foundAttraction) {
            setAttraction(foundAttraction)
            
            // Create a mock park object for display
            const mockPark: Park = {
              id: parkId,
              name: getParkDisplayName(parkId),
              location: getParkLocation(parkId),
              attractions: attractionsData
            }
            setPark(mockPark)
            console.log(`✅ Found attraction: ${foundAttraction.name}`)
          } else {
            console.warn(`Attraction ${attractionId} not found in park ${parkId}`)
          }
        } else {
          console.warn(`No attractions data found for park ${parkId}, trying sample data fallback`)
          
          // Fallback: try to load from sample data directly
          try {
            const { sampleAttractions } = await import('@/data/sampleData')
            const sampleData = sampleAttractions[parkId]
            
            if (sampleData && Array.isArray(sampleData)) {
              console.log(`Loaded from sample data: ${sampleData.length} attractions`)
              const foundAttraction = sampleData.find(a => a.id === attractionId)
              
              if (foundAttraction) {
                setAttraction(foundAttraction)
                
                // Create a mock park object for display
                const mockPark: Park = {
                  id: parkId,
                  name: getParkDisplayName(parkId),
                  location: getParkLocation(parkId),
                  attractions: sampleData
                }
                setPark(mockPark)
                console.log(`✅ Found attraction in sample data: ${foundAttraction.name}`)
              } else {
                console.warn(`Attraction ${attractionId} not found in sample data for park ${parkId}`)
                console.log(`Available sample attraction IDs:`, sampleData.map(a => `${a.id} (${a.name})`))
              }
            }
          } catch (importError) {
            console.error('Failed to load sample data:', importError)
          }
        }

        // Generate historical data based on time range
        const data = generateHistoricalData(timeRange)
        setHistoricalData(data)
        console.log('Historical data with trends:', data.slice(0, 3)) // Debug first few points
        
      } catch (error) {
        console.error('Error loading attraction data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [parkId, attractionId, timeRange])

  const generateHistoricalData = (range: TimeRange): HistoricalData[] => {
    const data: HistoricalData[] = []
    const now = new Date()
    
    if (range === 'week') {
      // Generate hourly data for the past week
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        
        for (let hour = 9; hour <= 21; hour++) {
          const baseWait = 15 + Math.sin(hour / 3) * 20 // Peak times during day
          const randomVariation = Math.random() * 30 - 15
          const weekendMultiplier = date.getDay() === 0 || date.getDay() === 6 ? 1.3 : 1
          
          data.push({
            timestamp: `${date.getMonth() + 1}/${date.getDate()} ${formatTime12Hour(hour)}`,
            waitTime: Math.max(5, Math.round((baseWait + randomVariation) * weekendMultiplier)),
            dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }),
            hour
          })
        }
      }
    } else if (range === 'month') {
      // Generate daily averages for the past month
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        
        const baseWait = 35 + Math.sin(i / 5) * 15
        const randomVariation = Math.random() * 20 - 10
        const weekendMultiplier = date.getDay() === 0 || date.getDay() === 6 ? 1.4 : 1
        
        data.push({
          timestamp: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          waitTime: Math.max(10, Math.round((baseWait + randomVariation) * weekendMultiplier)),
          dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' })
        })
      }
    } else {
      // Generate monthly averages for the past year
      for (let i = 11; i >= 0; i--) {
        const date = new Date(now)
        date.setMonth(date.getMonth() - i)
        
        // Seasonal variations (higher in summer, lower in winter)
        const seasonalMultiplier = Math.sin((date.getMonth() - 2) * Math.PI / 6) * 0.3 + 1
        const baseWait = 30 * seasonalMultiplier
        const randomVariation = Math.random() * 15 - 7.5
        
        data.push({
          timestamp: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          waitTime: Math.max(15, Math.round(baseWait + randomVariation)),
          month: date.toLocaleDateString('en-US', { month: 'short' })
        })
      }
    }
    
    // Calculate trend line using moving average
    return calculateTrendLine(data)
  }

  const calculateTrendLine = (data: HistoricalData[]): HistoricalData[] => {
    if (data.length < 3) return data.map(d => ({ ...d, trendLine: d.waitTime }))
    
    // Use a simple moving average with fixed window size for better visibility
    const windowSize = Math.max(3, Math.min(5, Math.floor(data.length / 4)))
    console.log(`Calculating trend line with window size: ${windowSize} for ${data.length} data points`)
    
    const result = data.map((point, index) => {
      // Calculate moving average for trend line
      const start = Math.max(0, index - Math.floor(windowSize / 2))
      const end = Math.min(data.length, index + Math.ceil(windowSize / 2))
      const window = data.slice(start, end)
      
      const trendLine = window.reduce((sum, p) => sum + p.waitTime, 0) / window.length
      
      return {
        ...point,
        trendLine: Math.round(trendLine)
      }
    })
    
    console.log('Sample trend calculations:', result.slice(0, 3).map(r => ({ waitTime: r.waitTime, trendLine: r.trendLine })))
    return result
  }

  const getAverageWaitTime = () => {
    if (historicalData.length === 0) return 0
    return Math.round(historicalData.reduce((sum, item) => sum + item.waitTime, 0) / historicalData.length)
  }

  const getPeakTime = () => {
    if (timeRange !== 'week') return null
    
    const hourlyAverages = new Map<number, number[]>()
    historicalData.forEach(item => {
      if (item.hour !== undefined) {
        if (!hourlyAverages.has(item.hour)) {
          hourlyAverages.set(item.hour, [])
        }
        hourlyAverages.get(item.hour)!.push(item.waitTime)
      }
    })
    
    let peakHour = 9
    let maxAverage = 0
    
    hourlyAverages.forEach((times, hour) => {
      const average = times.reduce((sum, time) => sum + time, 0) / times.length
      if (average > maxAverage) {
        maxAverage = average
        peakHour = hour
      }
    })
    
    return `${formatTime12Hour(peakHour)} - ${formatTime12Hour(peakHour + 1)}`
  }

  const getBestTime = () => {
    if (timeRange !== 'week') return null
    
    const hourlyAverages = new Map<number, number[]>()
    historicalData.forEach(item => {
      if (item.hour !== undefined) {
        if (!hourlyAverages.has(item.hour)) {
          hourlyAverages.set(item.hour, [])
        }
        hourlyAverages.get(item.hour)!.push(item.waitTime)
      }
    })
    
    let bestHour = 9
    let minAverage = Infinity
    
    hourlyAverages.forEach((times, hour) => {
      const average = times.reduce((sum, time) => sum + time, 0) / times.length
      if (average < minAverage) {
        minAverage = average
        bestHour = hour
      }
    })
    
    return `${formatTime12Hour(bestHour)} - ${formatTime12Hour(bestHour + 1)}`
  }

  const normalizeYAxisDomain = (data: HistoricalData[]) => {
    const waitValues = data.map(d => d.waitTime)
    const trendValues = data.map(d => d.trendLine).filter(Boolean) as number[]
    const allValues = [...waitValues, ...trendValues]
    
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)
    
    // Snap to nearest 10 minutes for better readability
    const minSnap = Math.floor(Math.max(0, min - 5) / 10) * 10
    const maxSnap = Math.ceil((max + 5) / 10) * 10
    
    return [minSnap, maxSnap]
  }

  const getStatusColor = (waitTime: number) => {
    if (waitTime <= 20) return 'bg-success text-success-foreground'
    if (waitTime <= 45) return 'bg-accent text-accent-foreground'
    return 'bg-destructive text-destructive-foreground'
  }

  const getStatusText = (waitTime: number) => {
    if (waitTime <= 20) return 'Short Wait'
    if (waitTime <= 45) return 'Moderate Wait'
    return 'Long Wait'
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="h-96 bg-muted rounded"></div>
            </div>
            <div className="space-y-4">
              <div className="h-32 bg-muted rounded"></div>
              <div className="h-32 bg-muted rounded"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!park || !attraction) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Attraction Not Found</h1>
        <Button 
          onClick={() => navigate('/')} 
          variant="outline"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Home
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={() => navigate(`/park/${parkId}`)}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to {park.name}
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{attraction.name}</h1>
            <p className="text-muted-foreground">{park.name}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => {
              if (!user) {
                onLoginRequired?.()
              } else {
                setShowTimer(true)
              }
            }}
            variant="outline"
            className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          >
            <Timer className="w-4 h-4 mr-2" />
            Start Timer
          </Button>
          
          <Button 
            onClick={() => {
              if (!user) {
                onLoginRequired?.()
              } else {
                setShowQuickLog(true)
              }
            }}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            Log Wait Time
          </Button>
          
          <Badge className={getStatusColor(attraction.currentWaitTime)}>
            <Clock className="w-4 h-4 mr-1" />
            {attraction.currentWaitTime} min - {getStatusText(attraction.currentWaitTime)}
          </Badge>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">Time Range:</span>
        <Select value={timeRange} onValueChange={(value: TimeRange) => setTimeRange(value)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Past Week (Hourly)</SelectItem>
            <SelectItem value="month">Past Month (Daily)</SelectItem>
            <SelectItem value="year">Past Year (Monthly)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendUp className="w-5 h-5" />
                Wait Time Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historicalData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="timestamp" 
                      stroke="#6b7280"
                      fontSize={12}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      fontSize={12}
                      domain={normalizeYAxisDomain(historicalData)}
                      tickFormatter={(value) => `${value}m`}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        if (name === 'waitTime') {
                          return [`${value} minutes`, 'Reported Wait Time']
                        } else if (name === 'trendLine') {
                          return [`${value} minutes`, 'Statistical Trend']
                        }
                        return [value, name]
                      }}
                      labelFormatter={(label) => `Time: ${label}`}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    
                    {/* Actual reported data points */}
                    <Line
                      type="monotone"
                      dataKey="waitTime"
                      stroke="hsl(var(--primary))"
                      strokeWidth={0}
                      dot={{ 
                        fill: "hsl(var(--primary))", 
                        strokeWidth: 0, 
                        r: 4,
                        fillOpacity: 0.8
                      }}
                      connectNulls={false}
                      name="waitTime"
                    />
                    
                    {/* Statistical trend line - must come after data points to show on top */}
                    <Line
                      type="monotone"
                      dataKey="trendLine"
                      stroke="#f97316"
                      strokeWidth={3}
                      dot={false}
                      strokeDasharray="none"
                      name="trendLine"
                      connectNulls={true}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              
              {/* Legend */}
              <div className="flex justify-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary opacity-60"></div>
                  <span>Reported Wait Times</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-1" style={{ backgroundColor: '#f97316' }}></div>
                  <span>Statistical Trend</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Statistics */}
        <div className="space-y-6">
          {/* Current Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Current Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">
                  {attraction.currentWaitTime}
                </div>
                <div className="text-sm text-muted-foreground">minutes</div>
                <Badge 
                  variant="secondary" 
                  className={`mt-2 ${attraction.status === 'operating' ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'}`}
                >
                  {attraction.status === 'operating' ? 'Operating' : 'Closed'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="w-5 h-5" />
                {timeRange === 'week' ? 'This Week' : timeRange === 'month' ? 'This Month' : 'This Year'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Average Wait</span>
                  <span className="font-medium">{getAverageWaitTime()} min</span>
                </div>
                
                {timeRange === 'week' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Peak Time</span>
                      <span className="font-medium">{getPeakTime()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Best Time</span>
                      <span className="font-medium">{getBestTime()}</span>
                    </div>
                  </>
                )}
                
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Max Wait</span>
                  <span className="font-medium">{Math.max(...historicalData.map(d => d.waitTime))} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Min Wait</span>
                  <span className="font-medium">{Math.min(...historicalData.map(d => d.waitTime))} min</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Wait Time Modal */}
      {showQuickLog && attraction && (
        <QuickWaitTimeModal
          attractionId={attraction.id}
          attractionName={attraction.name}
          parkId={parkId!}
          parkName={park!.name}
          user={user || null}
          onClose={() => setShowQuickLog(false)}
          onLoginRequired={onLoginRequired}
        />
      )}

      {/* Timer Modal */}
      {showTimer && attraction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Timer size={20} />
                  Timer for {attraction.name}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTimer(false)}
                  className="h-8 w-8 p-0"
                >
                  ×
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RideTimer
                user={user || null}
                attraction={attraction}
                parkId={parkId!}
                onTimeLogged={handleTimerLog}
                isLogging={isLogging}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}