import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MapPin, Users, Calendar, Funnel } from '@phosphor-icons/react'
import { parkFamilies } from '@/data/sampleData'

export function HomePage() {
  const navigate = useNavigate()
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null)

  const handleParkSelect = (parkId: string, tab?: string) => {
    if (tab) {
      navigate(`/park/${parkId}?tab=${tab}`)
    } else {
      navigate(`/park/${parkId}`)
    }
  }

  const handleFeatureClick = (parkId: string, feature: 'live-times' | 'crowd-calendar', e: React.MouseEvent) => {
    e.stopPropagation()
    handleParkSelect(parkId, feature)
  }

  const filteredFamilies = selectedFamily 
    ? parkFamilies.filter(family => family.id === selectedFamily)
    : parkFamilies

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8 text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground mb-2">
          Smart Theme Park Planning
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Real-time wait times and crowd insights for your perfect park day across major theme park destinations
        </p>
      </div>

      {/* Filter Controls */}
      <div className="mb-8 bg-card border rounded-lg p-6">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-4">
            <Funnel size={20} className="text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground">Filter by Resort Group</h3>
          </div>
          <div className="w-80">
            <Select
              value={selectedFamily || 'all'}
              onValueChange={(value) => setSelectedFamily(value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-full h-11">
                <SelectValue placeholder="Select a resort group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  All Parks ({parkFamilies.length} groups)
                </SelectItem>
                {parkFamilies.map((family) => (
                  <SelectItem key={family.id} value={family.id}>
                    {family.name} ({family.parks.length} parks)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-10">
        {filteredFamilies.map((family) => (
          <div key={family.id} className="space-y-6">
            {/* Family Header */}
            <div className="border-b-2 border-primary/20 pb-4">
              <h2 className="text-3xl font-bold text-foreground mb-2">
                {family.name}
              </h2>
              <div className="flex items-center text-muted-foreground mb-2">
                <MapPin size={18} className="mr-2" />
                <span className="text-lg">{family.location}</span>
              </div>
              <p className="text-muted-foreground">
                {family.description}
              </p>
            </div>

            {/* Parks Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {family.parks.map((park) => (
                <Card 
                  key={park.id}
                  className="hover:shadow-lg transition-all duration-300 cursor-pointer group"
                  onClick={() => handleParkSelect(park.id)}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-xl font-semibold group-hover:text-primary transition-colors">
                          {park.name}
                        </CardTitle>
                        <div className="flex items-center mt-2">
                          <Badge 
                            variant={park.type === 'theme-park' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {park.type === 'theme-park' ? 'Theme Park' : 'Water Park'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      {/* Park Features */}
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <button 
                          className="flex items-center hover:text-primary transition-colors cursor-pointer"
                          onClick={(e) => handleFeatureClick(park.id, 'live-times', e)}
                        >
                          <Users size={14} className="mr-2" />
                          <span>Live Wait Times</span>
                        </button>
                        <button 
                          className="flex items-center hover:text-primary transition-colors cursor-pointer"
                          onClick={(e) => handleFeatureClick(park.id, 'crowd-calendar', e)}
                        >
                          <Calendar size={14} className="mr-2" />
                          <span>Crowd Calendar</span>
                        </button>
                      </div>

                      {/* Action Button */}
                      <Button 
                        className="w-full group-hover:bg-primary group-hover:text-primary-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleParkSelect(park.id)
                        }}
                      >
                        View {park.shortName}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="mt-12 bg-muted/50 rounded-lg p-6">
        <div className="text-center space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Coverage Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {parkFamilies.length}
              </div>
              <div className="text-sm text-muted-foreground">Resort Groups</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {parkFamilies.reduce((total, family) => total + family.parks.length, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Total Parks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {parkFamilies.reduce((total, family) => 
                  total + family.parks.filter(p => p.type === 'theme-park').length, 0
                )}
              </div>
              <div className="text-sm text-muted-foreground">Theme Parks</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {parkFamilies.reduce((total, family) => 
                  total + family.parks.filter(p => p.type === 'water-park').length, 0
                )}
              </div>
              <div className="text-sm text-muted-foreground">Water Parks</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}