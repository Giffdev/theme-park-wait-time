import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Timer, Clock, TrendUp, Users, Brain, MapPin } from '@phosphor-icons/react'

export function AboutPage() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8 text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground mb-2">
          About Crowd Forecaster
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Your intelligent companion for theme park planning, combining real-time data with smart insights to optimize your park experience.
        </p>
      </div>

      {/* Core Features */}
      <div className="mb-8 space-y-6">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Core Features</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Timer size={28} className="text-primary" />
                <CardTitle className="text-primary">Smart Timer</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Time your actual wait experiences and contribute to our crowd-sourced data. 
                Help improve predictions for everyone while tracking your own park efficiency.
              </p>
            </CardContent>
          </Card>

          <Card className="border-accent/20 bg-accent/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Clock size={28} className="text-accent" />
                <CardTitle className="text-accent">Live Wait Times</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Access real-time wait information updated continuously throughout the day. 
                Make informed decisions about which attractions to visit and when.
              </p>
            </CardContent>
          </Card>

          <Card className="border-secondary/20 bg-secondary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <TrendUp size={28} className="text-secondary" />
                <CardTitle className="text-secondary">Crowd Insights</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Analyze historical patterns and seasonal trends to plan your perfect park day. 
                Discover the best times to visit popular attractions.
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
                <Users size={24} className="text-primary" />
                <CardTitle className="text-lg">Community-Powered Data</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                Our platform combines official park data with real-time reports from visitors like you. 
                When you log wait times and attraction experiences, you're helping create the most accurate 
                crowd forecasting system available.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <Brain size={24} className="text-accent" />
                <CardTitle className="text-lg">Smart Predictions</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                Advanced algorithms analyze patterns in crowd behavior, seasonal trends, and real-time data 
                to provide accurate predictions. The more data we collect, the smarter our recommendations become.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <MapPin size={24} className="text-secondary" />
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
            technology with community insights, we help families and friends make the most of their 
            precious vacation time, creating magical memories instead of waiting in long lines.
          </p>
        </div>
      </div>
    </main>
  )
}