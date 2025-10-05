import React, { useState, useEffect, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useKV } from '@github/spark/hooks'
import { Header } from '@/components/Header'
import { MobileBottomNav } from '@/components/MobileBottomNav'
import { AuthModal } from '@/components/AuthModal'

import { HomePage, AboutPage, ParkDetailsPage, AttractionDetailsPage, CrowdCalendarPage, ParkSelectorPage, RideLogPage, MyRideLogsPage } from '@/pages'
import { Toaster } from 'sonner'
import { ParkDataService } from '@/services/parkDataService'

export type Park = {
  id: string
  name: string
  location: string
  attractions: Attraction[]
}

export type Attraction = {
  id: string
  name: string
  type: 'thrill' | 'family' | 'show' | 'experience' | 'parade' | 'character-meet' | 'dining-experience'
  currentWaitTime: number
  status: 'operating' | 'closed' | 'delayed'
  lastUpdated: string
  availability?: 'active' | 'limited' | 'retired'
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
    let cancelled = false
    
    const loadData = async () => {
      try {
        console.log('🚀 App initializing sample data')
        
        // Set a maximum 5 second timeout to prevent infinite loading
        timeoutId = setTimeout(() => {
          console.warn('⏰ Timeout reached, allowing app to load anyway')
          if (!cancelled) setDataInitialized(true)
        }, 5000)
        
        // Wait for spark to be available with more patience
        let attempts = 0
        while (attempts < 50 && !window.spark?.kv && !cancelled) {
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
        }
        
        if (cancelled) return
        
        if (window.spark?.kv) {
          console.log('✅ Spark KV available')
          const successCount = await ParkDataService.initializeAllParks()
          console.log(successCount > 0 ? '✅ Data initialized successfully' : '⚠️ Data init had issues, continuing anyway')
          
          // Give a small delay to ensure KV operations are fully committed
          await new Promise(resolve => setTimeout(resolve, 200))
        } else {
          console.warn('⚠️ Spark KV not ready after waiting, continuing without init')
        }
        
        if (timeoutId) clearTimeout(timeoutId)
        if (!cancelled) setDataInitialized(true)
        
      } catch (error) {
        console.error('❌ App error during initialization:', error)
        if (timeoutId) clearTimeout(timeoutId)
        if (!cancelled) setDataInitialized(true)
      }
    }
    
    loadData()
    
    return () => {
      cancelled = true
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
          <div className="pb-20 md:pb-0">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/parks" element={<ParkSelectorPage />} />
              <Route path="/calendar" element={<CrowdCalendarPage />} />
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
                path="/log/:parkId" 
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        )}

        {/* Mobile Bottom Navigation */}
        <MobileBottomNav user={currentUser ?? null} />

        {showAuthModal && (
          <AuthModal
            onLogin={handleLogin}
            onClose={handleLoginModalClose}
          />
        )}

        {/* Toast notifications container */}
        <Toaster position="top-right" richColors />
      </div>
    </BrowserRouter>
  )
}

export default App