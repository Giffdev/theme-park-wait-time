import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Clock } from '@phosphor-icons/react'
import { useKV } from '@github/spark/hooks'
import { type TimerState } from '@/hooks/useGlobalTimer'

interface FloatingTimerIndicatorProps {
  attractionId: string
  onClick?: () => void
}

export function FloatingTimerIndicator({ attractionId, onClick }: FloatingTimerIndicatorProps) {
  const [timerState] = useKV<TimerState>(`timer-${attractionId}`, {
    isRunning: false,
    isPaused: false,
    isStopped: false,
    startTime: null,
    elapsedTime: 0,
    pausedTime: 0
  })

  // Safe timer state that's never undefined
  const safeTimerState = timerState || {
    isRunning: false,
    isPaused: false,
    isStopped: false,
    startTime: null,
    elapsedTime: 0,
    pausedTime: 0
  }

  if (safeTimerState.elapsedTime === 0 && !safeTimerState.isRunning) {
    return null
  }

  const formatTimerDisplay = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Badge 
      variant="secondary" 
      className="fixed bottom-4 right-4 z-50 px-3 py-2 cursor-pointer hover:bg-secondary/80 transition-colors"
      onClick={onClick}
    >
      <Clock size={14} className="mr-1" />
      {formatTimerDisplay(safeTimerState.elapsedTime)}
      {safeTimerState.isRunning && (
        <span className="ml-2 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
      )}
    </Badge>
  )
}