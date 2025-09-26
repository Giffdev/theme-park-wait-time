import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useKV } from '@github/spark/hooks'
import { Header } from '@/components/Header'
import { AuthModal } from '@/components/AuthModal'
import { HomePage, ParkDetailsPage, ParkSelectorPage } from '@/pages'
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
        const success = await initializeSampleData()
        if (!success) {
          console.error('❌ Failed to initialize sample data')
        } else {
          console.log('✅ App sample data initialized successfully')
        }
      } catch (error) {
        console.error('❌ App error loading sample data:', error)
      }
    }
    
    loadData()
  }, [])

  const handleLogin = (user: User) => {
    setCurrentUser(user)
    setShowAuthModal(false)
  }

  const handleLogout = () => {
    setCurrentUser(null)
  }

  return (
    <Router>
      <div className="min-h-screen bg-background">
        <Header 
          user={currentUser ?? null}
          onLoginClick={() => setShowAuthModal(true)}
          onLogout={handleLogout}
        />
        
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/parks" element={<ParkSelectorPage />} />
          <Route 
            path="/park/:parkId" 
            element={
              <ParkDetailsPage 
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
    </Router>
  )
}

export default App