import { useKV } from '@github/spark/hooks'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Clock, MapPin } from '@phosphor-icons/react'

interface ParkOverviewProps {
  onParkSelect: (parkId: string) => void
}

interface ParkFamily {
  name: string
  location: string
  parks: Array<{
    id: string
    name: string
    shortName?: string
  }>
}

const PARK_FAMILIES: ParkFamily[] = [
  {
    name: "Walt Disney World",
    location: "Orlando, FL",
    parks: [
      { id: "magic-kingdom", name: "Magic Kingdom" },
      { id: "epcot", name: "EPCOT" },
      { id: "hollywood-studios", name: "Disney's Hollywood Studios", shortName: "Hollywood Studios" },
      { id: "animal-kingdom", name: "Disney's Animal Kingdom", shortName: "Animal Kingdom" },
      { id: "typhoon-lagoon", name: "Disney's Typhoon Lagoon", shortName: "Typhoon Lagoon" },
      { id: "blizzard-beach", name: "Disney's Blizzard Beach", shortName: "Blizzard Beach" }
    ]
  },
  {
    name: "Universal Orlando", 
    location: "Orlando, FL",
    parks: [
      { id: "universal-studios-orlando", name: "Universal Studios Florida", shortName: "Universal Studios" },
      { id: "islands-of-adventure", name: "Universal's Islands of Adventure", shortName: "Islands of Adventure" },
      { id: "epic-universe", name: "Epic Universe" },
      { id: "volcano-bay", name: "Universal's Volcano Bay", shortName: "Volcano Bay" }
    ]
  },
  {
    name: "Disneyland Resort",
    location: "Anaheim, CA", 
    parks: [
      { id: "disneyland", name: "Disneyland Park", shortName: "Disneyland" },
      { id: "california-adventure", name: "Disney California Adventure", shortName: "California Adventure" }
    ]
  },
  {
    name: "Six Flags Magic Mountain",
    location: "Valencia, CA",
    parks: [
      { id: "six-flags-magic-mountain", name: "Six Flags Magic Mountain" }
    ]
  },
  {
    name: "Cedar Point",
    location: "Sandusky, OH", 
    parks: [
      { id: "cedar-point", name: "Cedar Point" }
    ]
  }
]

export function ParkOverview({ onParkSelect }: ParkOverviewProps) {
  const [selectedFamily, setSelectedFamily] = useState<string>('all')
  const [parkData, setParkData] = useState<Record<string, any>>({})
  const [isLoading, setIsLoading] = useState(true)

  // Load live data for all parks
  useEffect(() => {
    const loadParkData = async () => {
      setIsLoading(true)
      const data: Record<string, any> = {}

      // Load data for all parks
      for (const family of PARK_FAMILIES) {
        for (const park of family.parks) {
          try {
            const attractions = await window.spark.kv.get<any[]>(`attractions-${park.id}`)
            if (attractions && Array.isArray(attractions)) {
              const operating = attractions.filter(a => a.status === 'operating')
              const waitTimes = operating.map(a => a.currentWaitTime).filter(wt => wt > 0)
              
              data[park.id] = {
                name: park.shortName || park.name,
                totalAttractions: operating.length,
                avgWaitTime: waitTimes.length > 0 ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length) : 0,
                maxWaitTime: Math.max(...waitTimes, 0),
                family: family.name,
                location: family.location
              }
            }
          } catch (error) {
            console.error(`Error loading data for ${park.id}:`, error)
          }
        }
      }

      setParkData(data)
      setIsLoading(false)
    }

    loadParkData()
  }, [])

  const filteredFamilies = selectedFamily === 'all' 
    ? PARK_FAMILIES 
    : PARK_FAMILIES.filter(family => family.name === selectedFamily)

  const getWaitTimeBadge = (avgWaitTime: number, maxWaitTime: number) => {
    if (avgWaitTime === 0) return { color: 'bg-green-500', text: 'Great Day!', textColor: 'text-green-600' }
    if (avgWaitTime <= 15) return { color: 'bg-green-400', text: 'Low Crowds', textColor: 'text-green-600' }
    if (avgWaitTime <= 30) return { color: 'bg-yellow-400', text: 'Moderate', textColor: 'text-yellow-600' }
    if (avgWaitTime <= 45) return { color: 'bg-orange-400', text: 'Busy', textColor: 'text-orange-600' }
    return { color: 'bg-red-500', text: 'Very Busy', textColor: 'text-red-600' }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-semibold">Live Park Overview</h2>
          <div className="w-48 h-10 bg-muted animate-pulse rounded"></div>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="space-y-3">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                  <div className="h-8 bg-muted rounded"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Live Park Overview</h2>
          <p className="text-muted-foreground">Current wait times across major theme parks</p>
        </div>
        
        <Select value={selectedFamily} onValueChange={setSelectedFamily}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Filter by destination" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Destinations</SelectItem>
            {PARK_FAMILIES.map((family) => (
              <SelectItem key={family.name} value={family.name}>
                {family.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredFamilies.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No parks found for the selected family.
        </div>
      ) : (
        <div className="space-y-8">
          {filteredFamilies.map((family) => (
            <div key={family.name} className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <MapPin size={20} className="text-primary" />
                <h3 className="text-lg font-semibold">{family.name}</h3>
                <span className="text-sm text-muted-foreground">({family.location})</span>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {family.parks.map((park) => {
                  const data = parkData[park.id]
                  
                  if (!data) {
                    return (
                      <Card key={park.id} className="opacity-50">
                        <CardContent className="p-6 text-center">
                          <h4 className="font-medium text-sm mb-2">{park.shortName || park.name}</h4>
                          <p className="text-muted-foreground text-xs">No data available</p>
                        </CardContent>
                      </Card>
                    )
                  }
                  
                  const waitBadge = getWaitTimeBadge(data.avgWaitTime, data.maxWaitTime)
                  
                  return (
                    <Card key={park.id} className="cursor-pointer hover:shadow-md transition-shadow">
                      <CardContent className="p-6" onClick={() => onParkSelect(park.id)}>
                        <div className="space-y-3">
                          <div className="flex justify-between items-start">
                            <h4 className="font-medium text-sm leading-tight">{data.name}</h4>
                            <Badge variant="secondary" className={`text-xs ${waitBadge.textColor}`}>
                              {waitBadge.text}
                            </Badge>
                          </div>
                          
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{data.totalAttractions} attractions operating</span>
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {data.avgWaitTime}min avg
                            </span>
                          </div>
                          
                          <div className="text-xs">
                            <div className="flex justify-between mb-1">
                              <span>Longest wait:</span>
                              <span className="font-medium">{data.maxWaitTime}min</span>
                            </div>
                          </div>
                          
                          <Button variant="outline" size="sm" className="w-full text-xs">
                            View Details
                          </Button>
                        </div>
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