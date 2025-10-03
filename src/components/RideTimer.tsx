import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Play, Pause, Stop } from '@phosphor-icons/react'
import { useKV } from '@github/spark/hooks'
import { toast } from 'sonner'

interface RideTimerProps {
  attractionId: string
  attractionName: string
  onTimeRecorded?: (timeInMinutes: number) => void
}

interface TimerState {
  isRunning: boolean
  startTime: number | null
  elapsedTime: number
  pausedTime: number
}

export function RideTimer({ attractionId, attractionName, onTimeRecorded }: RideTimerProps) {
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  // Timer state with persistence per attraction
  const [timerState, setTimerState] = useKV<TimerState>(`timer-${attractionId}`, {
    isRunning: false,
    startTime: null,
    elapsedTime: 0,
    pausedTime: 0
  })

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
    toast.success(`Timer started for ${attractionName}`)
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
    const finalTime = timerState.elapsedTime
    setTimerState({
      isRunning: false,
      startTime: null,
      elapsedTime: 0,
      pausedTime: 0
    })
    
    if (finalTime > 0 && onTimeRecorded) {
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