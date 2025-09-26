import { useState, useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, TrendUp, MapPin } from '@phosphor-icons/react'
import { WaitTimeChart } from '@/components/WaitTimeChart'
import { parkFamilies } from '@/data/sampleData'
import type { Attraction } from '@/App'

interface ParkOverviewProps {
  onParkSelect: (parkId: string) => void
}

export function ParkOverview({ onParkSelect }: ParkOverviewProps) {
  const [parkData, setParkData] = useState<Record<string, Attraction[]>>({})
  const [isLoading, setIsLoading] = useState(true)

  // Get all individual parks from all park families
  const allParks = parkFamilies.flatMap(family => 
    family.parks
      .filter(park => park.type === 'theme-park') // Only show theme parks in overview
      .map(park => ({
        ...park,
        familyName: family.name,
        location: family.location
      }))
  )

  useEffect(() => {
    const loadAllParks = async () => {
      setIsLoading(true)
      try {
        const data: Record<string, Attraction[]> = {}
        
        // Try to initialize sample data first
        const { initializeSampleData } = await import('@/data/sampleData')
        await initializeSampleData()
        
        for (const park of allParks) {
          const attractions = await window.spark.kv.get<Attraction[]>(`attractions-${park.id}`)
          if (attractions && Array.isArray(attractions) && attractions.length > 0) {
            data[park.id] = attractions
            console.log(`✅ Loaded ${attractions.length} attractions for ${park.name}`)
          } else {
            console.warn(`❌ No attractions found for ${park.name} (${park.id})`)
          }
        }
        
        setParkData(data)
        console.log('✅ Loaded park overview data:', Object.keys(data).length, 'parks with data')
        console.log('📊 Park data loaded:', data)
      } catch (error) {
        console.error('❌ Error loading park overview:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadAllParks()
  }, [])

  const getParkStats = (attractions: Attraction[]) => {
    if (!attractions || attractions.length === 0) return { avgWait: 0, maxWait: 0, popular: null }
    
    const waitTimes = attractions.map(a => a.currentWaitTime)
    const avgWait = Math.round(waitTimes.reduce((sum, wait) => sum + wait, 0) / waitTimes.length)
    const maxWait = Math.max(...waitTimes)
    const popular = attractions.reduce((prev, current) => 
      prev.currentWaitTime > current.currentWaitTime ? prev : current
    )
    
    return { avgWait, maxWait, popular }
  }

  const getWaitTimeColor = (waitTime: number) => {
    if (waitTime <= 30) return 'bg-success text-success-foreground'
    if (waitTime <= 60) return 'bg-accent text-accent-foreground'
    return 'bg-destructive text-destructive-foreground'
  }

  // Group parks by family for organized display
  const groupedParks = parkFamilies.reduce((acc, family) => {
    const familyParks = family.parks
      .filter(park => park.type === 'theme-park')
      .filter(park => parkData[park.id]) // Only show parks with data
    
    if (familyParks.length > 0) {
      acc.push({
        family,
        parks: familyParks
      })
    }
    return acc
  }, [] as { family: typeof parkFamilies[0], parks: typeof parkFamilies[0]['parks'] }[])

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">Live Park Overview</h2>
        <p className="text-muted-foreground">Current wait times and trends across all parks</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-3">
                <div className="h-6 bg-muted rounded w-3/4"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-24 bg-muted rounded mb-4"></div>
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-muted rounded w-1/3"></div>
                  <div className="h-6 bg-muted rounded w-16"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {groupedParks.map(({ family, parks }) => (
            <div key={family.id} className="space-y-4">
              <div className="border-b pb-2">
                <h3 className="text-xl font-semibold text-foreground">{family.name}</h3>
                <div className="flex items-center text-sm text-muted-foreground mt-1">
                  <MapPin size={14} className="mr-1" />
                  {family.location}
                </div>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {parks.map((park) => {
                  const attractions = parkData[park.id] || []
                  const stats = getParkStats(attractions)
                  
                  return (
                    <Card 
                      key={park.id} 
                      className="hover:shadow-lg transition-all duration-300 cursor-pointer"
                      onClick={() => onParkSelect(park.id)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg font-medium leading-tight">
                              {park.shortName}
                            </CardTitle>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {attractions.length} rides
                          </Badge>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="space-y-4">
                        {/* Featured Attraction Chart */}
                        {stats.popular && (
                          <div className="space-y-2">
                            <div className="text-sm text-muted-foreground font-medium">
                              Busiest: {stats.popular.name}
                            </div>
                            <WaitTimeChart attractionId={stats.popular.id} />
                          </div>
                        )}
                        
                        {/* Current Stats */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Clock size={16} className="text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Avg Wait</span>
                          </div>
                          <Badge className={getWaitTimeColor(stats.avgWait)}>
                            {stats.avgWait} min
                          </Badge>
                        </div>
                        
                        {stats.maxWait > stats.avgWait && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <TrendUp size={16} className="text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">Peak Wait</span>
                            </div>
                            <Badge className={getWaitTimeColor(stats.maxWait)}>
                              {stats.maxWait} min
                            </Badge>
                          </div>
                        )}
                        
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full mt-4"
                          onClick={(e) => {
                            e.stopPropagation()
                            onParkSelect(park.id)
                          }}
                        >
                          View Details
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}