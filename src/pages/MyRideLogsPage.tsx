import { useState, useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, MapPin, Clock, Star, Users, Ticket, MagnifyingGlass, Funnel } from '@phosphor-icons/react'
import type { User } from '@/App'
import type { ParkVisit, RideLog } from '@/types'
import { parkFamilies } from '@/data/sampleData'

interface MyRideLogsPageProps {
  user: User | null
  onLoginRequired: () => void
}

export function MyRideLogsPage({ user, onLoginRequired }: MyRideLogsPageProps) {
  const [visits, setVisits] = useState<ParkVisit[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPark, setFilterPark] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user) {
      onLoginRequired()
      return
    }

    loadUserVisits()
  }, [user])

  const loadUserVisits = async () => {
    if (!user) return

    setIsLoading(true)
    try {
      const visitIds = await window.spark.kv.get<string[]>(`user-visits-${user.id}`) || []
      const visitPromises = visitIds.map(id => window.spark.kv.get<ParkVisit>(`park-visit-${id}`))
      const visitResults = await Promise.all(visitPromises)
      const validVisits = visitResults.filter(Boolean) as ParkVisit[]
      
      // Sort by visit date descending
      validVisits.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
      setVisits(validVisits)
    } catch (error) {
      console.error('Failed to load user visits:', error)
    }
    setIsLoading(false)
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'thrill': return <Star size={14} />
      case 'family': return <Users size={14} />
      case 'show': return <Clock size={14} />
      default: return <Ticket size={14} />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'thrill': return 'bg-destructive text-destructive-foreground'
      case 'family': return 'bg-success text-success-foreground'
      case 'show': return 'bg-accent text-accent-foreground'
      default: return 'bg-secondary text-secondary-foreground'
    }
  }

  // Filter and search logic
  const filteredVisits = visits.filter(visit => {
    const matchesSearch = searchTerm === '' || 
      visit.parkName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      visit.rideLogs.some(log => 
        log.attractionName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    
    const matchesPark = filterPark === 'all' || visit.parkId === filterPark
    
    const matchesType = filterType === 'all' || 
      visit.rideLogs.some(log => log.attractionType === filterType)

    return matchesSearch && matchesPark && matchesType
  })

  // Get unique parks from visits
  const uniqueParks = Array.from(new Set(visits.map(v => v.parkId)))
    .map(parkId => {
      const visit = visits.find(v => v.parkId === parkId)
      return { id: parkId, name: visit?.parkName || parkId }
    })

  // Calculate stats
  const totalRides = visits.reduce((sum, visit) => 
    sum + visit.rideLogs.reduce((rideSum, log) => rideSum + log.rideCount, 0), 0
  )
  const totalParks = uniqueParks.length
  const totalVisits = visits.length

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>
              You need to be signed in to view your ride logs
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={onLoginRequired}>
              Sign In to Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your ride logs...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Ride Logs</h1>
          <p className="text-muted-foreground">
            Your complete theme park experience history
          </p>
        </div>
        <Button asChild>
          <Link to="/parks">
            <Ticket size={16} className="mr-2" />
            Log New Visit
          </Link>
        </Button>
      </div>

      {visits.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Ticket size={48} className="mx-auto text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No Ride Logs Yet</CardTitle>
            <CardDescription className="mb-4">
              Start logging your theme park visits to build your experience history
            </CardDescription>
            <Button asChild>
              <Link to="/parks">Start Logging Rides</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Ticket size={20} className="text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{totalRides}</p>
                    <p className="text-sm text-muted-foreground">Total Rides</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <MapPin size={20} className="text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{totalParks}</p>
                    <p className="text-sm text-muted-foreground">Parks Visited</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Calendar size={20} className="text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{totalVisits}</p>
                    <p className="text-sm text-muted-foreground">Total Visits</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search and Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <MagnifyingGlass size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search rides, parks, or notes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                <div className="flex gap-2">
                  <Select value={filterPark} onValueChange={setFilterPark}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Parks</SelectItem>
                      {uniqueParks.map(park => (
                        <SelectItem key={park.id} value={park.id}>
                          {park.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="thrill">Thrill</SelectItem>
                      <SelectItem value="family">Family</SelectItem>
                      <SelectItem value="show">Show</SelectItem>
                      <SelectItem value="experience">Experience</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Visit Cards */}
          <div className="space-y-4">
            {filteredVisits.map(visit => (
              <Card key={visit.id} className="overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <MapPin size={20} />
                        {visit.parkName}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {new Date(visit.visitDate).toLocaleDateString()}
                        </span>
                        <span>{visit.rideLogs.length} attractions logged</span>
                        <span>
                          {visit.rideLogs.reduce((sum, log) => sum + log.rideCount, 0)} total rides
                        </span>
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/park/${visit.parkId}/log`}>
                        Add More Rides
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="grid gap-2">
                    {visit.rideLogs
                      .sort((a, b) => b.rideCount - a.rideCount)
                      .map(log => (
                      <div key={log.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          <Badge className={getTypeColor(log.attractionType)} variant="secondary">
                            {getTypeIcon(log.attractionType)}
                          </Badge>
                          <div>
                            <span className="font-medium">{log.attractionName}</span>
                            {log.trackVariant && (
                              <span className="text-sm text-muted-foreground ml-2">
                                ({log.trackVariant})
                              </span>
                            )}
                            {log.notes && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {log.notes}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline">
                          {log.rideCount}x
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredVisits.length === 0 && visits.length > 0 && (
            <Card className="text-center py-8">
              <CardContent>
                <Funnel size={32} className="mx-auto text-muted-foreground mb-4" />
                <CardTitle className="mb-2">No matching visits</CardTitle>
                <CardDescription>
                  Try adjusting your search or filter criteria
                </CardDescription>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}