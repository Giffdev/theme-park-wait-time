import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, TrendUp, Plus, Users, CheckCircle, Warning } from '@phosphor-icons/react'
import { formatTime12Hour, formatDateTime12Hour } from '@/utils/timeFormat'
import { ReportWaitTimeModal } from '@/components/ReportWaitTimeModal'
import { WaitTimeChart } from '@/components/WaitTimeChart'
import { useReporting } from '@/hooks/useReporting'
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

  // Force reload attractions when park changes
  useEffect(() => {
    const loadAttractionsForPark = async () => {
      setIsLoading(true)
      setError(null)
      console.log(`🔄 Loading attractions for park: ${parkId}`)
      
      try {
        // Ensure spark KV is available
        if (!window.spark?.kv) {
          throw new Error('Spark KV not available')
        }
        
        // First try to get data directly
        let parkData = await window.spark.kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
        console.log(`📊 Initial check for ${parkId}:`, parkData?.length || 0, 'attractions')
        
        // If no data found, initialize sample data and try again with retries
        if (!parkData || !Array.isArray(parkData) || parkData.length === 0) {
          console.warn(`❌ No data found for ${parkId}, initializing sample data...`)
          
          const { initializeSampleData } = await import('@/data/sampleData')
          const success = await initializeSampleData()
          
          if (success) {
            // Wait a moment for data to be properly saved
            await new Promise(resolve => setTimeout(resolve, 200))
            
            // Try to get data again with retry logic
            let retries = 3
            while (retries > 0 && (!parkData || !Array.isArray(parkData) || parkData.length === 0)) {
              parkData = await window.spark.kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
              console.log(`🔄 Retry ${4 - retries} for ${parkId}:`, parkData?.length || 0, 'attractions')
              
              if (!parkData || !Array.isArray(parkData) || parkData.length === 0) {
                await new Promise(resolve => setTimeout(resolve, 100))
                retries--
              } else {
                break
              }
            }
          }
        }
        
        if (parkData && Array.isArray(parkData) && parkData.length > 0) {
          setAttractions(parkData)
          console.log(`✅ Successfully loaded ${parkData.length} attractions for ${parkId}`)
        } else {
          console.error(`❌ Still no data found for ${parkId} even after initialization and retries`)
          setError(`Failed to load attraction data for this park. The data might be corrupted or the park ID "${parkId}" might not exist.`)
          setAttractions([])
        }
      } catch (error) {
        console.error(`❌ Error loading attractions for ${parkId}:`, error)
        setError(`Error loading park data: ${error instanceof Error ? error.message : 'Unknown error'}`)
        setAttractions([])
      } finally {
        setIsLoading(false)
      }
    }

    loadAttractionsForPark()
  }, [parkId])

  // Update wait times based on consensus every 30 seconds
  useEffect(() => {
    if (!attractions || attractions.length === 0) return

    const updateWaitTimes = () => {
      setAttractions(currentAttractions => {
        if (!currentAttractions || currentAttractions.length === 0) return currentAttractions
        
        return currentAttractions.map(attraction => {
          const consensusTime = getConsensusWaitTime(attraction.id)
          if (consensusTime !== null && consensusTime !== attraction.currentWaitTime) {
            return {
              ...attraction,
              currentWaitTime: consensusTime,
              lastUpdated: new Date().toISOString()
            }
          }
          return attraction
        })
      })
      
      setLastUpdate(new Date())
    }

    // Update immediately, then every 30 seconds
    updateWaitTimes()
    const interval = setInterval(updateWaitTimes, 30000)
    return () => clearInterval(interval)
  }, [attractions, getConsensusWaitTime])

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

  const handleTrendsClick = (attractionId: string) => {
    navigate(`/park/${parkId}/attraction/${attractionId}`)
  }

  const handleReportSubmit = async (waitTime: number) => {
    // The submission is handled in the modal via the useReporting hook
    setShowReportModal(false)
    setSelectedAttraction(null)
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
            <Button 
              onClick={() => window.location.reload()}
              variant="outline"
              className="mx-2"
            >
              Reload Page
            </Button>
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
          <p className="text-sm text-muted-foreground">
            Data might still be loading. Try selecting a different park or refreshing the page.
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
                      {attraction.currentWaitTime} min
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
                      {user ? 'Report Time' : 'Login to Report'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleTrendsClick(attraction.id)}
                      className="flex items-center space-x-1"
                    >
                      <TrendUp size={14} />
                      <span>Trends</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {showReportModal && selectedAttraction && user && (
        <ReportWaitTimeModal
          attractionId={selectedAttraction}
          attractionName={attractions?.find(a => a.id === selectedAttraction)?.name || ''}
          user={user}
          onClose={() => {
            setShowReportModal(false)
            setSelectedAttraction(null)
          }}
          onSubmit={handleReportSubmit}
        />
      )}
    </div>
  )
}