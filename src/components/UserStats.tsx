import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Trophy, Target, CheckCircle, Star, TrendUp } from '@phosphor-icons/react'
import { useReporting } from '@/hooks/useReporting'
import type { User } from '@/App'

interface UserStatsProps {
  user: User
}

export function UserStats({ user }: UserStatsProps) {
  const { contributions, reports, verifications } = useReporting()
  const [userStats, setUserStats] = useState<{
    reportsSubmitted: number
    verificationsProvided: number
    accuracyScore: number
    trustLevel: 'new' | 'bronze' | 'silver' | 'gold' | 'platinum'
    badges: string[]
    recentReports: number
    weeklyGoal: number
  }>({
    reportsSubmitted: 0,
    verificationsProvided: 0,
    accuracyScore: 0,
    trustLevel: 'new',
    badges: [],
    recentReports: 0,
    weeklyGoal: 10
  })

  useEffect(() => {
    const userContribution = contributions?.find(c => c.userId === user.id)
    
    if (userContribution) {
      // Calculate recent reports (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const recentReports = (reports || []).filter(report => 
        report.userId === user.id && 
        new Date(report.reportedAt) > sevenDaysAgo
      ).length

      // Calculate accuracy score based on verified reports
      const userReports = (reports || []).filter(r => r.userId === user.id)
      const verifiedReports = userReports.filter(r => r.status === 'verified')
      const disputedReports = userReports.filter(r => r.status === 'disputed')
      
      let accuracyScore = 0
      if (userReports.length > 0) {
        accuracyScore = Math.max(0, (verifiedReports.length - disputedReports.length) / userReports.length) * 100
      }

      setUserStats({
        ...userContribution,
        accuracyScore: Math.round(accuracyScore),
        recentReports,
        weeklyGoal: Math.max(10, userContribution.reportsSubmitted)
      })
    }
  }, [contributions, reports, user.id])

  const getTrustLevelColor = (level: string) => {
    switch (level) {
      case 'platinum': return 'bg-gradient-to-r from-purple-500 to-purple-600'
      case 'gold': return 'bg-gradient-to-r from-yellow-400 to-yellow-500'
      case 'silver': return 'bg-gradient-to-r from-gray-400 to-gray-500'
      case 'bronze': return 'bg-gradient-to-r from-orange-400 to-orange-500'
      default: return 'bg-muted'
    }
  }

  const getTrustLevelIcon = (level: string) => {
    switch (level) {
      case 'platinum': return <Star size={16} className="text-purple-100" />
      case 'gold': return <Trophy size={16} className="text-yellow-100" />
      case 'silver': return <Target size={16} className="text-gray-100" />
      case 'bronze': return <CheckCircle size={16} className="text-orange-100" />
      default: return <TrendUp size={16} className="text-muted-foreground" />
    }
  }

  const getBadgeDescription = (badge: string) => {
    switch (badge) {
      case 'first-report': return 'Submitted first wait time report'
      case 'first-verification': return 'Verified first report from another user'
      case 'accurate-reporter': return 'Maintains high accuracy in reports'
      case 'community-helper': return 'Actively helps verify other reports'
      case 'streak-keeper': return 'Consistent daily contributions'
      case 'early-adopter': return 'Among the first users of the platform'
      default: return 'Special contribution recognized'
    }
  }

  const progressPercentage = Math.min((userStats.recentReports / userStats.weeklyGoal) * 100, 100)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${getTrustLevelColor(userStats.trustLevel)}`}>
              {getTrustLevelIcon(userStats.trustLevel)}
            </div>
            <div>
              <div className="font-semibold">{user.username}</div>
              <div className="text-sm font-normal text-muted-foreground capitalize">
                {userStats.trustLevel} Contributor
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{userStats.reportsSubmitted}</div>
              <div className="text-sm text-muted-foreground">Reports Submitted</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">{userStats.verificationsProvided}</div>
              <div className="text-sm text-muted-foreground">Verifications</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">{userStats.accuracyScore}%</div>
              <div className="text-sm text-muted-foreground">Accuracy Score</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-secondary">{userStats.recentReports}</div>
              <div className="text-sm text-muted-foreground">This Week</div>
            </div>
          </div>

          {/* Weekly Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Weekly Goal Progress</span>
              <span>{userStats.recentReports}/{userStats.weeklyGoal}</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>

          {/* Badges */}
          {userStats.badges.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Achievements</div>
              <div className="flex flex-wrap gap-2">
                {userStats.badges.map((badge, index) => (
                  <Badge 
                    key={index}
                    variant="secondary" 
                    className="text-xs"
                    title={getBadgeDescription(badge)}
                  >
                    {badge.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}