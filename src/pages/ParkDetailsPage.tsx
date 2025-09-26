import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useKV } from '@github/spark/hooks'
import { ParkSelector } from '@/components/ParkSelector' 
import { LiveWaitTimes } from '@/components/LiveWaitTimes'
import { CrowdCalendar } from '@/components/CrowdCalendar'
import { UserStats } from '@/components/UserStats'
import { RealtimeIndicator } from '@/components/RealtimeIndicator'
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
  const [selectedPark, setSelectedPark] = useState<string>(parkId || 'universal-orlando')
  const [activeTab, setActiveTab] = useState('live-times')
  const [dataInitialized, setDataInitialized] = useState(false)

  // Update selected park when URL param changes
  useEffect(() => {
    if (parkId) {
      setSelectedPark(parkId)
    }
  }, [parkId])

  // Navigate to new park details when park selector changes
  const handleParkChange = (newParkId: string) => {
    navigate(`/park/${newParkId}`)
  }

  // Initialize sample data on park load
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log(`🚀 Park details initializing data for: ${selectedPark}`)
        
        const success = await initializeSampleData()
        if (!success) {
          console.error('❌ Failed to initialize sample data')
          return
        }
        
        setDataInitialized(true)
        
        // Verify that data was loaded for the selected park
        const data = await window.spark.kv.get<any[]>(`attractions-${selectedPark}`)
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.error(`❌ No data found for park ${selectedPark} even after initialization`)
          await initializeSampleData()
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
          className="gap-2"
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

      {/* Realtime Activity Indicator */}
      <div className="mb-6">
        <RealtimeIndicator parkId={selectedPark} />
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:grid-cols-3">
            <TabsTrigger value="live-times">Live Wait Times</TabsTrigger>
            <TabsTrigger value="crowd-calendar">Crowd Calendar</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="live-times">
            <LiveWaitTimes 
              parkId={selectedPark}
              user={user}
              onLoginRequired={onLoginRequired}
            />
          </TabsContent>

          <TabsContent value="crowd-calendar">
            <CrowdCalendar parkId={selectedPark} />
          </TabsContent>

          <TabsContent value="analytics">
            <div className="rounded-lg border bg-card p-6">
              <h2 className="text-2xl font-semibold mb-4">Historical Analytics</h2>
              <p className="text-muted-foreground">
                Detailed wait time trends and patterns coming soon...
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}