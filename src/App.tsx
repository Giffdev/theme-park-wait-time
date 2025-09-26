import { useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { Header } from '@/components/Header'
import { ParkSelector } from '@/components/ParkSelector' 
import { LiveWaitTimes } from '@/components/LiveWaitTimes'
import { CrowdCalendar } from '@/components/CrowdCalendar'
import { AuthModal } from '@/components/AuthModal'
import { UserProfile } from '@/components/UserProfile'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

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
      </main>

      {showAuthModal && (
        <AuthModal
          onLogin={handleLogin}
          onClose={() => setShowAuthModal(false)}
        />
      )}
    </div>
  )
}

export default App