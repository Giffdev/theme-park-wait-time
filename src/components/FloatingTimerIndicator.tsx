// This component has been removed as part of simplifying the app to focus on wait time reporting only

interface TimerSession {
  attractionId: string
  attractionName: string
  parkId: string
  startTime: number
  isActive: boolean
  pausedTime?: number
  totalPausedDuration: number
}

interface FloatingTimerIndicatorProps {
  user: User | null
}

export function FloatingTimerIndicator({ user }: FloatingTimerIndicatorProps) {
  const [currentSession, setCurrentSession] = useKV<TimerSession | null>(
    user ? `timer-session-${user.id}` : 'timer-session-anonymous', 
    null
  )
  const [elapsedTime, setElapsedTime] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const navigate = useNavigate()

  // Update elapsed time every second when timer is active
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    if (currentSession) {
      setIsVisible(true)
      
      const updateTime = () => {
        const now = Date.now()
        if (currentSession.isActive) {
          const startTime = currentSession.pausedTime || currentSession.startTime
          const elapsed = Math.floor((now - startTime + currentSession.totalPausedDuration) / 1000)
          setElapsedTime(elapsed)
        } else if (currentSession.pausedTime) {
          const elapsed = Math.floor((currentSession.pausedTime - currentSession.startTime + currentSession.totalPausedDuration) / 1000)
          setElapsedTime(elapsed)
        }
      }

      updateTime() // Initial update
      interval = setInterval(updateTime, 1000)
    } else {
      setIsVisible(false)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [currentSession])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  const toggleTimer = () => {
    if (!currentSession) return

    if (currentSession.isActive) {
      // Pause timer
      const pausedSession: TimerSession = {
        ...currentSession,
        isActive: false,
        pausedTime: Date.now()
      }
      setCurrentSession(pausedSession)
    } else {
      // Resume timer
      const resumedSession: TimerSession = {
        ...currentSession,
        isActive: true,
        startTime: Date.now(),
        totalPausedDuration: currentSession.totalPausedDuration + (currentSession.pausedTime ? (currentSession.pausedTime - (currentSession.pausedTime || currentSession.startTime)) : 0),
        pausedTime: undefined
      }
      setCurrentSession(resumedSession)
    }
  }

  const navigateToRideLog = () => {
    if (currentSession) {
      navigate(`/park/${currentSession.parkId}/log?attraction=${currentSession.attractionId}`)
    }
  }

  const cancelTimer = () => {
    setCurrentSession(null)
    setElapsedTime(0)
    setIsVisible(false)
  }

  if (!isVisible || !currentSession) {
    return null
  }

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none px-4 max-w-sm w-full">
      <Card className="pointer-events-auto shadow-lg border-2 border-primary/20 bg-card/95 backdrop-blur-sm">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            {/* Timer Icon and Status */}
            <div className="flex items-center gap-2">
              <Timer size={18} className="text-primary" />
              <Badge variant={currentSession.isActive ? "default" : "secondary"} className="text-xs">
                {currentSession.isActive ? 'Running' : 'Paused'}
              </Badge>
            </div>

            {/* Attraction Info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">
                {currentSession.attractionName}
              </div>
              <div className="text-xl font-mono font-bold text-primary">
                {formatTime(elapsedTime)}
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTimer}
                className="h-10 w-10 p-0 touch-manipulation"
              >
                {currentSession.isActive ? (
                  <Pause size={16} />
                ) : (
                  <Play size={16} />
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={navigateToRideLog}
                className="h-10 px-3 text-xs touch-manipulation"
              >
                View Details
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={cancelTimer}
                className="h-10 w-10 p-0 text-muted-foreground hover:text-destructive touch-manipulation"
              >
                <X size={16} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}