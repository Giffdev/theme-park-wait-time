import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { House, Calendar, Suitcase, Info, User as UserIcon } from '@phosphor-icons/react'
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
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border md:hidden safe-area-inset-bottom">
      <div className="flex items-center justify-around px-4 py-2">
        {/* Home */}
        <Link
          to="/"
          className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-colors ${
            isActive('/')
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <House size={20} weight={isActive('/') ? 'fill' : 'regular'} />
          <span className="text-xs">Home</span>
        </Link>

        {/* Parks */}
        <Link
          to="/parks"
          className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-colors ${
            isActive('/park')
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Suitcase size={20} weight={isActive('/park') ? 'fill' : 'regular'} />
          <span className="text-xs">Parks</span>
        </Link>

        {/* Calendar */}
        <Link
          to="/calendar"
          className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-colors ${
            isActive('/calendar')
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Calendar size={20} weight={isActive('/calendar') ? 'fill' : 'regular'} />
          <span className="text-xs">Calendar</span>
        </Link>

        {/* My Logs - only show if user is logged in */}
        {user && (
          <Link
            to="/my-logs"
            className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-colors ${
              isActive('/my-logs')
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserIcon size={20} weight={isActive('/my-logs') ? 'fill' : 'regular'} />
            <span className="text-xs">My Logs</span>
          </Link>
        )}

        {/* About */}
        <Link
          to="/about"
          className={`flex flex-col items-center gap-1 py-2 px-3 rounded-lg transition-colors ${
            isActive('/about')
              ? 'text-primary bg-primary/10'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Info size={20} weight={isActive('/about') ? 'fill' : 'regular'} />
          <span className="text-xs">About</span>
        </Link>
      </div>
    </div>
  )
}