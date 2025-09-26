import { useState, useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, TrendUp, Plus, Users, CheckCircle, Warning } from '@phosphor-icons/react'
import { ReportWaitTimeModal } from '@/components/ReportWaitTimeModal'
import { WaitTimeChart } from '@/components/WaitTimeChart'
import { useReporting } from '@/hooks/useReporting'
import type { User, Attraction } from '@/App'

interface LiveWaitTimesProps {
  parkId: string
  user: User | null
  onLoginRequired: () => void
}

export function LiveWaitTimes({ parkId, user, onLoginRequired }: LiveWaitTimesProps) {
  const [showReportModal, setShowReportModal] = useState(false)
  const [selectedAttraction, setSelectedAttraction] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [isLoading, setIsLoading] = useState(true)
  
  // Load attractions from seeded data - use key that changes with parkId
  const [attractions, setAttractions] = useKV<Attraction[]>(`attractions-${parkId}`, [])
  
  const { getConsensusWaitTime, getRecentReports } = useReporting()

  // Force reload attractions when park changes
  useEffect(() => {
    const loadAttractionsForPark = async () => {
      setIsLoading(true)
      console.log(`🔄 Loading attractions for park: ${parkId}`)
      try {
        const parkData = await window.spark.kv.get<Attraction[]>(`attractions-${parkId}`)
        console.log(`📊 Found data for ${parkId}:`, parkData?.length || 0, 'attractions')
        if (parkData && parkData.length > 0) {
          setAttractions(parkData)
          console.log(`✅ Set ${parkData.length} attractions for ${parkId}`)
        } else {
          console.warn(`❌ No data found for ${parkId}`)
          setAttractions([])
        }
      } catch (error) {
        console.error(`❌ Error loading attractions for ${parkId}:`, error)
        setAttractions([])
      } finally {
        setIsLoading(false)
      }
    }

    loadAttractionsForPark()
  }, [parkId, setAttractions])

  // Debug: Log the current attractions to see if they're loading
  useEffect(() => {
    console.log(`🔍 LiveWaitTimes render state for ${parkId}:`)
    console.log(`  - isLoading: ${isLoading}`)
    console.log(`  - attractions: ${attractions?.length || 0} items`)
    console.log(`  - attractions data:`, attractions)
    if (attractions && attractions.length > 0) {
      setIsLoading(false)
    }
  }, [parkId, attractions, isLoading])

  // Update wait times based on consensus every 30 seconds
  useEffect(() => {
    if (!attractions || attractions.length === 0) return

    const updateWaitTimes = () => {
      setAttractions(currentAttractions => {
        const safeAttractions = currentAttractions || []
        if (safeAttractions.length === 0) return safeAttractions
        
        return safeAttractions.map(attraction => {
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
  }, [attractions, getConsensusWaitTime, setAttractions])

  const getWaitTimeColor = (waitTime: number) => {
    if (waitTime <= 20) return 'bg-success text-success-foreground'
    if (waitTime <= 45) return 'bg-accent text-accent-foreground'
    return 'bg-destructive text-destructive-foreground'
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
          Updated: {lastUpdate.toLocaleTimeString()}
        </div>
      </div>

      {/* Loading state */}
      {isLoading || !attractions || attractions.length === 0 ? (
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
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {attractions.map((attraction) => {
            const reportCount = getReportCount(attraction.id)
            const verificationStatus = getVerificationStatus(attraction.id)
            
            return (
              <Card key={attraction.id} className="hover:shadow-lg transition-all duration-300">
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
                    <Badge className={getWaitTimeColor(attraction.currentWaitTime)}>
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