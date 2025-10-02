import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { formatTime12Hour } from '@/utils/timeFormat'
import { useKV } from '@github/spark/hooks'

interface WaitTimeDataPoint {
  time: string
  waitTime: number
  hour: number
}

interface WaitTimeChartProps {
  attractionId: string
  className?: string
}

export function WaitTimeChart({ attractionId, className = '' }: WaitTimeChartProps) {
  const [chartData, setChartData] = useState<WaitTimeDataPoint[]>([])
  const [historicalReports] = useKV<any[]>(`wait-reports-${attractionId}`, [])

  const getWaitTimeVariant = (waitTime: number): "success" | "accent" | "secondary" | "destructive" => {
    if (waitTime === -1) return 'destructive' // Closed rides
    if (waitTime <= 15) return 'success'
    if (waitTime <= 30) return 'accent'
    if (waitTime <= 60) return 'secondary'
    return 'destructive'
  }

  useEffect(() => {
    // Generate realistic historical data for today based on typical theme park patterns
    const generateTodayData = () => {
      const today = new Date()
      const data: WaitTimeDataPoint[] = []
      
      // Theme park hours: 9 AM to 10 PM (13 hours)
      for (let hour = 9; hour <= 22; hour++) {
        let baseWaitTime = 30 // Base wait time
        
        // Morning rush (9-11 AM): moderate increase
        if (hour >= 9 && hour <= 11) {
          baseWaitTime += Math.random() * 20 + 10
        }
        // Lunch lull (11 AM - 1 PM): slight decrease
        else if (hour >= 11 && hour <= 13) {
          baseWaitTime += Math.random() * 10 - 5
        }
        // Afternoon peak (1-5 PM): highest waits
        else if (hour >= 13 && hour <= 17) {
          baseWaitTime += Math.random() * 40 + 20
        }
        // Evening decline (5-8 PM): gradual decrease
        else if (hour >= 17 && hour <= 20) {
          baseWaitTime += Math.random() * 30 + 5
        }
        // Night hours (8-10 PM): lower waits
        else if (hour >= 20 && hour <= 22) {
          baseWaitTime += Math.random() * 15 - 5
        }
        
        // Ensure minimum wait time of 5 minutes
        baseWaitTime = Math.max(5, Math.round(baseWaitTime))
        
        const timeString = formatTime12Hour(hour)
        data.push({
          time: timeString,
          waitTime: baseWaitTime,
          hour
        })
      }
      
      return data
    }

    const loadChartData = async () => {
      try {
        // Always generate data first to ensure charts are never empty
        const generatedData = generateTodayData()
        setChartData(generatedData)
        console.log(`📈 Generated chart data for ${attractionId}:`, generatedData.length, 'points')
        
        // If we have real historical reports, process those
        if (historicalReports && Array.isArray(historicalReports) && historicalReports.length > 10) {
          // Process real reports into hourly averages
          const today = new Date()
          const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
          
          const hourlyData: { [hour: number]: number[] } = {}
          
          historicalReports
            .filter(report => new Date(report.reportedAt) >= todayStart)
            .forEach(report => {
              const hour = new Date(report.reportedAt).getHours()
              if (!hourlyData[hour]) hourlyData[hour] = []
              // Only include valid wait times (not closed rides) in hourly averages
              if (report.waitTime >= 0) {
                hourlyData[hour].push(report.waitTime)
              }
            })
          
          const processedData: WaitTimeDataPoint[] = []
          for (let hour = 9; hour <= 22; hour++) {
            const hourReports = hourlyData[hour] || []
            const avgWaitTime = hourReports.length > 0 
              ? Math.round(hourReports.reduce((sum, time) => sum + time, 0) / hourReports.length)
              : generatedData.find(d => d.hour === hour)?.waitTime || Math.round(Math.random() * 50 + 20) // Fallback
            
            const timeString = formatTime12Hour(hour)
            processedData.push({
              time: timeString,
              waitTime: avgWaitTime,
              hour
            })
          }
          
          setChartData(processedData)
          console.log(`📈 Using processed historical data for ${attractionId}:`, processedData.length, 'points')
        }
      } catch (error) {
        console.error(`❌ Error generating chart data for ${attractionId}:`, error)
        // Still ensure we have data to prevent blank charts
        const fallbackData = generateTodayData()
        setChartData(fallbackData)
      }
    }

    // Load chart data immediately
    loadChartData()
  }, [attractionId, historicalReports])

  // Always render a chart - never return null
  if (chartData.length === 0) {
    // Show a minimal loading state instead of nothing
    return (
      <div className={`bg-muted/30 rounded-lg p-3 ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Today's Pattern</span>
          <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
        </div>
        <div className="w-full h-16 bg-muted/50 rounded animate-pulse"></div>
      </div>
    )
  }

  // Calculate normalized max wait time for better scaling (exclude closed rides)
  const validWaitTimes = chartData.map(d => d.waitTime).filter(time => time >= 0)
  const rawMaxWaitTime = validWaitTimes.length > 0 ? Math.max(...validWaitTimes) : 30
  
  // Normalize to nearest 5, 10, or 20 minutes for clean, readable axis labels
  // This prevents awkward scales like 0-77 minutes and creates more intuitive charts
  const normalizeMaxWaitTime = (max: number) => {
    if (max <= 30) {
      // For low values (≤30min), round to nearest 5 minutes
      return Math.ceil(max / 5) * 5
    } else if (max <= 100) {
      // For medium values (30-100min), round to nearest 10 minutes
      return Math.ceil(max / 10) * 10
    } else {
      // For high values (>100min), round to nearest 20 minutes
      return Math.ceil(max / 20) * 20
    }
  }
  
  const maxWaitTime = normalizeMaxWaitTime(rawMaxWaitTime)
  const chartHeight = 60
  const chartWidth = 200

  // Create SVG path for the line chart
  const createPath = (data: WaitTimeDataPoint[]) => {
    if (data.length === 0) return ''
    
    const stepX = chartWidth / (data.length - 1)
    
    let path = ''
    data.forEach((point, index) => {
      const x = index * stepX
      // For closed rides (-1), show them at the bottom of the chart
      const normalizedWaitTime = point.waitTime === -1 ? 0 : point.waitTime
      const y = chartHeight - (normalizedWaitTime / maxWaitTime) * chartHeight
      
      if (index === 0) {
        path += `M ${x} ${y}`
      } else {
        path += ` L ${x} ${y}`
      }
    })
    
    return path
  }

  const pathData = createPath(chartData)
  const currentHour = new Date().getHours()
  const currentDataPoint = chartData.find(d => d.hour === currentHour)

  return (
    <div className={`bg-muted/30 rounded-lg p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">Today's Pattern</span>
        <span className="text-xs text-muted-foreground">
          {chartData.length > 0 && `${chartData[0].time} - ${chartData[chartData.length - 1].time}`}
        </span>
      </div>
      
      <div className="relative">
        <svg 
          width={chartWidth} 
          height={chartHeight} 
          className="w-full" 
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="20" height={chartHeight / 4} patternUnits="userSpaceOnUse">
              <path d={`M 20 0 L 0 0 0 ${chartHeight / 4}`} fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          {/* Horizontal reference lines */}
          {maxWaitTime >= 20 && (
            <line 
              x1="0" 
              y1={chartHeight / 2} 
              x2={chartWidth} 
              y2={chartHeight / 2} 
              stroke="currentColor" 
              strokeWidth="0.5" 
              opacity="0.2"
              strokeDasharray="2,2"
            />
          )}
          
          {/* Area under curve */}
          <path
            d={`${pathData} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`}
            fill="oklch(0.45 0.15 230)"
            fillOpacity="0.1"
          />
          
          {/* Main line */}
          <path
            d={pathData}
            fill="none"
            stroke="oklch(0.45 0.15 230)"
            strokeWidth="2"
            className="drop-shadow-sm"
          />
          
          {/* Current time indicator */}
          {currentDataPoint && (
            <circle
              cx={chartData.findIndex(d => d.hour === currentHour) * (chartWidth / (chartData.length - 1))}
              cy={chartHeight - ((currentDataPoint.waitTime === -1 ? 0 : currentDataPoint.waitTime) / maxWaitTime) * chartHeight}
              r="3"
              fill="oklch(0.70 0.18 50)"
              stroke="white"
              strokeWidth="1"
              className="drop-shadow-sm"
            />
          )}
        </svg>
        
        {/* X-axis labels */}
        <div className="flex justify-between mt-1 text-xs text-muted-foreground">
          <span>{formatTime12Hour(9)}</span>
          <span>{formatTime12Hour(14)}</span>
          <span>{formatTime12Hour(19)}</span>
          <span>{formatTime12Hour(22)}</span>
        </div>
        
        {/* Y-axis labels */}
        <div className="absolute -left-2 top-0 text-xs text-muted-foreground">
          {maxWaitTime}m
        </div>
        {maxWaitTime >= 20 && (
          <div className="absolute -left-2 text-xs text-muted-foreground" style={{ top: '50%', transform: 'translateY(-50%)' }}>
            {Math.round(maxWaitTime / 2)}m
          </div>
        )}
        <div className="absolute -left-1 bottom-0 text-xs text-muted-foreground">
          0m
        </div>
      </div>
      
      {currentDataPoint && (
        <div className="flex items-center justify-center mt-2 text-xs">
          <Badge variant={getWaitTimeVariant(currentDataPoint.waitTime)}>
            Now: {currentDataPoint.waitTime === -1 ? 'Closed' : `${currentDataPoint.waitTime} min`}
          </Badge>
        </div>
      )}
    </div>
  )
}