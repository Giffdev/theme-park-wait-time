import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Play, Pause, Stop } from '@phosphor-icons/react'
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
    if (timerState.isRunning && globalState.activeTimerId !== timerId) {
      // This timer is running but not registered globally - register it
      setActiveTimer(timerId, attractionName, parkId)
    } else if (!timerState.isRunning && globalState.activeTimerId === timerId) {
      // This timer is not running but is registered globally - clear it
      clearActiveTimer()
    }
  }, [timerState.isRunning, globalState.activeTimerId, timerId, attractionName, parkId, setActiveTimer, clearActiveTimer])

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
      startTime: Date.now()
    }))
    
    // Re-register as active timer
    setActiveTimer(timerId, attractionName, parkId)
    
    toast.success(`Timer resumed for ${attractionName}`)
  }

  const stopTimer = () => {
    const finalTime = timerState.elapsedTime
    
    setTimerState({
      isRunning: false,
      startTime: null,
      elapsedTime: 0,
      pausedTime: 0
    })
    
    // Clear from global timer
    clearActiveTimer()
    
    if (finalTime > 0 && onTimeRecorded) {
      // Enforce minimum 1 minute for realistic wait time reporting
      if (finalTime < 60) {
        toast.error('Timer must run for at least 1 minute to record accurate wait times')
        return
      }
      
      const minutes = Math.ceil(finalTime / 60)
      onTimeRecorded(minutes)
      toast.success(`Timer stopped: ${minutes} minutes`)
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
                Stop
              </Button>
            </>
          )}
        </div>
        
        {timerState.elapsedTime > 0 && (
          <p className="text-sm text-muted-foreground">
            Current wait: {Math.ceil(timerState.elapsedTime / 60)} minutes
          </p>
        )}
      </div>
    </Card>
  )
}