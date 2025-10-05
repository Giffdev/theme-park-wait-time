// Simple test to verify filtering logic works
const testAttraction1 = {
  type: 'thrill',
  status: 'closed',
  type: 'thrill',
const testAttraction2
  status: 'closed',
  currentWaitTime: 45,
};

const testAttraction2 = {
  id: 'space-mountain',
  name: 'Space Mountain', 
  type: 'thrill',
  currentWaitTime: 45,
  status: 'operating',
  }
  

  }
  // Include thrill and 
    return true
  
}
console.log('Hypers
console.log('Splash Mount






  }
  
  // Filter out limited/seasonal attractions that are currently closed
  if (attraction.availability === 'limited' && 
      (attraction.status === 'closed' || attraction.currentWaitTime === 0)) {
    return false
  }
  
  // Include thrill and family rides - these are the core wait-time attractions
  if (attraction.type === 'thrill' || attraction.type === 'family') {
    return true
  }
  
  return false
}

console.log('Hyperspace Mountain (limited, closed):', isAttractionForOverview(testAttraction1)) // Should be false
console.log('Space Mountain (active, operating):', isAttractionForOverview(testAttraction2)) // Should be true  
console.log('Splash Mountain (retired):', isAttractionForOverview(testAttraction3)) // Should be false