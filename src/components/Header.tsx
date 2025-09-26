import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SignOut, User as UserIcon, Train } from '@phosphor-icons/react'
import { Link, useLocation } from 'react-router-dom'
import type { User } from '@/App'

interface HeaderProps {
  user: User | null
  onLoginClick: () => void
  onLogout: () => void
}

export function Header({ user, onLoginClick, onLogout }: HeaderProps) {
  const location = useLocation()
  
  const isActive = (path: string) => {
    if (path === '/' && location.pathname === '/') return true
    if (path !== '/' && location.pathname.startsWith(path)) return true
    return false
  }

  return (
    <header className="border-b bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4 max-w-7xl">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Train size={18} className="text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">ParkFlow</span>
          </Link>
          
          <nav className="hidden md:flex items-center space-x-6">
            <Link 
              to="/" 
              className={`text-sm font-medium transition-colors hover:text-foreground ${
                isActive('/') ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              Home
            </Link>
            {user && (
              <Link 
                to="/my-logs" 
                className={`text-sm font-medium transition-colors hover:text-foreground ${
                  isActive('/my-logs') ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                My Logs
              </Link>
            )}
            <Link 
              to="/calendar" 
              className={`text-sm font-medium transition-colors hover:text-foreground ${
                isActive('/calendar') ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              Calendar
            </Link>
          </nav>

          <div className="flex items-center space-x-4">
            {user ? (
              <div className="flex items-center space-x-3">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-foreground">{user.username}</p>
                  <p className="text-xs text-muted-foreground">{user.contributionCount} reports</p>
                </div>
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {user.username.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
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
      </div>
    </header>
  )
}