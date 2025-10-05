import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { MapPin, Users, Calendar, Funnel, NotePencil, ChartLine } from '@phosphor-icons/react'
import { parkFamilies } from '@/data/sampleData'
import { getTodaysBusyLevel } from '@/utils/busyLevel'

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

      {/* Quick Actions Section */}
      <div className="mb-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Log Trip Action */}
          <Card className="border-2 border-primary/20 hover:border-primary/40 transition-all duration-300 group">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center group-hover:bg-accent/30 transition-colors">
                  <NotePencil size={20} className="text-accent" />
                </div>
                <CardTitle className="text-lg">Log Your Trip</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground mb-4">
                Track wait times, rate attractions, and help the community with real-time insights
              </p>
              <Button 
                onClick={() => navigate('/log')} 
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              >
                Start Logging
              </Button>
            </CardContent>
          </Card>

          {/* View Predictions Action */}
          <Card className="hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <ChartLine size={20} className="text-primary" />
                </div>
                <CardTitle className="text-lg">View Predictions</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground mb-4">
                See crowd forecasts and plan your perfect park day with our calendar
              </p>
              <Button 
                variant="outline" 
                onClick={() => navigate('/calendar')} 
                className="w-full"
              >
                View Calendar
              </Button>
            </CardContent>
          </Card>

          {/* Browse Parks Action */}
          <Card className="hover:shadow-md transition-all duration-300 md:col-span-2 lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center">
                  <MapPin size={20} className="text-secondary" />
                </div>
                <CardTitle className="text-lg">Explore Parks</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground mb-4">
                Browse all theme parks and check current wait times for attractions
              </p>
              <Button 
                variant="outline" 
                onClick={() => navigate('/parks')} 
                className="w-full"
              >
                Browse Parks
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="mb-8 bg-card border rounded-lg p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center space-y-3 md:space-y-0 md:space-x-6">
          <div className="flex items-center space-x-4">
            <Funnel size={20} className="text-muted-foreground" />
            <h3 className="text-sm md:text-lg font-semibold text-foreground">Filter by park group</h3>
          </div>
          <div className="w-full md:w-80">
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
                {[...parkFamilies]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((family) => (
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
                        <div className="flex items-center gap-2 mt-2">
                          <Badge 
                            variant={park.type === 'theme-park' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {park.type === 'theme-park' ? 'Theme Park' : 'Water Park'}
                          </Badge>
                          {(() => {
                            const busyLevel = getTodaysBusyLevel(park.id)
                            console.log(`${park.name} busy level:`, busyLevel) // Debug logging
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge 
                                    className={`text-xs ${busyLevel.colorClass} cursor-help`}
                                    variant="secondary"
                                  >
                                    {busyLevel.label}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Estimated crowd level for today</p>
                                </TooltipContent>
                              </Tooltip>
                            )
                          })()}
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
                        className="w-full"
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
    </main>
  )
}