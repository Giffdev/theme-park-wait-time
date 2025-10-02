import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { SignOut, User as UserIcon, List, X } from '@phosphor-icons/react'
import { Link, useLocation } from 'react-router-dom'
import type { User } from '@/App'

// ParkFlow Icon - Crystal ball with theme park elements
function ParkFlowIcon({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Crystal ball base */}
      <ellipse 
        cx="12" 
        cy="19" 
        rx="6" 
        ry="2" 
        fill="currentColor" 
        opacity="0.2"
      />
      
      {/* Crystal ball */}
      <circle 
        cx="12" 
        cy="12" 
        r="8" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        fill="none"
      />
      
      {/* Inner reflection highlight */}
      <circle 
        cx="10" 
        cy="8" 
        r="2" 
        fill="currentColor" 
        opacity="0.3"
      />
      
      {/* Miniature roller coaster inside the crystal ball */}
      <path 
        d="M8 14c1-2 2-2 3 0s2 2 3 0" 
        stroke="currentColor" 
        strokeWidth="1.2" 
        fill="none"
        strokeLinecap="round"
      />
      
      {/* Support pillars for mini coaster */}
      <path 
        d="M9 12v2M12 10v4M15 12v2" 
        stroke="currentColor" 
        strokeWidth="1" 
        strokeLinecap="round"
        opacity="0.7"
      />
      
      {/* Forecast trend lines around the crystal ball */}
      <path 
        d="M3 8l2 1M5 5l1 2M19 8l2-1M19 5l1 2" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
        opacity="0.6"
      />
      
      {/* Data points/sparkles */}
      <circle cx="6" cy="10" r="0.8" fill="currentColor" opacity="0.5" />
      <circle cx="18" cy="10" r="0.8" fill="currentColor" opacity="0.5" />
      <circle cx="4" cy="16" r="0.8" fill="currentColor" opacity="0.5" />
      <circle cx="20" cy="16" r="0.8" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

interface HeaderProps {
  user: User | null
  onLoginClick: () => void
  onLogout: () => void
}

export function Header({ user, onLoginClick, onLogout }: HeaderProps) {
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  
  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true
    if (path !== '/' && location.pathname.startsWith(path)) return true
    return false
  }

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
  }

  return (
    <header className="border-b bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4 max-w-7xl">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity" onClick={closeMobileMenu}>
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <ParkFlowIcon size={18} className="text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">ParkFlow</span>
          </Link>
          
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link 
              to="/" 
              className={`text-sm font-medium transition-colors hover:text-foreground ${
                isActive('/') ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              Home
            </Link>
            <Link 
              to="/calendar" 
              className={`text-sm font-medium transition-colors hover:text-foreground ${
                isActive('/calendar') ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              Calendar
            </Link>
            <Link 
              to="/about" 
              className={`text-sm font-medium transition-colors hover:text-foreground ${
                isActive('/about') ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              About
            </Link>
          </nav>

          <div className="flex items-center space-x-4">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleMobileMenu}
              className="md:hidden text-muted-foreground hover:text-foreground"
            >
              {isMobileMenuOpen ? <X size={20} /> : <List size={20} />}
            </Button>

            {/* User actions */}
            {user ? (
              <div className="flex items-center space-x-3">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-foreground">{user.username}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLogout}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <SignOut size={16} />
                </Button>
              </div>
            ) : (
              <Button 
                onClick={onLoginClick} 
                className="bg-primary hover:bg-primary/90 text-primary-foreground hover:text-primary-foreground"
              >
                <UserIcon size={16} className="mr-2" />
                Sign In
              </Button>
            )}
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-border">
            <nav className="flex flex-col space-y-3">
              <Link 
                to="/" 
                onClick={closeMobileMenu}
                className={`text-sm font-medium transition-colors hover:text-foreground px-2 py-1 ${
                  isActive('/') ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                Home
              </Link>
              <Link 
                to="/calendar" 
                onClick={closeMobileMenu}
                className={`text-sm font-medium transition-colors hover:text-foreground px-2 py-1 ${
                  isActive('/calendar') ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                Calendar
              </Link>
              <Link 
                to="/about" 
                onClick={closeMobileMenu}
                className={`text-sm font-medium transition-colors hover:text-foreground px-2 py-1 ${
                  isActive('/about') ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                About
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}