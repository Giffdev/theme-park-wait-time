import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FamilyCrowdCalendar } from '@/components/FamilyCrowdCalendar'
import { ParkFamilySelector } from '@/components/ParkFamilySelector'
import { Button } from '@/components/ui/button'
import { CaretLeft } from '@phosphor-icons/react'

export function CrowdCalendarPage() {
  const navigate = useNavigate()
  const [selectedFamily, setSelectedFamily] = useState<string>('disney-world-orlando')

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Back Button */}
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/')}
          className="gap-2 text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <CaretLeft size={16} />
          Back to Home
        </Button>
      </div>

      <div className="space-y-6">
        {/* Page Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Park Family Crowd Calendar</h1>
          <p className="text-muted-foreground">
            Compare busy levels across all parks in a resort to plan your perfect visit
          </p>
        </div>

        {/* Park Family Selector */}
        <div className="flex justify-center">
          <div className="w-full max-w-md">
            <ParkFamilySelector 
              selectedFamily={selectedFamily}
              onFamilyChange={setSelectedFamily}
            />
          </div>
        </div>

        {/* Family Crowd Calendar */}
        <FamilyCrowdCalendar familyId={selectedFamily} />
      </div>
    </main>
  )
}