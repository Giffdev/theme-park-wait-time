import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CrowdCalendar } from '@/components/CrowdCalendar'
import { ParkSelector } from '@/components/ParkSelector'
import { Button } from '@/components/ui/button'
import { CaretLeft } from '@phosphor-icons/react'

export function CrowdCalendarPage() {
  const navigate = useNavigate()
  const [selectedPark, setSelectedPark] = useState<string>('magic-kingdom')

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Back Button */}
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/')}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <CaretLeft size={16} />
          Back to Home
        </Button>
      </div>

      <div className="space-y-6">
        {/* Page Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Crowd Calendar</h1>
          <p className="text-muted-foreground">
            Plan your visit with historical crowd levels and predictions
          </p>
        </div>

        {/* Park Selector */}
        <div className="flex justify-center">
          <div className="w-full max-w-md">
            <ParkSelector 
              selectedPark={selectedPark}
              onParkChange={setSelectedPark}
            />
          </div>
        </div>

        {/* Crowd Calendar */}
        <CrowdCalendar parkId={selectedPark} />
      </div>
    </main>
  )
}