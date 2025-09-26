import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Clock, TrendUp, MapPin, CaretDown, CaretUp, FunnelSimple } from '@phosphor-icons/react'
import { WaitTimeChart } from '@/components/WaitTimeChart'
import { parkFamilies } from '@/data/sampleData'
import type { Attraction } from '@/App'

interface ParkOverviewProps {
  onParkSelect: (parkId: string) => void
}

export function ParkOverview({ onParkSelect }: ParkOverviewProps) {
  const [parkData, setParkData] = useState<Record<string, Attraction[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFamily, setSelectedFamily] = useState<string>('all')
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set())

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
        
        // Ensure spark is available before proceeding
        if (!window.spark?.kv) {
          console.error('❌ Spark KV not available in ParkOverview')
          return
        }
        
        // Initialize sample data first and wait for completion
        const { initializeSampleData } = await import('@/data/sampleData')
        const initSuccess = await initializeSampleData()
        
        if (!initSuccess) {
          console.error('❌ Failed to initialize sample data in ParkOverview')
        }
        
        // Give a small delay to ensure data is properly saved
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // Load data for all parks with error handling for each park
        const loadPromises = allParks.map(async (park) => {
          try {
            let attractions = await window.spark.kv.get<Attraction[]>(`attractions-${park.id}`)
            
            // Retry once if no data found
            if (!attractions || !Array.isArray(attractions) || attractions.length === 0) {
              await new Promise(resolve => setTimeout(resolve, 100))
              attractions = await window.spark.kv.get<Attraction[]>(`attractions-${park.id}`)
            }
            
            if (attractions && Array.isArray(attractions) && attractions.length > 0) {
              data[park.id] = attractions
              console.log(`✅ Loaded ${attractions.length} attractions for ${park.name} (${park.id})`)
            } else {
              console.warn(`⚠️ No attractions found for ${park.name} (${park.id}) - this park might not have sample data`)
            }
          } catch (parkError) {
            console.error(`❌ Error loading park ${park.name}:`, parkError)
          }
        })
        
        // Wait for all parks to load
        await Promise.all(loadPromises)
        
        setParkData(data)
        console.log(`✅ Loaded park overview data: ${Object.keys(data).length} parks with data out of ${allParks.length} total parks`)
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
      // Show all parks initially, data will populate as it loads
    
    if (familyParks.length > 0) {
      acc.push({
        family,
        parks: familyParks
      })
    }
    return acc
  }, [] as { family: typeof parkFamilies[0], parks: typeof parkFamilies[0]['parks'] }[])

  // Filter parks based on selected family
  const filteredGroupedParks = selectedFamily === 'all' 
    ? groupedParks 
    : groupedParks.filter(group => group.family.id === selectedFamily)

  const toggleFamilyCollapse = (familyId: string) => {
    setCollapsedFamilies(prev => {
      const newSet = new Set(prev)
      if (newSet.has(familyId)) {
        newSet.delete(familyId)
      } else {
        newSet.add(familyId)
      }
      return newSet
    })
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-semibold text-foreground">Live Park Overview</h2>
        <p className="text-muted-foreground">Current wait times and trends across all parks</p>
        
        {/* Family Filter */}
        <div className="flex justify-center">
          <div className="w-full max-w-xs">
            <Select value={selectedFamily} onValueChange={setSelectedFamily}>
              <SelectTrigger className="w-full">
                <div className="flex items-center gap-2">
                  <FunnelSimple size={16} />
                  <SelectValue placeholder="Filter by park family" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <span>All Park Families</span>
                    <Badge variant="secondary" className="text-xs">
                      {groupedParks.length}
                    </Badge>
                  </div>
                </SelectItem>
                {groupedParks.map(({ family, parks }) => (
                  <SelectItem key={family.id} value={family.id}>
                    <div className="flex items-center gap-2">
                      <span>{family.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {parks.length}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedFamily !== 'all' && (
          <div className="text-sm text-muted-foreground">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedFamily('all')}
              className="text-primary hover:text-primary"
            >
              ← Show all families
            </Button>
          </div>
        )}
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
        <div className="space-y-6">
          {filteredGroupedParks.map(({ family, parks }) => {
            const isCollapsed = collapsedFamilies.has(family.id)
            const totalParks = parks.length
            const parksWithData = parks.filter(park => parkData[park.id] && parkData[park.id].length > 0)
            const totalAttractions = parks.reduce((sum, park) => sum + (parkData[park.id]?.length || 0), 0)
            
            const avgWaitAcrossFamily = parksWithData.length > 0 
              ? parksWithData.reduce((sum, park) => {
                  const attractions = parkData[park.id] || []
                  const stats = getParkStats(attractions)
                  return sum + stats.avgWait
                }, 0) / parksWithData.length
              : 0
            
            return (
              <Collapsible key={family.id} open={!isCollapsed} onOpenChange={() => toggleFamilyCollapse(family.id)}>
                <div className="border border-border rounded-lg overflow-hidden bg-card">
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="w-full justify-between p-6 h-auto hover:bg-muted/50 rounded-none"
                    >
                      <div className="flex items-center gap-6 text-left">
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold text-foreground">{family.name}</h3>
                          <div className="flex items-center text-sm text-muted-foreground mt-1">
                            <MapPin size={14} className="mr-1" />
                            {family.location}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <div className="text-sm font-medium text-foreground">
                              {totalAttractions > 0 ? Math.round(avgWaitAcrossFamily) : '--'}
                            </div>
                            <div className="text-xs text-muted-foreground">avg min</div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                              {totalParks} parks
                            </Badge>
                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                              {totalAttractions > 0 ? `${totalAttractions} rides` : 'Loading...'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isCollapsed ? <CaretDown size={20} /> : <CaretUp size={20} />}
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="p-6 pt-0 border-t bg-muted/20">
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {parks.map((park) => {
                          const attractions = parkData[park.id] || []
                          const hasData = attractions.length > 0
                          const stats = getParkStats(attractions)
                          
                          return (
                            <Card 
                              key={park.id} 
                              className="hover:shadow-lg transition-all duration-300 cursor-pointer border-l-4 border-l-primary/20 hover:border-l-primary bg-background"
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
                                    {hasData ? `${attractions.length} rides` : 'Loading...'}
                                  </Badge>
                                </div>
                              </CardHeader>
                              
                              <CardContent className="space-y-4">
                                {hasData ? (
                                  <>
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
                                  </>
                                ) : (
                                  <>
                                    {/* Loading placeholder */}
                                    <div className="space-y-2">
                                      <div className="h-24 bg-muted/50 rounded animate-pulse"></div>
                                    </div>
                                    
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center space-x-2">
                                        <Clock size={16} className="text-muted-foreground" />
                                        <span className="text-sm text-muted-foreground">Loading wait times...</span>
                                      </div>
                                      <Badge variant="secondary">--</Badge>
                                    </div>
                                  </>
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
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )
          })}
          
          {filteredGroupedParks.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <div className="mx-auto w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mb-4">
                <FunnelSimple size={32} className="text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                {selectedFamily === 'all' 
                  ? "No parks available" 
                  : "No parks found for selected family"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {selectedFamily === 'all' 
                  ? "Park data may still be loading. Please try refreshing the page." 
                  : "Try selecting a different park family or clear the filter to see all parks."}
              </p>
              {selectedFamily !== 'all' && (
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedFamily('all')}
                >
                  Show All Families
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}