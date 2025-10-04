import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Timer, Clock, TrendUp, Users, Brain, MapPin, NotePencil, ChartBar } from '@phosphor-icons/react'

export function AboutPage() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8 text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground mb-2">
          About ParkFlow
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Your intelligent companion for theme park planning, combining real-time data with personal trip tracking to optimize your park experience and preserve your magical memories.
        </p>
      </div>

      {/* Core Features */}
      <div className="mb-8 space-y-6">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Core Features</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <NotePencil size={28} className="text-primary" />
                <CardTitle className="text-primary">Trip Logging</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Log your park visits and track every ride you experience. Build a personal history of your theme park adventures across multiple parks and dates.
              </p>
            </CardContent>
          </Card>

          <Card className="border-accent/20 bg-accent/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <ChartBar size={28} className="text-accent" />
                <CardTitle className="text-accent">Ride Statistics</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Track how many times you've ridden each attraction. View your personal ride counts and discover your favorite attractions across different parks.
              </p>
            </CardContent>
          </Card>

          <Card className="border-secondary/20 bg-secondary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Clock size={28} className="text-secondary" />
                <CardTitle className="text-secondary">Live Wait Times</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Access real-time wait information updated continuously throughout the day. Make informed decisions about which attractions to visit and when.
              </p>
            </CardContent>
          </Card>

          <Card className="border-muted-foreground/20 bg-muted">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <TrendUp size={28} className="text-muted-foreground" />
                <CardTitle className="text-muted-foreground">Crowd Insights</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Analyze historical patterns and seasonal trends to plan your perfect park day. Discover the best times to visit popular attractions.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* How It Works */}
      <div className="mb-8 space-y-6">
        <h2 className="text-2xl font-semibold text-foreground mb-4">How It Works</h2>
        
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <NotePencil size={24} className="text-primary" />
                <CardTitle className="text-lg">Personal Trip Tracking</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                Create an account to log your park visits and track every attraction you experience. 
                Build a comprehensive record of your theme park adventures, including which rides you've been on 
                and how many times you've experienced each attraction.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Users size={24} className="text-accent" />
                <CardTitle className="text-lg">Community-Powered Data</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                Our platform combines official park data with real-time insights from visitors like you. 
                Your trip logs and attraction experiences help create a comprehensive database of theme park information 
                while building your personal park history.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Brain size={24} className="text-secondary" />
                <CardTitle className="text-lg">Smart Analytics</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                View detailed statistics about your park visits, including total rides experienced, 
                favorite attractions, and parks visited. Discover patterns in your theme park adventures 
                and track your progress toward experiencing every attraction.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <MapPin size={24} className="text-muted-foreground" />
                <CardTitle className="text-lg">Comprehensive Coverage</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                From Disney World and Disneyland to Universal Studios and beyond, we cover major theme park 
                destinations worldwide. Each park includes detailed attraction information, wait times, and crowd calendars.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mission Statement */}
      <div className="bg-muted/50 rounded-lg p-6">
        <div className="text-center space-y-4">
          <h3 className="text-xl font-semibold text-foreground">
            Our Mission
          </h3>
          <p className="text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            We believe that great theme park experiences shouldn't be left to chance. By combining 
            technology with personal trip tracking and community insights, we help families and friends make the most of their 
            precious vacation time while preserving memories of every magical moment and thrilling ride.
          </p>
        </div>
      </div>
    </main>
  )
}