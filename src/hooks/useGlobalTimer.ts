import { useKV } from '@github/spark/hooks'
import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'

interface GlobalTimerState {
  activeTimerId: string | null // Format: 'timer-{attractionId}'
  activeAttractionName: string | null
  activeParkId: string | null // Add park ID for navigation
}

interface TimerState {
  isRunning: boolean
  isPaused: boolean
  isStopped: boolean
  startTime: number | null
  elapsedTime: number
  pausedTime: number
}

export function useGlobalTimer() {
  const [globalState, setGlobalState] = useKV<GlobalTimerState>('global-timer-state', {
    activeTimerId: null,
    activeAttractionName: null,
    activeParkId: null
  })

  // Check if a timer can start (no other timer is running)
  const canStartTimer = useCallback((timerId: string): boolean => {
    // Allow if no active timer, or if this is the same timer (resume case)
    return globalState.activeTimerId === null || globalState.activeTimerId === timerId
  }, [globalState.activeTimerId])

  // Register a timer as active
  const setActiveTimer = useCallback((timerId: string, attractionName: string, parkId: string) => {
    setGlobalState({
      activeTimerId: timerId,
      activeAttractionName: attractionName,
      activeParkId: parkId
    })
  }, [setGlobalState])

  // Clear active timer
  const clearActiveTimer = useCallback(() => {
    setGlobalState({
      activeTimerId: null,
      activeAttractionName: null,
      activeParkId: null
    })
  }, [setGlobalState])

  // Stop any other running timer when starting a new one
  const stopOtherTimers = useCallback(async (currentTimerId: string) => {
    if (globalState.activeTimerId && globalState.activeTimerId !== currentTimerId) {
      // Stop the other running timer
      try {
        const otherTimerState = await window.spark.kv.get<TimerState>(globalState.activeTimerId)
        if (otherTimerState?.isRunning || otherTimerState?.isPaused) {
          // Stop the other timer
          await window.spark.kv.set(globalState.activeTimerId, {
            ...otherTimerState,
            isRunning: false,
            isPaused: false,
            isStopped: true,
            startTime: null
          })
          
          toast.info(`Stopped timer for ${globalState.activeAttractionName} to start new timer`)
        }
      } catch (error) {
        console.warn('Failed to stop other timer:', error)
      }
    }
  }, [globalState.activeTimerId, globalState.activeAttractionName])

  return {
    globalState,
    canStartTimer,
    setActiveTimer,
    clearActiveTimer,
    stopOtherTimers
  }
}