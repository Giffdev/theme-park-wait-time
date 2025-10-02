import { useEffect, useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { initializeSampleData } from '@/data/sampleData'
import type { ExtendedAttraction } from '@/types'

interface DebugDataViewerProps {
  parkId: string
}

export function DebugDataViewer({ parkId }: DebugDataViewerProps) {
  const [attractions] = useKV<ExtendedAttraction[]>(`attractions-${parkId}`, [])
  const [allKeys, setAllKeys] = useState<string[]>([])
  const [directData, setDirectData] = useState<ExtendedAttraction[] | null>(null)
  const [isReloading, setIsReloading] = useState(false)

  const debugData = async () => {
    if (!window.spark?.kv) return
    
    // Get all keys
    const keys = await window.spark.kv.keys()
    setAllKeys(keys)
    
    // Try to get data directly
    const data = await window.spark.kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
    setDirectData(data || null)
  }

  useEffect(() => {
    debugData()
  }, [parkId])

  const forceReload = async () => {
    setIsReloading(true)
    try {
      console.log('🔄 Debug component forcing data reload...')
      await initializeSampleData()
      await debugData()
      console.log('✅ Debug reload complete')
      
      // Force a page refresh to ensure all components get the new data
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error) {
      console.error('❌ Debug reload failed:', error)
    }
    setIsReloading(false)
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Debug Data Viewer - {parkId}
          <div className="flex gap-2">
            <Button 
              onClick={debugData} 
              variant="outline"
              size="sm"
            >
              Refresh
            </Button>
            <Button 
              onClick={forceReload} 
              disabled={isReloading}
              variant="outline"
              size="sm"
            >
              {isReloading ? 'Loading...' : 'Force Reload'}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="font-medium">useKV Hook Data:</h4>
          <p className="text-sm text-muted-foreground">
            {attractions ? `${attractions.length} attractions` : 'No data'}
          </p>
          {attractions && attractions.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Sample: {attractions.slice(0, 3).map(a => a.name).join(', ')}...
            </p>
          )}
        </div>
        
        <div>
          <h4 className="font-medium">Direct KV Data:</h4>
          <p className="text-sm text-muted-foreground">
            {directData ? `${directData.length} attractions` : 'No data'}
          </p>
          {directData && directData.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Sample: {directData.slice(0, 3).map(a => a.name).join(', ')}...
            </p>
          )}
        </div>
        
        <div>
          <h4 className="font-medium">All KV Keys ({allKeys.length}):</h4>
          <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto">
            {allKeys.filter(k => k.startsWith('attractions-')).map(key => (
              <div key={key}>{key}</div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}