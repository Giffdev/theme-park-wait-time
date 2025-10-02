// Simple debug script to test KV data access in browser console
// Paste this into the browser console to check data

async function debugParkData() {
  if (!window.spark?.kv) {
    console.error('❌ Spark KV not available')
    return
  }

  console.log('🔍 Debugging park data...')
  
  // Get all keys
  const allKeys = await window.spark.kv.keys()
  console.log('📋 All KV keys:', allKeys)
  
  // Filter attraction keys
  const attractionKeys = allKeys.filter(key => key.startsWith('attractions-'))
  console.log('🎢 Attraction keys:', attractionKeys)
  
  // Test a specific park
  const testPark = 'magic-kingdom'
  const data = await window.spark.kv.get(`attractions-${testPark}`)
  console.log(`📊 Data for ${testPark}:`, data)
  
  if (data && Array.isArray(data)) {
    console.log(`✅ ${testPark} has ${data.length} attractions`)
    console.log('🎯 Sample attractions:', data.slice(0, 5).map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      waitTime: a.currentWaitTime
    })))
  } else {
    console.log('❌ No valid data found')
  }
}

// Call it
debugParkData()