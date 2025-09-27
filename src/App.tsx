import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useKV } from '@github/spark/hooks'
import { Header } from '@/components/Header'
import { AuthModal } from '@/components/AuthModal'
import { HomePage, ParkDetailsPage, AttractionDetailsPage, RideLogPage, MyRideLogsPage, CrowdCalendarPage } from '@/pages'
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
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [currentUser, setCurrentUser] = useKV<User | null>('current-user', null)

  // Initialize sample data on app load
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('🚀 App initializing sample data')
        
        // Check if spark is available first
        if (!window.spark) {
          console.error('❌ Spark global object not available')
          return
        }
        
        if (!window.spark.kv) {
          console.error('❌ Spark KV not available')
          return
        }
        
        console.log('✅ Spark KV is available, proceeding with data initialization')
        
        const success = await initializeSampleData()
        if (!success) {
          console.error('❌ Failed to initialize sample data')
        } else {
          console.log('✅ App sample data initialized successfully')
          
          // Quick verification that data is accessible
          try {
            const testPark = 'universal-studios-orlando'
            const testData = await window.spark.kv.get(`attractions-${testPark}`)
            console.log(`🔍 Test verification for ${testPark}:`, testData ? 'Data found' : 'No data')
          } catch (testError) {
            console.error('❌ Test verification failed:', testError)
          }
        }
      } catch (error) {
        console.error('❌ App error loading sample data:', error)
      }
    }
    
    // Add a small delay to ensure the spark runtime is fully loaded
    const timer = setTimeout(loadData, 100)
    return () => clearTimeout(timer)
  }, [])

  const handleLogin = (user: User) => {
    setCurrentUser(user)
    setShowAuthModal(false)
  }

  const handleLogout = () => {
    setCurrentUser(null)
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background">
        <Header 
          user={currentUser ?? null}
          onLoginClick={() => setShowAuthModal(true)}
          onLogout={handleLogout}
        />
        
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/calendar" element={<CrowdCalendarPage />} />
          <Route 
            path="/park/:parkId" 
            element={
              <ParkDetailsPage 
                user={currentUser ?? null}
                onLoginRequired={() => setShowAuthModal(true)}
              />
            } 
          />
          <Route 
            path="/park/:parkId/attraction/:attractionId" 
            element={<AttractionDetailsPage />} 
          />
          <Route 
            path="/park/:parkId/log" 
            element={
              <RideLogPage 
                user={currentUser ?? null}
                onLoginRequired={() => setShowAuthModal(true)}
              />
            } 
          />
          <Route 
            path="/my-logs" 
            element={
              <MyRideLogsPage 
                user={currentUser ?? null}
                onLoginRequired={() => setShowAuthModal(true)}
              />
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {showAuthModal && (
          <AuthModal
            onLogin={handleLogin}
            onClose={() => setShowAuthModal(false)}
          />
        )}

        {/* Toast notifications container */}
        <Toaster position="top-right" richColors />
      </div>
    </BrowserRouter>
  )
}

export default App