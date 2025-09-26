import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MapPin } from '@phosphor-icons/react'
import { parkFamilies } from '@/data/sampleData'

interface ParkSelectorProps {
  selectedPark: string
  onParkChange: (parkId: string) => void
}

export function ParkSelector({ selectedPark, onParkChange }: ParkSelectorProps) {
  // Get all parks from all families
  const allParks = parkFamilies.flatMap(family => 
    family.parks.map(park => ({
      ...park,
      familyName: family.name,
      location: family.location
    }))
  )
  
  const currentPark = allParks.find(park => park.id === selectedPark)

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground flex items-center gap-2">
        <MapPin size={16} />
        Select Theme Park
      </label>
      <Select value={selectedPark} onValueChange={onParkChange}>
        <SelectTrigger className="w-full max-w-sm">
          <SelectValue placeholder="Choose a park">
            {currentPark && (
              <div>
                <span className="font-medium">{currentPark.shortName}</span>
                <span className="text-muted-foreground text-sm ml-2">
                  {currentPark.location}
                </span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {parkFamilies.map((family) => (
            <div key={family.id}>
              {/* Family header */}
              <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
                {family.name} - {family.location}
              </div>
              {/* Parks in this family */}
              {family.parks.map((park) => (
                <SelectItem key={park.id} value={park.id} className="pl-4">
                  <div>
                    <div className="font-medium">{park.shortName}</div>
                    <div className="text-sm text-muted-foreground">
                      {park.type === 'theme-park' ? 'Theme Park' : 'Water Park'}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}