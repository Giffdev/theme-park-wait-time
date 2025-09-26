import { useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, TrendUp, Plus } from '@phosphor-icons/react'
import { ReportWaitTimeModal } from '@/components/ReportWaitTimeModal'
import type { User, Attraction } from '@/App'

interface LiveWaitTimesProps {
  parkId: string
  user: User | null
  onLoginRequired: () => void
}

export function LiveWaitTimes({ parkId, user, onLoginRequired }: LiveWaitTimesProps) {
  const [showReportModal, setShowReportModal] = useState(false)
  const [selectedAttraction, setSelectedAttraction] = useState<string | null>(null)
  
  // Load attractions from seeded data
  const [attractions] = useKV<Attraction[]>(`attractions-${parkId}`, [])

  const getWaitTimeColor = (waitTime: number) => {
    if (waitTime <= 20) return 'bg-success text-success-foreground'
    if (waitTime <= 45) return 'bg-accent text-accent-foreground'
    return 'bg-destructive text-destructive-foreground'
  }

  const handleReportClick = (attractionId: string) => {
    if (!user) {
      onLoginRequired()
      return
    }
    setSelectedAttraction(attractionId)
    setShowReportModal(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground">Current Wait Times</h2>
        <div className="text-sm text-muted-foreground">
          Updated: {new Date().toLocaleTimeString()}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {attractions?.map((attraction) => (
          <Card key={attraction.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg font-medium leading-tight">
                  {attraction.name}
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {attraction.type}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock size={16} className="text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Wait Time</span>
                </div>
                <Badge className={getWaitTimeColor(attraction.currentWaitTime)}>
                  {attraction.currentWaitTime} min
                </Badge>
              </div>
              
              <div className="flex items-center space-x-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReportClick(attraction.id)}
                  className="flex-1"
                >
                  <Plus size={14} className="mr-1" />
                  Report Time
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex items-center space-x-1"
                >
                  <TrendUp size={14} />
                  <span>Trends</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showReportModal && selectedAttraction && (
        <ReportWaitTimeModal
          attractionId={selectedAttraction}
          attractionName={attractions?.find(a => a.id === selectedAttraction)?.name || ''}
          onClose={() => {
            setShowReportModal(false)
            setSelectedAttraction(null)
          }}
          onSubmit={(waitTime) => {
            console.log('Reported wait time:', waitTime)
            setShowReportModal(false)
            setSelectedAttraction(null)
          }}
        />
      )}
    </div>
  )
}