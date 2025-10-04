import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { useKV } from '@github/spark/hooks'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'


import { 
  ArrowLeft, 
  Calendar, 
  Ticket, 
  MapPin, 
  Plus, 
  Minus, 
  Star, 
  Users, 
  Clock,
  CaretDown,
  MagnifyingGlass,
  Eye,
  Trash,
  Funnel,
  PencilSimple
} from '@phosphor-icons/react'

import { ParkDataService } from '@/services/parkDataService'
import { parkFamilies } from '@/data/sampleData'
import { isAttractionNotDining } from '@/lib/utils'
import type { ExtendedAttraction, Trip, TripPark, RideLog, User } from '@/types'

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
    `current-trip-${user?.id || 'anonymous'}`, 
    null
  )
  const [rideCounts, setRideCounts] = useState<Record<string, number>>({}) // key: "parkId-attractionId"
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [visitDate, setVisitDate] = useState<Date>(new Date())
  const [selectedParks, setSelectedParks] = useState<string[]>(parkId ? [parkId] : [])
  const [isLoading, setIsLoading] = useState(true)
  const [tripNotes, setTripNotes] = useState('')
  const [activePark, setActivePark] = useState<string>(parkId || '')
  const [isSaving, setIsSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

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

    // Clear current trip if it doesn't belong to the current user
    if (currentTrip && currentTrip.userId !== user.id) {
      console.log('🔄 Clearing trip that belongs to different user')
      setCurrentTrip(null)
      setRideCounts({})
      setSelectedVariants({})
      setNotes({})
      setTripNotes('')
    }

    if (parkId) {
      loadAttractionsForPark(parkId)
    } else {
      // If no specific park, set loading to false so the trip setup can begin
      setIsLoading(false)
    }
  }, [user, parkId, currentTrip, setCurrentTrip])

  // Restore state from existing current trip
  useEffect(() => {
    if (currentTrip && currentTrip.rideLogs.length > 0) {
      console.log('🔄 Restoring state from existing trip with', currentTrip.rideLogs.length, 'logs')
      
      // Check if this is an existing trip being edited (has a createdAt date in the past)
      const tripCreated = new Date(currentTrip.createdAt)
      const now = new Date()
      const timeDiff = now.getTime() - tripCreated.getTime()
      const isExistingTrip = timeDiff > 60000 // More than 1 minute ago
      
      setIsEditing(isExistingTrip)
      console.log(`✏️ Trip editing mode: ${isExistingTrip ? 'EDITING' : 'NEW'}`)
      
      const restoredRideCounts: Record<string, number> = {}
      const restoredVariants: Record<string, string> = {}
      const restoredNotes: Record<string, string> = {}
      
      currentTrip.rideLogs.forEach(log => {
        const key = `${log.parkId}-${log.attractionId}`
        restoredRideCounts[key] = log.rideCount
        
        if (log.trackVariant) {
          restoredVariants[key] = log.trackVariant
        }
        
        if (log.notes) {
          restoredNotes[key] = log.notes
        }
      })
      
      setRideCounts(restoredRideCounts)
      setSelectedVariants(restoredVariants)
      setNotes(restoredNotes)
      setTripNotes(currentTrip.notes || '')
      
      console.log('✅ State restored from trip:', {
        rideCount: Object.keys(restoredRideCounts).length,
        variants: Object.keys(restoredVariants).length,
        notes: Object.keys(restoredNotes).length
      })
    } else {
      setIsEditing(false)
    }
  }, [currentTrip])

  // Auto-save when notes change - remove since now using onBlur
  // useEffect(() => {
  //   if (currentTrip && user && Object.values(rideCounts).some(count => count > 0)) {
  //     const timeoutId = setTimeout(() => {
  //       autoSaveTrip(rideCounts)
  //     }, 500) // Debounce notes changes
      
  //     return () => clearTimeout(timeoutId)
  //   }
  // }, [notes, currentTrip, user, rideCounts])

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
      console.log(`🔄 Loading attractions for park: ${targetParkId}`)
      
      // Use ParkDataService which has fallback mechanisms
      const attractionData = await ParkDataService.loadAttractions(targetParkId)
      
      if (attractionData && Array.isArray(attractionData) && attractionData.length > 0) {
        setAttractions(prev => ({
          ...prev,
          [targetParkId]: attractionData
        }))
        console.log(`✅ Loaded ${attractionData.length} attractions for ${targetParkId}`)
      } else {
        console.warn(`⚠️ No attractions found for park ${targetParkId}`)
        toast.error(`No attractions found for this park. This park may not have data available yet.`)
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
        console.log(`🔄 Loading attractions for park: ${parkId}`)
        
        // Use ParkDataService which has fallback mechanisms
        const attractionData = await ParkDataService.loadAttractions(parkId)
        
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
    setNotes(prev => ({
      ...prev,
      [key]: note
    }))
  }, [])

  const handleNotesBlur = useCallback((key: string) => {
    // Auto-save when notes field loses focus
    if (currentTrip && user && Object.values(rideCounts).some(count => count > 0)) {
      setTimeout(() => {
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
      const currentCount = prev[key] || 0
      const newCount = Math.max(0, currentCount + change)
      
      const newCounts = {
        ...prev,
        [key]: newCount
      }
      
      // Auto-save the trip with updated counts - add validation
      if (currentTrip && user && window.spark?.kv) {
        // Add a small delay to prevent rapid-fire saves
        setTimeout(() => {
          try {
            autoSaveTrip(newCounts)
          } catch (error) {
            console.error('❌ Error during auto-save:', error)
            toast.error('Failed to save changes. Please try again.')
          }
        }, 100)
      } else if (!window.spark?.kv) {
        toast.error('Storage not available. Changes may not be saved.')
      }
      
      return newCounts
    })
  }

  const startNewTrip = async () => {
    if (!user || selectedParks.length === 0) {
      toast.error('Please select at least one park to start your trip log.')
      return
    }

    // Check if Spark KV is available
    if (!window.spark?.kv) {
      toast.error('Storage system not available. Please refresh the page and try again.')
      return
    }

    setIsLoading(true)
    
    try {
      console.log(`🚀 Starting new trip for ${selectedParks.length} parks:`, selectedParks)
      
      // First, validate that the selected parks have data available
      const availableParks = ParkDataService.getAvailableParks()
      console.log('📋 Available parks with data:', availableParks)
      
      const validParks = selectedParks.filter(parkId => ParkDataService.hasPark(parkId))
      const invalidParks = selectedParks.filter(parkId => !ParkDataService.hasPark(parkId))
      
      if (invalidParks.length > 0) {
        const invalidParkNames = invalidParks.map(parkId => {
          const parkInfo = parkFamilies
            .flatMap(family => family.parks.map(park => ({ ...park, familyId: family.id, familyName: family.name })))
            .find(park => park.id === parkId)
          return parkInfo?.name || parkId
        })
        console.warn(`⚠️ Parks without data: ${invalidParks.join(', ')}`)
        toast.error(`The following parks don't have attraction data available yet: ${invalidParkNames.join(', ')}`)
        
        if (validParks.length === 0) {
          toast.error('None of the selected parks have attraction data available. Please select different parks.')
          setIsLoading(false)
          return
        }
      }
      
      // Use only valid parks for the trip
      const parksToUse = validParks.length > 0 ? validParks : selectedParks
      console.log(`🎯 Using parks for trip:`, parksToUse)
      
      // Load attractions for all selected parks  
      await loadAllSelectedParksAttractions(parksToUse)

      // Create trip parks data
      const tripParks: TripPark[] = parksToUse.map(parkId => {
        const parkInfo = parkFamilies
          .flatMap(family => family.parks.map(park => ({ ...park, familyId: family.id, familyName: family.name })))
          .find(park => park.id === parkId)
        
        return {
          parkId,
          parkName: parkInfo?.name || parkId,
          rideCount: 0
        }
      })

      // Generate unique trip ID
      const tripId = `trip-${user.id}-${Date.now()}`
      
      const newTrip: Trip = {
        id: tripId,
        userId: user.id,
        visitDate: visitDate.toISOString().split('T')[0], // Convert Date to string
        parks: tripParks,
        rideLogs: [],
        totalRides: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: tripNotes.trim() || undefined
      }

      console.log('💾 Saving new trip to storage...')
      
      // Save trip to storage
      try {
        await window.spark.kv.set(`current-trip-${user.id}`, newTrip)
        console.log('✅ New trip saved successfully')
      } catch (kvError) {
        console.error('❌ Failed to save new trip:', kvError)
        
        // Show specific error
        if (kvError instanceof Error && kvError.message.includes('quota')) {
          toast.error('Storage quota exceeded. Please delete some old trips and try again.')
        } else {
          toast.error('Failed to save trip. Please try again or refresh the page.')
        }
        throw kvError
      }

      // Update state only after successful save
      setCurrentTrip(newTrip)
      setActivePark(parksToUse[0]) // Set first park as active
      
      const parkNames = tripParks.map(p => p.parkName).join(', ')
      toast.success(`Started trip log for: ${parkNames}`)
      
      // If some parks were invalid, warn the user but continue
      if (invalidParks.length > 0 && validParks.length > 0) {
        setTimeout(() => {
          toast.warning(`Note: Some parks were excluded due to missing data. Contact support if you need those parks added.`)
        }, 2000)
      }
      
    } catch (error) {
      console.error('❌ Failed to start trip:', error)
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to start trip: ${errorMessage}`)
      
    } finally {
      setIsLoading(false)
    }
  }

  const autoSaveTrip = async (updatedRideCounts: Record<string, number>) => {
    if (!user || !currentTrip) {
      console.warn('⚠️ Cannot save trip: missing user or current trip')
      return
    }

    // Check if spark KV is available
    if (!window.spark?.kv) {
      console.error('❌ Spark KV not available')
      toast.error('Storage not available. Please try refreshing the page.')
      return
    }

    setIsSaving(true)
    
    try {
      console.log('🔄 Starting trip save process...')
      console.log('📊 Current ride counts:', updatedRideCounts)
      
      const logsToSave: RideLog[] = []

      // Build ride logs from current counts
      Object.entries(updatedRideCounts).forEach(([key, count]) => {
        console.log(`🎢 Processing ride: ${key} = ${count}`)
        if (count > 0) {
          // Find the correct parkId by checking which selected park the key starts with
          const parkId = selectedParks.find(p => key.startsWith(`${p}-`))
          if (!parkId) {
            console.warn(`⚠️ Could not determine parkId for key: ${key}`)
            return
          }
          
          // Extract attractionId by removing the parkId prefix and the connecting dash
          const attractionId = key.substring(parkId.length + 1)
          
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
              trackVariant: selectedVariants[key] || undefined,
              loggedAt: new Date().toISOString(),
              notes: notes[key] || undefined
            }
            logsToSave.push(rideLog)
            console.log(`✅ Added ride log for ${attraction.name}: ${count} rides`)
          } else {
            console.warn(`⚠️ Attraction not found for key: ${key}, trying fallback`)
            // Try to find existing log data as fallback
            const existingLog = currentTrip.rideLogs.find(log => log.parkId === parkId && log.attractionId === attractionId)
            if (existingLog) {
              const rideLog: RideLog = {
                id: `log-${user.id}-${attractionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                userId: user.id,
                tripId: currentTrip.id,
                parkId,
                attractionId,
                attractionName: existingLog.attractionName,
                attractionType: existingLog.attractionType,
                rideCount: count,
                trackVariant: selectedVariants[key] || undefined,
                loggedAt: new Date().toISOString(),
                notes: notes[key] || undefined
              }
              logsToSave.push(rideLog)
              console.log(`✅ Added fallback ride log for ${existingLog.attractionName}: ${count} rides`)
            } else {
              console.error(`❌ No fallback data available for ${key}`)
              // As last resort, create a basic log entry to prevent total failure
              console.log(`🆘 Creating emergency fallback log for ${key}`)
              const rideLog: RideLog = {
                id: `log-${user.id}-${attractionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                userId: user.id,
                tripId: currentTrip.id,
                parkId,
                attractionId,
                attractionName: `Unknown Attraction (${attractionId})`,
                attractionType: 'experience' as any,
                rideCount: count,
                trackVariant: selectedVariants[key] || undefined,
                loggedAt: new Date().toISOString(),
                notes: notes[key] || undefined
              }
              logsToSave.push(rideLog)
              console.log(`⚠️ Created emergency fallback log`)
            }
          }
        } else {
          console.log(`⏭️ Skipping ${key} with count ${count}`)
        }
      })

      console.log(`📝 Built ${logsToSave.length} ride logs to save`)

      // Update park ride counts
      const updatedParks = currentTrip.parks.map(park => ({
        ...park,
        rideCount: logsToSave.filter(log => log.parkId === park.parkId).reduce((sum, log) => sum + log.rideCount, 0)
      }))

      // Create updated trip object
      const updatedTrip: Trip = {
        id: currentTrip.id,
        userId: user.id,
        visitDate: currentTrip.visitDate,
        parks: updatedParks,
        rideLogs: logsToSave,
        totalRides: logsToSave.reduce((sum, log) => sum + log.rideCount, 0),
        createdAt: currentTrip.createdAt,
        updatedAt: new Date().toISOString(),
        notes: tripNotes.trim() || undefined
      }

      console.log(`💾 Saving trip with ${logsToSave.length} logs, ${updatedTrip.totalRides} total rides`)
      console.log('📊 Trip data to save:', {
        id: updatedTrip.id,
        userId: updatedTrip.userId,
        visitDate: updatedTrip.visitDate,
        parks: updatedTrip.parks.map(p => ({ parkId: p.parkId, parkName: p.parkName, rideCount: p.rideCount })),
        totalRides: updatedTrip.totalRides,
        logCount: updatedTrip.rideLogs.length,
        rideLogsDetails: updatedTrip.rideLogs.map(log => ({ name: log.attractionName, count: log.rideCount }))
      })

      // Update current trip state first - this ensures the completion handler gets the right data
      setCurrentTrip(updatedTrip)
      
      // Save to KV storage
      try {
        // Save current trip (for resuming sessions)
        await window.spark.kv.set(`current-trip-${user.id}`, updatedTrip)
        console.log('✅ Current trip saved to KV')
        
        // If there are rides logged, save to permanent trip storage  
        if (updatedTrip.totalRides > 0) {
          await window.spark.kv.set(`trip-${updatedTrip.id}`, updatedTrip)
          console.log('✅ Trip record saved to KV permanent storage with proper ride counts')
          
          // Update user's trip history - this is critical for My Trips to work
          const userTrips = await window.spark.kv.get<string[]>(`user-trips-${user.id}`) || []
          console.log('📋 Current user trip history before update:', userTrips)
          
          if (!userTrips.includes(updatedTrip.id)) {
            const updatedUserTrips = [...userTrips, updatedTrip.id]
            await window.spark.kv.set(`user-trips-${user.id}`, updatedUserTrips)
            console.log('✅ User trip history updated - added trip ID:', updatedTrip.id)
            console.log('📋 Updated user trip history:', updatedUserTrips)
            
            // Verify the save worked
            const verifyUserTrips = await window.spark.kv.get<string[]>(`user-trips-${user.id}`)
            console.log('🔍 Verification - User trips after save:', verifyUserTrips)
          } else {
            console.log('ℹ️ Trip already exists in user trip history')
          }
        } else {
          console.log('ℹ️ No rides logged yet, trip not saved to permanent storage')
        }
        
      } catch (kvError) {
        console.error('❌ KV Storage error:', kvError)
        
        // Try to diagnose the issue
        const errorDetails = {
          error: kvError instanceof Error ? kvError.message : 'Unknown error',
          tripId: updatedTrip.id,
          userId: user.id,
          dataSize: JSON.stringify(updatedTrip).length,
          logsCount: logsToSave.length
        }
        console.error('KV Error details:', errorDetails)
        
        // Show user-friendly error message
        if (kvError instanceof Error && kvError.message.includes('quota')) {
          toast.error('Storage quota exceeded. Please delete some old trip logs and try again.')
        } else if (kvError instanceof Error && kvError.message.includes('network')) {
          toast.error('Network error. Your changes will be saved when connection is restored.')
        } else {
          toast.error('Failed to save trip data. Please try again or refresh the page.')
        }
        
        throw kvError // Re-throw to be caught by outer catch
      }
      
    } catch (error) {
      console.error('❌ Trip save failed:', error)
      
      // Show specific error message to user
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      toast.error(`Unable to save trip: ${errorMessage}`)
      
    } finally {
      // Brief delay to show saving status
      setTimeout(() => setIsSaving(false), 1000)
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
          <h1 className="text-3xl font-bold">
            {isEditing ? 'Edit Your Park Trip' : 'Log Your Park Trip'}
          </h1>
          <p className="text-muted-foreground">
            {isEditing 
              ? 'Continue adding rides to your existing trip or modify current entries'
              : 'Track your rides across multiple parks in a single trip'
            }
          </p>
        </div>
      </div>

      {/* Show editing banner */}
      {isEditing && currentTrip && (
        <Card className="border-accent/50 bg-accent/5">
          <CardContent className="flex items-center gap-3 py-3">
            <div className="flex items-center gap-2 text-accent">
              <PencilSimple size={18} />
              <span className="font-medium">Editing Existing Trip</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Trip from {new Date(currentTrip.visitDate).toLocaleDateString()} • 
              {currentTrip.totalRides} rides currently logged •
              {currentTrip.rideLogs.length} attractions
            </div>
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
              <div className="mt-1 p-3 bg-muted rounded-md border">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar size={16} className="text-muted-foreground" />
                  <span className="font-medium">
                    {new Date().toLocaleDateString('en-US', { 
                      weekday: 'long',
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Currently only today's date is supported for new trip logs
                </p>
              </div>
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
              disabled={selectedParks.length === 0 || isLoading || !window.spark?.kv}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2"></div>
                  Loading attractions...
                </>
              ) : !window.spark?.kv ? (
                'Storage not available - please refresh'
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
                      onClick={async () => {
                        if (!user || !currentTrip) {
                          toast.error('No active trip to complete')
                          return
                        }

                        try {
                          console.log('🔄 Completing trip session...')
                          console.log('📊 Current ride counts before completion:', rideCounts)
                          console.log('🎯 Current trip state:', {
                            id: currentTrip.id,
                            totalRides: currentTrip.totalRides,
                            rideLogs: currentTrip.rideLogs.length
                          })
                          
                          // Check that we actually have rides to save
                          const totalRideCount = Object.values(rideCounts).reduce((sum, count) => sum + count, 0)
                          if (totalRideCount === 0) {
                            toast.warning('No rides logged in this trip session')
                            return
                          }
                          
                          console.log(`🎢 Total rides to complete: ${totalRideCount}`)
                          
                          // Build the trip data directly from current state instead of relying on auto-save
                          console.log('🔨 Building final trip directly from current state...')
                          
                          const finalLogsToSave: RideLog[] = []

                          Object.entries(rideCounts).forEach(([key, count]) => {
                            if (count > 0) {
                              const parts = key.split('-')
                              // Handle attraction IDs that might contain dashes - take first part as parkId, rest as attractionId
                              const parkId = parts[0]
                              const attractionId = parts.slice(1).join('-')
                              
                              console.log(`🔍 Processing ride log for key: ${key}, parkId: ${parkId}, attractionId: ${attractionId}, count: ${count}`)
                              console.log(`🏗️ Available attractions for park ${parkId}:`, attractions[parkId]?.map(a => ({ id: a.id, name: a.name })) || 'No attractions loaded')
                              
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
                                  trackVariant: selectedVariants[key] || undefined,
                                  loggedAt: new Date().toISOString(),
                                  notes: notes[key] || undefined
                                }
                                finalLogsToSave.push(rideLog)
                                console.log(`✅ Created ride log for ${attraction.name}`)
                              } else {
                                console.warn(`⚠️ Could not find attraction with ID ${attractionId} in park ${parkId}`)
                                console.warn(`Available attraction IDs:`, attractions[parkId]?.map(a => a.id) || 'None')
                                
                                // Try to create the log anyway using data from the existing trip if possible
                                const existingLog = currentTrip.rideLogs.find(log => log.parkId === parkId && log.attractionId === attractionId)
                                if (existingLog) {
                                  console.log('📝 Using existing log data as fallback')
                                  const rideLog: RideLog = {
                                    id: `log-${user.id}-${attractionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                    userId: user.id,
                                    tripId: currentTrip.id,
                                    parkId,
                                    attractionId,
                                    attractionName: existingLog.attractionName,
                                    attractionType: existingLog.attractionType,
                                    rideCount: count,
                                    trackVariant: selectedVariants[key] || undefined,
                                    loggedAt: new Date().toISOString(),
                                    notes: notes[key] || undefined
                                  }
                                  finalLogsToSave.push(rideLog)
                                  console.log(`✅ Created fallback ride log for ${existingLog.attractionName}`)
                                } else {
                                  console.error(`❌ No fallback data available for ${key}`)
                                  // As a last resort, create a basic log entry to prevent total failure
                                  console.log(`🆘 Creating emergency fallback log for ${key}`)
                                  const rideLog: RideLog = {
                                    id: `log-${user.id}-${attractionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                    userId: user.id,
                                    tripId: currentTrip.id,
                                    parkId,
                                    attractionId,
                                    attractionName: `Unknown Attraction (${attractionId})`,
                                    attractionType: 'experience' as any,
                                    rideCount: count,
                                    trackVariant: selectedVariants[key] || undefined,
                                    loggedAt: new Date().toISOString(),
                                    notes: notes[key] || undefined
                                  }
                                  finalLogsToSave.push(rideLog)
                                  console.log(`⚠️ Created emergency fallback log`)
                                }
                              }
                            }
                          })
                          
                          console.log(`📋 Final logs to save: ${finalLogsToSave.length}`)
                          console.log('🎢 Final ride logs:', finalLogsToSave.map(log => ({ name: log.attractionName, count: log.rideCount })))
                          
                          if (finalLogsToSave.length === 0) {
                            console.error('❌ Trip completion failed: No valid ride logs could be created')
                            console.error('Debug info:', {
                              rideCountsEntries: Object.entries(rideCounts).length,
                              attractionsLoaded: Object.keys(attractions),
                              rideCounts: rideCounts
                            })
                            toast.error('Unable to complete trip - could not process the logged rides. Please try refreshing the page and trying again.')
                            return
                          }
                          
                          // Update park ride counts
                          const finalUpdatedParks = currentTrip.parks.map(park => ({
                            ...park,
                            rideCount: finalLogsToSave.filter(log => log.parkId === park.parkId).reduce((sum, log) => sum + log.rideCount, 0)
                          }))

                          // Create the final trip object
                          const finalTripData: Trip = {
                            id: currentTrip.id,
                            userId: user.id,
                            visitDate: currentTrip.visitDate,
                            parks: finalUpdatedParks,
                            rideLogs: finalLogsToSave,
                            totalRides: finalLogsToSave.reduce((sum, log) => sum + log.rideCount, 0),
                            createdAt: currentTrip.createdAt,
                            updatedAt: new Date().toISOString(),
                            notes: tripNotes.trim() || undefined
                          }
                          
                          console.log('📋 Final trip data built:', {
                            id: finalTripData.id,
                            totalRides: finalTripData.totalRides,
                            rideLogs: finalTripData.rideLogs.length,
                            parks: finalTripData.parks.map(p => ({ name: p.parkName, rideCount: p.rideCount }))
                          })
                          
                          // Save to permanent storage
                          console.log(`💾 Saving completed trip to permanent storage: trip-${finalTripData.id}`)
                          await window.spark.kv.set(`trip-${finalTripData.id}`, finalTripData)
                          
                          // Update user trip history - this is critical for My Trips display
                          console.log('📋 Updating user trip history...')
                          const userTrips = await window.spark.kv.get<string[]>(`user-trips-${user.id}`) || []
                          console.log('📋 Current user trip history before update:', userTrips)
                          
                          if (!userTrips.includes(finalTripData.id)) {
                            const updatedUserTrips = [...userTrips, finalTripData.id]
                            await window.spark.kv.set(`user-trips-${user.id}`, updatedUserTrips)
                            console.log('✅ Updated user trip history:', updatedUserTrips)
                          } else {
                            console.log('ℹ️ Trip already exists in user history')
                          }
                          
                          // Verify the save worked
                          console.log('🔍 Verifying trip save...')
                          const savedTrip = await window.spark.kv.get<Trip>(`trip-${finalTripData.id}`)
                          const verifyUserTrips = await window.spark.kv.get<string[]>(`user-trips-${user.id}`)
                          
                          if (!savedTrip) {
                            throw new Error('Failed to save trip to permanent storage')
                          }
                          
                          if (!verifyUserTrips || !verifyUserTrips.includes(finalTripData.id)) {
                            throw new Error('Failed to update user trip history')
                          }
                          
                          console.log('✅ Verification passed:', {
                            savedTrip: savedTrip ? `YES (${savedTrip.totalRides} rides)` : 'NO',
                            inUserHistory: verifyUserTrips?.includes(finalTripData.id) ? 'YES' : 'NO',
                            userTripCount: verifyUserTrips?.length || 0
                          })
                          
                          // Clear current trip session only after successful verification
                          console.log('🗑️ Clearing current trip session...')
                          await window.spark.kv.delete(`current-trip-${user.id}`)
                          
                          // Clear local state
                          setCurrentTrip(null)
                          setRideCounts({})
                          setSelectedVariants({})
                          setNotes({})
                          setTripNotes('')
                          
                          toast.success(`Trip completed! Saved ${finalTripData.totalRides} rides across ${finalTripData.parks.length} parks.`)
                          
                          // Navigate to My Trips page
                          navigate('/my-logs')
                          
                        } catch (error) {
                          console.error('❌ Error completing trip:', error)
                          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                          toast.error(`Failed to complete trip: ${errorMessage}. Your trip data has been saved and you can try again.`)
                        }
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
              onNotesBlur={handleNotesBlur}
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
  onNotesBlur: (key: string) => void
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
  onNotesBlur,
  user
}: AttractionsForParkProps) {
  // Filter out dining establishments - only show actual attractions
  const attractionOnlyFilter = isAttractionNotDining

  const activeAttractions = attractions.filter(a => !a.isDefunct && attractionOnlyFilter(a))
  const defunctAttractions = attractions.filter(a => a.isDefunct && attractionOnlyFilter(a)).sort((a, b) => a.name.localeCompare(b.name))
  const seasonalAttractions = activeAttractions.filter(a => a.isSeasonal).sort((a, b) => a.name.localeCompare(b.name))
  const regularAttractions = activeAttractions.filter(a => !a.isSeasonal).sort((a, b) => a.name.localeCompare(b.name))

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
            onNotesBlur={() => onNotesBlur(`${parkId}-${attraction.id}`)}
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
              onNotesBlur={() => onNotesBlur(`${parkId}-${attraction.id}`)}
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
              onNotesBlur={() => onNotesBlur(`${parkId}-${attraction.id}`)}
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
  onNotesBlur: () => void
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
  onNotesBlur,
  isDefunct = false,
  user
}: RideLogCardProps) {
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
        <div className="flex items-center justify-between mb-4">
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
          
          {/* Simple ride counter */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCountChange(-1)}
              disabled={count === 0}
            >
              <Minus size={16} />
            </Button>
            <div className="text-center min-w-[60px]">
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs text-muted-foreground">
                {count === 1 ? 'ride' : 'rides'}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCountChange(1)}
            >
              <Plus size={16} />
            </Button>
          </div>
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
              onBlur={onNotesBlur}
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

  // Get available parks from the data service
  const availableParks = ParkDataService.getAvailableParks()

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
      // Only select parks that have data available
      const familyParkIds = family.parks
        .filter(park => availableParks.includes(park.id))
        .map(p => p.id)
      const otherParks = selectedParks.filter(parkId => 
        !family.parks.some(p => p.id === parkId)
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

  // Reset park filter when changing family selection
  const handleFamilyChange = (familyId: string) => {
    setSelectedFamily(familyId)
    // Auto-expand the newly selected family
    if (familyId) {
      setShowParkFilter(prev => ({
        ...prev,
        [familyId]: true
      }))
    }
  }

  // Get families to display - filtered by selection
  const familiesToShow = selectedFamily 
    ? parkFamilies.filter(family => family.id === selectedFamily)
    : []

  return (
    <div className="space-y-6">
      {/* Resort Group Selection */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Funnel size={16} className="text-muted-foreground" />
          <Label className="text-sm font-medium">Step 1: Choose Resort Group</Label>
        </div>
        <Select
          value={selectedFamily || 'none'}
          onValueChange={(value) => handleFamilyChange(value === 'none' ? '' : value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a resort group to view parks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Choose a resort group...</SelectItem>
            {[...parkFamilies]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((family) => {
              const familyParksWithData = family.parks.filter(park => availableParks.includes(park.id))
              return (
                <SelectItem key={family.id} value={family.id}>
                  {`${family.name} (${familyParksWithData.length} parks)`}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Parks Selection - Only show if family is selected */}
      {selectedFamily && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-muted-foreground" />
            <Label className="text-sm font-medium">Step 2: Choose Parks from Selected Resort</Label>
          </div>
          
          {/* Helpful info about multiple parks */}
          <div className="bg-muted/50 border border-muted rounded-lg p-3">
            <p className="text-sm text-muted-foreground">
              <strong>Tip:</strong> Select multiple parks if you're visiting more than one park on the same day. 
              This helps you track all your rides in one trip log!
            </p>
          </div>
          
          {familiesToShow.map(family => {
            const familyParks = family.parks
            const parksWithData = familyParks.filter(park => availableParks.includes(park.id))
            const selectedFamilyParks = selectedParks.filter(parkId => 
              familyParks.some(p => p.id === parkId)
            )
            const isExpanded = showParkFilter[family.id] !== false // Default to expanded

            return (
              <div key={family.id} className="border rounded-lg p-4 space-y-3">
                {/* Family Header */}
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{family.name}</h3>
                      <Badge variant="outline" className="text-xs">
                        {family.location}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {selectedFamilyParks.length > 0 
                        ? `${selectedFamilyParks.length} of ${parksWithData.length} parks selected`
                        : `${parksWithData.length} of ${familyParks.length} parks have data available`
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
                      disabled={selectedFamilyParks.length === parksWithData.length || parksWithData.length === 0}
                    >
                      Select All Available
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
                    {familyParks.map(park => {
                      const hasData = availableParks.includes(park.id)
                      return (
                        <div key={park.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={park.id}
                            checked={selectedParks.includes(park.id)}
                            onCheckedChange={(checked) => handleParkToggle(park.id, checked as boolean)}
                            disabled={!hasData}
                          />
                          <Label 
                            htmlFor={park.id} 
                            className={`text-sm cursor-pointer flex items-center gap-2 ${!hasData ? 'text-muted-foreground' : ''}`}
                          >
                            {park.name}
                            {park.type === 'water-park' && (
                              <Badge variant="secondary" className="text-xs">
                                Water Park
                              </Badge>
                            )}
                            {!hasData && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                No Data
                              </Badge>
                            )}
                          </Label>
                        </div>
                      )
                    })}
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
        </div>
      )}
      
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