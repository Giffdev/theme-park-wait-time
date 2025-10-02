// Simple debug script to test data access
console.log('🔍 Debug script started')

// Wait for window to be available
setTimeout(async () => {
  console.log('🔍 Checking window.spark availability...')
  
  if (!window.spark) {
    console.error('❌ window.spark not found')
    return
  }
  
  if (!window.spark.kv) {
    console.error('❌ window.spark.kv not found')
    return
  }
  
  console.log('✅ Spark KV found, checking data...')
  
  try {
    // Check all keys
    const allKeys = await window.spark.kv.keys()
    console.log('📋 All keys:', allKeys.length)
    
    const attractionKeys = allKeys.filter(k => k.startsWith('attractions-'))
    console.log('🎢 Attraction keys:', attractionKeys)
    
    // Check magic kingdom specifically
    const magicKingdomData = await window.spark.kv.get('attractions-magic-kingdom')
    console.log('🏰 Magic Kingdom data:', magicKingdomData ? `${magicKingdomData.length} attractions` : 'No data')
    
    if (magicKingdomData && magicKingdomData.length > 0) {
      console.log('🎢 Sample attractions:', magicKingdomData.slice(0, 3).map(a => a.name))
    }
    
  } catch (error) {
    console.error('❌ Error checking data:', error)
  }
}, 1000)