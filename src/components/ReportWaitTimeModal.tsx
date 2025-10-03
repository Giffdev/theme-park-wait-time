import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Clock, CheckCircle, XCircle, Warning } from '@phosphor-icons/react'
import { useReporting } from '@/hooks/useReporting'
import { formatTime12Hour } from '@/utils/timeFormat'
import { toast } from 'sonner'
import type { User } from '@/App'
import type { WaitTimeReport } from '@/types'

interface ReportWaitTimeModalProps {
  attractionId: string
  attractionName: string
  parkId: string
  user: User
  onClose: () => void
  onSubmit: (waitTime: number) => void
}

export function ReportWaitTimeModal({
  attractionId,
  attractionName,
  parkId,
  user,
  onClose,
  onSubmit
}: ReportWaitTimeModalProps) {
  const [waitTime, setWaitTime] = useState('')
  const [isClosed, setIsClosed] = useState(false)
  const [mode, setMode] = useState<'report' | 'verify'>('report')
  const { 
    getRecentReports, 
    submitReport, 
    verifyReport, 
    isSubmitting 
  } = useReporting()

  const [recentReports, setRecentReports] = useState<WaitTimeReport[]>([])
  const [unverifiedReports, setUnverifiedReports] = useState<WaitTimeReport[]>([])

  // Load reports when component mounts or attractionId changes
  useEffect(() => {
    const reports = getRecentReports(attractionId, 5)
    setRecentReports(reports)
    setUnverifiedReports(reports.filter(
      report => report.userId !== user.id && 
               report.status === 'pending' && 
               !report.verifications.some(v => v.userId === user.id)
    ))
  }, [attractionId, getRecentReports])

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // If ride is closed, use -1 as a special value to indicate closure
    const time = isClosed ? -1 : parseInt(waitTime)
    
    if (!isClosed && (isNaN(time) || time < 0 || time > 300)) {
      toast.error('Please enter a valid wait time between 0 and 300 minutes.')
      return
    }

    try {
      console.log('🔄 Submitting wait time report:', {
        attractionId,
        parkId,
        userId: user.id,
        username: user.username,
        time
      })
      
      await submitReport(attractionId, parkId, user.id, user.username, time)
      
      if (isClosed) {
        toast.success(`Reported ${attractionName} as closed`)
      } else {
        toast.success(`Wait time reported: ${time} minutes for ${attractionName}`)
      }
      onSubmit(time)
      onClose() // Close the modal on successful submission
    } catch (error) {
      console.error('❌ Failed to submit report:', error)
      
      // Provide more helpful error messages
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      
      if (errorMessage.includes('KV storage is not available')) {
        toast.error('Storage system not ready - please refresh the page and try again')
      } else if (errorMessage.includes('Missing required parameters')) {
        toast.error('Missing information - please try logging out and back in')
      } else if (errorMessage.includes('Wait time must be')) {
        toast.error('Please enter a valid wait time between 0 and 300 minutes')
      } else {
        toast.error(`Unable to submit report: ${errorMessage}`)
      }
    }
  }

  const handleVerifyReport = async (report: WaitTimeReport, isAccurate: boolean) => {
    try {
      await verifyReport(report.id, user.id, user.username, isAccurate)
      toast.success(`Report ${isAccurate ? 'verified as accurate' : 'marked as inaccurate'}`)
      
      // Refresh the local state
      const updatedReports = getRecentReports(attractionId, 5)
      setRecentReports(updatedReports)
      setUnverifiedReports(updatedReports.filter(
        report => report.userId !== user.id && 
                 report.status === 'pending' && 
                 !report.verifications.some(v => v.userId === user.id)
      ))
    } catch (error) {
      console.error('Failed to verify report:', error)
      toast.error('Failed to verify report. Please try again.')
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
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ride-closed"
                  checked={isClosed}
                  onCheckedChange={(checked) => {
                    setIsClosed(checked as boolean)
                    if (checked) {
                      setWaitTime('') // Clear wait time when marking as closed
                    }
                  }}
                />
                <Label 
                  htmlFor="ride-closed" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Ride is closed
                </Label>
              </div>
              
              {!isClosed && (
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
                </div>
              )}
              
              <p className="text-sm text-muted-foreground">
                {isClosed 
                  ? "Your closure report helps other guests plan their visit"
                  : "Your report helps other guests plan their visit"
                }
              </p>
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || (!isClosed && !waitTime)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground hover:text-primary-foreground"
              >
                {isSubmitting ? 'Reporting...' : isClosed ? 'Report as Closed' : 'Submit Report'}
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
                          {formatTime12Hour(new Date(report.reportedAt).getHours(), new Date(report.reportedAt).getMinutes())}
                        </Badge>
                        {getStatusIcon(report.status)}
                      </div>
                      <Badge className={getStatusColor(report.status)}>
                        {report.waitTime === -1 ? 'Ride is closed' : `${report.waitTime} min`}
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
                      {formatTime12Hour(new Date(report.reportedAt).getHours(), new Date(report.reportedAt).getMinutes())}
                    </span>
                    {getStatusIcon(report.status)}
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {report.waitTime === -1 ? 'Ride is closed' : `${report.waitTime} min`}
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