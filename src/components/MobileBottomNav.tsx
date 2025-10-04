import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { House, Calendar, Suitcase, Info } from '@phosphor-icons/react'
import type { User } from '@/App'

interface MobileBottomNavProps {
  user: User | null
}

export function MobileBottomNav({ user }: MobileBottomNavProps) {
  const location = useLocation()
  
  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(path)
  }

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border safe-area-inset-bottom z-50">
      <div className="flex items-center justify-around px-2 py-1">
        {/* Home */}
        <Link
          to="/"
          className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
            isActive('/')
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <House size={20} />
          <span className="text-xs mt-1">Home</span>
        </Link>

        {/* Parks */}
        <Link
          to="/parks"
          className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
            isActive('/parks') || isActive('/park/')
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Suitcase size={20} />
          <span className="text-xs mt-1">Parks</span>
        </Link>

        {/* Calendar */}
        <Link
          to="/calendar"
          className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
            isActive('/calendar')
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Calendar size={20} />
          <span className="text-xs mt-1">Calendar</span>
        </Link>

        {/* My Logs - only show if user is logged in */}
        {user && (
          <Link
            to="/my-logs"
            className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
              isActive('/my-logs')
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Suitcase size={20} />
            <span className="text-xs mt-1">My Logs</span>
          </Link>
        )}

        {/* About */}
        <Link
          to="/about"
          className={`flex flex-col items-center py-2 px-3 rounded-lg transition-colors ${
            isActive('/about')
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Info size={20} />
          <span className="text-xs mt-1">About</span>
        </Link>
      </div>
    </div>
  )
}