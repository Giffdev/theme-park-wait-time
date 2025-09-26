import { ParkOverview } from '@/components/ParkOverviewHome'
import { useNavigate } from 'react-router-dom'

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
        

      </div>

      {/* Live Park Overview */}
      <div className="mb-8">
        <ParkOverview onParkSelect={handleParkSelect} />
      </div>
    </main>
  )
}