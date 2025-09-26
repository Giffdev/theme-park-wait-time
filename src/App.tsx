import { useState, useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { Header } from '@/components/Header'
import { ParkSelector } from '@/components/ParkSelector' 
import { ParkOverview } from '@/components/ParkOverview'
import { LiveWaitTimes } from '@/components/LiveWaitTimes'
import { CrowdCalendar } from '@/components/CrowdCalendar'
import { AuthModal } from '@/components/AuthModal'
import { UserProfile } from '@/components/UserProfile'
import { UserStats } from '@/components/UserStats'
import { RealtimeIndicator } from '@/components/RealtimeIndicator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toaster } from 'sonner'
import { initializeSampleData } from '@/data/sampleData'

export type Park = {
  id: string
  name: string
  location: string
  attractions: Attraction[]
}

export type Attraction = {
  id: string
  name: string
  type: 'thrill' | 'family' | 'show' | 'experience'
  currentWaitTime: number
  status: 'operating' | 'closed' | 'delayed'
  lastUpdated: string
}

export type User = {
  id: string
  username: string
  email: string
  contributionCount: number
  joinDate: string
}

function App() {
  const [selectedPark, setSelectedPark] = useState<string>('universal-orlando')
  const [activeTab, setActiveTab] = useState('live-times')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [currentUser, setCurrentUser] = useKV<User | null>('current-user', null)

  // Initialize sample data on app load and when park changes
  useEffect(() => {
    const loadData = async () => {
      try {
        await initializeSampleData()
        
        // Double-check that data was loaded for the selected park
        const data = await window.spark.kv.get<Attraction[]>(`attractions-${selectedPark}`)
        if (!data || !Array.isArray(data) || data.length === 0) {
          console.warn(`No data found for park ${selectedPark}, reinitializing...`)
          await initializeSampleData()
        }
        console.log(`Verified data for ${selectedPark}:`, data?.length, 'attractions')
      } catch (error) {
        console.error('Error loading sample data:', error)
      }
    }
    
    loadData()
  }, [selectedPark]) // Add selectedPark as dependency

  const handleLogin = (user: User) => {
    setCurrentUser(user)
    setShowAuthModal(false)
  }

  const handleLogout = () => {
    setCurrentUser(null)
  }

  return (
    <div className="min-h-screen bg-background">
      <Header 
        user={currentUser ?? null}
        onLoginClick={() => setShowAuthModal(true)}
        onLogout={handleLogout}
      />
      
      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">
            Smart Theme Park Planning
          </h1>
          <p className="text-lg text-muted-foreground">
            Real-time wait times and crowd insights for your perfect park day
          </p>
        </div>

        <div className="mb-6">
          <ParkSelector 
            selectedPark={selectedPark}
            onParkChange={setSelectedPark}
          />
        </div>

        {/* Park Overview - Shows summary of all parks */}
        <div className="mb-8">
          <ParkOverview onParkSelect={setSelectedPark} />
        </div>

        {/* Realtime Activity Indicator */}
        <div className="mb-6">
          <RealtimeIndicator parkId={selectedPark} />
        </div>

        {/* User Stats - Show only when logged in */}
        {currentUser && (
          <div className="mb-6">
            <UserStats user={currentUser} />
          </div>
        )}

        {/* Selected Park Details */}
        <div className="border-t pt-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">
              Selected Park Details
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
                user={currentUser ?? null}
                onLoginRequired={() => setShowAuthModal(true)}
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

      {showAuthModal && (
        <AuthModal
          onLogin={handleLogin}
          onClose={() => setShowAuthModal(false)}
        />
      )}

      {/* Toast notifications container */}
      <Toaster position="top-right" richColors />
    </div>
  )
}

export default App