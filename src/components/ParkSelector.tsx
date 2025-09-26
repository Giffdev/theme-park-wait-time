import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MapPin } from '@phosphor-icons/react'

const parks = [
  {
    id: 'universal-orlando',
    name: 'Universal Studios Orlando',
    location: 'Orlando, FL'
  },
  {
    id: 'islands-of-adventure',
    name: 'Islands of Adventure',
    location: 'Orlando, FL'
  },
  {
    id: 'epic-universe',
    name: 'Epic Universe',
    location: 'Orlando, FL'
  },
  {
    id: 'hollywood-studios',
    name: 'Hollywood Studios',
    location: 'Orlando, FL'
  },
  {
    id: 'animal-kingdom',
    name: 'Animal Kingdom',
    location: 'Orlando, FL'
  },
  {
    id: 'magic-kingdom',
    name: 'Magic Kingdom',
    location: 'Orlando, FL'
  }
]

interface ParkSelectorProps {
  selectedPark: string
  onParkChange: (parkId: string) => void
}

export function ParkSelector({ selectedPark, onParkChange }: ParkSelectorProps) {
  const currentPark = parks.find(park => park.id === selectedPark)

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
                <span className="font-medium">{currentPark.name}</span>
                <span className="text-muted-foreground text-sm ml-2">
                  {currentPark.location}
                </span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {parks.map((park) => (
            <SelectItem key={park.id} value={park.id}>
              <div>
                <div className="font-medium">{park.name}</div>
                <div className="text-sm text-muted-foreground">{park.location}</div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}