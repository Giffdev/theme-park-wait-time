import { ParkOverview } from '@/components/ParkOverview'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin, Clock, TrendUp } from '@phosphor-icons/react'

export function HomePage() {
  const navigate = useNavigate()

  const handleParkSelect = (parkId: string) => {
    navigate(`/park/${parkId}`)
  }

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8 text-center space-y-4">
        <h1 className="text-4xl font-bold text-foreground mb-2">
          Smart Theme Park Planning
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Real-time wait times and crowd insights for your perfect park day across major theme park destinations
        </p>
        
        {/* Quick Guide Cards */}
        <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto mt-8">
          <Card className="text-center">
            <CardContent className="pt-6">
              <MapPin size={32} className="mx-auto mb-3 text-primary" />
              <h3 className="font-semibold mb-2">Choose Your Destination</h3>
              <p className="text-sm text-muted-foreground">
                Select from Disney, Universal, Six Flags, and more park families
              </p>
            </CardContent>
          </Card>
          
          <Card className="text-center">
            <CardContent className="pt-6">
              <Clock size={32} className="mx-auto mb-3 text-accent" />
              <h3 className="font-semibold mb-2">Live Wait Times</h3>
              <p className="text-sm text-muted-foreground">
                See real-time wait times updated by fellow park visitors
              </p>
            </CardContent>
          </Card>
          
          <Card className="text-center">
            <CardContent className="pt-6">
              <TrendUp size={32} className="mx-auto mb-3 text-success" />
              <h3 className="font-semibold mb-2">Historical Trends</h3>
              <p className="text-sm text-muted-foreground">
                Plan your day with historical wait time patterns
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Live Park Overview */}
      <div className="mb-8">
        <ParkOverview onParkSelect={handleParkSelect} />
      </div>
    </main>
  )
}