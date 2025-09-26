import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useKV } from '@github/spark/hooks'
import { ParkSelector } from '@/components/ParkSelector' 
import { LiveWaitTimes } from '@/components/LiveWaitTimes'
import { ParkDetailsOverview } from '@/components/ParkOverview'
import { CrowdCalendar } from '@/components/CrowdCalendar'
import { UserStats } from '@/components/UserStats'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { CaretLeft } from '@phosphor-icons/react'
import { initializeSampleData } from '@/data/sampleData'
import type { User } from '@/App'

interface ParkDetailsPageProps {
  user: User | null
  onLoginRequired: () => void
}

export function ParkDetailsPage({ user, onLoginRequired }: ParkDetailsPageProps) {
  const { parkId } = useParams<{ parkId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedPark, setSelectedPark] = useState<string>(parkId || 'magic-kingdom')
  const [activeTab, setActiveTab] = useState('overview')
  const [targetRide, setTargetRide] = useState<string | null>(null)
  const [dataInitialized, setDataInitialized] = useState(false)

  // Update selected park when URL param changes
  useEffect(() => {
    if (parkId) {
      setSelectedPark(parkId)
    }
  }, [parkId])

  // Handle ride navigation via URL parameters
  useEffect(() => {
    const rideParam = searchParams.get('ride')
    if (rideParam) {
      setTargetRide(rideParam)
      setActiveTab('live-times')
    }
  }, [searchParams])

  // Navigate to new park details when park selector changes
  const handleParkChange = (newParkId: string) => {
    navigate(`/park/${newParkId}`)
  }

  // Handle ride selection from overview
  const handleRideSelect = (rideId: string) => {
    // Navigate to the detailed attraction trends page
    navigate(`/park/${selectedPark}/attraction/${rideId}`)
  }

  // Initialize sample data on park load
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log(`🚀 Park details initializing data for: ${selectedPark}`)
        
        // Ensure spark is available
        if (!window.spark?.kv) {
          console.error('❌ Spark KV not available in ParkDetailsPage')
          return
        }
        
        const success = await initializeSampleData()
        if (!success) {
          console.error('❌ Failed to initialize sample data')
          return
        }
        
        setDataInitialized(true)
        
        // Verify that data was loaded for the selected park with retry
        let retries = 3
        let data: any[] | undefined = undefined
        
        while (retries > 0 && (!data || !Array.isArray(data) || data.length === 0)) {
          await new Promise(resolve => setTimeout(resolve, 100))
          data = await window.spark.kv.get<any[]>(`attractions-${selectedPark}`)
          retries--
        }
        
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.error(`❌ No data found for park ${selectedPark} even after initialization with retries`)
        } else {
          console.log(`✅ Park details verified data for ${selectedPark}: ${data.length} attractions`)
        }
      } catch (error) {
        console.error('❌ Park details error loading sample data:', error)
      }
    }
    
    loadData()
  }, [selectedPark])

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Back to Home Button */}
      <div className="mb-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/')}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <CaretLeft size={16} />
          Back to Home
        </Button>
      </div>

      {/* Park Selector */}
      <div className="mb-6">
        <ParkSelector 
          selectedPark={selectedPark}
          onParkChange={handleParkChange}
        />
      </div>

      {/* Log Rides Button */}
      <div className="mb-6 flex justify-center">
        {user ? (
          <Button asChild className="bg-accent hover:bg-accent/90 text-accent-foreground">
            <Link to={`/park/${selectedPark}/log`}>
              🎢 Log Your Rides Today
            </Link>
          </Button>
        ) : (
          <Button 
            onClick={onLoginRequired}
            className="bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            🎢 Sign In to Log Rides
          </Button>
        )}
      </div>


      {/* User Stats - Show only when logged in */}
      {user && (
        <div className="mb-6">
          <UserStats user={user} />
        </div>
      )}

      {/* Park Details */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold text-foreground">
            Park Details
          </h2>
          <p className="text-muted-foreground">
            Detailed insights for your selected park
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(newTab) => {
          setActiveTab(newTab)
          // Clear ride parameter when leaving live-times tab
          if (newTab !== 'live-times' && searchParams.has('ride')) {
            setSearchParams({})
          }
        }} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="live-times">Live Times</TabsTrigger>
            <TabsTrigger value="crowd-calendar">Crowd Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <ParkDetailsOverview 
              parkId={selectedPark} 
              onRideSelect={handleRideSelect}
            />
          </TabsContent>

          <TabsContent value="live-times">
            <LiveWaitTimes 
              parkId={selectedPark}
              user={user}
              onLoginRequired={onLoginRequired}
              targetRide={targetRide}
              onRideViewed={() => setTargetRide(null)}
            />
          </TabsContent>

          <TabsContent value="crowd-calendar">
            <CrowdCalendar parkId={selectedPark} />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}