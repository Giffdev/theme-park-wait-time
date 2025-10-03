import React, { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Clock } from '@phosphor-icons/react'
import { useKV } from '@github/spark/hooks'
import { useGlobalTimer } from '@/hooks/useGlobalTimer'
import { useNavigate, useLocation } from 'react-router-dom'

interface TimerState {
  isRunning: boolean
  startTime: number | null
  elapsedTime: number
  pausedTime: number
}

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
      startTime: null,
      elapsedTime: 0,
      pausedTime: 0
    }
  )

  // Update current elapsed time for running timers
  useEffect(() => {
    if (activeTimerState.isRunning && activeTimerState.startTime) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - activeTimerState.startTime!) / 1000) + activeTimerState.pausedTime
        setCurrentElapsedTime(elapsed)
      }, 1000)
      
      return () => clearInterval(interval)
    } else {
      setCurrentElapsedTime(activeTimerState.elapsedTime)
    }
  }, [activeTimerState.isRunning, activeTimerState.startTime, activeTimerState.elapsedTime, activeTimerState.pausedTime])

  // Don't show if no active timer or if timer has no elapsed time
  if (!globalState.activeTimerId || (!activeTimerState.isRunning && activeTimerState.elapsedTime === 0)) {
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
      {activeTimerState.isRunning && (
        <span className="ml-2 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
      )}
      <div className="ml-2 text-xs opacity-75 max-w-24 truncate">
        {globalState.activeAttractionName}
      </div>
    </Badge>
  )
}