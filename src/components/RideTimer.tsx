// This component has been removed as part of simplifying the app to focus on wait time reporting only

interface RideTimerProps {
  user: User | null
  attraction: ExtendedAttraction
  parkId: string
  onTimeLogged: (minutes: number) => void
  isLogging: boolean
}

interface TimerSession {
  attractionId: string
  attractionName: string
  parkId: string
  startTime: number
  isActive: boolean
  pausedTime?: number
  totalPausedDuration: number
}

export function RideTimer({ user, attraction, parkId, onTimeLogged, isLogging }: RideTimerProps) {
  // Use a safer key that doesn't rely on potentially undefined user
  const timerKey = user ? `timer-session-${user.id}` : `timer-session-anonymous-${parkId}-${attraction.id}`
  
  const [currentSession, setCurrentSession] = useKV<TimerSession | null>(
    timerKey, 
    null
  )
  const [elapsedTime, setElapsedTime] = useState(0)
  const [isActive, setIsActive] = useState(false)

  // Update elapsed time every second when timer is active
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    if (currentSession?.isActive) {
      setIsActive(true)
      interval = setInterval(() => {
        const now = Date.now()
        const startTime = currentSession.pausedTime || currentSession.startTime
        const elapsed = Math.floor((now - startTime + currentSession.totalPausedDuration) / 1000)
        setElapsedTime(elapsed)
      }, 1000)
    } else {
      setIsActive(false)
      if (currentSession && !currentSession.isActive && currentSession.pausedTime) {
        // Calculate elapsed time for paused state
        const elapsed = Math.floor((currentSession.pausedTime - currentSession.startTime + currentSession.totalPausedDuration) / 1000)
        setElapsedTime(elapsed)
      }
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [currentSession])

  // Check if there's an active session for a different attraction
  const isTimerForDifferentAttraction = currentSession && 
    (currentSession.attractionId !== attraction.id || currentSession.parkId !== parkId)

  const startTimer = useCallback(async () => {
    if (!user) {
      toast.error('Please sign in to use the timer')
      return
    }

    if (!window.spark?.kv) {
      toast.error('Storage not available. Please refresh the page.')
      return
    }

    try {
      const newSession: TimerSession = {
        attractionId: attraction.id,
        attractionName: attraction.name,
        parkId,
        startTime: Date.now(),
        isActive: true,
        totalPausedDuration: 0
      }

      // Validate data before saving
      if (!newSession.attractionId || !newSession.parkId || !newSession.startTime) {
        throw new Error('Invalid timer session data')
      }

      await setCurrentSession(newSession)
      toast.success(`Timer started for ${attraction.name}! 🎢`, {
        description: 'Timer will run in the background. You can safely switch apps.'
      })
    } catch (error) {
      console.error('Failed to start timer:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to start timer: ${errorMessage}`)
    }
  }, [user, attraction, parkId, setCurrentSession])

  const pauseTimer = useCallback(async () => {
    if (!currentSession || !currentSession.isActive) return

    try {
      const pausedSession: TimerSession = {
        ...currentSession,
        isActive: false,
        pausedTime: Date.now()
      }

      await setCurrentSession(pausedSession)
      toast.info(`Timer paused for ${attraction.name}`)
    } catch (error) {
      console.error('Failed to pause timer:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to pause timer: ${errorMessage}`)
    }
  }, [currentSession, attraction.name, setCurrentSession])

  const resumeTimer = useCallback(async () => {
    if (!currentSession || currentSession.isActive || !currentSession.pausedTime) return

    try {
      const resumedSession: TimerSession = {
        ...currentSession,
        isActive: true,
        startTime: Date.now(),
        totalPausedDuration: currentSession.totalPausedDuration + (currentSession.pausedTime - (currentSession.pausedTime || currentSession.startTime)),
        pausedTime: undefined
      }

      await setCurrentSession(resumedSession)
      toast.success(`Timer resumed for ${attraction.name}`)
    } catch (error) {
      console.error('Failed to resume timer:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to resume timer: ${errorMessage}`)
    }
  }, [currentSession, attraction.name, setCurrentSession])

  const stopTimer = useCallback(async () => {
    if (!currentSession) return

    try {
      const endTime = currentSession.isActive ? Date.now() : (currentSession.pausedTime || Date.now())
      const totalDuration = endTime - currentSession.startTime + currentSession.totalPausedDuration
      const minutes = Math.round(totalDuration / 60000) // Convert to minutes and round

      if (minutes < 1) {
        toast.error('Timer must run for at least 1 minute to log')
        return
      }

      // Clear the timer session first
      await setCurrentSession(null)
      setElapsedTime(0)
      setIsActive(false)

      // Log the time
      await onTimeLogged(minutes)
      toast.success(`Logged ${minutes} minute${minutes !== 1 ? 's' : ''} for ${attraction.name}`)
    } catch (error) {
      console.error('Failed to stop timer:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to log wait time: ${errorMessage}`)
    }
  }, [currentSession, attraction.name, onTimeLogged, setCurrentSession])

  const cancelTimer = useCallback(async () => {
    if (!currentSession) return

    try {
      await setCurrentSession(null)
      setElapsedTime(0)
      setIsActive(false)
      toast.info(`Timer cancelled for ${attraction.name}`)
    } catch (error) {
      console.error('Failed to cancel timer:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to cancel timer: ${errorMessage}`)
    }
  }, [currentSession, attraction.name, setCurrentSession])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  // If there's a timer for a different attraction, show notification
  if (isTimerForDifferentAttraction) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer size={16} className="text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Timer Active for Different Attraction
                </p>
                <p className="text-xs text-amber-700">
                  {currentSession?.attractionName} - {formatTime(elapsedTime)}
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
              {currentSession?.isActive ? 'Running' : 'Paused'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Main timer interface
  return (
    <Card className={`transition-all ${currentSession ? 'ring-2 ring-primary' : ''}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Timer size={16} />
          Ride Timer
        </CardTitle>
        <CardDescription className="text-xs">
          Start timer when you join the queue, stop when you exit
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {currentSession ? (
          <div className="space-y-4">
            {/* Timer Display */}
            <div className="text-center">
              <div className="text-2xl font-mono font-bold text-primary">
                {formatTime(elapsedTime)}
              </div>
              <div className="flex items-center justify-center gap-2 mt-1">
                <Badge variant={isActive ? "default" : "secondary"} className="text-xs">
                  {isActive ? 'Running' : 'Paused'}
                </Badge>
                {elapsedTime >= 60 && (
                  <Badge variant="outline" className="text-xs">
                    ~{Math.round(elapsedTime / 60)} min
                  </Badge>
                )}
              </div>
            </div>

            {/* Timer Controls */}
            <div className="flex gap-2">
              {isActive ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={pauseTimer}
                  className="flex-1 touch-manipulation min-h-[44px]"
                  disabled={isLogging}
                >
                  <Pause size={16} className="mr-1" />
                  Pause
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resumeTimer}
                  className="flex-1 touch-manipulation min-h-[44px]"
                  disabled={isLogging}
                >
                  <Play size={16} className="mr-1" />
                  Resume
                </Button>
              )}
              
              <Button
                variant="default"
                size="sm"
                onClick={stopTimer}
                className="flex-1 touch-manipulation min-h-[44px]"
                disabled={isLogging || elapsedTime < 60}
              >
                <Square size={16} className="mr-1" />
                {isLogging ? 'Logging...' : 'Stop & Log'}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={cancelTimer}
                disabled={isLogging}
                className="px-3 touch-manipulation min-h-[44px]"
              >
                Cancel
              </Button>
            </div>

            {/* Quick Actions for common times */}
            {elapsedTime >= 300 && ( // 5+ minutes
              <div className="flex gap-1 pt-2">
                <span className="text-xs text-muted-foreground mr-2">Quick log:</span>
                {[5, 10, 15, 30, 60].filter(min => min * 60 <= elapsedTime + 60).map(minutes => (
                  <Button
                    key={minutes}
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await setCurrentSession(null)
                        setElapsedTime(0)
                        setIsActive(false)
                        await onTimeLogged(minutes)
                        toast.success(`Logged ${minutes} minutes for ${attraction.name}`)
                      } catch (error) {
                        console.error('Failed to quick-log time:', error)
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
                        toast.error(`Failed to log wait time: ${errorMessage}`)
                      }
                    }}
                    className="h-8 px-3 text-xs touch-manipulation min-h-[36px]"
                    disabled={isLogging}
                  >
                    {minutes}m
                  </Button>
                ))}
              </div>
            )}

            {elapsedTime < 60 && (
              <p className="text-xs text-muted-foreground text-center">
                Timer must run for at least 1 minute to log
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Button
              variant="default"
              size="sm"
              onClick={startTimer}
              className="w-full touch-manipulation min-h-[44px]"
              disabled={!user || isLogging}
            >
              <Play size={16} className="mr-2" />
              Start Timer for {attraction.name}
            </Button>
            
            {!user && (
              <p className="text-xs text-muted-foreground text-center">
                Sign in required to use timer
              </p>
            )}
          </div>
        )}

        {/* Usage Tips */}
        {!currentSession && (
          <div className="mt-3 p-3 bg-muted/50 rounded-sm space-y-1">
            <p className="text-xs font-medium text-muted-foreground">💡 Timer Features:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Runs in background when you switch apps</li>
              <li>• Pause for bathroom breaks or food</li>
              <li>• Quick-log buttons for common wait times</li>
              <li>• Only one timer can run at a time</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}