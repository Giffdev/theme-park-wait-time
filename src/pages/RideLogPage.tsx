import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useKV } from '@github/spark/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, Plus, Minus, Calendar, Clock, Star, Ticket, Users } from '@phosphor-icons/react'
import { toast } from 'sonner'
import type { User } from '@/App'
import type { RideLog, ParkVisit, ExtendedAttraction } from '@/types'
import { parkFamilies } from '@/data/sampleData'

interface RideLogPageProps {
  user: User | null
  onLoginRequired: () => void
}

export function RideLogPage({ user, onLoginRequired }: RideLogPageProps) {
  const { parkId } = useParams()
  const navigate = useNavigate()
  const [attractions, setAttractions] = useState<ExtendedAttraction[]>([])
  const [currentVisit, setCurrentVisit] = useKV<ParkVisit | null>(`current-visit-${user?.id}`, null)
  const [rideCounts, setRideCounts] = useState<Record<string, number>>({})
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0])
  const [isLoading, setIsLoading] = useState(true)

  const parkInfo = parkFamilies
    .flatMap(family => family.parks.map(park => ({ ...park, familyId: family.id, familyName: family.name })))
    .find(park => park.id === parkId)

  useEffect(() => {
    if (!user) {
      onLoginRequired()
      return
    }

    loadAttractions()
  }, [user, parkId])

  const loadAttractions = async () => {
    if (!parkId) return

    setIsLoading(true)
    try {
      const attractionData = await window.spark.kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
      if (attractionData) {
        setAttractions(attractionData)
      }
    } catch (error) {
      console.error('Failed to load attractions:', error)
      toast.error('Failed to load park attractions')
    }
    setIsLoading(false)
  }

  const updateRideCount = (attractionId: string, change: number) => {
    setRideCounts(prev => ({
      ...prev,
      [attractionId]: Math.max(0, (prev[attractionId] || 0) + change)
    }))
  }

  const startNewVisit = async () => {
    if (!user || !parkId || !parkInfo) return

    const newVisit: ParkVisit = {
      id: `visit-${user.id}-${parkId}-${Date.now()}`,
      userId: user.id,
      parkId,
      parkName: parkInfo.name,
      visitDate,
      rideLogs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    setCurrentVisit(newVisit)
    toast.success(`Started logging for ${parkInfo.name}!`)
  }

  const saveRideLogs = async () => {
    if (!user || !currentVisit) return

    const logsToSave: RideLog[] = []

    Object.entries(rideCounts).forEach(([attractionId, count]) => {
      if (count > 0) {
        const attraction = attractions.find(a => a.id === attractionId)
        if (attraction) {
          const rideLog: RideLog = {
            id: `log-${user.id}-${attractionId}-${Date.now()}`,
            userId: user.id,
            parkId: currentVisit.parkId,
            attractionId,
            attractionName: attraction.name,
            attractionType: attraction.type,
            rideCount: count,
            trackVariant: selectedVariants[attractionId],
            loggedAt: new Date().toISOString(),
            visitDate: currentVisit.visitDate,
            notes: notes[attractionId]
          }
          logsToSave.push(rideLog)
        }
      }
    })

    if (logsToSave.length === 0) {
      toast.error('Add some rides before saving!')
      return
    }

    const updatedVisit: ParkVisit = {
      ...currentVisit,
      rideLogs: logsToSave,
      updatedAt: new Date().toISOString()
    }

    try {
      // Save the visit
      await window.spark.kv.set(`park-visit-${updatedVisit.id}`, updatedVisit)
      
      // Update user's visit history
      const userVisits = await window.spark.kv.get<string[]>(`user-visits-${user.id}`) || []
      if (!userVisits.includes(updatedVisit.id)) {
        userVisits.push(updatedVisit.id)
        await window.spark.kv.set(`user-visits-${user.id}`, userVisits)
      }

      setCurrentVisit(null)
      setRideCounts({})
      setSelectedVariants({})
      setNotes({})
      
      toast.success(`Saved ${logsToSave.length} ride logs!`)
      navigate('/my-logs')
    } catch (error) {
      console.error('Failed to save ride logs:', error)
      toast.error('Failed to save your ride logs')
    }
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Sign In Required</CardTitle>
            <CardDescription>
              You need to be signed in to log your rides
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
          <p className="text-muted-foreground">Loading park attractions...</p>
        </div>
      </div>
    )
  }

  const activeAttractions = attractions.filter(a => !a.isDefunct)
  const defunctAttractions = attractions.filter(a => a.isDefunct)
  const seasonalAttractions = activeAttractions.filter(a => a.isSeasonal)
  const regularAttractions = activeAttractions.filter(a => !a.isSeasonal)

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button 
          variant="ghost" 
          size="sm" 
          asChild
          className="hover:bg-muted"
        >
          <Link to={`/park/${parkId}`}>
            <ArrowLeft size={16} className="mr-2" />
            Back to Park
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Log Your Rides</h1>
          <p className="text-muted-foreground">
            Track your park experience at {parkInfo?.name}
          </p>
        </div>
      </div>

      {!currentVisit ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar size={20} />
              Start Your Visit Log
            </CardTitle>
            <CardDescription>
              Begin tracking your rides and experiences for today
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="visit-date">Visit Date</Label>
              <Input
                id="visit-date"
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>
            <Button onClick={startNewVisit} className="w-full">
              Start Logging Rides
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Ticket size={20} />
                  Current Visit - {new Date(currentVisit.visitDate).toLocaleDateString()}
                </span>
                <Badge variant="secondary">
                  {Object.values(rideCounts).reduce((sum, count) => sum + count, 0)} rides logged
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button onClick={saveRideLogs} disabled={Object.values(rideCounts).every(count => count === 0)}>
                  Save Visit Log
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setCurrentVisit(null)
                    setRideCounts({})
                    setSelectedVariants({})
                    setNotes({})
                  }}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="regular" className="space-y-4">
            <TabsList>
              <TabsTrigger value="regular">Active Attractions</TabsTrigger>
              {seasonalAttractions.length > 0 && (
                <TabsTrigger value="seasonal">Seasonal</TabsTrigger>
              )}
              {defunctAttractions.length > 0 && (
                <TabsTrigger value="defunct">Defunct/Historical</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="regular" className="space-y-4">
              {regularAttractions.map(attraction => (
                <RideLogCard
                  key={attraction.id}
                  attraction={attraction}
                  count={rideCounts[attraction.id] || 0}
                  selectedVariant={selectedVariants[attraction.id]}
                  notes={notes[attraction.id] || ''}
                  onCountChange={(change) => updateRideCount(attraction.id, change)}
                  onVariantChange={(variant) => setSelectedVariants(prev => ({ ...prev, [attraction.id]: variant }))}
                  onNotesChange={(note) => setNotes(prev => ({ ...prev, [attraction.id]: note }))}
                />
              ))}
            </TabsContent>

            {seasonalAttractions.length > 0 && (
              <TabsContent value="seasonal" className="space-y-4">
                {seasonalAttractions.map(attraction => (
                  <RideLogCard
                    key={attraction.id}
                    attraction={attraction}
                    count={rideCounts[attraction.id] || 0}
                    selectedVariant={selectedVariants[attraction.id]}
                    notes={notes[attraction.id] || ''}
                    onCountChange={(change) => updateRideCount(attraction.id, change)}
                    onVariantChange={(variant) => setSelectedVariants(prev => ({ ...prev, [attraction.id]: variant }))}
                    onNotesChange={(note) => setNotes(prev => ({ ...prev, [attraction.id]: note }))}
                  />
                ))}
              </TabsContent>
            )}

            {defunctAttractions.length > 0 && (
              <TabsContent value="defunct" className="space-y-4">
                <div className="text-sm text-muted-foreground mb-4">
                  These attractions are no longer operating but can still be logged for historical visits
                </div>
                {defunctAttractions.map(attraction => (
                  <RideLogCard
                    key={attraction.id}
                    attraction={attraction}
                    count={rideCounts[attraction.id] || 0}
                    selectedVariant={selectedVariants[attraction.id]}
                    notes={notes[attraction.id] || ''}
                    onCountChange={(change) => updateRideCount(attraction.id, change)}
                    onVariantChange={(variant) => setSelectedVariants(prev => ({ ...prev, [attraction.id]: variant }))}
                    onNotesChange={(note) => setNotes(prev => ({ ...prev, [attraction.id]: note }))}
                    isDefunct
                  />
                ))}
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}
    </div>
  )
}

interface RideLogCardProps {
  attraction: ExtendedAttraction
  count: number
  selectedVariant?: string
  notes: string
  onCountChange: (change: number) => void
  onVariantChange: (variant: string) => void
  onNotesChange: (notes: string) => void
  isDefunct?: boolean
}

function RideLogCard({ 
  attraction, 
  count, 
  selectedVariant, 
  notes, 
  onCountChange, 
  onVariantChange, 
  onNotesChange,
  isDefunct = false 
}: RideLogCardProps) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'thrill': return <Star size={16} />
      case 'family': return <Users size={16} />
      case 'show': return <Clock size={16} />
      default: return <Ticket size={16} />
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

  return (
    <Card className={`transition-all ${count > 0 ? 'ring-2 ring-primary' : ''} ${isDefunct ? 'opacity-75' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Badge className={getTypeColor(attraction.type)} variant="secondary">
              {getTypeIcon(attraction.type)}
              <span className="ml-1 capitalize">{attraction.type}</span>
            </Badge>
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                {attraction.name}
                {attraction.isSeasonal && (
                  <Badge variant="outline" className="text-xs">
                    {attraction.seasonalPeriod || 'Seasonal'}
                  </Badge>
                )}
                {isDefunct && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Defunct
                  </Badge>
                )}
              </h3>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCountChange(-1)}
              disabled={count === 0}
            >
              <Minus size={16} />
            </Button>
            <span className="w-8 text-center font-semibold">{count}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCountChange(1)}
            >
              <Plus size={16} />
            </Button>
          </div>
        </div>

        {attraction.variants && attraction.variants.length > 0 && (
          <div className="mb-3">
            <Label htmlFor={`variant-${attraction.id}`} className="text-sm">Track/Variant</Label>
            <Select value={selectedVariant || ''} onValueChange={onVariantChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select track/variant" />
              </SelectTrigger>
              <SelectContent>
                {attraction.variants.map(variant => (
                  <SelectItem key={variant.id} value={variant.id}>
                    {variant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {count > 0 && (
          <div>
            <Label htmlFor={`notes-${attraction.id}`} className="text-sm">Notes (optional)</Label>
            <Textarea
              id={`notes-${attraction.id}`}
              placeholder="Add any notes about your experience..."
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              className="mt-1"
              rows={2}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}