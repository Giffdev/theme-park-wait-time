import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Clock, CheckCircle, XCircle, Warning } from '@phosphor-icons/react'
import { useReporting } from '@/hooks/useReporting'
import type { User } from '@/App'
import type { WaitTimeReport } from '@/types'

interface ReportWaitTimeModalProps {
  attractionId: string
  attractionName: string
  user: User
  onClose: () => void
  onSubmit: (waitTime: number) => void
}

export function ReportWaitTimeModal({
  attractionId,
  attractionName,
  user,
  onClose,
  onSubmit
}: ReportWaitTimeModalProps) {
  const [waitTime, setWaitTime] = useState('')
  const [mode, setMode] = useState<'report' | 'verify'>('report')
  const { 
    getRecentReports, 
    submitReport, 
    verifyReport, 
    isSubmitting 
  } = useReporting()

  const recentReports = getRecentReports(attractionId, 5)
  const unverifiedReports = recentReports.filter(
    report => report.userId !== user.id && 
             report.status === 'pending' && 
             !report.verifications.some(v => v.userId === user.id)
  )

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault()
    const time = parseInt(waitTime)
    
    if (isNaN(time) || time < 0 || time > 300) {
      return
    }

    try {
      await submitReport(attractionId, 'universal-orlando', user.id, user.username, time)
      onSubmit(time)
    } catch (error) {
      console.error('Failed to submit report:', error)
    }
  }

  const handleVerifyReport = async (report: WaitTimeReport, isAccurate: boolean) => {
    try {
      await verifyReport(report.id, user.id, user.username, isAccurate)
      // Force re-render by switching modes briefly
      setMode('report')
      setTimeout(() => setMode('verify'), 100)
    } catch (error) {
      console.error('Failed to verify report:', error)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle size={16} className="text-success" />
      case 'disputed':
        return <XCircle size={16} className="text-destructive" />
      default:
        return <Warning size={16} className="text-muted-foreground" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified':
        return 'bg-success text-success-foreground'
      case 'disputed':
        return 'bg-destructive text-destructive-foreground'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock size={20} />
            {attractionName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === 'report' ? 'default' : 'outline'}
            onClick={() => setMode('report')}
            size="sm"
          >
            Report Wait Time
          </Button>
          <Button
            variant={mode === 'verify' ? 'default' : 'outline'}
            onClick={() => setMode('verify')}
            size="sm"
            disabled={unverifiedReports.length === 0}
          >
            Verify Reports ({unverifiedReports.length})
          </Button>
        </div>

        {mode === 'report' && (
          <form onSubmit={handleSubmitReport} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="waitTime">Current Wait Time (minutes)</Label>
              <Input
                id="waitTime"
                type="number"
                min="0"
                max="300"
                value={waitTime}
                onChange={(e) => setWaitTime(e.target.value)}
                placeholder="Enter wait time in minutes"
                required
              />
              <p className="text-sm text-muted-foreground">
                Your report helps other guests plan their visit
              </p>
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !waitTime}
                className="bg-primary hover:bg-primary/90"
              >
                {isSubmitting ? 'Reporting...' : 'Submit Report'}
              </Button>
            </div>
          </form>
        )}

        {mode === 'verify' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Help improve data accuracy by verifying recent reports from other users
            </p>
            
            {unverifiedReports.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Warning size={48} className="mx-auto mb-2 opacity-50" />
                <p>No reports to verify right now</p>
                <p className="text-sm">Check back later or submit your own report!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {unverifiedReports.map((report) => (
                  <div key={report.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{report.username}</div>
                        <Badge variant="secondary" className="text-xs">
                          {new Date(report.reportedAt).toLocaleTimeString()}
                        </Badge>
                        {getStatusIcon(report.status)}
                      </div>
                      <Badge className={getStatusColor(report.status)}>
                        {report.waitTime} min
                      </Badge>
                    </div>
                    
                    {report.verifications.length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        {report.verifications.length} verification(s)
                        {report.accuracy && ` • ${Math.round(report.accuracy * 100)}% accuracy`}
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleVerifyReport(report, true)}
                        disabled={isSubmitting}
                        className="flex items-center gap-1"
                      >
                        <CheckCircle size={14} />
                        Accurate
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleVerifyReport(report, false)}
                        disabled={isSubmitting}
                        className="flex items-center gap-1"
                      >
                        <XCircle size={14} />
                        Inaccurate
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        )}

        {recentReports.length > 0 && (
          <div className="border-t pt-4 mt-4">
            <h4 className="font-medium mb-3">Recent Reports</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {recentReports.slice(0, 3).map((report) => (
                <div key={report.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{report.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(report.reportedAt).toLocaleTimeString()}
                    </span>
                    {getStatusIcon(report.status)}
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {report.waitTime} min
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}