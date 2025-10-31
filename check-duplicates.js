// Script to check for duplicate attractions in all parks
const fs = require('fs');

// Read the sampleData.ts file
const fileContent = fs.readFileSync('./src/data/sampleData.ts', 'utf8');

// Extract attraction IDs per park
const parkSections = fileContent.split(/^\s*'([^']+)':\s*\[/gm);

const results = {};
let currentPark = null;

for (let i = 1; i < parkSections.length; i += 2) {
  const parkId = parkSections[i];
  const parkContent = parkSections[i + 1];
  
  // Extract all IDs from this park section
  const idMatches = parkContent.matchAll(/id:\s*'([^']+)'/g);
  const ids = [];
  const idCounts = {};
  
  for (const match of idMatches) {
    const id = match[1];
    ids.push(id);
    idCounts[id] = (idCounts[id] || 0) + 1;
  }
  
  // Find duplicates
  const duplicates = Object.entries(idCounts)
    .filter(([id, count]) => count > 1)
    .map(([id, count]) => ({ id, count }));
  
  if (duplicates.length > 0) {
    results[parkId] = {
      total: ids.length,
      duplicates: duplicates
    };
  }
}

console.log('=== DUPLICATE ATTRACTION IDS ===\n');

if (Object.keys(results).length === 0) {
  console.log('✅ No duplicates found!');
} else {
  for (const [parkId, data] of Object.entries(results)) {
    console.log(`\n❌ Park: ${parkId}`);
    console.log(`   Total attractions: ${data.total}`);
    console.log(`   Duplicates found:`);
    for (const dup of data.duplicates) {
      console.log(`   - ${dup.id} (appears ${dup.count} times)`);
    }
  }
}
