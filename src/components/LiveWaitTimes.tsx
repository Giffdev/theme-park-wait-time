import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, TrendUp, Plus, Users, CheckCircle, Warning } from '@phosphor-icons/react'
import { formatTime12Hour, formatDateTime12Hour } from '@/utils/timeFormat'
import { QuickWaitTimeModal } from '@/components/QuickWaitTimeModal'
import { WaitTimeChart } from '@/components/WaitTimeChart'
import { DebugDataViewer } from '@/components/DebugDataViewer'
import { useReporting } from '@/hooks/useReporting'
import { parkFamilies } from '@/data/sampleData'
import { ParkDataService } from '@/services/parkDataService'
import { toast } from 'sonner'
import { isAttractionNotDining } from '@/lib/utils'
import type { User } from '@/App'
import type { ExtendedAttraction } from '@/types'

interface LiveWaitTimesProps {
  parkId: string
  user: User | null
  onLoginRequired: () => void
  targetRide?: string | null
  onRideViewed?: () => void
}

export function LiveWaitTimes({ parkId, user, onLoginRequired, targetRide, onRideViewed }: LiveWaitTimesProps) {
  const navigate = useNavigate()
  const [showReportModal, setShowReportModal] = useState(false)
  const [selectedAttraction, setSelectedAttraction] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attractions, setAttractions] = useState<ExtendedAttraction[]>([])
  
  const { getConsensusWaitTime, getRecentReports } = useReporting()

  // Helper function to load attractions for the current park
  const loadAttractionsForPark = async () => {
    setIsLoading(true)
    setError(null)
    console.log(`🔄 LiveWaitTimes loading attractions for park: ${parkId}`)
    
    try {
      // Use the ParkDataService for reliable loading
      const parkData = await ParkDataService.loadAttractions(parkId)
      
      if (parkData && Array.isArray(parkData) && parkData.length > 0) {
        // Filter out dining establishments - only show actual attractions
        const validAttractions = parkData.filter(attraction => 
          attraction && 
          typeof attraction === 'object' && 
          attraction.name && 
          typeof attraction.currentWaitTime === 'number' &&
          isAttractionNotDining(attraction)
        )
        
        setAttractions(validAttractions)
        console.log(`✅ LiveWaitTimes successfully loaded ${validAttractions.length} valid attractions for ${parkId}`)
      } else {
        console.warn(`⚠️ LiveWaitTimes no data returned from ParkDataService for ${parkId}`)
        
        // Check available parks for error message
        const availableParks = ParkDataService.getAvailableParks()
        if (availableParks.length > 0) {
          if (ParkDataService.hasPark(parkId)) {
            setError(`Unable to load attractions for "${parkId}". Please try refreshing the page.`)
          } else {
            setError(`Park "${parkId}" not found. Available parks: ${availableParks.join(', ')}`)
          }
        } else {
          setError(`No park data available. Please refresh the page to reload data.`)
        }
        
        setAttractions([])
      }
    } catch (error) {
      console.error(`❌ LiveWaitTimes error loading attractions for ${parkId}:`, error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(`Error loading park data: ${errorMessage}. Please try refreshing the page.`)
      setAttractions([])
    } finally {
      setIsLoading(false)
    }
  }

  // Helper function to get park display name
  const getParkDisplayName = (parkId: string): string => {
    for (const family of parkFamilies) {
      const park = family.parks.find(p => p.id === parkId)
      if (park) return park.name
    }
    return parkId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const handleTimerLog = useCallback(async (minutes: number) => {
    // Timer logging functionality has been removed to simplify the app
    toast.info('Timer logging has been disabled. Use wait time reporting instead.')
  }, [])

  // Force reload attractions when park changes
  useEffect(() => {
    loadAttractionsForPark()
  }, [parkId])

  // Update wait times based on consensus every 30 seconds
  useEffect(() => {
    const updateWaitTimes = () => {
      try {
        console.log('🔄 LiveWaitTimes updating consensus wait times')
        
        setAttractions(currentAttractions => {
          if (!currentAttractions || currentAttractions.length === 0) {
            console.log('⚠️ LiveWaitTimes no current attractions to update')
            return currentAttractions
          }
          
          return currentAttractions.map(attraction => {
            try {
              const consensusTime = getConsensusWaitTime(attraction.id)
              if (consensusTime !== null && consensusTime !== attraction.currentWaitTime) {
                console.log(`🔄 LiveWaitTimes updating ${attraction.name}: ${attraction.currentWaitTime} -> ${consensusTime}`)
                return {
                  ...attraction,
                  currentWaitTime: consensusTime,
                  lastUpdated: new Date().toISOString()
                }
              }
              return attraction
            } catch (err) {
              console.error(`❌ LiveWaitTimes error getting consensus for ${attraction.name}:`, err)
              return attraction
            }
          })
        })
        
        setLastUpdate(new Date())
        console.log('✅ LiveWaitTimes consensus update complete')
      } catch (error) {
        console.error('❌ LiveWaitTimes error in updateWaitTimes:', error)
      }
    }

    // Update immediately, then every 30 seconds
    updateWaitTimes()
    const interval = setInterval(updateWaitTimes, 30000)
    return () => clearInterval(interval)
  }, [getConsensusWaitTime])  // Removed attractions from dependencies and early return

  // Handle scrolling to target ride
  useEffect(() => {
    if (targetRide && attractions.length > 0 && !isLoading) {
      const timer = setTimeout(() => {
        const targetElement = document.getElementById(`ride-${targetRide}`)
        if (targetElement) {
          targetElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          })
          // Add a highlight effect
          targetElement.classList.add('ring-2', 'ring-primary', 'ring-opacity-50')
          setTimeout(() => {
            targetElement.classList.remove('ring-2', 'ring-primary', 'ring-opacity-50')
          }, 2000)
          
          // Notify that the ride has been viewed
          onRideViewed?.()
        }
      }, 100) // Small delay to ensure rendering is complete
      
      return () => clearTimeout(timer)
    }
  }, [targetRide, attractions, isLoading, onRideViewed])

  const getWaitTimeVariant = (waitTime: number): "success" | "accent" | "destructive" => {
    if (waitTime === -1) return 'destructive' // Closed rides
    if (waitTime <= 20) return 'success'
    if (waitTime <= 45) return 'accent'
    return 'destructive'
  }

  const getReportCount = (attractionId: string) => {
    const reports = getRecentReports(attractionId, 20)
    const recentReports = reports.filter(report => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
      return new Date(report.reportedAt) > thirtyMinutesAgo
    })
    return recentReports.length
  }

  const getVerificationStatus = (attractionId: string) => {
    const reports = getRecentReports(attractionId, 10)
    const recentReports = reports.filter(report => {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
      return new Date(report.reportedAt) > thirtyMinutesAgo
    })
    
    if (recentReports.length === 0) return 'no-data'
    
    const verifiedCount = recentReports.filter(r => r.status === 'verified').length
    const totalCount = recentReports.length
    
    if (verifiedCount / totalCount >= 0.7) return 'verified'
    if (verifiedCount / totalCount <= 0.3) return 'disputed'
    return 'pending'
  }

  const handleReportClick = (attractionId: string) => {
    if (!user) {
      onLoginRequired()
      return
    }
    setSelectedAttraction(attractionId)
    setShowReportModal(true)
  }

  const handleTimerClick = (attraction: ExtendedAttraction) => {
    // Timer functionality has been removed to simplify the app
    toast.info('Timer functionality has been disabled. Use wait time reporting instead.')
  }

  const handleTrendsClick = (attractionId: string) => {
    navigate(`/park/${parkId}/attraction/${attractionId}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground">Live Wait Times</h2>
        <div className="text-sm text-muted-foreground">
          Updated: {formatTime12Hour(lastUpdate.getHours(), lastUpdate.getMinutes())}
        </div>
      </div>

      {/* Loading state or error */}
      {isLoading ? (
        <>
          <p className="text-sm text-muted-foreground">Loading attractions for {parkId}...</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="pb-3">
                  <div className="h-6 bg-muted rounded w-3/4"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-24 bg-muted rounded mb-4"></div>
                  <div className="h-8 bg-muted rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : error ? (
        <div className="text-center py-8 space-y-4">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <Warning size={32} className="text-destructive" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-destructive mb-2">
              Error Loading Data
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              {error}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex gap-2 justify-center">
              <Button 
                onClick={() => {
                  // Retry loading data
                  setError(null)
                  loadAttractionsForPark()
                }}
                variant="default"
                className="mx-1"
              >
                Try Again
              </Button>
              <Button 
                onClick={() => window.location.reload()}
                variant="outline"
                className="mx-1"
              >
                Reload Page
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              If this error persists, try selecting a different park or clearing your browser cache.
            </div>
          </div>
        </div>
      ) : !attractions || attractions.length === 0 ? (
        <div className="text-center py-8">
          <h3 className="text-lg font-medium text-muted-foreground mb-2">
            No attractions found for this park
          </h3>
          <p className="text-sm text-muted-foreground mb-2">
            Data might still be loading. Try selecting a different park or refreshing the page.
          </p>
          <p className="text-xs text-muted-foreground">
            Park ID: {parkId} | Attractions: {attractions?.length || 0}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {attractions.map((attraction) => {
            const reportCount = getReportCount(attraction.id)
            const verificationStatus = getVerificationStatus(attraction.id)
            
            return (
              <Card 
                key={attraction.id} 
                id={`ride-${attraction.id}`}
                className="hover:shadow-lg transition-all duration-300"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg font-medium leading-tight">
                      {attraction.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {attraction.type}
                      </Badge>
                      {verificationStatus === 'verified' && (
                        <CheckCircle size={16} className="text-success" />
                      )}
                      {verificationStatus === 'disputed' && (
                        <Warning size={16} className="text-destructive" />
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Clock size={16} className="text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Current Wait</span>
                    </div>
                    <Badge variant={getWaitTimeVariant(attraction.currentWaitTime)}>
                      {attraction.currentWaitTime === -1 ? 'Ride is closed' : `${attraction.currentWaitTime} min`}
                    </Badge>
                  </div>
                  
                  {/* Historical Chart */}
                  <WaitTimeChart attractionId={attraction.id} />
                  
                  {reportCount > 0 && (
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                      <Users size={14} />
                      <span>{reportCount} recent report{reportCount !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center space-x-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReportClick(attraction.id)}
                      className="flex-1"
                    >
                      <Plus size={14} className="mr-1" />
                      Report wait time
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleTrendsClick(attraction.id)}
                      className="flex items-center space-x-1 px-2"
                    >
                      <TrendUp size={14} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {showReportModal && selectedAttraction && user && (
        <QuickWaitTimeModal
          attractionId={selectedAttraction}
          attractionName={attractions?.find(a => a.id === selectedAttraction)?.name || ''}
          parkId={parkId}
          parkName={getParkDisplayName(parkId)}
          user={user}
          onClose={() => {
            setShowReportModal(false)
            setSelectedAttraction(null)
          }}
          onLoginRequired={onLoginRequired}
        />
      )}
      
      {/* Debug component - remove in production */}
      <DebugDataViewer parkId={parkId} />
    </div>
  )
}