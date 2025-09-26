import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MapPin } from '@phosphor-icons/react'
import { parkFamilies } from '@/data/sampleData'

interface ParkFamilySelectorProps {
  selectedFamily: string
  onFamilyChange: (familyId: string) => void
}

export function ParkFamilySelector({ selectedFamily, onFamilyChange }: ParkFamilySelectorProps) {
  const currentFamily = parkFamilies.find(family => family.id === selectedFamily)

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground flex items-center gap-2">
        <MapPin size={16} />
        Select Park Family
      </label>
      <Select value={selectedFamily} onValueChange={onFamilyChange}>
        <SelectTrigger className="w-full max-w-sm">
          <SelectValue placeholder="Choose a park family">
            {currentFamily && (
              <div>
                <span className="font-medium">{currentFamily.name}</span>
                <span className="text-muted-foreground text-sm ml-2">
                  {currentFamily.location}
                </span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {parkFamilies.map((family) => (
            <SelectItem key={family.id} value={family.id}>
              <div>
                <div className="font-medium">{family.name}</div>
                <div className="text-sm text-muted-foreground">
                  {family.location} • {family.parks.length} park{family.parks.length !== 1 ? 's' : ''}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}