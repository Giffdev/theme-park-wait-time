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
    const loadData = async () => {
      try {
        console.log('🚀 App initializing sample data')
        
        // Wait a bit longer for spark to be fully available
        let attempts = 0
        const maxAttempts = 20
        
        while (attempts < maxAttempts) {
          if (window.spark?.kv) {
            console.log('✅ Spark KV is available after', attempts, 'attempts')
            break
          }
          console.log(`⏳ Attempt ${attempts + 1}: Waiting for Spark KV...`)
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
        }
        
        if (!window.spark?.kv) {
          console.error('❌ Spark KV not available after all attempts')
          setDataInitialized(true) // Still allow app to load
          return
        }
        
        console.log('🔄 Initializing sample data...')
        const success = await initializeSampleData()
        if (!success) {
          console.error('❌ Failed to initialize sample data')
        } else {
          console.log('✅ App sample data initialized successfully')
        }
        
        // CRITICAL: Wait for data to be fully available with retries
        console.log('🔍 Verifying data availability...')
        let verificationAttempts = 0
        const maxVerificationAttempts = 10
        let dataVerified = false
        
        while (verificationAttempts < maxVerificationAttempts && !dataVerified) {
          try {
            const testParks = ['magic-kingdom', 'epcot', 'hollywood-studios', 'universal-studios-orlando', 'islands-of-adventure']
            let verifiedParks = 0
            
            for (const testPark of testParks) {
              const testData = await window.spark.kv.get(`attractions-${testPark}`)
              if (testData && Array.isArray(testData) && testData.length > 0) {
                console.log(`✅ Verified ${testPark}: ${testData.length} attractions`)
                verifiedParks++
              } else {
                console.warn(`⚠️ ${testPark}: No data found`)
              }
            }
            
            if (verifiedParks >= 3) {
              console.log(`✅ Data verification complete: ${verifiedParks}/${testParks.length} parks verified`)
              dataVerified = true
            } else {
              console.log(`⏳ Verification attempt ${verificationAttempts + 1}: Only ${verifiedParks} parks verified, retrying...`)
              await new Promise(resolve => setTimeout(resolve, 200))
            }
          } catch (testError) {
            console.error(`❌ Verification attempt ${verificationAttempts + 1} failed:`, testError)
            await new Promise(resolve => setTimeout(resolve, 200))
          }
          
          verificationAttempts++
        }
        
        if (!dataVerified) {
          console.error('❌ Data verification failed after all attempts')
        }
      } catch (error) {
        console.error('❌ App error loading sample data:', error)
      } finally {
        setDataInitialized(true)
      }
    }
    
    // Start loading immediately
    loadData()
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
              <p className="text-muted-foreground">Initializing park data...</p>
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