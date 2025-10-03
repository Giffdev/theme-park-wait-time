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
import { useGlobalTimer } from '@/hooks/useGlobalTimer'
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
  isPaused: boolean
  isStopped: boolean
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
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const timerId = `timer-${attractionId}`
  
  // Global timer management
  const { globalState, canStartTimer, setActiveTimer, clearActiveTimer, stopOtherTimers } = useGlobalTimer()
  
  // Timer state with persistence
  const [timerState, setTimerState] = useKV<TimerState>(timerId, {
    isRunning: false,
    isPaused: false,
    isStopped: false,
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

  // Sync with global timer state when component mounts
  useEffect(() => {
    if ((timerState.isRunning || timerState.isPaused) && globalState.activeTimerId !== timerId) {
      // This timer is active but not registered globally - register it
      setActiveTimer(timerId, attractionName, parkId)
    } else if (!timerState.isRunning && !timerState.isPaused && globalState.activeTimerId === timerId) {
      // This timer is not active but is registered globally - clear it (unless stopped with time)
      if (!timerState.isStopped || timerState.elapsedTime === 0) {
        clearActiveTimer()
      }
    }
  }, [timerState.isRunning, timerState.isPaused, timerState.isStopped, timerState.elapsedTime, globalState.activeTimerId, timerId, attractionName, parkId, setActiveTimer, clearActiveTimer])

  const startTimer = async () => {
    if (!canStartTimer(timerId)) {
      toast.error(`Another timer is already running for ${globalState.activeAttractionName}. Only one timer can run at a time.`)
      return
    }

    // Stop any other running timers
    await stopOtherTimers(timerId)
    
    setTimerState(current => ({
      ...current,
      isRunning: true,
      isPaused: false,
      isStopped: false,
      startTime: Date.now()
    }))
    
    // Register as active timer
    setActiveTimer(timerId, attractionName, parkId)
    
    toast.success('Timer started! The time will persist if you leave and come back.')
  }

  const pauseTimer = () => {
    setTimerState(current => ({
      ...current,
      isRunning: false,
      isPaused: true,
      pausedTime: current.elapsedTime,
      startTime: null
    }))
    
    toast.info(`Timer paused for ${attractionName}`)
  }

  const resumeTimer = async () => {
    if (!canStartTimer(timerId)) {
      toast.error(`Another timer is already running for ${globalState.activeAttractionName}. Only one timer can run at a time.`)
      return
    }
    
    setTimerState(current => ({
      ...current,
      isRunning: true,
      isPaused: false,
      startTime: Date.now()
    }))
    
    // Re-register as active timer
    setActiveTimer(timerId, attractionName, parkId)
  }

  const stopTimer = () => {
    setTimerState(current => ({
      ...current,
      isRunning: false,
      isPaused: false,
      isStopped: true,
      startTime: null
    }))
    
    toast.success(`Timer stopped for ${attractionName}`)
  }

  const resetTimer = () => {
    setTimerState({
      isRunning: false,
      isPaused: false,
      isStopped: false,
      startTime: null,
      elapsedTime: 0,
      pausedTime: 0
    })
    
    // Clear from global timer
    clearActiveTimer()
  }

  const useTimerForReport = () => {
    if (!timerState.isStopped) {
      toast.error('Stop the timer first before using this time')
      return
    }

    // Round down to nearest minute, treating 0 minutes as walk-on
    const minutes = Math.floor(timerState.elapsedTime / 60)
    setWaitTime(minutes.toString())
    resetTimer()
    
    const message = minutes === 0 ? 'Used timer result: Walk-on (0 minutes)' : `Used timer result: ${minutes} minutes`
    toast.success(message)
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
      resetTimer()
      
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

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg w-[95vw] max-h-[85vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Clock size={20} />
            {attractionName}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmitReport} className="space-y-6">
          {/* Timer Section */}
          <div className="bg-card border rounded-lg p-4 sm:p-6">
            <div className="text-center mb-4">
              <div className="text-2xl sm:text-3xl font-mono font-bold text-primary mb-1">
                {formatTimerDisplay(timerState.elapsedTime)}
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Time your actual wait in line
              </p>
            </div>
            
            {/* Timer Controls */}
            <div className="flex justify-center gap-2 flex-wrap mb-4">
              {!timerState.isRunning && !timerState.isPaused && !timerState.isStopped && (
                <Button type="button" onClick={startTimer} className="gap-2 text-sm">
                  <Play size={16} />
                  Start Timer
                </Button>
              )}
              
              {timerState.isRunning && (
                <>
                  <Button type="button" onClick={pauseTimer} variant="outline" className="gap-2 text-sm">
                    <Pause size={16} />
                    Pause
                  </Button>
                  <Button type="button" onClick={stopTimer} variant="secondary" className="gap-2 text-sm">
                    <Stop size={16} />
                    Stop
                  </Button>
                </>
              )}
              
              {timerState.isPaused && (
                <>
                  <Button type="button" onClick={resumeTimer} className="gap-2 text-sm">
                    <Play size={16} />
                    Resume
                  </Button>
                  <Button type="button" onClick={stopTimer} variant="secondary" className="gap-2 text-sm">
                    <Stop size={16} />
                    Stop
                  </Button>
                </>
              )}

              {timerState.isStopped && (
                <Button type="button" onClick={resetTimer} variant="outline" className="gap-2 text-sm">
                  Reset
                </Button>
              )}
            </div>
            
            {/* Use Timer Button */}
            {timerState.isStopped && timerState.elapsedTime > 0 && (
              <Button 
                type="button"
                onClick={useTimerForReport} 
                className="w-full bg-success hover:bg-success/90 text-sm mb-3"
                size="sm"
              >
                <CheckCircle size={16} className="mr-2" />
                Use This Time ({Math.floor(timerState.elapsedTime / 60) === 0 ? 'Walk-on' : `${Math.floor(timerState.elapsedTime / 60)} min`})
              </Button>
            )}

            {/* Timer Status Messages */}
            {timerState.elapsedTime > 0 && !timerState.isStopped && (
              <p className="text-xs text-muted-foreground text-center">
                Stop the timer to use this time for your report
              </p>
            )}
            
            {timerState.elapsedTime === 0 && (
              <p className="text-xs text-muted-foreground text-center">
                💡 Start the timer when you join the line - it will persist if you leave and come back
              </p>
            )}
          </div>
          
          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-border"></div>
            <span className="text-xs text-muted-foreground bg-background px-2">OR</span>
            <div className="flex-1 border-t border-border"></div>
          </div>

          {/* Manual Entry Section */}
          <div className="space-y-4">
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
                  Enter Wait Time Manually (minutes)
                </Label>
                <Input
                  id="waitTime"
                  type="number"
                  min="0"
                  max="300"
                  value={waitTime}
                  onChange={(e) => setWaitTime(e.target.value)}
                  placeholder="e.g. 45"
                  className="text-center text-lg h-16 max-w-32 mx-auto block"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Enter 0 for walk-on, or actual wait time in line
                </p>
              </div>
            )}
            
            {/* Help Text */}
            <p className="text-sm text-muted-foreground text-center">
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
          </div>
        </form>

        {/* Recent Reports */}
        {recentReports.length > 0 && (
          <div className="border-t pt-4 mt-4">
            <h4 className="font-medium mb-3 text-sm">Recent Reports</h4>
            <div className="space-y-2">
              {recentReports.map((report) => (
                <div key={report.id} className="flex items-center justify-between text-sm py-2 px-3 bg-muted/50 rounded-md">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-muted-foreground font-medium truncate">{report.username}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatTime12Hour(new Date(report.reportedAt).getHours(), new Date(report.reportedAt).getMinutes())}
                    </span>
                    <span className="shrink-0">{getStatusIcon(report.status)}</span>
                  </div>
                  <Badge variant="secondary" className="text-xs ml-2 shrink-0">
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