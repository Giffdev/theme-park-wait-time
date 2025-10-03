import React, { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Clock, Play, Pause, Stop, CheckCircle, XCircle, Warning } from '@phosphor-icons/react'
import { useReporting } from '@/hooks/useReporting'
import { useKV } from '@github/spark/hooks'
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

interface TimerState {
  isRunning: boolean
  startTime: number | null
  elapsedTime: number
  pausedTime: number
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
  const [inputMode, setInputMode] = useState<'manual' | 'timer'>('manual')
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  // Timer state with persistence
  const [timerState, setTimerState] = useKV<TimerState>(`timer-${attractionId}`, {
    isRunning: false,
    startTime: null,
    elapsedTime: 0,
    pausedTime: 0
  })

  const { 
    getRecentReports, 
    submitReport, 
    isSubmitting 
  } = useReporting()

  const [recentReports, setRecentReports] = useState<WaitTimeReport[]>([])

  // Load recent reports when component mounts
  useEffect(() => {
    const reports = getRecentReports(attractionId, 3)
    setRecentReports(reports)
  }, [attractionId, getRecentReports])

  // Timer effect
  useEffect(() => {
    if (timerState.isRunning && timerState.startTime) {
      timerRef.current = setInterval(() => {
        setTimerState(current => ({
          ...current,
          elapsedTime: Math.floor((Date.now() - current.startTime!) / 1000) + current.pausedTime
        }))
      }, 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [timerState.isRunning, timerState.startTime, setTimerState])

  const startTimer = () => {
    setTimerState(current => ({
      ...current,
      isRunning: true,
      startTime: Date.now()
    }))
    toast.success('Timer started! The time will persist if you leave and come back.')
  }

  const pauseTimer = () => {
    setTimerState(current => ({
      ...current,
      isRunning: false,
      pausedTime: current.elapsedTime,
      startTime: null
    }))
  }

  const resumeTimer = () => {
    setTimerState(current => ({
      ...current,
      isRunning: true,
      startTime: Date.now()
    }))
  }

  const stopTimer = () => {
    setTimerState({
      isRunning: false,
      startTime: null,
      elapsedTime: 0,
      pausedTime: 0
    })
  }

  const useTimerForReport = () => {
    const minutes = Math.ceil(timerState.elapsedTime / 60)
    setWaitTime(minutes.toString())
    setInputMode('manual')
    stopTimer()
    toast.success(`Used timer result: ${minutes} minutes`)
  }

  const formatTimerDisplay = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
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
      
      // Clear the timer after successful report
      stopTimer()
      
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Clock size={20} />
            {attractionName}
          </DialogTitle>
        </DialogHeader>
        
        {/* Input Mode Toggle */}
        <div className="flex gap-1 mb-4 p-1 bg-muted rounded-lg">
          <Button
            variant={inputMode === 'manual' ? 'default' : 'ghost'}
            onClick={() => setInputMode('manual')}
            size="sm"
            className="flex-1 h-8"
          >
            Manual Entry
          </Button>
          <Button
            variant={inputMode === 'timer' ? 'default' : 'ghost'}
            onClick={() => setInputMode('timer')}
            size="sm"
            className="flex-1 h-8"
          >
            Use Timer
          </Button>
        </div>

        {inputMode === 'timer' && (
          <div className="space-y-4 mb-6">
            {/* Timer Display */}
            <div className="bg-card border rounded-lg p-6 text-center">
              <div className="text-3xl font-mono font-bold text-primary mb-2">
                {formatTimerDisplay(timerState.elapsedTime)}
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Time your actual wait in line
              </p>
              
              {/* Timer Controls */}
              <div className="flex justify-center gap-2">
                {!timerState.isRunning && timerState.elapsedTime === 0 && (
                  <Button onClick={startTimer} className="gap-2">
                    <Play size={16} />
                    Start Timer
                  </Button>
                )}
                
                {timerState.isRunning && (
                  <Button onClick={pauseTimer} variant="outline" className="gap-2">
                    <Pause size={16} />
                    Pause
                  </Button>
                )}
                
                {!timerState.isRunning && timerState.elapsedTime > 0 && (
                  <>
                    <Button onClick={resumeTimer} className="gap-2">
                      <Play size={16} />
                      Resume
                    </Button>
                    <Button onClick={stopTimer} variant="outline" className="gap-2">
                      <Stop size={16} />
                      Reset
                    </Button>
                  </>
                )}
              </div>
              
              {timerState.elapsedTime > 0 && (
                <Button 
                  onClick={useTimerForReport} 
                  className="mt-3 w-full bg-accent hover:bg-accent/90"
                  size="sm"
                >
                  Use This Time ({Math.ceil(timerState.elapsedTime / 60)} min)
                </Button>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              💡 Your timer will persist if you leave and come back to this attraction
            </p>
          </div>
        )}

        {inputMode === 'manual' && (
          <form onSubmit={handleSubmitReport} className="space-y-4">
            {/* Ride Closed Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="ride-closed"
                checked={isClosed}
                onCheckedChange={(checked) => {
                  setIsClosed(checked as boolean)
                  if (checked) {
                    setWaitTime('')
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
            
            {/* Wait Time Input */}
            {!isClosed && (
              <div className="space-y-2">
                <Label htmlFor="waitTime" className="text-sm font-medium">
                  Wait Time (minutes)
                </Label>
                <Input
                  id="waitTime"
                  type="number"
                  min="0"
                  max="300"
                  value={waitTime}
                  onChange={(e) => setWaitTime(e.target.value)}
                  placeholder="e.g. 45"
                  required
                  className="text-lg h-12"
                />
              </div>
            )}
            
            {/* Help Text */}
            <p className="text-sm text-muted-foreground">
              {isClosed 
                ? "Your closure report helps other guests plan their visit"
                : "Your report helps other guests avoid long waits"
              }
            </p>
            
            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || (!isClosed && !waitTime)}
                className="flex-1 bg-primary hover:bg-primary/90"
              >
                {isSubmitting ? 'Reporting...' : isClosed ? 'Report Closed' : 'Submit Report'}
              </Button>
            </div>
          </form>
        )}

        {/* Recent Reports */}
        {recentReports.length > 0 && (
          <div className="border-t pt-4 mt-4">
            <h4 className="font-medium mb-3 text-sm">Recent Reports</h4>
            <div className="space-y-2">
              {recentReports.map((report) => (
                <div key={report.id} className="flex items-center justify-between text-sm py-2 px-3 bg-muted/50 rounded-md">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium">{report.username}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatTime12Hour(new Date(report.reportedAt).getHours(), new Date(report.reportedAt).getMinutes())}
                    </span>
                    {getStatusIcon(report.status)}
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {report.waitTime === -1 ? 'Closed' : `${report.waitTime} min`}
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