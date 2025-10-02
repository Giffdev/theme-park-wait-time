import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Clock, Plus, CheckCircle, X } from '@phosphor-icons/react'
import { useKV } from '@github/spark/hooks'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import type { User } from '@/App'
import type { RideLog, Trip, TripPark, ExtendedAttraction } from '@/types'

interface QuickWaitTimeModalProps {
  attractionId: string
  attractionName: string
  parkId: string
  parkName: string
  user: User | null
  onClose: () => void
  onLoginRequired?: () => void
}

export function QuickWaitTimeModal({
  attractionId,
  attractionName,
  parkId,
  parkName,
  user,
  onClose,
  onLoginRequired
}: QuickWaitTimeModalProps) {
  const [waitTime, setWaitTime] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addToTrip, setAddToTrip] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isClosed, setIsClosed] = useState(false)
  const navigate = useNavigate()

  const [currentTrip, setCurrentTrip] = useKV<Trip | null>(
    user ? `current-trip-${user.id}` : 'current-trip-anonymous', 
    null
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) {
      onLoginRequired?.()
      return
    }

    // If ride is closed, treat as infinite wait time
    let time: number
    if (isClosed) {
      time = -1 // Use -1 to represent closed/infinite wait
    } else {
      time = parseInt(waitTime)
      
      if (isNaN(time) || time < 0 || time > 300) {
        toast.error('Please enter a valid wait time between 0 and 300 minutes')
        return
      }
    }

    setIsSubmitting(true)
    
    try {
      // If user wants to add to trip, handle trip logic
      if (addToTrip) {
        await handleAddToTrip(time)
      }

      // Always submit the wait time report for crowd data
      await submitWaitTimeReport(time)

      setIsSuccess(true)
      const statusMessage = isClosed 
        ? `Ride status logged as closed for ${attractionName}`
        : `Wait time logged: ${time} minutes for ${attractionName}`
      toast.success(statusMessage)
      
      // Auto-close after showing success
      setTimeout(() => {
        onClose()
      }, 2000)
      
    } catch (error) {
      console.error('Failed to submit wait time:', error)
      toast.error('Failed to log wait time. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddToTrip = async (waitTimeMinutes: number) => {
    if (!user) return

    try {
      // Get today's date for the trip
      const today = new Date().toISOString().split('T')[0]
      
      let tripToUpdate = currentTrip

      // If no current trip exists, create one for today
      if (!tripToUpdate) {
        const newTrip: Trip = {
          id: `trip-${user.id}-${Date.now()}`,
          userId: user.id,
          visitDate: today,
          parks: [{
            parkId,
            parkName,
            rideCount: 0
          }],
          rideLogs: [],
          totalRides: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notes: ''
        }
        tripToUpdate = newTrip
        setCurrentTrip(newTrip)
      } else {
        // Add park to existing trip if not already there
        if (!tripToUpdate.parks.find(p => p.parkId === parkId)) {
          tripToUpdate.parks.push({
            parkId,
            parkName,
            rideCount: 0
          })
        }
      }

      // Load attraction data to get type
      const attractions = await window.spark.kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
      const attraction = attractions?.find(a => a.id === attractionId)

      // Create the ride log entry
      const rideLog: RideLog = {
        id: `log-${user.id}-${attractionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId: user.id,
        tripId: tripToUpdate.id,
        parkId,
        attractionId,
        attractionName,
        attractionType: attraction?.type || 'experience',
        rideCount: 1,
        loggedAt: new Date().toISOString(),
        notes: waitTimeMinutes === -1 ? 'Ride was closed' : `Wait time: ${waitTimeMinutes} minutes`
      }

      // Update the trip with the new ride log
      const updatedRideLogs = [...tripToUpdate.rideLogs.filter(log => 
        !(log.parkId === parkId && log.attractionId === attractionId)
      ), rideLog]

      // Update park ride counts
      const updatedParks = tripToUpdate.parks.map(park => 
        park.parkId === parkId 
          ? { ...park, rideCount: updatedRideLogs.filter(log => log.parkId === parkId).length }
          : park
      )

      const updatedTrip: Trip = {
        ...tripToUpdate,
        parks: updatedParks,
        rideLogs: updatedRideLogs,
        totalRides: updatedRideLogs.length,
        updatedAt: new Date().toISOString()
      }

      // Save the updated trip
      setCurrentTrip(updatedTrip)
      await window.spark.kv.set(`current-trip-${user.id}`, updatedTrip)
      await window.spark.kv.set(`trip-${updatedTrip.id}`, updatedTrip)

      // Update user's trip history
      const userTrips = await window.spark.kv.get<string[]>(`user-trips-${user.id}`) || []
      if (!userTrips.includes(updatedTrip.id)) {
        userTrips.push(updatedTrip.id)
        await window.spark.kv.set(`user-trips-${user.id}`, userTrips)
      }

    } catch (error) {
      console.error('Failed to add to trip:', error)
      throw error
    }
  }

  const submitWaitTimeReport = async (waitTimeMinutes: number) => {
    // Submit to wait time reports system for crowd data
    // waitTimeMinutes of -1 indicates the ride is closed
    const reportId = `report-${user!.id}-${attractionId}-${Date.now()}`
    const report = {
      id: reportId,
      attractionId,
      parkId,
      userId: user!.id,
      username: user!.username,
      waitTime: waitTimeMinutes, // -1 for closed, actual minutes otherwise
      reportedAt: new Date().toISOString(),
      status: 'pending' as const,
      verifications: [],
      accuracy: null
    }

    // Store the individual report
    await window.spark.kv.set(`wait-report-${reportId}`, report)

    // Add to attraction's reports list
    const attractionReports = await window.spark.kv.get<string[]>(`attraction-reports-${attractionId}`) || []
    attractionReports.push(reportId)
    // Keep only last 50 reports
    if (attractionReports.length > 50) {
      attractionReports.splice(0, attractionReports.length - 50)
    }
    await window.spark.kv.set(`attraction-reports-${attractionId}`, attractionReports)
  }

  if (isSuccess) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-6">
            <CheckCircle size={64} className="text-success mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Wait Time Logged!</h3>
            <p className="text-muted-foreground mb-4">
              {isClosed ? `${attractionName} marked as closed` : `${waitTime} minutes for ${attractionName}`}
            </p>
            {addToTrip && (
              <p className="text-sm text-muted-foreground">
                ✓ Added to your trip log for today
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock size={20} />
            Log Wait Time
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-center mb-4">
            <h3 className="font-semibold">{attractionName}</h3>
            <Badge variant="outline" className="text-xs">
              {parkName}
            </Badge>
          </div>

          <div className="space-y-2">
            <Label htmlFor="waitTime">How long was your wait? (minutes)</Label>
            <Input
              id="waitTime"
              type="number"
              min="0"
              max="300"
              value={waitTime}
              onChange={(e) => setWaitTime(e.target.value)}
              placeholder="e.g. 25"
              required={!isClosed}
              disabled={isClosed}
              autoFocus={!isClosed}
              className="text-center text-lg"
            />
            <p className="text-xs text-muted-foreground text-center">
              Enter 0 for walk-on, or actual wait time in line
            </p>
          </div>

          <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg">
            <Checkbox
              id="isClosed"
              checked={isClosed}
              onCheckedChange={(checked) => {
                setIsClosed(checked as boolean)
                if (checked) {
                  setWaitTime('') // Clear wait time when marking as closed
                }
              }}
            />
            <Label htmlFor="isClosed" className="text-sm cursor-pointer flex items-center gap-2">
              <X size={14} />
              Ride is closed
            </Label>
          </div>

          {user && (
            <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-lg">
              <Checkbox
                id="addToTrip"
                checked={addToTrip}
                onCheckedChange={(checked) => setAddToTrip(checked as boolean)}
              />
              <Label htmlFor="addToTrip" className="text-sm cursor-pointer flex items-center gap-2">
                <Plus size={14} />
                Add this ride to my trip log for today
              </Label>
            </div>
          )}

          {!user && (
            <div className="text-xs text-muted-foreground text-center p-2 bg-muted/30 rounded">
              Sign in to add rides to your trip log
            </div>
          )}
          
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || (!waitTime && !isClosed)}
              className="flex-1"
            >
              {isSubmitting ? 'Logging...' : (isClosed ? 'Log as Closed' : 'Log Wait Time')}
            </Button>
          </div>
        </form>

        <div className="text-xs text-muted-foreground text-center border-t pt-3">
          Your wait time helps other guests plan their visit
        </div>
      </DialogContent>
    </Dialog>
  )
}