import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Play, Pause, Stop, CheckCircle } from '@phosphor-icons/react'
import { useKV } from '@github/spark/hooks'
import { useGlobalTimer } from '@/hooks/useGlobalTimer'
import { toast } from 'sonner'

interface RideTimerProps {
  attractionId: string
  attractionName: string
  parkId: string
  onTimeRecorded?: (timeInMinutes: number) => void
}

interface TimerState {
  isRunning: boolean
  isPaused: boolean
  isStopped: boolean
  startTime: number | null
  elapsedTime: number
  pausedTime: number
}

export function RideTimer({ attractionId, attractionName, parkId, onTimeRecorded }: RideTimerProps) {
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const timerId = `timer-${attractionId}`
  
  // Global timer management
  const { globalState, canStartTimer, setActiveTimer, clearActiveTimer, stopOtherTimers } = useGlobalTimer()
  
  // Timer state with persistence per attraction
  const [timerState, setTimerState] = useKV<TimerState>(timerId, {
    isRunning: false,
    isPaused: false,
    isStopped: false,
    startTime: null,
    elapsedTime: 0,
    pausedTime: 0
  })

  // Update elapsed time when timer is running
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
    
    // Start this timer
    setTimerState(current => ({
      ...current,
      isRunning: true,
      isPaused: false,
      isStopped: false,
      startTime: Date.now()
    }))
    
    // Register as active timer
    setActiveTimer(timerId, attractionName, parkId)
    
    toast.success(`Timer started for ${attractionName}`)
  }

  const pauseTimer = () => {
    setTimerState(current => ({
      ...current,
      isRunning: false,
      isPaused: true,
      pausedTime: current.elapsedTime,
      startTime: null
    }))
    
    // Keep timer registered but paused
    toast.info(`Timer paused for ${attractionName}`)
  }

  const resumeTimer = () => {
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
    
    toast.success(`Timer resumed for ${attractionName}`)
  }

  const stopTimer = () => {
    setTimerState(current => ({
      ...current,
      isRunning: false,
      isPaused: false,
      isStopped: true,
      startTime: null
    }))
    
    // Keep timer registered to prevent multiple timers
    // Only clear after using the time or resetting
    
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
    
    toast.info(`Timer reset for ${attractionName}`)
  }

  const useTime = () => {
    if (!timerState.isStopped) {
      toast.error('Stop the timer first before using this time')
      return
    }

    const finalTime = timerState.elapsedTime
    
    if (finalTime < 60) {
      toast.error('Timer must run for at least 1 minute to record accurate wait times')
      return
    }
    
    const minutes = Math.ceil(finalTime / 60)
    
    // Reset timer after using the time
    resetTimer()
    
    if (onTimeRecorded) {
      onTimeRecorded(minutes)
      toast.success(`Used timer result: ${minutes} minutes`)
    }
  }

  const formatTimerDisplay = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Card className="p-4">
      <div className="text-center space-y-4">
        <h3 className="font-semibold text-lg">{attractionName}</h3>
        
        <div className="text-4xl font-mono font-bold text-primary">
          {formatTimerDisplay(timerState.elapsedTime)}
        </div>
        
        <div className="flex justify-center gap-2">
          {!timerState.isRunning && !timerState.isPaused && !timerState.isStopped && (
            <Button onClick={startTimer} className="gap-2">
              <Play size={16} />
              Start Timer
            </Button>
          )}
          
          {timerState.isRunning && (
            <>
              <Button onClick={pauseTimer} variant="outline" className="gap-2">
                <Pause size={16} />
                Pause
              </Button>
              <Button onClick={stopTimer} variant="destructive" className="gap-2">
                <Stop size={16} />
                Stop
              </Button>
            </>
          )}
          
          {timerState.isPaused && (
            <>
              <Button onClick={resumeTimer} className="gap-2">
                <Play size={16} />
                Resume
              </Button>
              <Button onClick={stopTimer} variant="destructive" className="gap-2">
                <Stop size={16} />
                Stop
              </Button>
            </>
          )}

          {timerState.isStopped && (
            <>
              <Button 
                onClick={useTime} 
                className="gap-2 bg-success hover:bg-success/90"
                disabled={timerState.elapsedTime < 60}
              >
                <CheckCircle size={16} />
                Use This Time
              </Button>
              <Button onClick={resetTimer} variant="outline" className="gap-2">
                Reset
              </Button>
            </>
          )}
        </div>
        
        {timerState.elapsedTime > 0 && (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Current wait: {Math.ceil(timerState.elapsedTime / 60)} minutes
            </p>
            {!timerState.isStopped && (
              <p className="text-xs text-muted-foreground">
                Stop the timer to submit this time
              </p>
            )}
            {timerState.isStopped && timerState.elapsedTime < 60 && (
              <p className="text-xs text-destructive">
                Timer must run for at least 1 minute
              </p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}