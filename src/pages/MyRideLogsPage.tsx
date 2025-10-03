import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
  Funnel
} from '@phosphor-icons/react'

import type { Trip, User } from '@/types'

interface MyRideLogsPageProps {
  user: User | null
  onLoginRequired: () => void
}

export function MyRideLogsPage({ user, onLoginRequired }: MyRideLogsPageProps) {
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
      
      const tripIds = await window.spark.kv.get<string[]>(`user-trips-${user.id}`) || []
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
            parks: trip.parks.map(p => `${p.parkName}(${p.rideCount})`)
          })
        }
        return trip
      })
      
      const tripResults = await Promise.all(tripPromises)
      const validTrips = tripResults.filter(Boolean) as Trip[]
      
      console.log(`✅ Loaded ${validTrips.length} valid trips out of ${tripIds.length} trip IDs`)
      
      // Debug: Log detailed trip information
      validTrips.forEach(trip => {
        console.log(`🔍 Trip ${trip.id} full details:`, {
          visitDate: trip.visitDate,
          totalRides: trip.totalRides,
          rideLogsCount: trip.rideLogs.length,
          parks: trip.parks.map(p => ({ name: p.parkName, rideCount: p.rideCount })),
          rideLogsDetails: trip.rideLogs.map(log => ({ name: log.attractionName, count: log.rideCount }))
        })
      })
      
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
      const userTrips = await window.spark.kv.get<string[]>(`user-trips-${user.id}`) || []
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
      return { id: parkId, name: parkInfo?.parkName || parkId }
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Ticket size={20} className="text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{totalRides}</p>
                    <p className="text-sm text-muted-foreground">Total Rides</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <MapPin size={20} className="text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{totalParks}</p>
                    <p className="text-sm text-muted-foreground">Parks Visited</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Calendar size={20} className="text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{totalTrips}</p>
                    <p className="text-sm text-muted-foreground">Total Trips</p>
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
                  <Card key={`${trip.id}-${log.id}`} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge className={getTypeColor(log.attractionType)} variant="secondary">
                          {getTypeIcon(log.attractionType)}
                        </Badge>
                        <div>
                          <span className="font-medium">{log.attractionName}</span>
                          {log.trackVariant && (
                            <span className="text-sm text-muted-foreground ml-2">
                              ({log.trackVariant})
                            </span>
                          )}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <MapPin size={12} />
                              {trip.parks.find(p => p.parkId === log.parkId)?.parkName}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar size={12} />
                              {new Date(trip.visitDate).toLocaleDateString()}
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

interface TripCardProps {
  trip: Trip
  onDelete: (tripId: string) => void
  getTypeIcon: (type: string) => React.ReactElement
  getTypeColor: (type: string) => string
}

function TripCard({ trip, onDelete, getTypeIcon, getTypeColor }: TripCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar size={20} />
              {new Date(trip.visitDate).toLocaleDateString()}
            </CardTitle>
            <CardDescription className="mt-1">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <MapPin size={14} />
                  {trip.parks.length} park{trip.parks.length !== 1 ? 's' : ''}: {trip.parks.map(p => p.parkName).join(', ')}
                </span>
                <span>{trip.rideLogs.length} attractions logged</span>
                <span>{trip.totalRides} total rides</span>
              </div>
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              <Eye size={16} className="mr-2" />
              {expanded ? 'Hide' : 'View'} Details
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Trash size={16} />
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
              const parkLogs = trip.rideLogs.filter(log => log.parkId === park.parkId)
              const actualRideCount = parkLogs.reduce((sum, log) => sum + log.rideCount, 0)
              
              return (
                <div key={park.parkId}>
                  <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <MapPin size={14} />
                    {park.parkName} ({actualRideCount} rides)
                  </h4>
                  <div className="grid gap-2 pl-4">
                    {parkLogs.length === 0 ? (
                      <div className="text-sm text-muted-foreground italic py-2">
                        No rides logged for this park
                      </div>
                    ) : (
                      parkLogs
                        .sort((a, b) => b.rideCount - a.rideCount)
                        .map(log => (
                          <div key={log.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-3">
                              <Badge className={getTypeColor(log.attractionType)} variant="secondary">
                                {getTypeIcon(log.attractionType)}
                              </Badge>
                              <div>
                                <span className="font-medium">{log.attractionName}</span>
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
                        ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      )}
    </Card>
  )
}