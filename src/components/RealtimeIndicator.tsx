import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Bell, Clock, CheckCircle, Users } from '@phosphor-icons/react'
import { useReporting } from '@/hooks/useReporting'
import { formatTime12Hour } from '@/utils/timeFormat'
import { toast } from 'sonner'

interface RealtimeIndicatorProps {
  parkId: string
}

export function RealtimeIndicator({ parkId }: RealtimeIndicatorProps) {
  // Temporarily disable the hook call to isolate the error
  const { reports = [], verifications = [] } = useReporting()
  const [lastReportTime, setLastReportTime] = useState<string | null>(null)
  const [newReportsCount, setNewReportsCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(true)

  // Monitor for new reports
  useEffect(() => {
    if (!reports || !Array.isArray(reports) || reports.length === 0) return

    const parkReports = reports.filter(report => report.parkId === parkId)
    if (parkReports.length === 0) return

    const latestReport = parkReports.sort(
      (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
    )[0]

    const currentLastTime = lastReportTime
    const latestTime = latestReport.reportedAt

    if (currentLastTime && latestTime > currentLastTime) {
      setNewReportsCount(prev => prev + 1)
      
      if (showNotifications) {
        const waitTimeText = latestReport.waitTime === -1 ? 'Ride is closed' : `${latestReport.waitTime} minutes`
        toast.success(`New wait time reported for ${latestReport.attractionId}`, {
          description: `${waitTimeText} by ${latestReport.username}`,
          duration: 5000,
          action: {
            label: 'View',
            onClick: () => {
              // Could scroll to the attraction or show more details
            }
          }
        })
      }
    }

    setLastReportTime(latestTime)
  }, [reports, parkId, lastReportTime, showNotifications])

  // Monitor for new verifications
  useEffect(() => {
    if (!verifications || !Array.isArray(verifications) || verifications.length === 0) return

    // Filter for recent verifications (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const recentVerifications = verifications.filter(
      verification => new Date(verification.verifiedAt) > fiveMinutesAgo
    )

    if (recentVerifications.length > 0 && showNotifications) {
      const latestVerification = recentVerifications[recentVerifications.length - 1]
      const status = latestVerification.isAccurate ? 'verified' : 'disputed'
      
      toast.info(`Report ${status}`, {
        description: `by ${latestVerification.username}`,
        duration: 3000
      })
    }
  }, [verifications, showNotifications])

  const handleClearNotifications = () => {
    setNewReportsCount(0)
  }

  // Get activity stats for the last hour
  const getRecentActivity = () => {
    if (!reports || !Array.isArray(reports)) return { reports: 0, verifications: 0 }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const recentReports = reports.filter(
      report => report.parkId === parkId && new Date(report.reportedAt) > oneHourAgo
    )
    const recentVerifications = (verifications || []).filter(
      verification => new Date(verification.verifiedAt) > oneHourAgo
    )

    return {
      reports: recentReports.length,
      verifications: recentVerifications.length
    }
  }

  const activity = getRecentActivity()
  const isActive = activity.reports > 0 || activity.verifications > 0

  return (
    <Card className={`transition-all duration-300 ${isActive ? 'ring-2 ring-primary/20 bg-primary/5' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isActive ? 'bg-primary/10 animate-pulse' : 'bg-muted'}`}>
              <Bell size={16} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
            </div>
            
            <div>
              <div className="font-medium flex items-center gap-2">
                Live Activity
                {newReportsCount > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs">
                    {newReportsCount}
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {isActive ? 'Data updating in real-time' : 'Monitoring for updates'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {activity.reports > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <Clock size={14} className="text-primary" />
                <span className="font-medium">{activity.reports}</span>
                <span className="text-muted-foreground">reports</span>
              </div>
            )}
            
            {activity.verifications > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <CheckCircle size={14} className="text-success" />
                <span className="font-medium">{activity.verifications}</span>
                <span className="text-muted-foreground">verified</span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowNotifications(!showNotifications)}
                className="h-8 w-8 p-0"
                title={showNotifications ? 'Disable notifications' : 'Enable notifications'}
              >
                <Bell size={14} className={showNotifications ? 'text-primary' : 'text-muted-foreground'} />
              </Button>
              
              {newReportsCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleClearNotifications}
                  className="h-8 px-2 text-xs"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </div>

        {lastReportTime && (
          <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
            Last update: {formatTime12Hour(new Date(lastReportTime).getHours(), new Date(lastReportTime).getMinutes())}
          </div>
        )}
      </CardContent>
    </Card>
  )
}