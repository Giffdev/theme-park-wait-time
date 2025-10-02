import { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useKV } from '@github/spark/hooks'
import { Header } from '@/components/Header'
import { AuthModal } from '@/components/AuthModal'
import { FloatingTimerIndicator } from '@/components/FloatingTimerIndicator'
import { HomePage, AboutPage, ParkDetailsPage, AttractionDetailsPage, RideLogPage, MyRideLogsPage, CrowdCalendarPage, ParkSelectorPage } from '@/pages'
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
  const [dataInitialized, setDataInitialized] = useState(false)

  // Initialize sample data on app load
  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    
    const loadData = async () => {
      try {
        console.log('🚀 App initializing sample data')
        
        // Set a maximum 2 second timeout to prevent infinite loading
        timeoutId = setTimeout(() => {
          console.warn('⏰ Timeout reached, allowing app to load anyway')
          setDataInitialized(true)
        }, 2000)
        
        // Quick check for spark availability
        let attempts = 0
        while (attempts < 5 && !window.spark?.kv) {
          await new Promise(resolve => setTimeout(resolve, 50))
          attempts++
        }
        
        if (window.spark?.kv) {
          console.log('✅ Spark KV available')
          const success = await initializeSampleData()
          console.log(success ? '✅ Data initialized' : '⚠️ Data init had issues, continuing anyway')
        } else {
          console.warn('⚠️ Spark KV not ready, continuing without init')
        }
        
        clearTimeout(timeoutId)
        setDataInitialized(true)
        
      } catch (error) {
        console.error('❌ App error during initialization:', error)
        clearTimeout(timeoutId)
        setDataInitialized(true)
      }
    }
    
    loadData()
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  const handleLogin = useCallback((user: User) => {
    setCurrentUser(user)
    setShowAuthModal(false)
  }, [setCurrentUser])

  const handleLogout = useCallback(() => {
    setCurrentUser(null)
  }, [setCurrentUser])

  const handleLoginModalOpen = useCallback(() => {
    setShowAuthModal(true)
  }, [])

  const handleLoginModalClose = useCallback(() => {
    setShowAuthModal(false)
  }, [])

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background">
        <Header 
          user={currentUser ?? null}
          onLoginClick={handleLoginModalOpen}
          onLogout={handleLogout}
        />
        
        {!dataInitialized ? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground">Loading theme park data...</p>
              <p className="text-xs text-muted-foreground">Setting up attractions for Magic Kingdom, EPCOT, and more...</p>
            </div>
          </div>
        ) : (
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/parks" element={<ParkSelectorPage />} />
            <Route path="/calendar" element={<CrowdCalendarPage />} />
            <Route 
              path="/park/:parkId" 
              element={
                <ParkDetailsPage 
                  user={currentUser ?? null}
                  onLoginRequired={handleLoginModalOpen}
                />
              } 
            />
            <Route 
              path="/park/:parkId/attraction/:attractionId" 
              element={
                <AttractionDetailsPage 
                  user={currentUser ?? null}
                  onLoginRequired={handleLoginModalOpen}
                />
              } 
            />
            <Route 
              path="/log" 
              element={
                <RideLogPage 
                  user={currentUser ?? null}
                  onLoginRequired={handleLoginModalOpen}
                />
              } 
            />
            <Route 
              path="/park/:parkId/log" 
              element={
                <RideLogPage 
                  user={currentUser ?? null}
                  onLoginRequired={handleLoginModalOpen}
                />
              } 
            />
            <Route 
              path="/my-logs" 
              element={
                <MyRideLogsPage 
                  user={currentUser ?? null}
                  onLoginRequired={handleLoginModalOpen}
                />
              } 
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}

        {showAuthModal && (
          <AuthModal
            onLogin={handleLogin}
            onClose={handleLoginModalClose}
          />
        )}

        {/* Toast notifications container */}
        <Toaster position="top-right" richColors />

        {/* Floating Timer Indicator */}
        <FloatingTimerIndicator user={currentUser ?? null} />
      </div>
    </BrowserRouter>
  )
}

export default App