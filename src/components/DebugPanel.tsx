import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function DebugPanel() {
  const [kvStatus, setKvStatus] = useState<string>('Checking...')
  const [keys, setKeys] = useState<string[]>([])
  const [sampleCheck, setSampleCheck] = useState<string>('Not checked')
  
  useEffect(() => {
    checkKvStatus()
  }, [])
  
  const checkKvStatus = async () => {
    try {
      if (!window.spark) {
        setKvStatus('❌ Spark not available')
        return
      }
      
      if (!window.spark.kv) {
        setKvStatus('❌ Spark KV not available')
        return
      }
      
      setKvStatus('✅ Spark KV available')
      
      // Get all keys
      const allKeys = await window.spark.kv.keys()
      setKeys(allKeys)
      
      // Check specific sample data
      const testPark = 'universal-studios-orlando'
      const data = await window.spark.kv.get(`attractions-${testPark}`)
      setSampleCheck(data && Array.isArray(data) ? 
        `✅ Found ${data.length} attractions for ${testPark}` : 
        `❌ No data for ${testPark}`)
        
    } catch (error) {
      setKvStatus(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  const reinitializeData = async () => {
    try {
      const { initializeSampleData } = await import('@/data/sampleData')
      const success = await initializeSampleData()
      setSampleCheck(success ? '✅ Data reinitialized' : '❌ Reinitialization failed')
      await checkKvStatus()
    } catch (error) {
      setSampleCheck(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  const clearAllData = async () => {
    try {
      const allKeys = await window.spark.kv.keys()
      const attractionKeys = allKeys.filter(key => key.startsWith('attractions-'))
      
      for (const key of attractionKeys) {
        await window.spark.kv.delete(key)
      }
      
      setSampleCheck('✅ All attraction data cleared')
      await checkKvStatus()
    } catch (error) {
      setSampleCheck(`❌ Clear error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  return (
    <Card className="fixed bottom-4 right-4 w-96 max-h-96 overflow-auto z-50 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Debug Panel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">KV Status</div>
          <div className="text-xs">{kvStatus}</div>
        </div>
        
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">Sample Data</div>
          <div className="text-xs">{sampleCheck}</div>
        </div>
        
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Keys ({keys.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {keys.filter(k => k.startsWith('attractions-')).slice(0, 5).map(key => (
              <Badge key={key} variant="outline" className="text-xs">
                {key.replace('attractions-', '')}
              </Badge>
            ))}
            {keys.filter(k => k.startsWith('attractions-')).length > 5 && (
              <Badge variant="secondary" className="text-xs">
                +{keys.filter(k => k.startsWith('attractions-')).length - 5} more
              </Badge>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={checkKvStatus} className="text-xs">
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={reinitializeData} className="text-xs">
            Reinit Data
          </Button>
          <Button size="sm" variant="destructive" onClick={clearAllData} className="text-xs">
            Clear All
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}