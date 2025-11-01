import React, { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Calendar, Plus, Trash, MapPin } from '@phosphor-icons/react'
import { parkFamilies } from '@/data/sampleData'
import { ParkDataService } from '@/services/parkDataService'
import { format, differenceInDays, addDays } from 'date-fns'

export type DayParkSelection = {
  date: string
  parkIds: string[]
}

interface MultiDayTripPickerProps {
  onTripSelected: (days: DayParkSelection[], startDate: Date, endDate: Date) => void
  initialParkId?: string
}

export function MultiDayTripPicker({ onTripSelected, initialParkId }: MultiDayTripPickerProps) {
  const [tripDays, setTripDays] = useState<DayParkSelection[]>([])
  const [currentDayDate, setCurrentDayDate] = useState<Date | undefined>(new Date())
  const [currentDayParks, setCurrentDayParks] = useState<string[]>(initialParkId ? [initialParkId] : [])
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null)
  const [availableParks, setAvailableParks] = useState<string[]>([])
  const [isLoadingAvailableParks, setIsLoadingAvailableParks] = useState(true)

  useEffect(() => {
    try {
      const parks = ParkDataService.getAvailableParks()
      setAvailableParks(parks)
      setIsLoadingAvailableParks(false)
      
      if (initialParkId) {
        const family = parkFamilies.find(f => f.parks.some(p => p.id === initialParkId))
        if (family) {
          setSelectedFamily(family.id)
        }
      }
    } catch (error) {
      console.error('Failed to load available parks:', error)
      setAvailableParks([])
      setIsLoadingAvailableParks(false)
    }
  }, [initialParkId])

  const addDay = useCallback(() => {
    if (!currentDayDate || currentDayParks.length === 0) {
      return
    }

    const dateStr = format(currentDayDate, 'yyyy-MM-dd')
    
    const existingDayIndex = tripDays.findIndex(d => d.date === dateStr)
    
    if (existingDayIndex >= 0) {
      const updatedDays = [...tripDays]
      updatedDays[existingDayIndex] = {
        date: dateStr,
        parkIds: currentDayParks
      }
      setTripDays(updatedDays)
    } else {
      setTripDays([...tripDays, {
        date: dateStr,
        parkIds: currentDayParks
      }])
    }
    
    const nextDate = addDays(currentDayDate, 1)
    setCurrentDayDate(nextDate)
    setCurrentDayParks([])
    setSelectedFamily(null)
  }, [currentDayDate, currentDayParks, tripDays])

  const removeDay = useCallback((dateStr: string) => {
    setTripDays(tripDays.filter(d => d.date !== dateStr))
  }, [tripDays])

  const handleStartTrip = useCallback(() => {
    if (tripDays.length === 0) {
      return
    }

    const sortedDays = [...tripDays].sort((a, b) => a.date.localeCompare(b.date))
    const startDate = new Date(sortedDays[0].date)
    const endDate = new Date(sortedDays[sortedDays.length - 1].date)
    
    onTripSelected(sortedDays, startDate, endDate)
  }, [tripDays, onTripSelected])

  const familiesWithData = parkFamilies.filter(family => 
    family.parks.some(park => availableParks.includes(park.id))
  )

  const selectedFamilyData = selectedFamily ? familiesWithData.find(f => f.id === selectedFamily) : null

  const getParkName = (parkId: string) => {
    const park = parkFamilies
      .flatMap(f => f.parks)
      .find(p => p.id === parkId)
    return park?.shortName || park?.name || parkId
  }

  return (
    <div className="space-y-6">
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
          <Calendar size={18} />
          Multi-Day Trip Planner
        </h3>
        <p className="text-sm text-muted-foreground">
          Plan your trip across multiple days and parks. Add each day separately, selecting which park(s) you visited on that date.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus size={18} />
            Add a Day to Your Trip
          </CardTitle>
          <CardDescription>
            Select the date and park(s) you visited
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Date</Label>
            <div className="mt-1">
              <DatePicker
                date={currentDayDate}
                onDateChange={setCurrentDayDate}
                placeholder="Select visit date"
                disableFutureDates={false}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              You can plan future trips, but can only log rides for today and past dates
            </p>
          </div>

          <div className="space-y-3">
            <Label>Resort Group</Label>
            <Select
              value={selectedFamily || 'none'}
              onValueChange={(value) => setSelectedFamily(value === 'none' ? null : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select resort group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a resort group...</SelectItem>
                {familiesWithData
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((family) => {
                    const familyParksWithData = family.parks.filter(park => availableParks.includes(park.id))
                    return (
                      <SelectItem key={family.id} value={family.id}>
                        {family.name} ({familyParksWithData.length} parks)
                      </SelectItem>
                    )
                  })}
              </SelectContent>
            </Select>
          </div>

          {selectedFamilyData && (
            <div className="space-y-3">
              <Label>Parks Visited This Day</Label>
              <div className="border rounded-lg p-3 space-y-2">
                {selectedFamilyData.parks
                  .filter(park => availableParks.includes(park.id))
                  .map(park => {
                    const isSelected = currentDayParks.includes(park.id)
                    
                    return (
                      <div 
                        key={park.id}
                        className={`flex items-center space-x-3 p-2 rounded-md border transition-colors ${
                          isSelected 
                            ? 'bg-primary/10 border-primary/30' 
                            : 'bg-card hover:bg-muted/50'
                        }`}
                      >
                        <Checkbox
                          id={`current-park-${park.id}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setCurrentDayParks([...currentDayParks, park.id])
                            } else {
                              setCurrentDayParks(currentDayParks.filter(id => id !== park.id))
                            }
                          }}
                        />
                        <Label 
                          htmlFor={`current-park-${park.id}`}
                          className="text-sm font-medium cursor-pointer flex-1"
                        >
                          {park.name}
                        </Label>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          <Button
            onClick={addDay}
            disabled={!currentDayDate || currentDayParks.length === 0}
            variant="secondary"
            className="w-full"
          >
            <Plus size={16} className="mr-2" />
            {tripDays.some(d => d.date === (currentDayDate ? format(currentDayDate, 'yyyy-MM-dd') : '')) 
              ? 'Update This Day' 
              : 'Add This Day to Trip'}
          </Button>
        </CardContent>
      </Card>

      {tripDays.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin size={18} />
              Your Trip Overview
            </CardTitle>
            <CardDescription>
              {tripDays.length} day{tripDays.length !== 1 ? 's' : ''} planned
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...tripDays]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((day) => {
                const date = new Date(day.date)
                return (
                  <div 
                    key={day.date}
                    className="flex items-center justify-between p-3 border rounded-lg bg-card"
                  >
                    <div className="flex-1">
                      <div className="font-medium">
                        {format(date, 'EEEE, MMMM d, yyyy')}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {day.parkIds.map(parkId => (
                          <Badge key={parkId} variant="secondary" className="text-xs">
                            {getParkName(parkId)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeDay(day.date)}
                    >
                      <Trash size={16} />
                    </Button>
                  </div>
                )
              })}

            <Button
              onClick={handleStartTrip}
              className="w-full mt-4"
              size="lg"
            >
              Start Trip Log ({tripDays.length} day{tripDays.length !== 1 ? 's' : ''})
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
