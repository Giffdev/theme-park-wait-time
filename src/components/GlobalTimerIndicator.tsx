import React, { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Clock } from '@phosphor-icons/react'
import { useKV } from '@github/spark/hooks'
import { useGlobalTimer, type TimerState } from '@/hooks/useGlobalTimer'
import { useNavigate, useLocation } from 'react-router-dom'

export function GlobalTimerIndicator() {
  const { globalState } = useGlobalTimer()
  const navigate = useNavigate()
  const location = useLocation()
  const [currentElapsedTime, setCurrentElapsedTime] = useState(0)
  
  // Load the timer state for the active timer
  const [activeTimerState] = useKV<TimerState>(
    globalState.activeTimerId || 'no-timer', 
    {
      isRunning: false,
      isPaused: false,
      isStopped: false,
      startTime: null,
      elapsedTime: 0,
      pausedTime: 0
    }
  )

  // Safe timer state that's never undefined
  const safeActiveTimerState = activeTimerState || {
    isRunning: false,
    isPaused: false,
    isStopped: false,
    startTime: null,
    elapsedTime: 0,
    pausedTime: 0
  }

  // Update current elapsed time for running timers
  useEffect(() => {
    if (safeActiveTimerState.isRunning && safeActiveTimerState.startTime) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - safeActiveTimerState.startTime!) / 1000) + safeActiveTimerState.pausedTime
        setCurrentElapsedTime(elapsed)
      }, 1000)
      
      return () => clearInterval(interval)
    } else {
      setCurrentElapsedTime(safeActiveTimerState.elapsedTime)
    }
  }, [safeActiveTimerState.isRunning, safeActiveTimerState.startTime, safeActiveTimerState.elapsedTime, safeActiveTimerState.pausedTime])

  // Don't show if no active timer or if timer has no elapsed time and isn't running/paused
  if (!globalState.activeTimerId || (!safeActiveTimerState.isRunning && !safeActiveTimerState.isPaused && safeActiveTimerState.elapsedTime === 0)) {
    return null
  }

  // Extract attraction ID from timer ID
  const attractionId = globalState.activeTimerId.replace('timer-', '')
  const parkId = globalState.activeParkId

  const formatTimerDisplay = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleClick = () => {
    if (parkId && attractionId) {
      // Navigate to the specific attraction page
      navigate(`/park/${parkId}/attraction/${attractionId}`)
    } else {
      console.warn('Cannot navigate: missing park or attraction ID')
    }
  }

  return (
    <Badge 
      variant="secondary" 
      className="fixed bottom-4 right-4 z-50 px-3 py-2 cursor-pointer hover:bg-secondary/80 transition-colors shadow-lg"
      onClick={handleClick}
    >
      <Clock size={14} className="mr-1" />
      {formatTimerDisplay(currentElapsedTime)}
      {safeActiveTimerState.isRunning && (
        <span className="ml-2 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
      )}
      {safeActiveTimerState.isPaused && (
        <span className="ml-2 h-2 w-2 bg-yellow-500 rounded-full" />
      )}
      {safeActiveTimerState.isStopped && (
        <span className="ml-2 h-2 w-2 bg-red-500 rounded-full" />
      )}
      <div className="ml-2 text-xs opacity-75 max-w-24 truncate">
        {globalState.activeAttractionName}
      </div>
    </Badge>
  )
}