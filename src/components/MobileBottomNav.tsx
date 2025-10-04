import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { House, Calendar, Suitcase, Info } from '@phosphor-icons/react'
import type { User } from '@/App'

// ParkFlow Icon - Crystal ball with theme park elements (simplified for small size)
function ParkFlowIcon({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg 
      width={size} 
      height={size}
      viewBox="0 0 24 24" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Crystal ball */}
      <circle 
        cx="12" 
        cy="12" 
        r="9" 
        fill="none"
        stroke="currentColor" 
        strokeWidth="1.2" 
      />
      
      {/* Miniature castle inside the crystal ball */}
      <circle 
        cx="12" 
        cy="8" 
        r="2" 
        fill="currentColor" 
      />
      
      {/* Miniature roller coaster inside the crystal ball */}
      <path 
        d="M8 14c1-2 2-2 3 0s2 2 3 0" 
        stroke="currentColor" 
        strokeWidth="1.2" 
        fill="none"
      />
    </svg>
  )
}

interface MobileBottomNavProps {
  user: User | null
}

export function MobileBottomNav({ user }: MobileBottomNavProps) {
  const location = useLocation()
  
  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true
    if (path !== '/' && location.pathname.startsWith(path)) return true
    return false
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border z-50 md:hidden safe-area-inset-bottom">
      <div className="flex items-center justify-around py-2 px-4 max-w-sm mx-auto">
        {/* Home */}
        <Link 
          to="/" 
          className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
            isActive('/') 
              ? 'text-primary bg-primary/10' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ParkFlowIcon size={22} />
          <span className="text-xs mt-1 font-medium">Home</span>
        </Link>

        {/* Calendar */}
        <Link 
          to="/calendar" 
          className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
            isActive('/calendar') 
              ? 'text-primary bg-primary/10' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Calendar size={22} />
          <span className="text-xs mt-1 font-medium">Calendar</span>
        </Link>

        {/* My Trips - only show if user is logged in */}
        {user && (
          <Link 
            to="/my-logs" 
            className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
              isActive('/my-logs') 
                ? 'text-primary bg-primary/10' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Suitcase size={22} />
            <span className="text-xs mt-1 font-medium">My Trips</span>
          </Link>
        )}

        {/* About */}
        <Link 
          to="/about" 
          className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
            isActive('/about') 
              ? 'text-primary bg-primary/10' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Info size={22} />
          <span className="text-xs mt-1 font-medium">About</span>
        </Link>
      </div>
    </nav>
  )
}