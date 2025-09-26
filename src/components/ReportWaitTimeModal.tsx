import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Clock } from '@phosphor-icons/react'

interface ReportWaitTimeModalProps {
  attractionId: string
  attractionName: string
  onClose: () => void
  onSubmit: (waitTime: number) => void
}

export function ReportWaitTimeModal({
  attractionId,
  attractionName,
  onClose,
  onSubmit
}: ReportWaitTimeModalProps) {
  const [waitTime, setWaitTime] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const time = parseInt(waitTime)
    
    if (isNaN(time) || time < 0 || time > 300) {
      return
    }

    setIsSubmitting(true)
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      onSubmit(time)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock size={20} />
            Report Wait Time
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">
              Attraction
            </Label>
            <p className="text-lg font-medium">{attractionName}</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="waitTime">Current Wait Time (minutes)</Label>
            <Input
              id="waitTime"
              type="number"
              min="0"
              max="300"
              value={waitTime}
              onChange={(e) => setWaitTime(e.target.value)}
              placeholder="Enter wait time in minutes"
              required
            />
          </div>
          
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !waitTime}
              className="bg-primary hover:bg-primary/90"
            >
              {isSubmitting ? 'Reporting...' : 'Report Time'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}