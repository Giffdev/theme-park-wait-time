import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { MapPin, CaretDown } from '@phosphor-icons/react'
import { parkFamilies } from '@/data/sampleData'

interface ParkFamilySelectorProps {
  selectedFamily: string
  selectedParks: string[]
  onFamilyChange: (familyId: string) => void
  onParksChange: (parkIds: string[]) => void
}

export function ParkFamilySelector({ selectedFamily, selectedParks, onFamilyChange, onParksChange }: ParkFamilySelectorProps) {
  const [showParkFilter, setShowParkFilter] = useState(false)
  const currentFamily = parkFamilies.find(family => family.id === selectedFamily)
  // Include both theme parks and water parks for crowd calendar
  const allParks = currentFamily?.parks || []

  const handleParkToggle = (parkId: string, checked: boolean) => {
    if (checked) {
      onParksChange([...selectedParks, parkId])
    } else {
      onParksChange(selectedParks.filter(id => id !== parkId))
    }
  }

  const handleSelectAll = () => {
    onParksChange(allParks.map(park => park.id))
  }

  const handleDeselectAll = () => {
    onParksChange([])
  }

  return (
    <div className="space-y-4">
      {/* Family Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground flex items-center gap-2">
          <MapPin size={16} />
          Select Park Family
        </label>
        <Select value={selectedFamily} onValueChange={(newFamily) => {
          onFamilyChange(newFamily)
          // Reset park selection when family changes
          onParksChange([])
        }}>
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

      {/* Park Filter */}
      {allParks.length > 1 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              Filter Parks ({selectedParks.length > 0 ? selectedParks.length : 'All'} selected)
            </label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowParkFilter(!showParkFilter)}
              className="gap-1 text-muted-foreground hover:text-foreground"
            >
              <CaretDown size={16} className={`transition-transform ${showParkFilter ? 'rotate-180' : ''}`} />
              {showParkFilter ? 'Hide' : 'Show'} Filter
            </Button>
          </div>
          
          {showParkFilter && (
            <div className="border rounded-lg p-4 space-y-3 bg-card">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={selectedParks.length === allParks.length}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeselectAll}
                  disabled={selectedParks.length === 0}
                >
                  Deselect All
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {allParks.map((park) => (
                  <div key={park.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={park.id}
                      checked={selectedParks.length === 0 || selectedParks.includes(park.id)}
                      onCheckedChange={(checked) => handleParkToggle(park.id, checked as boolean)}
                    />
                    <label
                      htmlFor={park.id}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                    >
                      {park.name}
                      {park.type === 'water-park' && (
                        <Badge variant="secondary" className="text-xs">
                          Water Park
                        </Badge>
                      )}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}