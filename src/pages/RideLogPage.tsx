import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { useKV } from '@github/spark/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Plus, Minus, Calendar, Clock, Star, Ticket, Users, MapPin, CaretDown } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { isAttractionNotDining } from '@/lib/utils'
import type { User } from '@/App'
import type { RideLog, Trip, TripPark, ExtendedAttraction } from '@/types'
import { parkFamilies, ParkFamily, ParkInfo } from '@/data/sampleData'
import { RideTimer } from '@/components/RideTimer'

interface RideLogPageProps {
  user: User | null
  onLoginRequired: () => void
}

export function RideLogPage({ user, onLoginRequired }: RideLogPageProps) {
  const { parkId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [attractions, setAttractions] = useState<Record<string, ExtendedAttraction[]>>({})
  const [currentTrip, setCurrentTrip] = useKV<Trip | null>(
    user ? `current-trip-${user.id}` : 'current-trip-anonymous', 
    null
  )
  const [rideCounts, setRideCounts] = useState<Record<string, number>>({}) // key: "parkId-attractionId"
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedParks, setSelectedParks] = useState<string[]>(parkId ? [parkId] : [])
  const [isLoading, setIsLoading] = useState(true)
  const [tripNotes, setTripNotes] = useState('')
  const [activePark, setActivePark] = useState<string>(parkId || '')
  const [isSaving, setIsSaving] = useState(false)

  // Get attraction ID from URL search params
  const searchParams = new URLSearchParams(location.search)
  const preselectedAttractionId = searchParams.get('attraction')

  // Get park info for the initial park (if coming from park page)
  const initialParkInfo = parkFamilies
    .flatMap(family => family.parks.map(park => ({ ...park, familyId: family.id, familyName: family.name })))
    .find(park => park.id === parkId)

  useEffect(() => {
    if (!user) {
      onLoginRequired()
      return
    }

    if (parkId) {
      loadAttractionsForPark(parkId)
    } else {
      // If no specific park, set loading to false so the trip setup can begin
      setIsLoading(false)
    }
  }, [user, parkId])

  // Pre-select attraction if specified in URL
  useEffect(() => {
    if (preselectedAttractionId && parkId && attractions[parkId]) {
      const attractionKey = `${parkId}-${preselectedAttractionId}`
      // Check if the attraction exists in the loaded data
      const attraction = attractions[parkId].find(a => a.id === preselectedAttractionId)
      if (attraction && !rideCounts[attractionKey]) {
        setRideCounts(prev => ({
          ...prev,
          [attractionKey]: 1
        }))
        toast.success(`Pre-selected ${attraction.name} for logging`)
      }
    }
  }, [preselectedAttractionId, parkId, attractions, rideCounts])

  const loadAttractionsForPark = async (targetParkId: string) => {
    setIsLoading(true)
    try {
      const attractionData = await window.spark.kv.get<ExtendedAttraction[]>(`attractions-${targetParkId}`)
      if (attractionData && Array.isArray(attractionData) && attractionData.length > 0) {
        setAttractions(prev => ({
          ...prev,
          [targetParkId]: attractionData
        }))
        console.log(`✅ Loaded ${attractionData.length} attractions for ${targetParkId}`)
      } else {
        console.warn(`⚠️ No attractions found for park ${targetParkId}`)
        toast.error(`No attractions found for this park. Please try again or contact support.`)
      }
    } catch (error) {
      console.error('Failed to load attractions:', error)
      toast.error('Failed to load park attractions. Please try again.')
    }
    setIsLoading(false)
  }

  const loadAllSelectedParksAttractions = async (parks: string[]) => {
    const newAttractions: Record<string, ExtendedAttraction[]> = {}
    const failedParks: string[] = []
    
    for (const parkId of parks) {
      try {
        const attractionData = await window.spark.kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
        
        if (attractionData && Array.isArray(attractionData) && attractionData.length > 0) {
          newAttractions[parkId] = attractionData
          console.log(`✅ Loaded ${attractionData.length} attractions for ${parkId}`)
        } else {
          console.warn(`⚠️ No attractions found for park ${parkId}`)
          failedParks.push(parkId)
        }
      } catch (error) {
        console.error(`❌ Failed to load attractions for ${parkId}:`, error)
        failedParks.push(parkId)
      }
    }
    
    setAttractions(newAttractions)
    
    // Show warnings for failed parks
    if (failedParks.length > 0 && failedParks.length < parks.length) {
      const failedParkNames = failedParks.map(parkId => {
        const parkInfo = parkFamilies
          .flatMap(family => family.parks.map(park => ({ ...park, familyId: family.id, familyName: family.name })))
          .find(park => park.id === parkId)
        return parkInfo?.name || parkId
      })
      toast.error(`Could not load attractions for: ${failedParkNames.join(', ')}`)
    } else if (failedParks.length === parks.length) {
      throw new Error('No attractions could be loaded for any selected parks')
    }
  }

  const handleVariantChange = useCallback((key: string, variant: string) => {
    setSelectedVariants(prev => {
      const newVariants = { ...prev, [key]: variant }
      return newVariants
    })
    // Auto-save when variant changes - use setTimeout to avoid stale closure
    if (currentTrip && user && Object.values(rideCounts).some(count => count > 0)) {
      setTimeout(() => {
        // Get fresh state from callback
        setRideCounts(currentCounts => {
          autoSaveTrip(currentCounts)
          return currentCounts
        })
      }, 100)
    }
  }, [currentTrip, user, rideCounts])

  const handleNotesChange = useCallback((key: string, note: string) => {
    setNotes(prev => {
      const newNotes = { ...prev, [key]: note }
      return newNotes
    })
    // Auto-save when notes change - use setTimeout to avoid stale closure
    if (currentTrip && user && Object.values(rideCounts).some(count => count > 0)) {
      setTimeout(() => {
        // Get fresh state from callback
        setRideCounts(currentCounts => {
          autoSaveTrip(currentCounts)
          return currentCounts
        })
      }, 100)
    }
  }, [currentTrip, user, rideCounts])

  const updateRideCount = (parkId: string, attractionId: string, change: number) => {
    const key = `${parkId}-${attractionId}`
    setRideCounts(prev => {
      const newCounts = {
        ...prev,
        [key]: Math.max(0, (prev[key] || 0) + change)
      }
      
      // Auto-save the trip with updated counts
      if (currentTrip && user) {
        autoSaveTrip(newCounts)
      }
      
      return newCounts
    })
  }

  const startNewTrip = async () => {
    if (!user || selectedParks.length === 0) return

    setIsLoading(true)
    try {
      // Load attractions for all selected parks  
      await loadAllSelectedParksAttractions(selectedParks)

      // Create trip parks data
      const tripParks: TripPark[] = selectedParks.map(parkId => {
        const parkInfo = parkFamilies
          .flatMap(family => family.parks.map(park => ({ ...park, familyId: family.id, familyName: family.name })))
          .find(park => park.id === parkId)
        
        return {
          parkId,
          parkName: parkInfo?.name || parkId,
          rideCount: 0
        }
      })

      const newTrip: Trip = {
        id: `trip-${user.id}-${Date.now()}`,
        userId: user.id,
        visitDate,
        parks: tripParks,
        rideLogs: [],
        totalRides: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: tripNotes
      }

      setCurrentTrip(newTrip)
      setActivePark(selectedParks[0]) // Set first park as active
      toast.success(`Started trip log for ${selectedParks.length} park${selectedParks.length > 1 ? 's' : ''}!`)
    } catch (error) {
      console.error('❌ Failed to start trip:', error)
      toast.error('Failed to start trip. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const autoSaveTrip = async (updatedRideCounts: Record<string, number>) => {
    if (!user || !currentTrip) return

    // Check if spark KV is available
    if (!window.spark?.kv) {
      console.error('❌ Spark KV not available for auto-save')
      toast.error('Storage not available. Please refresh the page.')
      return
    }

    setIsSaving(true)
    try {
      const logsToSave: RideLog[] = []

      Object.entries(updatedRideCounts).forEach(([key, count]) => {
        if (count > 0) {
          const [parkId, attractionId] = key.split('-')
          const attraction = attractions[parkId]?.find(a => a.id === attractionId)
          if (attraction) {
            const rideLog: RideLog = {
              id: `log-${user.id}-${attractionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              userId: user.id,
              tripId: currentTrip.id,
              parkId,
              attractionId,
              attractionName: attraction.name,
              attractionType: attraction.type,
              rideCount: count,
              trackVariant: selectedVariants[key],
              loggedAt: new Date().toISOString(),
              notes: notes[key]
            }
            logsToSave.push(rideLog)
          }
        }
      })

      // Update park ride counts  
      const updatedParks = currentTrip.parks.map(park => ({
        ...park,
        rideCount: logsToSave.filter(log => log.parkId === park.parkId).reduce((sum, log) => sum + log.rideCount, 0)
      }))

      const updatedTrip: Trip = {
        ...currentTrip,
        parks: updatedParks,
        rideLogs: logsToSave,
        totalRides: logsToSave.reduce((sum, log) => sum + log.rideCount, 0),
        updatedAt: new Date().toISOString(),
        notes: tripNotes
      }

      // Update current trip state first
      setCurrentTrip(updatedTrip)
      
      // Auto-save to storage with better error handling
      try {
        await window.spark.kv.set(`current-trip-${user.id}`, updatedTrip)
        console.log('✅ Current trip saved successfully')
      } catch (kvError) {
        console.error('❌ Failed to save current trip to KV:', kvError)
        throw new Error('Failed to save trip progress')
      }
      
      // If there are any rides logged, also save to the finalized trip storage
      if (logsToSave.length > 0) {
        try {
          await window.spark.kv.set(`trip-${updatedTrip.id}`, updatedTrip)
          console.log('✅ Trip record saved successfully')
          
          // Update user's trip history
          const userTrips = await window.spark.kv.get<string[]>(`user-trips-${user.id}`) || []
          if (!userTrips.includes(updatedTrip.id)) {
            userTrips.push(updatedTrip.id)
            await window.spark.kv.set(`user-trips-${user.id}`, userTrips)
            console.log('✅ User trip history updated successfully')
          }
        } catch (kvError) {
          console.error('❌ Failed to save trip record to KV:', kvError)
          // Don't throw here - we already saved the current trip, so partial success
        }
      }
      
    } catch (error) {
      console.error('❌ Failed to auto-save trip:', error)
      toast.error('Failed to save your trip. Please try again.')
    } finally {
      setTimeout(() => setIsSaving(false), 1000) // Show "saved" state briefly
    }
  }



  const handleParksChange = (parks: string[]) => {
    // Find parks that were deselected and clear their ride counts
    const deselectedParks = selectedParks.filter(parkId => !parks.includes(parkId))
    if (deselectedParks.length > 0) {
      const keysToRemove = Object.keys(rideCounts).filter(key => 
        deselectedParks.some(parkId => key.startsWith(`${parkId}-`))
      )
      setRideCounts(prev => {
        const updated = { ...prev }
        keysToRemove.forEach(key => delete updated[key])
        return updated
      })
    }
    setSelectedParks(parks)
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>
              You need to be signed in to log your rides
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

  if (isLoading && !currentTrip && selectedParks.length > 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading attractions for selected parks...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center gap-4 mb-6">
        <Button 
          variant="ghost" 
          size="sm" 
          asChild
          className="hover:bg-muted"
        >
          <Link to={parkId ? `/park/${parkId}` : '/'}>
            <ArrowLeft size={16} className="mr-2" />
            {parkId ? 'Back to Park' : 'Back to Home'}
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Log Your Park Trip</h1>
          <p className="text-muted-foreground">
            Track your rides across multiple parks in a single trip
          </p>
        </div>
      </div>

        {/* Usage Guide for Timer */}
        {!currentTrip && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <Clock size={18} />
                New: Smart Timer Feature
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-blue-700 text-sm space-y-2">
              <p>📱 <strong>Mobile-Optimized:</strong> Timers run in the background even when you switch apps or turn off your screen</p>
              <p>⏱️ <strong>Two Ways to Log:</strong> Use manual counting for quick entries or start a timer when joining a queue</p>
              <p>🎯 <strong>Accurate Tracking:</strong> Timer captures your total wait time from queue entry to ride exit</p>
              <p>💡 <strong>Smart Features:</strong> Pause/resume for bathroom breaks, quick-log buttons for common times</p>
            </CardContent>
          </Card>
        )}

        {!currentTrip ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar size={20} />
              Start Your Trip Log
            </CardTitle>
            <CardDescription>
              Select your visit date and the parks you plan to visit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="visit-date">Visit Date</Label>
              <Input
                id="visit-date"
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div>
              <Label>Select Parks to Visit</Label>
              <div className="mt-2">
                <ParkFamilyTripSelector 
                  selectedParks={selectedParks}
                  onParksChange={handleParksChange}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="trip-notes">Trip Notes (optional)</Label>
              <Textarea
                id="trip-notes"
                placeholder="Add any notes about your trip..."
                value={tripNotes}
                onChange={(e) => setTripNotes(e.target.value)}
                rows={3}
              />
            </div>

            <Button 
              onClick={startNewTrip} 
              className="w-full"
              disabled={selectedParks.length === 0 || isLoading}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2"></div>
                  Loading attractions...
                </>
              ) : (
                `Start Trip Log (${selectedParks.length} park${selectedParks.length !== 1 ? 's' : ''} selected)`
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Ticket size={20} />
                  Trip - {new Date(currentTrip.visitDate).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="flex items-center gap-1">
                    {Object.values(rideCounts).reduce((sum, count) => sum + count, 0)} rides logged
                    {isSaving ? (
                      <>
                        <span>•</span>
                        <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full"></div>
                        <span>Saving...</span>
                      </>
                    ) : (
                      Object.values(rideCounts).some(count => count > 0) && (
                        <>
                          <span>•</span>
                          <span>Saved</span>
                        </>
                      )
                    )}
                  </Badge>
                  {Object.values(rideCounts).some(count => count > 0) && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setCurrentTrip(null)
                        setRideCounts({})
                        setSelectedVariants({})
                        setNotes({})
                        setTripNotes('')
                        toast.success('Trip session ended. Your rides have been saved!')
                        navigate('/my-logs')
                      }}
                    >
                      End Trip Session
                    </Button>
                  )}
                </div>
              </CardTitle>
              <CardDescription>
                Parks: {currentTrip.parks.map(p => p.parkName).join(', ')} • Rides auto-save as you log them
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div>
                <Label>Trip Notes (auto-saved)</Label>
                <Textarea
                  value={tripNotes}
                  onChange={(e) => {
                    setTripNotes(e.target.value)
                    // Auto-save when trip notes change - debounced
                    if (currentTrip && user) {
                      setTimeout(() => {
                        setRideCounts(currentCounts => {
                          autoSaveTrip(currentCounts)
                          return currentCounts
                        })
                      }, 500)
                    }
                  }}
                  placeholder="Add notes about your trip experience..."
                  rows={2}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Park Selection Tabs */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin size={20} />
                Select Park to Log Rides
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {currentTrip.parks.map(park => (
                  <Button
                    key={park.parkId}
                    variant={activePark === park.parkId ? "default" : "outline"}
                    onClick={() => setActivePark(park.parkId)}
                    className="flex items-center gap-2"
                  >
                    {park.parkName}
                    {Object.entries(rideCounts)
                      .filter(([key]) => key.startsWith(`${park.parkId}-`))
                      .reduce((sum, [, count]) => sum + count, 0) > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {Object.entries(rideCounts)
                          .filter(([key]) => key.startsWith(`${park.parkId}-`))
                          .reduce((sum, [, count]) => sum + count, 0)}
                      </Badge>
                    )}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Attractions for Active Park */}
          {activePark && attractions[activePark] && (
            <AttractionsForPark
              parkId={activePark}
              attractions={attractions[activePark]}
              rideCounts={rideCounts}
              selectedVariants={selectedVariants}
              notes={notes}
              onUpdateRideCount={updateRideCount}
              onVariantChange={handleVariantChange}
              onNotesChange={handleNotesChange}
              user={user}
            />
          )}
        </div>
      )}
    </div>
  )
}

interface AttractionsForParkProps {
  parkId: string
  attractions: ExtendedAttraction[]
  rideCounts: Record<string, number>
  selectedVariants: Record<string, string>
  notes: Record<string, string>
  onUpdateRideCount: (parkId: string, attractionId: string, change: number) => void
  onVariantChange: (key: string, variant: string) => void
  onNotesChange: (key: string, notes: string) => void
  user: User | null
}

function AttractionsForPark({
  parkId,
  attractions,
  rideCounts,
  selectedVariants,
  notes,
  onUpdateRideCount,
  onVariantChange,
  onNotesChange,
  user
}: AttractionsForParkProps) {
  // Filter out dining establishments - only show actual attractions
  const attractionOnlyFilter = isAttractionNotDining

  const activeAttractions = attractions.filter(a => !a.isDefunct && attractionOnlyFilter(a))
  const defunctAttractions = attractions.filter(a => a.isDefunct && attractionOnlyFilter(a))
  const seasonalAttractions = activeAttractions.filter(a => a.isSeasonal)
  const regularAttractions = activeAttractions.filter(a => !a.isSeasonal)

  return (
    <Tabs defaultValue="regular" className="space-y-4">
      <TabsList>
        <TabsTrigger value="regular">Active Attractions</TabsTrigger>
        {seasonalAttractions.length > 0 && (
          <TabsTrigger value="seasonal">Seasonal</TabsTrigger>
        )}
        {defunctAttractions.length > 0 && (
          <TabsTrigger value="defunct">Defunct/Historical</TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="regular" className="space-y-4">
        {regularAttractions.map(attraction => (
          <RideLogCard
            key={`${parkId}-${attraction.id}`}
            parkId={parkId}
            attraction={attraction}
            count={rideCounts[`${parkId}-${attraction.id}`] || 0}
            selectedVariant={selectedVariants[`${parkId}-${attraction.id}`]}
            notes={notes[`${parkId}-${attraction.id}`] || ''}
            onCountChange={(change) => onUpdateRideCount(parkId, attraction.id, change)}
            onVariantChange={(variant) => onVariantChange(`${parkId}-${attraction.id}`, variant)}
            onNotesChange={(note) => onNotesChange(`${parkId}-${attraction.id}`, note)}
            user={user}
          />
        ))}
      </TabsContent>

      {seasonalAttractions.length > 0 && (
        <TabsContent value="seasonal" className="space-y-4">
          {seasonalAttractions.map(attraction => (
            <RideLogCard
              key={`${parkId}-${attraction.id}`}
              parkId={parkId}
              attraction={attraction}
              count={rideCounts[`${parkId}-${attraction.id}`] || 0}
              selectedVariant={selectedVariants[`${parkId}-${attraction.id}`]}
              notes={notes[`${parkId}-${attraction.id}`] || ''}
              onCountChange={(change) => onUpdateRideCount(parkId, attraction.id, change)}
              onVariantChange={(variant) => onVariantChange(`${parkId}-${attraction.id}`, variant)}
              onNotesChange={(note) => onNotesChange(`${parkId}-${attraction.id}`, note)}
              user={user}
            />
          ))}
        </TabsContent>
      )}

      {defunctAttractions.length > 0 && (
        <TabsContent value="defunct" className="space-y-4">
          <div className="text-sm text-muted-foreground mb-4">
            These attractions are no longer operating but can still be logged for historical visits
          </div>
          {defunctAttractions.map(attraction => (
            <RideLogCard
              key={`${parkId}-${attraction.id}`}
              parkId={parkId}
              attraction={attraction}
              count={rideCounts[`${parkId}-${attraction.id}`] || 0}
              selectedVariant={selectedVariants[`${parkId}-${attraction.id}`]}
              notes={notes[`${parkId}-${attraction.id}`] || ''}
              onCountChange={(change) => onUpdateRideCount(parkId, attraction.id, change)}
              onVariantChange={(variant) => onVariantChange(`${parkId}-${attraction.id}`, variant)}
              onNotesChange={(note) => onNotesChange(`${parkId}-${attraction.id}`, note)}
              isDefunct
              user={user}
            />
          ))}
        </TabsContent>
      )}
    </Tabs>
  )
}

interface RideLogCardProps {
  parkId: string
  attraction: ExtendedAttraction
  count: number
  selectedVariant?: string
  notes: string
  onCountChange: (change: number) => void
  onVariantChange: (variant: string) => void
  onNotesChange: (notes: string) => void
  isDefunct?: boolean
  user: User | null
}

function RideLogCard({ 
  parkId,
  attraction, 
  count, 
  selectedVariant, 
  notes, 
  onCountChange, 
  onVariantChange, 
  onNotesChange,
  isDefunct = false,
  user
}: RideLogCardProps) {
  const [useTimer, setUseTimer] = useState(false)
  const [isLogging, setIsLogging] = useState(false)

  const handleTimerLog = useCallback(async (minutes: number) => {
    setIsLogging(true)
    try {
      // Convert minutes to ride count (each ride = the time logged)
      onCountChange(minutes)
      
      // Brief delay to show the logged state
      setTimeout(() => {
        setIsLogging(false)
        setUseTimer(false) // Switch back to manual mode after logging
      }, 1000)
    } catch (error) {
      console.error('Failed to log timer result:', error)
      toast.error('Failed to log wait time. Please try again.')
      setIsLogging(false)
    }
  }, [onCountChange])
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'thrill': return <Star size={16} />
      case 'family': return <Users size={16} />
      case 'show': return <Clock size={16} />
      default: return <Ticket size={16} />
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

  return (
    <Card className={`transition-all ${count > 0 ? 'ring-2 ring-primary' : ''} ${isDefunct ? 'opacity-75' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Badge className={getTypeColor(attraction.type)} variant="secondary">
              {getTypeIcon(attraction.type)}
              <span className="ml-1 capitalize">{attraction.type}</span>
            </Badge>
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                {attraction.name}
                {attraction.isSeasonal && (
                  <Badge variant="outline" className="text-xs">
                    {attraction.seasonalPeriod || 'Seasonal'}
                  </Badge>
                )}
                {isDefunct && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Defunct
                  </Badge>
                )}
              </h3>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCountChange(-1)}
              disabled={count === 0 || isLogging}
            >
              <Minus size={16} />
            </Button>
            <span className="w-12 text-center font-semibold">
              {count} {count === 1 ? 'min' : 'mins'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCountChange(1)}
              disabled={isLogging}
            >
              <Plus size={16} />
            </Button>
          </div>
        </div>

        {/* Timer/Manual Toggle */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Button
              variant={!useTimer ? "default" : "outline"}
              size="sm"
              onClick={() => setUseTimer(false)}
              disabled={isLogging}
            >
              Manual Count
            </Button>
            <Button
              variant={useTimer ? "default" : "outline"}  
              size="sm"
              onClick={() => setUseTimer(true)}
              disabled={isLogging}
            >
              Use Timer
            </Button>
          </div>

          {/* Timer Component */}
          {useTimer && (
            <RideTimer
              user={user}
              attraction={attraction}
              parkId={parkId}
              onTimeLogged={handleTimerLog}
              isLogging={isLogging}
            />
          )}
        </div>

        {attraction.variants && attraction.variants.length > 0 && (
          <div className="mb-3">
            <Label htmlFor={`variant-${parkId}-${attraction.id}`} className="text-sm">Track/Variant</Label>
            <Select value={selectedVariant || ''} onValueChange={onVariantChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select track/variant" />
              </SelectTrigger>
              <SelectContent>
                {attraction.variants.map(variant => (
                  <SelectItem key={variant.id} value={variant.id}>
                    {variant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {count > 0 && (
          <div>
            <Label htmlFor={`notes-${parkId}-${attraction.id}`} className="text-sm">Notes (optional)</Label>
            <Textarea
              id={`notes-${parkId}-${attraction.id}`}
              placeholder="Add any notes about your experience..."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              className="mt-1"
              rows={2}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface ParkFamilyTripSelectorProps {
  selectedParks: string[]
  onParksChange: (parkIds: string[]) => void
}

function ParkFamilyTripSelector({ selectedParks, onParksChange }: ParkFamilyTripSelectorProps) {
  const [selectedFamily, setSelectedFamily] = useState<string>('')
  const [showParkFilter, setShowParkFilter] = useState<Record<string, boolean>>({})

  const handleParkToggle = (parkId: string, checked: boolean) => {
    if (checked) {
      onParksChange([...selectedParks, parkId])
    } else {
      onParksChange(selectedParks.filter(id => id !== parkId))
    }
  }

  const handleFamilySelectAll = (familyId: string) => {
    const family = parkFamilies.find(f => f.id === familyId)
    if (family) {
      const familyParkIds = family.parks.map(p => p.id)
      const otherParks = selectedParks.filter(parkId => 
        !familyParkIds.includes(parkId)
      )
      onParksChange([...otherParks, ...familyParkIds])
    }
  }

  const handleFamilyDeselectAll = (familyId: string) => {
    const family = parkFamilies.find(f => f.id === familyId)
    if (family) {
      const familyParkIds = family.parks.map(p => p.id)
      onParksChange(selectedParks.filter(parkId => 
        !familyParkIds.includes(parkId)
      ))
    }
  }

  const toggleFamilyFilter = (familyId: string) => {
    setShowParkFilter(prev => ({
      ...prev,
      [familyId]: !prev[familyId]
    }))
  }

  return (
    <div className="space-y-6">
      {parkFamilies.map(family => {
        const familyParks = family.parks
        const selectedFamilyParks = selectedParks.filter(parkId => 
          familyParks.some(p => p.id === parkId)
        )
        const isExpanded = showParkFilter[family.id]

        return (
          <div key={family.id} className="border rounded-lg p-4 space-y-3">
            {/* Family Header */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">{family.name}</h3>
                  <Badge variant="outline" className="text-xs">
                    {family.location}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedFamilyParks.length > 0 
                    ? `${selectedFamilyParks.length} of ${familyParks.length} parks selected`
                    : `${familyParks.length} parks available`
                  }
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleFamilyFilter(family.id)}
                  className="gap-1 text-muted-foreground hover:text-foreground"
                >
                  <CaretDown 
                    size={16} 
                    className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                  />
                  {isExpanded ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>

            {/* Quick Actions */}
            {isExpanded && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFamilySelectAll(family.id)}
                  disabled={selectedFamilyParks.length === familyParks.length}
                >
                  Select All {family.name}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFamilyDeselectAll(family.id)}
                  disabled={selectedFamilyParks.length === 0}
                >
                  Deselect All
                </Button>
              </div>
            )}

            {/* Parks List */}
            {isExpanded && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                {familyParks.map(park => (
                  <div key={park.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={park.id}
                      checked={selectedParks.includes(park.id)}
                      onCheckedChange={(checked) => handleParkToggle(park.id, checked as boolean)}
                    />
                    <Label htmlFor={park.id} className="text-sm cursor-pointer flex items-center gap-2">
                      {park.name}
                      {park.type === 'water-park' && (
                        <Badge variant="secondary" className="text-xs">
                          Water Park
                        </Badge>
                      )}
                    </Label>
                  </div>
                ))}
              </div>
            )}

            {/* Show selected parks when collapsed */}
            {!isExpanded && selectedFamilyParks.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedFamilyParks.map(parkId => {
                  const park = familyParks.find(p => p.id === parkId)
                  return park ? (
                    <Badge key={parkId} variant="secondary" className="text-xs">
                      {park.shortName || park.name}
                    </Badge>
                  ) : null
                })}
              </div>
            )}
          </div>
        )
      })}
      
      {selectedParks.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-foreground">
                {selectedParks.length} Park{selectedParks.length !== 1 ? 's' : ''} Selected
              </h4>
              <p className="text-sm text-muted-foreground">
                Ready to start your trip log
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onParksChange([])}
            >
              Clear All
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}