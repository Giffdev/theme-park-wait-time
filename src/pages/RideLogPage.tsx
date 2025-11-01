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
import { DatePicker } from '@/components/ui/date-picker'


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
import { isAttractionNotDining, canLogInTrip, isRetiredAttraction } from '@/lib/utils'
import type { ExtendedAttraction, Trip, TripPark, RideLog, User, TripDay } from '@/types'
import { MultiDayTripPicker, type DayParkSelection } from '@/components/MultiDayTripPicker'
import { format } from 'date-fns'

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
  const [rideCounts, setRideCounts] = useState<Record<string, number>>({}) // key: "date-parkId-attractionId"
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [visitDate, setVisitDate] = useState<Date>(new Date())
  const [selectedParks, setSelectedParks] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [tripNotes, setTripNotes] = useState('')
  const [activePark, setActivePark] = useState<string>(parkId || '')
  const [activeDay, setActiveDay] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [showContinuationPrompt, setShowContinuationPrompt] = useState(false)
  const [justCreatedTrip, setJustCreatedTrip] = useState(false)
  const [tripDays, setTripDays] = useState<TripDay[]>([])

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

    console.log('🚀 Initializing RideLogPage:', { parkId, currentTrip: currentTrip?.id, selectedParks: selectedParks.length, justCreatedTrip })

    // Clear current trip if it doesn't belong to the current user
    if (currentTrip && currentTrip.userId !== user.id) {
      console.log('🔄 Clearing trip that belongs to different user')
      setCurrentTrip(null)
      setRideCounts({})
      setSelectedVariants({})
      setNotes({})
      setTripNotes('')
      setSelectedParks([])
      return
    }

    // If user accessed /log directly (no parkId) and there's a current trip with no rides,
    // clear it to give them a fresh start - BUT only if we didn't just create this trip
    if (!parkId && currentTrip && currentTrip.totalRides === 0 && !justCreatedTrip) {
      console.log('🆕 Clearing empty current trip for fresh start from /log')
      setCurrentTrip(null)
      setRideCounts({})
      setSelectedVariants({})
      setNotes({})
      setTripNotes('')
      setSelectedParks([])
      return
    }

    // If user accessed /log directly and there's an existing trip with rides,
    // show them the option to continue or start fresh
    if (!parkId && currentTrip && currentTrip.totalRides > 0 && !showContinuationPrompt) {
      console.log('❓ Showing continuation prompt for existing trip with rides')
      setShowContinuationPrompt(true)
      return
    }

    // Pre-select park when coming from a specific park page (e.g., /log/disneyland) - only once
    if (parkId && selectedParks.length === 0 && !currentTrip) {
      console.log(`🎯 Pre-selecting park from URL: ${parkId}`)
      setSelectedParks([parkId])
    }

    if (parkId && !currentTrip) {
      loadAttractionsForPark(parkId)
    } else if (!parkId) {
      // If no specific park, set loading to false so the trip setup can begin
      setIsLoading(false)
    }
  }, [user, parkId, currentTrip?.id, currentTrip?.totalRides, currentTrip?.userId])

  // Separate effect to auto-start trip when park is pre-selected
  useEffect(() => {
    // Auto-start trip if coming from park page with parkId and park is now selected
    if (parkId && !currentTrip && selectedParks.includes(parkId) && user && !isLoading) {
      // Also check that the park has data available
      const availableParks = ParkDataService.getAvailableParks()
      if (availableParks.includes(parkId)) {
        console.log(`🚀 Auto-starting trip for park: ${parkId} (parks selected: ${selectedParks.join(', ')})`)
        // Small delay to prevent race conditions
        const timeoutId = setTimeout(() => {
          if (!currentTrip) { // Double-check to prevent duplicate trips
            startNewTrip()
          }
        }, 100)
        
        return () => clearTimeout(timeoutId)
      } else {
        console.warn(`⚠️ Cannot auto-start trip for ${parkId} - no data available`)
      }
    }
  }, [parkId, currentTrip, selectedParks, user, isLoading])

  // Separate effect to handle clean slate initialization when accessing /log directly
  // REMOVED: This effect was causing the bug where users couldn't select parks.
  // The effect was continuously clearing selectedParks state even when the user
  // was actively trying to select parks in the trip setup UI.

  // Restore state from existing current trip
  useEffect(() => {
    if (currentTrip && currentTrip.rideLogs.length > 0) {
      console.log('🔄 Restoring state from existing trip with', currentTrip.rideLogs.length, 'logs')
      
      const tripCreated = new Date(currentTrip.createdAt)
      const now = new Date()
      const timeDiff = now.getTime() - tripCreated.getTime()
      const isExistingTrip = timeDiff > 60000
      
      setIsEditing(isExistingTrip)
      console.log(`✏️ Trip editing mode: ${isExistingTrip ? 'EDITING' : 'NEW'}`)
      
      if (currentTrip.days && currentTrip.days.length > 0) {
        setTripDays(currentTrip.days)
        setActiveDay(currentTrip.days[0].date)
        setActivePark(currentTrip.days[0].parkId)
      } else {
        const tripParkIds = currentTrip.parks.map(p => p.parkId)
        setSelectedParks(currentSelectedParks => {
          const currentSet = new Set(currentSelectedParks)
          const tripSet = new Set(tripParkIds)
          
          const areSame = currentSet.size === tripSet.size && 
            tripParkIds.every(id => currentSet.has(id))
          
          if (areSame) {
            console.log('🏰 Selected parks already match trip parks, skipping update')
            return currentSelectedParks
          }
          
          console.log('🏰 Restoring selected parks from trip:', tripParkIds)
          return tripParkIds
        })
      }
      
      const restoredRideCounts: Record<string, number> = {}
      const restoredVariants: Record<string, string> = {}
      const restoredNotes: Record<string, string> = {}
      
      currentTrip.rideLogs.forEach(log => {
        const key = log.visitDate 
          ? `${log.visitDate}-${log.parkId}-${log.attractionId}`
          : `${log.parkId}-${log.attractionId}`
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
      if (!currentTrip) {
        setShowContinuationPrompt(false)
      }
    }
  }, [currentTrip, parkId])

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

  const loadAllSelectedParksAttractions = useCallback(async (parks: string[]) => {
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
  }, [])

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
    // Don't auto-save on every character - only on blur
  }, [])

  const handleNotesBlur = useCallback((key: string) => {
    // Auto-save when notes field loses focus - use current notes state
    if (currentTrip && user && window.spark?.kv) {
      setTimeout(() => {
        setRideCounts(currentCounts => {
          autoSaveTrip(currentCounts)
          return currentCounts
        })
      }, 100)
    }
  }, [currentTrip, user])

  const updateRideCount = (parkId: string, attractionId: string, change: number) => {
    const key = activeDay 
      ? `${activeDay}-${parkId}-${attractionId}`
      : `${parkId}-${attractionId}`
    
    setRideCounts(prev => {
      const currentCount = prev[key] || 0
      const newCount = Math.max(0, currentCount + change)
      
      const newCounts = {
        ...prev,
        [key]: newCount
      }
      
      if (currentTrip && user && window.spark?.kv) {
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

  const startNewTrip = useCallback(async () => {
    if (!user || selectedParks.length === 0) {
      toast.error('Please select at least one park to start your trip log.')
      return
    }

    if (!window.spark?.kv) {
      toast.error('Storage system not available. Please refresh the page and try again.')
      return
    }

    setIsLoading(true)
    
    try {
      console.log(`🚀 Starting new trip for ${selectedParks.length} parks:`, selectedParks)
      
      const availableParks = ParkDataService.getAvailableParks()
      console.log('📋 Available parks with data:', availableParks)
      
      const validParks = selectedParks.filter(parkId => {
        const hasData = ParkDataService.hasPark(parkId)
        console.log(`🔍 Park ${parkId} has data: ${hasData}`)
        return hasData
      })
      const invalidParks = selectedParks.filter(parkId => !ParkDataService.hasPark(parkId))
      
      console.log(`✅ Valid parks: ${validParks.length}/${selectedParks.length}`, validParks)
      console.log(`❌ Invalid parks: ${invalidParks.length}/${selectedParks.length}`, invalidParks)
      
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
      
      const parksToUse = validParks.length > 0 ? validParks : selectedParks
      console.log(`🎯 Using parks for trip:`, parksToUse)
      
      await loadAllSelectedParksAttractions(parksToUse)

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

      const tripId = `trip-${user.id}-${Date.now()}`
      
      const newTrip: Trip = {
        id: tripId,
        userId: user.id,
        visitDate: visitDate.toISOString().split('T')[0],
        parks: tripParks,
        rideLogs: [],
        totalRides: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: tripNotes.trim() || undefined
      }

      console.log('💾 Saving new trip to storage...', newTrip)
      
      try {
        await window.spark.kv.set(`current-trip-${user.id}`, newTrip)
        console.log('✅ New trip saved successfully')
      } catch (kvError) {
        console.error('❌ Failed to save new trip:', kvError)
        
        if (kvError instanceof Error && kvError.message.includes('quota')) {
          toast.error('Storage quota exceeded. Please delete some old trips and try again.')
        } else {
          toast.error('Failed to save trip. Please try again or refresh the page.')
        }
        throw kvError
      }

      setCurrentTrip(newTrip)
      setJustCreatedTrip(true)
      console.log('✅ Trip created and state updated:', {
        tripId: newTrip.id,
        parks: newTrip.parks.map(p => p.parkName),
        stateUpdateComplete: true
      })
      setActivePark(parksToUse[0])
      
      const parkNames = tripParks.map(p => p.parkName).join(', ')
      toast.success(`Started trip log for: ${parkNames}`)
      
      setTimeout(() => setJustCreatedTrip(false), 1000)
      
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
  }, [user, selectedParks, visitDate, tripNotes, setCurrentTrip, loadAllSelectedParksAttractions])

  const startMultiDayTrip = useCallback(async (days: DayParkSelection[], startDate: Date, endDate: Date) => {
    if (!user) {
      toast.error('Please sign in to start your trip log.')
      return
    }

    if (!window.spark?.kv) {
      toast.error('Storage system not available. Please refresh the page and try again.')
      return
    }

    setIsLoading(true)
    
    try {
      console.log(`🚀 Starting multi-day trip with ${days.length} days`)
      
      const allParkIds = new Set<string>()
      days.forEach(day => day.parkIds.forEach(parkId => allParkIds.add(parkId)))
      
      const parksToUse = Array.from(allParkIds)
      await loadAllSelectedParksAttractions(parksToUse)

      const tripId = `trip-${user.id}-${Date.now()}`
      
      const tripDaysData: TripDay[] = days.map(day => {
        const parkId = day.parkIds[0]
        const parkInfo = parkFamilies
          .flatMap(family => family.parks.map(park => ({ ...park, familyId: family.id, familyName: family.name })))
          .find(park => park.id === parkId)
        
        return {
          date: day.date,
          parkId,
          parkName: parkInfo?.name || parkId,
          rideLogs: [],
          rideCount: 0
        }
      })

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

      const newTrip: Trip = {
        id: tripId,
        userId: user.id,
        visitDate: format(startDate, 'yyyy-MM-dd'),
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(endDate, 'yyyy-MM-dd'),
        parks: tripParks,
        days: tripDaysData,
        rideLogs: [],
        totalRides: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: tripNotes.trim() || undefined
      }

      await window.spark.kv.set(`current-trip-${user.id}`, newTrip)
      
      setCurrentTrip(newTrip)
      setTripDays(tripDaysData)
      setActiveDay(tripDaysData[0].date)
      setActivePark(tripDaysData[0].parkId)
      setJustCreatedTrip(true)
      
      toast.success(`Started multi-day trip: ${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d, yyyy')}`)
      
      setTimeout(() => setJustCreatedTrip(false), 1000)
      
    } catch (error) {
      console.error('❌ Failed to start multi-day trip:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to start trip: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }, [user, tripNotes, setCurrentTrip, loadAllSelectedParksAttractions])

  const autoSaveTrip = async (updatedRideCounts: Record<string, number>) => {
    if (!user || !currentTrip) {
      console.warn('⚠️ Cannot save trip: missing user or current trip')
      return
    }

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

      Object.entries(updatedRideCounts).forEach(([key, count]) => {
        console.log(`🎢 Processing ride: ${key} = ${count}`)
        if (count > 0) {
          let dateStr: string | undefined
          let parkId: string
          let attractionId: string
          
          const parts = key.split('-')
          if (parts.length >= 3 && parts[0].match(/^\d{4}/)) {
            dateStr = parts.slice(0, 3).join('-')
            parkId = parts[3]
            attractionId = parts.slice(4).join('-')
          } else {
            parkId = parts[0]
            attractionId = parts.slice(1).join('-')
          }
          
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
              notes: notes[key] || undefined,
              visitDate: dateStr
            }
            logsToSave.push(rideLog)
            console.log(`✅ Added ride log for ${attraction.name}: ${count} rides${dateStr ? ` on ${dateStr}` : ''}`)
          } else {
            console.warn(`⚠️ Attraction not found for key: ${key}, trying fallback`)
            const existingLog = currentTrip.rideLogs.find(log => 
              log.parkId === parkId && log.attractionId === attractionId && 
              (!dateStr || log.visitDate === dateStr)
            )
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
                notes: notes[key] || undefined,
                visitDate: dateStr
              }
              logsToSave.push(rideLog)
              console.log(`✅ Added fallback ride log for ${existingLog.attractionName}: ${count} rides`)
            } else {
              console.error(`❌ No fallback data available for ${key}`)
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
                notes: notes[key] || undefined,
                visitDate: dateStr
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

      const updatedParks = currentTrip.parks.map(park => ({
        ...park,
        rideCount: logsToSave.filter(log => log.parkId === park.parkId).reduce((sum, log) => sum + log.rideCount, 0)
      }))

      let updatedDays = currentTrip.days
      if (currentTrip.days && currentTrip.days.length > 0) {
        updatedDays = currentTrip.days.map(day => ({
          ...day,
          rideLogs: logsToSave.filter(log => log.visitDate === day.date),
          rideCount: logsToSave
            .filter(log => log.visitDate === day.date)
            .reduce((sum, log) => sum + log.rideCount, 0)
        }))
      }

      const updatedTrip: Trip = {
        ...currentTrip,
        parks: updatedParks,
        days: updatedDays,
        rideLogs: logsToSave,
        totalRides: logsToSave.reduce((sum, log) => sum + log.rideCount, 0),
        updatedAt: new Date().toISOString(),
        notes: tripNotes.trim() || undefined
      }

      console.log(`💾 Saving trip with ${logsToSave.length} logs, ${updatedTrip.totalRides} total rides`)

      setCurrentTrip(updatedTrip)
      console.log('✅ Updated currentTrip state')
      
      try {
        await window.spark.kv.set(`current-trip-${user.id}`, updatedTrip)
        console.log('✅ Current trip saved to KV')
        
        if (updatedTrip.totalRides > 0) {
          await window.spark.kv.set(`trip-${updatedTrip.id}`, updatedTrip)
          console.log('✅ Trip record saved to KV permanent storage')
          
          const userTrips = await window.spark.kv.get<string[]>(`user-trips-${user.id}`) || []
          
          if (!userTrips.includes(updatedTrip.id)) {
            const updatedUserTrips = [...userTrips, updatedTrip.id]
            await window.spark.kv.set(`user-trips-${user.id}`, updatedUserTrips)
            console.log('✅ User trip history updated')
          }
        }
        
      } catch (kvError) {
        console.error('❌ KV Storage error:', kvError)
        
        if (kvError instanceof Error && kvError.message.includes('quota')) {
          toast.error('Storage quota exceeded. Please delete some old trips and try again.')
        } else if (kvError instanceof Error && kvError.message.includes('network')) {
          toast.error('Network error. Your changes will be saved when connection is restored.')
        } else {
          toast.error('Failed to save trip data. Please try again or refresh the page.')
        }
        
        throw kvError
      }
      
    } catch (error) {
      console.error('❌ Trip save failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      toast.error(`Unable to save trip: ${errorMessage}`)
      
    } finally {
      setTimeout(() => setIsSaving(false), 1000)
    }
  }

  const handleParksChange = useCallback((parks: string[]) => {
    console.log('🏰 handleParksChange called:', { 
      newParks: parks, 
      change: parks.length - selectedParks.length
    })
    console.log('🏰 Selected parks before update:', JSON.stringify(selectedParks))
    console.log('🏰 New parks to set:', JSON.stringify(parks))
    
    setSelectedParks(currentParks => {
      console.log('🔍 Current parks in state update:', currentParks)
      
      // Find parks that were deselected and clear their ride counts
      const deselectedParks = currentParks.filter(parkId => !parks.includes(parkId))
      if (deselectedParks.length > 0) {
        console.log('🗑️ Clearing ride counts for deselected parks:', deselectedParks)
        setRideCounts(prev => {
          const keysToRemove = Object.keys(prev).filter(key => 
            deselectedParks.some(parkId => key.startsWith(`${parkId}-`))
          )
          const updated = { ...prev }
          keysToRemove.forEach(key => delete updated[key])
          return updated
        })
      }
      
      console.log('✅ Parks state updated to:', parks)
      return parks
    })
  }, [])

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
              Sign In to Log Rides
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

  // Debug log to help with troubleshooting
  console.log('🖥️ RideLogPage render:', {
    currentTrip: currentTrip ? `Trip ${currentTrip.id} (${currentTrip.totalRides} rides)` : 'null',
    showContinuationPrompt,
    shouldShowSetup: (!currentTrip && !showContinuationPrompt),
    shouldShowLogging: (currentTrip || showContinuationPrompt),
    selectedParks: selectedParks.length,
    availableParks: ParkDataService.getAvailableParks().length,
    isLoading,
    hasSparkKV: !!window.spark?.kv
  })

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

      {/* Show continuation prompt */}
      {showContinuationPrompt && currentTrip && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="font-semibold text-foreground mb-2">Continue Previous Trip?</h3>
                <p className="text-sm text-muted-foreground">
                  You have an existing trip from {new Date(currentTrip.visitDate).toLocaleDateString()} with {currentTrip.totalRides} rides logged 
                  across {currentTrip.parks.map(p => p.parkName).join(', ')}.
                </p>
              </div>
              
              <div className="flex gap-3">
                <Button
                  onClick={() => {
                    setShowContinuationPrompt(false)
                    setIsEditing(true)
                    // Restore the trip state
                    const tripParkIds = currentTrip.parks.map(p => p.parkId)
                    setSelectedParks(tripParkIds)
                    setActivePark(tripParkIds[0] || '')
                    
                    // Restore ride counts, variants, and notes from the trip
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
                    
                    toast.success('Continuing existing trip')
                  }}
                  className="flex-1"
                >
                  Continue Trip
                </Button>
                
                <Button
                  variant="outline"
                  onClick={async () => {
                    setShowContinuationPrompt(false)
                    
                    // Clear the current trip to start fresh
                    try {
                      if (window.spark?.kv && user) {
                        await window.spark.kv.delete(`current-trip-${user.id}`)
                        console.log('✅ Cleared current trip from storage')
                      }
                    } catch (error) {
                      console.warn('⚠️ Could not clear current trip from storage:', error)
                    }
                    
                    // Clear ALL local state for a completely fresh start
                    setCurrentTrip(null)
                    setRideCounts({})
                    setSelectedVariants({})
                    setNotes({})
                    setTripNotes('')
                    setSelectedParks([]) // Explicitly clear selected parks
                    setActivePark('')
                    setAttractions({})
                    setIsEditing(false)
                    
                    toast.success('Ready to start a new trip!')
                  }}
                  className="flex-1"
                >
                  Start New Trip
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}



        {(!currentTrip && !showContinuationPrompt) ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar size={20} />
              Plan Your Trip
            </CardTitle>
            <CardDescription>
              Choose between a single-day visit or a multi-day trip across different parks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="multi-day" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single-day">Single Day</TabsTrigger>
                <TabsTrigger value="multi-day">Multi-Day Trip</TabsTrigger>
              </TabsList>
              
              <TabsContent value="single-day" className="space-y-6 mt-6">
                <div>
                  <Label htmlFor="visit-date">Visit Date</Label>
                  <div className="mt-1">
                    <DatePicker
                      date={visitDate}
                      onDateChange={(date) => {
                        if (date) {
                          setVisitDate(date)
                        }
                      }}
                      placeholder="Select your visit date"
                      disableFutureDates={true}
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Select today's date or any past date for your trip
                    </p>
                  </div>
                </div>

                <div>
                  <Label>Select Parks to Visit</Label>
                  <div className="mt-2">
                    <ParkFamilyTripSelector 
                      selectedParks={selectedParks}
                      onParksChange={handleParksChange}
                      initialParkId={parkId}
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
              </TabsContent>
              
              <TabsContent value="multi-day" className="mt-6">
                <MultiDayTripPicker
                  onTripSelected={startMultiDayTrip}
                  initialParkId={parkId}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Ticket size={20} />
                  Trip - {currentTrip ? new Date(currentTrip.visitDate).toLocaleDateString() : 'Unknown Date'}
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
                  
                  {/* Start New Trip Button */}
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={async () => {
                      console.log('🔄 Starting new trip (clearing current session)...')
                      
                      try {
                        // Clear current trip from KV storage
                        if (window.spark?.kv && user) {
                          await window.spark.kv.delete(`current-trip-${user.id}`)
                          console.log('✅ Cleared current trip from storage')
                        }
                      } catch (error) {
                        console.warn('⚠️ Could not clear current trip from storage:', error)
                      }
                      
                      // Clear ALL local state for a completely fresh start
                      setCurrentTrip(null)
                      setRideCounts({})
                      setSelectedVariants({})
                      setNotes({})
                      setTripNotes('')
                      setSelectedParks([]) // Explicitly clear parks
                      setActivePark('')
                      setAttractions({})
                      setIsEditing(false)
                      toast.success('Ready to start a new trip!')
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Start New Trip
                  </Button>
                  
                  {(
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={isSaving}
                      onClick={async () => {
                        if (!user || !currentTrip || isSaving) {
                          if (!user || !currentTrip) {
                            toast.error('No active trip to complete')
                          }
                          return
                        }

                        setIsSaving(true)
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
                          
                          // Build the trip data from current state and combine with existing logs
                          console.log('🔨 Building final trip from current state and existing logs...')
                          
                          // Start with existing logs from the trip (for editing scenarios)
                          const finalLogsToSave: RideLog[] = [...(currentTrip.rideLogs || [])]
                          const existingLogKeys = new Set(
                            finalLogsToSave.map(log => `${log.parkId}-${log.attractionId}`)
                          )

                          // Process current ride counts - either update existing logs or create new ones
                          Object.entries(rideCounts).forEach(([key, count]) => {
                            if (count > 0) {
                              // Find the correct parkId by checking which selected park the key starts with
                              const parkId = selectedParks.find(p => key.startsWith(`${p}-`))
                              if (!parkId) {
                                console.warn(`⚠️ Could not determine parkId for key: ${key}`)
                                return
                              }
                              
                              // Extract attractionId by removing the parkId prefix and the connecting dash
                              const attractionId = key.substring(parkId.length + 1)
                              
                              console.log(`🔍 Processing ride log for key: ${key}, parkId: ${parkId}, attractionId: ${attractionId}, count: ${count}`)
                              
                              // Check if we already have a log for this attraction
                              const existingLogIndex = finalLogsToSave.findIndex(
                                log => log.parkId === parkId && log.attractionId === attractionId
                              )
                              
                              if (existingLogIndex >= 0) {
                                // Update existing log
                                console.log(`🔄 Updating existing log for ${finalLogsToSave[existingLogIndex].attractionName}`)
                                finalLogsToSave[existingLogIndex] = {
                                  ...finalLogsToSave[existingLogIndex],
                                  rideCount: count,
                                  trackVariant: selectedVariants[key] || finalLogsToSave[existingLogIndex].trackVariant,
                                  notes: notes[key] || finalLogsToSave[existingLogIndex].notes,
                                  loggedAt: new Date().toISOString()
                                }
                              } else {
                                // Create new log
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
                                  console.log(`✅ Created new ride log for ${attraction.name}`)
                                } else {
                                  console.warn(`⚠️ Could not find attraction with ID ${attractionId} in park ${parkId}`)
                                  // Try to create log with basic info
                                  const rideLog: RideLog = {
                                    id: `log-${user.id}-${attractionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                    userId: user.id,
                                    tripId: currentTrip.id,
                                    parkId,
                                    attractionId,
                                    attractionName: attractionId.split('-').map(word => 
                                      word.charAt(0).toUpperCase() + word.slice(1)
                                    ).join(' '),
                                    attractionType: 'experience' as any,
                                    rideCount: count,
                                    trackVariant: selectedVariants[key] || undefined,
                                    loggedAt: new Date().toISOString(),
                                    notes: notes[key] || undefined
                                  }
                                  finalLogsToSave.push(rideLog)
                                  console.log(`⚠️ Created fallback ride log for ${rideLog.attractionName}`)
                                }
                              }
                            }
                          })
                          
                          // Remove logs with 0 rides (if user set them to 0)
                          const nonZeroLogs = finalLogsToSave.filter(log => {
                            const key = `${log.parkId}-${log.attractionId}`
                            const currentCount = rideCounts[key]
                            return currentCount === undefined || currentCount > 0
                          })
                          
                          console.log(`📋 Final logs to save: ${nonZeroLogs.length}`)
                          console.log('🎢 Final ride logs:', nonZeroLogs.map(log => ({ name: log.attractionName, count: log.rideCount })))
                          
                          if (nonZeroLogs.length === 0) {
                            console.error('❌ Trip completion failed: No valid ride logs could be created')
                            toast.error('Unable to complete trip - no rides were logged. Please add some rides first.')
                            return
                          }
                          
                          // Recalculate park summaries based on final logs
                          const parkSummaryMap = new Map<string, { parkName: string, rideCount: number }>()
                          
                          for (const log of nonZeroLogs) {
                            const parkInfo = currentTrip.parks.find(p => p.parkId === log.parkId)
                            const parkName = parkInfo?.parkName || log.parkId.split('-').map(word => 
                              word.charAt(0).toUpperCase() + word.slice(1)
                            ).join(' ')
                            
                            const existing = parkSummaryMap.get(log.parkId) || { parkName, rideCount: 0 }
                            existing.rideCount += log.rideCount
                            parkSummaryMap.set(log.parkId, existing)
                          }
                          
                          const finalUpdatedParks = Array.from(parkSummaryMap.entries()).map(([parkId, info]) => ({
                            parkId,
                            parkName: info.parkName,
                            rideCount: info.rideCount
                          }))

                          // Create the final trip object
                          const finalTripData: Trip = {
                            id: currentTrip.id,
                            userId: user.id,
                            visitDate: currentTrip.visitDate,
                            parks: finalUpdatedParks,
                            rideLogs: nonZeroLogs,
                            totalRides: nonZeroLogs.reduce((sum, log) => sum + log.rideCount, 0),
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
                        } finally {
                          setIsSaving(false)
                        }
                      }}
                    >
                      {isSaving ? 'Saving Trip...' : 'End Trip Session'}
                    </Button>
                  )}
                </div>
              </CardTitle>
              <CardDescription>
                Parks: {currentTrip?.parks.map(p => p.parkName).join(', ') || 'Unknown'} • Rides auto-save as you log them
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div>
                <Label>Trip Notes (auto-saved)</Label>
                <Textarea
                  value={tripNotes}
                  onChange={(e) => setTripNotes(e.target.value)}
                  onBlur={() => {
                    // Auto-save when trip notes field loses focus
                    if (currentTrip && user && window.spark?.kv) {
                      setTimeout(() => {
                        setRideCounts(currentCounts => {
                          autoSaveTrip(currentCounts)
                          return currentCounts
                        })
                      }, 100)
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
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <MapPin size={20} />
                  {currentTrip?.days && currentTrip.days.length > 0 
                    ? 'Select Day & Park' 
                    : 'Select Park to Log Rides'}
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {currentTrip?.days && currentTrip.days.length > 0
                    ? `${currentTrip.days.length} day${currentTrip.days.length !== 1 ? 's' : ''} in trip`
                    : `${currentTrip?.parks.length || 0} park${(currentTrip?.parks.length || 0) !== 1 ? 's' : ''} in trip`}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentTrip?.days && currentTrip.days.length > 0 ? (
                <>
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Trip Days</Label>
                    <div className="flex flex-wrap gap-2">
                      {currentTrip.days.map(day => {
                        const date = new Date(day.date)
                        const isActive = activeDay === day.date
                        const dayRideCount = Object.entries(rideCounts)
                          .filter(([key]) => key.startsWith(`${day.date}-`))
                          .reduce((sum, [, count]) => sum + count, 0)
                        
                        return (
                          <Button
                            key={day.date}
                            variant={isActive ? "default" : "outline"}
                            onClick={() => {
                              setActiveDay(day.date)
                              setActivePark(day.parkId)
                              
                              if (!attractions[day.parkId] || attractions[day.parkId].length === 0) {
                                loadAttractionsForPark(day.parkId)
                              }
                            }}
                            className="flex flex-col items-start gap-1 h-auto py-2 px-3"
                          >
                            <div className="font-semibold">{format(date, 'MMM d')}</div>
                            <div className="text-xs opacity-80">{day.parkName}</div>
                            {dayRideCount > 0 && (
                              <Badge variant="secondary" className="text-xs mt-1">
                                {dayRideCount} rides
                              </Badge>
                            )}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {currentTrip?.parks.map(park => (
                    <Button
                      key={park.parkId}
                      variant={activePark === park.parkId ? "default" : "outline"}
                      onClick={async () => {
                        console.log(`🎯 Switching to park: ${park.parkId}`)
                        setActivePark(park.parkId)
                        
                        if (!attractions[park.parkId] || attractions[park.parkId].length === 0) {
                          console.log(`🔄 Loading attractions for ${park.parkId} (not cached)`)
                          try {
                            await loadAttractionsForPark(park.parkId)
                            toast.success(`Loaded attractions for ${park.parkName}`)
                          } catch (error) {
                            console.error(`❌ Failed to load attractions for ${park.parkId}:`, error)
                            toast.error(`Failed to load attractions for ${park.parkName}. Click again to retry.`)
                          }
                        } else {
                          console.log(`✅ Attractions already loaded for ${park.parkId} (${attractions[park.parkId].length} attractions)`)
                        }
                      }}
                      className="flex items-center gap-2"
                    >
                      {park.parkName}
                      {Object.entries(rideCounts)
                        .filter(([key]) => {
                          const parts = key.split('-')
                          const keyParkId = parts.length === 3 ? parts[1] : parts[0]
                          return keyParkId === park.parkId
                        })
                        .reduce((sum, [, count]) => sum + count, 0) > 0 && (
                        <Badge variant="secondary" className="ml-1">
                          {Object.entries(rideCounts)
                            .filter(([key]) => {
                              const parts = key.split('-')
                              const keyParkId = parts.length === 3 ? parts[1] : parts[0]
                              return keyParkId === park.parkId
                            })
                            .reduce((sum, [, count]) => sum + count, 0)}
                        </Badge>
                      )}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attractions for Active Park */}
          {activePark && (
            <>
              {attractions[activePark] && attractions[activePark].length > 0 ? (
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
                  activeDay={activeDay}
                />
              ) : (
                <Card>
                  <CardContent className="py-8">
                    <div className="text-center space-y-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                      <div>
                        <p className="text-muted-foreground">Loading attractions for {currentTrip?.parks.find(p => p.parkId === activePark)?.parkName}...</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          If this takes too long, try clicking the park button again or refreshing the page.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
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
  onVariantChange: (attractionId: string, variant: string) => void
  onNotesChange: (attractionId: string, notes: string) => void
  onNotesBlur: (attractionId: string) => void
  user: User | null
  activeDay?: string
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
  user,
  activeDay
}: AttractionsForParkProps) {
  const attractionOnlyFilter = canLogInTrip

  const activeAttractions = attractions.filter(a => !isRetiredAttraction(a) && attractionOnlyFilter(a))
  const defunctAttractions = attractions.filter(a => isRetiredAttraction(a) && attractionOnlyFilter(a)).sort((a, b) => a.name.localeCompare(b.name))
  const seasonalAttractions = activeAttractions.filter(a => a.isSeasonal).sort((a, b) => a.name.localeCompare(b.name))
  const regularAttractions = activeAttractions.filter(a => !a.isSeasonal).sort((a, b) => a.name.localeCompare(b.name))

  const getKey = (attractionId: string) => activeDay ? `${activeDay}-${parkId}-${attractionId}` : `${parkId}-${attractionId}`

  return (
    <Tabs defaultValue="regular" className="space-y-4">
      <TabsList>
        <TabsTrigger value="regular">Active</TabsTrigger>
        {seasonalAttractions.length > 0 && (
          <TabsTrigger value="seasonal">Limited/Seasonal</TabsTrigger>
        )}
        {defunctAttractions.length > 0 && (
          <TabsTrigger value="defunct">Retired</TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="regular" className="space-y-4">
        {regularAttractions.map(attraction => {
          const key = getKey(attraction.id)
          return (
            <RideLogCard
              key={key}
              parkId={parkId}
              attraction={attraction}
              count={rideCounts[key] || 0}
              selectedVariant={selectedVariants[key]}
              notes={notes[key] || ''}
              onCountChange={(change) => onUpdateRideCount(parkId, attraction.id, change)}
              onVariantChange={(variant) => onVariantChange(key, variant)}
              onNotesChange={(note) => onNotesChange(key, note)}
              onNotesBlur={() => onNotesBlur(key)}
              user={user}
            />
          )
        })}
      </TabsContent>

      {seasonalAttractions.length > 0 && (
        <TabsContent value="seasonal" className="space-y-4">
          <div className="text-sm text-muted-foreground mb-4">
            These attractions operate seasonally or for limited periods
          </div>
          {seasonalAttractions.map(attraction => {
            const key = getKey(attraction.id)
            return (
              <RideLogCard
                key={key}
                parkId={parkId}
                attraction={attraction}
                count={rideCounts[key] || 0}
                selectedVariant={selectedVariants[key]}
                notes={notes[key] || ''}
                onCountChange={(change) => onUpdateRideCount(parkId, attraction.id, change)}
                onVariantChange={(variant) => onVariantChange(key, variant)}
                onNotesChange={(note) => onNotesChange(key, note)}
                onNotesBlur={() => onNotesBlur(key)}
                user={user}
              />
            )
          })}
        </TabsContent>
      )}
      
      {defunctAttractions.length > 0 && (
        <TabsContent value="defunct" className="space-y-4">
          <div className="text-sm text-muted-foreground mb-4">
            These attractions are no longer operating but can still be logged for historical visits
          </div>
          {defunctAttractions.map(attraction => {
            const key = getKey(attraction.id)
            return (
              <RideLogCard
                key={key}
                parkId={parkId}
                attraction={attraction}
                count={rideCounts[key] || 0}
                selectedVariant={selectedVariants[key]}
                notes={notes[key] || ''}
                onCountChange={(change) => onUpdateRideCount(parkId, attraction.id, change)}
                onVariantChange={(variant) => onVariantChange(key, variant)}
                onNotesChange={(note) => onNotesChange(key, note)}
                onNotesBlur={() => onNotesBlur(key)}
                isDefunct
                user={user}
              />
            )
          })}
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
      case 'experience': return <MapPin size={16} />
      case 'parade': return <Ticket size={16} />
      case 'character-meet': return <Users size={16} />
      case 'dining-experience': return <Clock size={16} />
      default: return <Ticket size={16} />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'thrill': return 'bg-destructive text-destructive-foreground'
      case 'family': return 'bg-success text-success-foreground'
      case 'show': return 'bg-accent text-accent-foreground'
      case 'experience': return 'bg-secondary text-secondary-foreground'
      case 'parade': return 'bg-primary text-primary-foreground'
      case 'character-meet': return 'bg-success text-success-foreground'
      case 'dining-experience': return 'bg-muted text-muted-foreground'
      default: return 'bg-secondary text-secondary-foreground'
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'character-meet': return 'Character Meet'
      case 'dining-experience': return 'Dining'
      default: return type.charAt(0).toUpperCase() + type.slice(1)
    }
  }

  return (
    <Card className={`transition-all ${count > 0 ? 'ring-2 ring-primary' : ''} ${isDefunct ? 'opacity-75' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Badge className={getTypeColor(attraction.type)} variant="secondary">
              {getTypeIcon(attraction.type)}
              <span className="ml-1">{getTypeLabel(attraction.type)}</span>
            </Badge>
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                {attraction.name}
                {attraction.availability === 'limited' && (
                  <Badge variant="outline" className="text-xs text-amber-600">
                    Limited/Seasonal
                  </Badge>
                )}
                {attraction.availability === 'retired' && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Retired
                  </Badge>
                )}
                {attraction.isSeasonal && attraction.availability === 'active' && (
                  <Badge variant="outline" className="text-xs">
                    {attraction.seasonalPeriod || 'Seasonal'}
                  </Badge>
                )}
                {isDefunct && !attraction.availability && (
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
                {count === 1 ? 'time' : 'times'}
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
  initialParkId?: string
}

function ParkFamilyTripSelector({ selectedParks, onParksChange, initialParkId }: ParkFamilyTripSelectorProps) {
  const [availableParks, setAvailableParks] = useState<string[]>([])
  const [isLoadingAvailableParks, setIsLoadingAvailableParks] = useState(true)
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null)

  // Load available parks data synchronously
  useEffect(() => {
    try {
      const parks = ParkDataService.getAvailableParks()
      console.log('📋 Available parks with data (ParkFamilyTripSelector):', parks)
      setAvailableParks(parks)
      setIsLoadingAvailableParks(false)
      
      // Auto-select family if we have a pre-selected park
      if (initialParkId && selectedParks.includes(initialParkId)) {
        const family = parkFamilies.find(f => f.parks.some(p => p.id === initialParkId))
        if (family) {
          setSelectedFamily(family.id)
        }
      }
    } catch (error) {
      console.error('❌ Failed to load available parks:', error)
      setAvailableParks([])
      setIsLoadingAvailableParks(false)
    }
  }, [selectedParks, initialParkId])

  const handleParkToggle = useCallback((parkId: string) => {
    console.log('🔄 Toggling park:', parkId, 'Currently selected:', selectedParks.includes(parkId))
    
    if (selectedParks.includes(parkId)) {
      // Remove park
      const newSelection = selectedParks.filter(id => id !== parkId)
      console.log('❌ Removing park, new selection:', newSelection)
      onParksChange(newSelection)
    } else {
      // Add park
      const newSelection = [...selectedParks, parkId]
      console.log('✅ Adding park, new selection:', newSelection)
      onParksChange(newSelection)
    }
  }, [selectedParks, onParksChange])

  if (isLoadingAvailableParks) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
          <Label className="text-sm text-muted-foreground">
            Loading available parks...
          </Label>
        </div>
      </div>
    )
  }

  // Filter families that have at least one park with data
  const familiesWithData = parkFamilies.filter(family => 
    family.parks.some(park => availableParks.includes(park.id))
  )

  const selectedFamilyData = selectedFamily ? familiesWithData.find(f => f.id === selectedFamily) : null

  return (
    <div className="space-y-4">
      {/* Helpful tip */}
      <div className="bg-muted/50 border border-muted rounded-lg p-3">
        <p className="text-sm text-muted-foreground">
          <strong>Tip:</strong> Select one or more parks you'll visit on this trip. You can track rides across multiple parks in the same trip log!
        </p>
      </div>

      {/* Step 1: Choose Resort Group */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Step 1: Choose Resort Group</Label>
        <Select
          value={selectedFamily || 'none'}
          onValueChange={(value) => setSelectedFamily(value === 'none' ? null : value)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a resort group first" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              Select a resort group...
            </SelectItem>
            {familiesWithData
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((family) => {
                const familyParksWithData = family.parks.filter(park => availableParks.includes(park.id))
                return (
                  <SelectItem key={family.id} value={family.id}>
                    {family.name} ({familyParksWithData.length} parks)
                  </SelectItem>
                )
              })}
          </SelectContent>
        </Select>
      </div>

      {/* Step 2: Select Parks */}
      {selectedFamilyData && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">Step 2: Select Parks to Visit</Label>
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{selectedFamilyData.name}</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {selectedFamilyData.location}
                  </Badge>
                  {selectedParks.filter(parkId => 
                    selectedFamilyData.parks.some(p => p.id === parkId)
                  ).length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedParks.filter(parkId => 
                        selectedFamilyData.parks.some(p => p.id === parkId)
                      ).length} selected
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Parks List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {selectedFamilyData.parks
                .filter(park => availableParks.includes(park.id))
                .map(park => {
                  const isSelected = selectedParks.includes(park.id)
                  
                  return (
                    <div 
                      key={park.id} 
                      className={`flex items-center space-x-3 p-3 rounded-md border transition-colors ${
                        isSelected 
                          ? 'bg-primary/10 border-primary/30' 
                          : 'bg-card hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        id={`park-${park.id}`}
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          console.log('🔄 Checkbox change for park:', park.id, 'checked:', checked)
                          if (checked) {
                            const newSelection = [...selectedParks, park.id]
                            console.log('✅ Adding park via checkbox, new selection:', newSelection)
                            onParksChange(newSelection)
                          } else {
                            const newSelection = selectedParks.filter(id => id !== park.id)
                            console.log('❌ Removing park via checkbox, new selection:', newSelection)
                            onParksChange(newSelection)
                          }
                        }}
                      />
                      <div className="flex-1">
                        <Label 
                          htmlFor={`park-${park.id}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {park.name}
                        </Label>
                        {park.shortName && park.shortName !== park.name && (
                          <p className="text-xs text-muted-foreground">{park.shortName}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}
      
      {/* Selected Parks Summary */}
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
          <div className="flex flex-wrap gap-1 mt-2">
            {selectedParks.map(parkId => {
              const park = parkFamilies
                .flatMap(family => family.parks)
                .find(p => p.id === parkId)
              return park ? (
                <Badge key={parkId} variant="secondary" className="text-xs">
                  {park.shortName || park.name}
                </Badge>
              ) : null
            })}
          </div>
        </div>
      )}
    </div>
  )
}