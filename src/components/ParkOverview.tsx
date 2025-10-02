import { useState, useEffect, useMemo } from 'react'
import { useKV } from '@github/spark/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChartBar, Clock, TrendUp, SortAscending, Eye } from '@phosphor-icons/react'
import { isAttractionNotDining } from '@/lib/utils'
import type { ExtendedAttraction } from '@/types'

interface ParkOverviewProps {
  parkId: string
  onRideSelect?: (rideId: string) => void
}

type SortOption = 'waitTime-desc' | 'waitTime-asc' | 'name-asc' | 'name-desc'

export function ParkDetailsOverview({ parkId, onRideSelect }: ParkOverviewProps) {
  const [attractions, setAttractions] = useKV<ExtendedAttraction[]>(`attractions-${parkId}`, [])
  const [sortBy, setSortBy] = useState<SortOption>('waitTime-desc')
  const [viewMode, setViewMode] = useState<'bars' | 'list'>('bars')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        console.log(`🔄 ParkOverview loading data for park: ${parkId}`)
        
        // Ensure spark is available
        if (!window.spark?.kv) {
          console.error('❌ Spark KV not available in ParkOverview')
          return
        }
        
        // Small delay to ensure data is loaded
        await new Promise(resolve => setTimeout(resolve, 100))
        
        const data = await window.spark.kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
        console.log(`📊 ParkOverview data for ${parkId}:`, data?.length || 0, 'attractions')
        
        if (data && Array.isArray(data)) {
          setAttractions(data)
          console.log(`✅ ParkOverview successfully loaded ${data.length} attractions`)
        } else {
          console.warn(`⚠️ ParkOverview no data found for ${parkId}`)
          setAttractions([])
        }
      } catch (error) {
        console.error('❌ ParkOverview error loading attractions:', error)
        setAttractions([])
      }
      setIsLoading(false)
    }
    
    loadData()
  }, [parkId])

  // Sort attractions based on selected option
  const sortedAttractions = useMemo(() => {
    console.log(`🔍 ParkOverview sorting ${attractions?.length || 0} attractions for ${parkId}`)
    
    if (!attractions || !Array.isArray(attractions)) {
      console.warn('⚠️ ParkOverview attractions is not an array:', attractions)
      return []
    }
    
    const validAttractions = attractions.filter(attraction => {
      const isValid = attraction && 
        typeof attraction === 'object' && 
        attraction.name && 
        typeof attraction.currentWaitTime === 'number'
      
      if (!isValid) {
        console.warn('⚠️ ParkOverview invalid attraction:', attraction)
        return false
      }
      
      // Filter out dining establishments - only show actual attractions
      return isValid && isAttractionNotDining(attraction)
    })
    
    console.log(`✅ ParkOverview filtered to ${validAttractions.length} valid attractions`)

    return [...validAttractions].sort((a, b) => {
      switch (sortBy) {
        case 'waitTime-desc':
          return b.currentWaitTime - a.currentWaitTime
        case 'waitTime-asc':
          return a.currentWaitTime - b.currentWaitTime
        case 'name-asc':
          return a.name.localeCompare(b.name)
        case 'name-desc':
          return b.name.localeCompare(a.name)
        default:
          return b.currentWaitTime - a.currentWaitTime
      }
    })
  }, [attractions, sortBy, parkId])

  // Calculate statistics
  const stats = useMemo(() => {
    if (!sortedAttractions.length) return { avg: 0, max: 0, min: 0, operating: 0 }
    
    const operatingAttractions = sortedAttractions.filter(a => a.status === 'operating')
    // Exclude closed rides (-1) from wait time calculations
    const waitTimes = operatingAttractions.map(a => a.currentWaitTime).filter(wt => wt > 0 && wt !== -1)
    
    return {
      avg: waitTimes.length > 0 ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0,
      max: Math.max(...waitTimes, 0),
      min: Math.min(...waitTimes.filter(wt => wt > 0), 0) || 0,
      operating: operatingAttractions.length
    }
  }, [sortedAttractions])

  // Get status color and label
  const getStatusInfo = (status: string, waitTime: number) => {
    switch (status) {
      case 'closed':
        return { color: 'bg-muted', label: 'Closed', textColor: 'text-muted-foreground' }
      case 'delayed':
        return { color: 'bg-accent', label: 'Delayed', textColor: 'text-accent-foreground' }
      default:
        if (waitTime === -1) return { color: 'bg-destructive', label: 'Ride is closed', textColor: 'text-destructive-foreground' }
        if (waitTime === 0) return { color: 'bg-success', label: 'Walk On', textColor: 'text-success-foreground' }
        if (waitTime <= 15) return { color: 'bg-success', label: `${waitTime}min`, textColor: 'text-success-foreground' }
        if (waitTime <= 30) return { color: 'bg-accent', label: `${waitTime}min`, textColor: 'text-accent-foreground' }
        if (waitTime <= 60) return { color: 'bg-secondary', label: `${waitTime}min`, textColor: 'text-secondary-foreground' }
        return { color: 'bg-destructive', label: `${waitTime}min`, textColor: 'text-destructive-foreground' }
    }
  }

  if (isLoading) {
    console.log('📊 ParkOverview rendering loading state')
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 bg-muted rounded"></div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!sortedAttractions.length) {
    console.log('📊 ParkOverview rendering empty state for', parkId)
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">No attractions data available for this park.</p>
          <p className="text-sm text-muted-foreground mt-2">Park ID: {parkId}</p>
        </CardContent>
      </Card>
    )
  }

  console.log('📊 ParkOverview rendering overview with', sortedAttractions.length, 'attractions')

  return (
    <div className="space-y-6">
      {/* Statistics Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.operating}</div>
            <div className="text-sm text-muted-foreground">Operating</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-success">{stats.avg}min</div>
            <div className="text-sm text-muted-foreground">Avg Wait</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-destructive">{stats.max}min</div>
            <div className="text-sm text-muted-foreground">Longest Wait</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-success">{stats.min || 0}min</div>
            <div className="text-sm text-muted-foreground">Shortest Wait</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2">
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectTrigger className="w-[200px]">
              <SortAscending size={16} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="waitTime-desc">Longest Wait First</SelectItem>
              <SelectItem value="waitTime-asc">Shortest Wait First</SelectItem>
              <SelectItem value="name-asc">Name A-Z</SelectItem>
              <SelectItem value="name-desc">Name Z-A</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-1">
          <Button
            variant={viewMode === 'bars' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('bars')}
          >
            <ChartBar size={16} />
            Bar Chart
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <Clock size={16} />
            List View
          </Button>
        </div>
      </div>

      {/* Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {viewMode === 'bars' ? <ChartBar size={20} /> : <Clock size={20} />}
            All Attractions Overview
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Click on any attraction to view detailed live wait times
          </p>
        </CardHeader>
        <CardContent>
          {viewMode === 'bars' ? (
            <div className="space-y-3">
              {sortedAttractions.map((attraction) => {
                const statusInfo = getStatusInfo(attraction.status, attraction.currentWaitTime)
                const maxWait = Math.max(...sortedAttractions.map(a => a.currentWaitTime), 60)
                const barWidth = attraction.status === 'operating' && attraction.currentWaitTime > 0 
                  ? (attraction.currentWaitTime / maxWait) * 100 
                  : attraction.status === 'operating' && attraction.currentWaitTime === 0 ? 5 : 2
                
                return (
                  <div 
                    key={attraction.id} 
                    className="space-y-1 cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors group"
                    onClick={() => onRideSelect?.(attraction.id)}
                    title="Click to view live details"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm truncate flex-1 mr-2 group-hover:text-primary transition-colors">
                        {attraction.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <Badge 
                          className={`text-xs ${statusInfo.color} ${statusInfo.textColor} border-0`}
                        >
                          {statusInfo.label}
                        </Badge>
                        <Eye size={12} className="text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
                      </div>
                    </div>
                    <div className="relative h-6 bg-muted rounded-sm">
                      <div
                        className={`absolute left-0 top-0 h-full rounded-sm transition-all duration-300 ${statusInfo.color}`}
                        style={{ width: `${Math.max(barWidth, 2)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {sortedAttractions.map((attraction) => {
                const statusInfo = getStatusInfo(attraction.status, attraction.currentWaitTime)
                
                return (
                  <div 
                    key={attraction.id} 
                    className="flex justify-between items-center py-3 px-4 rounded-lg border bg-card hover:shadow-sm transition-all cursor-pointer group"
                    onClick={() => onRideSelect?.(attraction.id)}
                    title="Click to view live details"
                  >
                    <div className="flex-1">
                      <h4 className="font-medium group-hover:text-primary transition-colors">{attraction.name}</h4>
                      <p className="text-sm text-muted-foreground capitalize">
                        {attraction.type} • Status: {attraction.status}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <Badge 
                        className={`${statusInfo.color} ${statusInfo.textColor} font-semibold border-0`}
                      >
                        {statusInfo.label}
                      </Badge>
                      <Eye size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}