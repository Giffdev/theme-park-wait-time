import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

import { 
  Calendar, 
  Ticket, 
  MapPin, 
  Star, 
  Users, 
  Clock,
  MagnifyingGlass,
  Eye,
  Trash,
  Funnel,
  PencilSimple
} from '@phosphor-icons/react'

import type { Trip, User } from '@/types'
import { ParkDataService } from '@/services/parkDataService'

// Helper function to get proper park names from IDs
function getParkNameFromId(parkId: string): string {
  const parkNameMap: Record<string, string> = {
    'magic-kingdom': 'Magic Kingdom',
    'epcot': 'EPCOT',
    'hollywood-studios': "Disney's Hollywood Studios",
    'animal-kingdom': "Disney's Animal Kingdom",
    'disneyland': 'Disneyland Park',
    'disney-california-adventure': 'Disney California Adventure',
    'universal-studios-orlando': 'Universal Studios Florida',
    'universal-studios-florida': 'Universal Studios Florida',
    'islands-of-adventure': "Universal's Islands of Adventure",
    'universal-studios-hollywood': 'Universal Studios Hollywood',
    'blizzard-beach': "Disney's Blizzard Beach",
    'typhoon-lagoon': "Disney's Typhoon Lagoon",
    // Handle common malformed IDs
    'hollywood': "Disney's Hollywood Studios",
    'studios': "Disney's Hollywood Studios",
    'kingdom': 'Magic Kingdom',
    'universal': 'Universal Studios Florida'
  }
  
  return parkNameMap[parkId] || parkId.split('-').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')
}

// Data cleanup utility to fix malformed ride logs
async function cleanupUserRideLogData(userId: string): Promise<number> {
  let fixedCount = 0
  
  try {
    const tripIds = (await window.spark.kv.get<string[]>(`user-trips-${userId}`)) || []
    
    for (const tripId of tripIds) {
      const trip = await window.spark.kv.get<Trip>(`trip-${tripId}`)
      if (!trip) continue
      
      let tripModified = false
      
      // Fix each ride log in the trip
      for (const log of trip.rideLogs) {
        let logModified = false
        
        // Clean up any debug information in attraction names
        if (log.attractionName && log.attractionName.includes('debug:')) {
          // Remove debug prefixes and clean up the name
          const cleanName = log.attractionName.replace(/^debug:\s*park=.*?,\s*ID=/, '').trim()
          if (cleanName) {
            log.attractionName = cleanName.split('-').map((word: string) => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ')
            logModified = true
          }
        }
        
        // Fix common park ID issues
        if (log.parkId === 'hollywood') {
          log.parkId = 'hollywood-studios'
          logModified = true
        }
        
        // Fix common attraction ID issues
        if (log.attractionId?.includes('studios-alien-swirling-saurces')) {
          log.attractionId = 'alien-swirling-saucers'
          log.attractionName = 'Alien Swirling Saucers'
          logModified = true
        }
        
        // Fix other common malformed attraction IDs
        if (log.attractionId?.startsWith('studios-')) {
          const correctedId = log.attractionId.replace('studios-', '')
          // Try to find the attraction with the corrected ID
          try {
            const attractions = await ParkDataService.loadAttractions('hollywood-studios')
            const found = attractions.find(a => a.id === correctedId)
            if (found) {
              log.attractionId = correctedId
              log.attractionName = found.name
              if (log.parkId !== 'hollywood-studios') {
                log.parkId = 'hollywood-studios'
              }
              logModified = true
            }
          } catch (error) {
            // Silently continue if we can't verify
          }
        }
        
        if (logModified) {
          fixedCount++
          tripModified = true
        }
      }
      
      // Update park information if needed
      if (tripModified) {
        // Rebuild park summary to match corrected data
        const parkMap = new Map<string, { parkName: string, rideCount: number }>()
        
        for (const log of trip.rideLogs) {
          const existing = parkMap.get(log.parkId) || { parkName: getParkNameFromId(log.parkId), rideCount: 0 }
          existing.rideCount += log.rideCount
          parkMap.set(log.parkId, existing)
        }
        
        trip.parks = Array.from(parkMap.entries()).map(([parkId, info]) => ({
          parkId,
          parkName: info.parkName,
          rideCount: info.rideCount
        }))
        
        // Save the updated trip
        await window.spark.kv.set(`trip-${tripId}`, trip)
        console.log(`🔧 Fixed ${fixedCount} issues in trip ${tripId}`)
      }
    }
  } catch (error) {
    console.error('Error during data cleanup:', error)
  }
  
  return fixedCount
}

interface MyRideLogsPageProps {
  user: User | null
  onLoginRequired: () => void
}

// Helper function to resolve attraction names from stored logs
async function resolveAttractionName(log: any): Promise<string> {
  // Clean any debug information first
  let cleanName = log.attractionName
  if (cleanName && cleanName.includes('debug:')) {
    cleanName = cleanName.replace(/^debug:\s*park=.*?,\s*ID=/, '').trim()
    if (cleanName) {
      return cleanName.split('-').map((word: string) => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ')
    }
  }
  
  // If we already have a clean attraction name, use it
  if (cleanName && !cleanName.includes('Unknown Attraction')) {
    return cleanName
  }
  
  // Try to find the attraction in park data with the stored park ID
  try {
    const attractions = await ParkDataService.loadAttractions(log.parkId)
    const attraction = attractions.find(a => a.id === log.attractionId)
    
    if (attraction) {
      return attraction.name
    }
  } catch (error) {
    // Silently continue to fallback strategies
  }
  
  // Handle common park ID variations and malformed attraction IDs
  const parkIdMappings: Record<string, string[]> = {
    'hollywood': ['hollywood-studios'],
    'kingdom': ['magic-kingdom'],
    'studios': ['hollywood-studios', 'universal-studios-orlando', 'universal-studios-hollywood'],
    'adventure': ['islands-of-adventure', 'disney-california-adventure'],
    'universal': ['universal-studios-orlando', 'universal-studios-hollywood', 'islands-of-adventure']
  }
  
  // Try park ID variations first
  const possibleParks = new Set<string>()
  
  // Add direct mappings
  for (const [key, parks] of Object.entries(parkIdMappings)) {
    if (log.parkId?.toLowerCase().includes(key)) {
      parks.forEach(park => possibleParks.add(park))
    }
  }
  
  // Add common parks as fallback
  const commonParks = ['magic-kingdom', 'epcot', 'hollywood-studios', 'animal-kingdom', 
                       'universal-studios-orlando', 'islands-of-adventure', 'disneyland', 
                       'disney-california-adventure', 'universal-studios-hollywood']
  commonParks.forEach(park => possibleParks.add(park))
  
  for (const parkId of possibleParks) {
    try {
      const attractions = await ParkDataService.loadAttractions(parkId)
      
      // Try the full attractionId first
      let attraction = attractions.find(a => a.id === log.attractionId)
      if (attraction) {
        return attraction.name
      }
      
      // Handle malformed attraction IDs with common corrections
      let correctedId = log.attractionId
      
      // Fix common typos and malformations
      if (correctedId?.includes('studios-')) {
        correctedId = correctedId.replace('studios-', '')
      }
      if (correctedId?.includes('saurces')) {
        correctedId = correctedId.replace('saurces', 'saucers')
      }
      
      // Try corrected ID
      attraction = attractions.find(a => a.id === correctedId)
      if (attraction) {
        return attraction.name
      }
      
      // Try partial matches for malformed compound IDs
      if (log.attractionId?.includes('-')) {
        const parts = log.attractionId.split('-')
        
        // Try removing first part (e.g., "kingdom-space-mountain" -> "space-mountain")
        for (let i = 1; i < parts.length; i++) {
          const partialId = parts.slice(i).join('-')
          attraction = attractions.find(a => a.id === partialId)
          if (attraction) {
            return attraction.name
          }
        }
        
        // Try fuzzy matching on the last meaningful part
        const lastPart = parts[parts.length - 1]
        if (lastPart && lastPart.length > 3) {
          attraction = attractions.find(a => 
            a.id.includes(lastPart) || 
            a.name.toLowerCase().includes(lastPart.replace(/-/g, ' '))
          )
          if (attraction) {
            return attraction.name
          }
        }
      }
    } catch (error) {
      continue
    }
  }
  
  // Last resort: return a cleaned up version of the ID without debug info
  const cleanId = log.attractionId?.replace(/^[^-]+-/, '') || log.attractionId || 'unknown'
  return cleanId.split('-').map((word: string) => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ')
}

export function MyRideLogsPage({ user, onLoginRequired }: MyRideLogsPageProps) {
  const navigate = useNavigate()
  const [trips, setTrips] = useState<Trip[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPark, setFilterPark] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('trips')

  useEffect(() => {
    if (!user) {
      onLoginRequired()
      return
    }

    loadUserTrips()
  }, [user])

  const loadUserTrips = async () => {
    if (!user) return

    setIsLoading(true)
    try {
      console.log('🔄 Loading trips for user:', user.id)
      
      // Run data cleanup first (only logs issues, doesn't show to user)
      try {
        const fixedCount = await cleanupUserRideLogData(user.id)
        if (fixedCount > 0) {
          console.log(`🔧 Fixed ${fixedCount} data issues during load`)
        }
      } catch (cleanupError) {
        console.warn('Data cleanup had issues, continuing with load:', cleanupError)
      }
      
      // First, let's see what keys exist in storage for debugging
      const allKeys = await window.spark.kv.keys()
      const userKeys = allKeys.filter(key => key.includes(user.id))
      console.log('🔍 All user-related keys in storage:', userKeys)
      
      // Check if there's also a current trip that should be included
      const currentTrip = await window.spark.kv.get<Trip>(`current-trip-${user.id}`)
      if (currentTrip && currentTrip.totalRides > 0) {
        console.log('📋 Found active current trip with rides:', {
          id: currentTrip.id,
          totalRides: currentTrip.totalRides,
          logsCount: currentTrip.rideLogs.length
        })
      }
      
      const tripIds = (await window.spark.kv.get<string[]>(`user-trips-${user.id}`)) || []
      console.log('📋 Found trip IDs in user history:', tripIds)
      
      if (tripIds.length === 0) {
        console.log('ℹ️ No trip IDs found in user history')
        setTrips([])
        setIsLoading(false)
        return
      }
      
      const tripPromises = tripIds.map(async (id) => {
        const trip = await window.spark.kv.get<Trip>(`trip-${id}`)
        console.log(`📁 Trip ${id}:`, trip ? `found (${trip.totalRides} rides, ${trip.rideLogs.length} logs)` : 'MISSING')
        if (trip) {
          console.log(`📋 Trip ${id} details:`, {
            visitDate: trip.visitDate,
            totalRides: trip.totalRides,
            parks: trip.parks.map(p => `${p.parkName}(${p.rideCount})`),
            rideLogs: trip.rideLogs.map(log => ({
              attractionId: log.attractionId,
              attractionName: log.attractionName,
              parkId: log.parkId
            }))
          })
        }
        return trip
      })
      
      const tripResults = await Promise.all(tripPromises)
      const validTrips = tripResults.filter(Boolean) as Trip[]
      
      console.log(`✅ Loaded ${validTrips.length} valid trips out of ${tripIds.length} trip IDs`)
      
      // Sort by visit date descending
      validTrips.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
      setTrips(validTrips)
    } catch (error) {
      console.error('❌ Failed to load user trips:', error)
    }
    setIsLoading(false)
  }

  const deleteTrip = async (tripId: string) => {
    if (!user) return

    try {
      // Remove from user's trip list
      const userTrips = (await window.spark.kv.get<string[]>(`user-trips-${user.id}`)) || []
      const updatedTrips = userTrips.filter(id => id !== tripId)
      await window.spark.kv.set(`user-trips-${user.id}`, updatedTrips)
      
      // Delete the trip data
      await window.spark.kv.delete(`trip-${tripId}`)
      
      // Update local state
      setTrips(prev => prev.filter(trip => trip.id !== tripId))
      
      toast.success('Trip deleted successfully')
    } catch (error) {
      console.error('Failed to delete trip:', error)
      toast.error('Failed to delete trip')
    }
  }

  const editTrip = async (trip: Trip) => {
    if (!user) return

    try {
      // Set this trip as the current trip for editing
      await window.spark.kv.set(`current-trip-${user.id}`, trip)
      
      // Navigate to the ride log page
      const primaryPark = trip.parks[0]?.parkId
      if (primaryPark) {
        navigate(`/log/${primaryPark}`)
      } else {
        navigate('/log')
      }
      
      toast.success('Trip loaded for editing')
    } catch (error) {
      console.error('Failed to load trip for editing:', error)
      toast.error('Failed to load trip for editing')
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'thrill': return <Star size={14} />
      case 'family': return <Users size={14} />
      case 'show': return <Clock size={14} />
      default: return <Ticket size={14} />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'thrill': return 'bg-destructive text-destructive-foreground'
      case 'family': return 'bg-success text-success-foreground'
      case 'show': return 'bg-accent text-accent-foreground'
      default: return 'bg-secondary text-secondary-foreground'
    }
  }

  // Get all ride logs from all trips for aggregate view
  const allRideLogs = trips.flatMap(trip => trip.rideLogs.map(log => ({ ...log, trip })))

  // Filter trips and rides
  const filteredTrips = trips.filter(trip => {
    const matchesSearch = searchTerm === '' || 
      trip.parks.some(park => park.parkName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      trip.rideLogs.some(log => 
        log.attractionName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      ) ||
      trip.notes?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesPark = filterPark === 'all' || trip.parks.some(park => park.parkId === filterPark)
    
    const matchesType = filterType === 'all' || 
      trip.rideLogs.some(log => log.attractionType === filterType)

    return matchesSearch && matchesPark && matchesType
  })

  const filteredRideLogs = allRideLogs.filter(({ trip, ...log }) => {
    const matchesSearch = searchTerm === '' || 
      log.attractionName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.notes?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesPark = filterPark === 'all' || log.parkId === filterPark
    const matchesType = filterType === 'all' || log.attractionType === filterType

    return matchesSearch && matchesPark && matchesType
  })

  // Get unique parks from trips
  const uniqueParks = Array.from(new Set(trips.flatMap(trip => trip.parks.map(park => park.parkId))))
    .map(parkId => {
      const parkInfo = trips.flatMap(trip => trip.parks).find(park => park.parkId === parkId)
      return { id: parkId, name: parkInfo?.parkName || getParkNameFromId(parkId) }
    })

  // Calculate stats
  const totalRides = trips.reduce((sum, trip) => sum + trip.totalRides, 0)
  const totalParks = uniqueParks.length
  const totalTrips = trips.length

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>
              You need to be signed in to view your ride logs
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={onLoginRequired}>
              Sign In to Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your ride logs...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Park Trips</h1>
          <p className="text-muted-foreground">
            Your complete theme park experience history
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadUserTrips}>
            Refresh
          </Button>
          <Button asChild>
            <Link to="/log">
              <Ticket size={16} className="mr-2" />
              Log New Trip
            </Link>
          </Button>
        </div>
      </div>

      {trips.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Ticket size={48} className="mx-auto text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No Trips Logged Yet</CardTitle>
            <CardDescription className="mb-4">
              Start logging your theme park trips to build your experience history
            </CardDescription>
            <Button asChild>
              <Link to="/log">Start Logging Trips</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <Card>
              <CardContent className="p-3 md:p-4">
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 text-center md:text-left">
                  <Ticket size={16} className="text-primary mx-auto md:mx-0" />
                  <div>
                    <p className="text-lg md:text-2xl font-bold">{totalRides}</p>
                    <p className="text-xs md:text-sm text-muted-foreground">Total Rides</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-3 md:p-4">
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 text-center md:text-left">
                  <MapPin size={16} className="text-primary mx-auto md:mx-0" />
                  <div>
                    <p className="text-lg md:text-2xl font-bold">{totalParks}</p>
                    <p className="text-xs md:text-sm text-muted-foreground">Parks Visited</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-3 md:p-4">
                <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 text-center md:text-left">
                  <Calendar size={16} className="text-primary mx-auto md:mx-0" />
                  <div>
                    <p className="text-lg md:text-2xl font-bold">{totalTrips}</p>
                    <p className="text-xs md:text-sm text-muted-foreground">Total Trips</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search and Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <MagnifyingGlass size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search rides, parks, or notes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                <div className="flex gap-2">
                  <Select value={filterPark} onValueChange={setFilterPark}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Parks</SelectItem>
                      {uniqueParks.map(park => (
                        <SelectItem key={park.id} value={park.id}>
                          {park.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="thrill">Thrill</SelectItem>
                      <SelectItem value="family">Family</SelectItem>
                      <SelectItem value="show">Show</SelectItem>
                      <SelectItem value="experience">Experience</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs for different views */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="trips">Trips View</TabsTrigger>
              <TabsTrigger value="rides">All Rides</TabsTrigger>
            </TabsList>

            <TabsContent value="trips" className="space-y-4 mt-6">
              {filteredTrips.map(trip => (
                <TripCard 
                  key={trip.id} 
                  trip={trip} 
                  onDelete={deleteTrip}
                  onEdit={editTrip}
                  getTypeIcon={getTypeIcon}
                  getTypeColor={getTypeColor}
                />
              ))}
              
              {filteredTrips.length === 0 && trips.length > 0 && (
                <Card className="text-center py-8">
                  <CardContent>
                    <Funnel size={32} className="mx-auto text-muted-foreground mb-4" />
                    <CardTitle className="mb-2">No matching trips</CardTitle>
                    <CardDescription>
                      Try adjusting your search or filter criteria
                    </CardDescription>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="rides" className="space-y-4 mt-6">
              <div className="grid gap-3">
                {filteredRideLogs
                  .sort((a, b) => new Date(b.trip.visitDate).getTime() - new Date(a.trip.visitDate).getTime())
                  .map(({ trip, ...log }) => (
                  <RideLogCard key={`${trip.id}-${log.id}`} log={{ ...log, trip }} getTypeIcon={getTypeIcon} getTypeColor={getTypeColor} />
                ))}
              </div>
              
              {filteredRideLogs.length === 0 && allRideLogs.length > 0 && (
                <Card className="text-center py-8">
                  <CardContent>
                    <Funnel size={32} className="mx-auto text-muted-foreground mb-4" />
                    <CardTitle className="mb-2">No matching rides</CardTitle>
                    <CardDescription>
                      Try adjusting your search or filter criteria
                    </CardDescription>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}

interface RideLogCardProps {
  log: any
  getTypeIcon: (type: string) => React.ReactElement
  getTypeColor: (type: string) => string
}

function RideLogCard({ log, getTypeIcon, getTypeColor }: RideLogCardProps) {
  const [resolvedName, setResolvedName] = useState<string | null>(null)

  useEffect(() => {
    const resolveName = async () => {
      try {
        const name = await resolveAttractionName(log)
        setResolvedName(name)
      } catch (error) {
        // Never show debug information to users
        setResolvedName(log.attractionName || 'Unknown Attraction')
      }
    }
    
    resolveName()
  }, [log])

  const displayName = resolvedName || log.attractionName || 'Loading...'

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge className={getTypeColor(log.attractionType)} variant="secondary">
            {getTypeIcon(log.attractionType)}
          </Badge>
          <div>
            <span className="font-medium">{displayName}</span>
            {log.trackVariant && (
              <span className="text-sm text-muted-foreground ml-2">
                ({log.trackVariant})
              </span>
            )}
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <MapPin size={12} />
                {log.trip.parks.find((p: any) => p.parkId === log.parkId)?.parkName || getParkNameFromId(log.parkId)}
              </span>
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {new Date(log.trip.visitDate).toLocaleDateString()}
              </span>
            </div>
            {log.notes && (
              <p className="text-sm text-muted-foreground mt-1">
                {log.notes}
              </p>
            )}
          </div>
        </div>
        <Badge variant="outline">
          {log.rideCount}x
        </Badge>
      </div>
    </Card>
  )
}

interface TripCardProps {
  trip: Trip
  onDelete: (tripId: string) => void
  onEdit: (trip: Trip) => void
  getTypeIcon: (type: string) => React.ReactElement
  getTypeColor: (type: string) => string
}

function TripCard({ trip, onDelete, onEdit, getTypeIcon, getTypeColor }: TripCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({})

  // Resolve attraction names when expanded
  useEffect(() => {
    if (expanded && trip.rideLogs.length > 0) {
      const resolveNames = async () => {
        const newResolvedNames: Record<string, string> = {}
        
        for (const log of trip.rideLogs) {
          try {
            const resolvedName = await resolveAttractionName(log)
            newResolvedNames[log.id] = resolvedName
          } catch (error) {
            // Never show debug information to users
            newResolvedNames[log.id] = log.attractionName || 'Unknown Attraction'
          }
        }
        
        setResolvedNames(newResolvedNames)
      }
      
      resolveNames()
    }
  }, [expanded, trip.rideLogs])

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Calendar size={20} />
              {new Date(trip.visitDate).toLocaleDateString()}
            </CardTitle>
            <CardDescription className="mt-1">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                <span className="flex items-center gap-1">
                  <MapPin size={14} />
                  {trip.parks.length} park{trip.parks.length !== 1 ? 's' : ''}: {trip.parks.map(p => p.parkName).join(', ')}
                </span>
                <span>{trip.rideLogs.length} attractions logged</span>
                <span>{trip.totalRides} total rides</span>
              </div>
            </CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(trip)}
              className="w-full sm:w-auto"
            >
              <PencilSimple size={16} className="mr-2" />
              <span className="sm:hidden">Edit</span>
              <span className="hidden sm:inline">Edit Trip</span>
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="flex-1 sm:flex-none"
              >
                <Eye size={16} className="mr-2" />
                <span className="sm:hidden">{expanded ? 'Hide' : 'View'}</span>
                <span className="hidden sm:inline">{expanded ? 'Hide' : 'View'} Details</span>
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="px-3">
                    <Trash size={16} />
                    <span className="sr-only">Delete trip</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Trip</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this trip? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(trip.id)}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {trip.notes && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm">{trip.notes}</p>
            </div>
          )}
          
          <div className="space-y-4">
            {trip.parks.map(park => {
              // More robust filtering - check both exact match and potential variations
              const parkLogs = trip.rideLogs.filter(log => {
                return log.parkId === park.parkId || 
                       log.parkId?.toString() === park.parkId?.toString()
              })
              const actualRideCount = parkLogs.reduce((sum, log) => sum + log.rideCount, 0)
              
              return (
                <div key={park.parkId}>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <MapPin size={14} />
                    {park.parkName} ({actualRideCount} rides)
                  </h4>
                  <div className="grid gap-2 pl-4">
                    {parkLogs.length === 0 ? (
                      <div className="text-sm text-muted-foreground italic py-2">No rides logged for this park</div>
                    ) : (
                      parkLogs
                        .sort((a, b) => b.rideCount - a.rideCount)
                        .map(log => {
                          const displayName = resolvedNames[log.id] || log.attractionName || 'Loading...'
                          return (
                            <div key={log.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                              <div className="flex items-center gap-3">
                                <Badge className={getTypeColor(log.attractionType)} variant="secondary">
                                  {getTypeIcon(log.attractionType)}
                                </Badge>
                                <div>
                                  <span className="font-medium">{displayName}</span>
                                  {log.trackVariant && (
                                    <span className="text-sm text-muted-foreground ml-2">
                                      ({log.trackVariant})
                                    </span>
                                  )}
                                  {log.notes && (
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {log.notes}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <Badge variant="outline">
                                {log.rideCount}x
                              </Badge>
                            </div>
                          )
                        })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}