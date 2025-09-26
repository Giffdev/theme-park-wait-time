import type { Attraction } from '@/App'

// Park family and location structure
export interface ParkFamily {
  id: string
  name: string
  location: string
  description: string
  parks: ParkInfo[]
}

export interface ParkInfo {
  id: string
  name: string
  shortName: string
  type: 'theme-park' | 'water-park'
}

export const parkFamilies: ParkFamily[] = [
  {
    id: 'disney-world-orlando',
    name: 'Walt Disney World Resort',
    location: 'Orlando, FL',
    description: 'The most magical place on earth with four theme parks and two water parks',
    parks: [
      { id: 'magic-kingdom', name: 'Magic Kingdom', shortName: 'Magic Kingdom', type: 'theme-park' },
      { id: 'epcot', name: 'EPCOT', shortName: 'EPCOT', type: 'theme-park' },
      { id: 'hollywood-studios', name: 'Disney\'s Hollywood Studios', shortName: 'Hollywood Studios', type: 'theme-park' },
      { id: 'animal-kingdom', name: 'Disney\'s Animal Kingdom', shortName: 'Animal Kingdom', type: 'theme-park' },
      { id: 'blizzard-beach', name: 'Disney\'s Blizzard Beach', shortName: 'Blizzard Beach', type: 'water-park' },
      { id: 'typhoon-lagoon', name: 'Disney\'s Typhoon Lagoon', shortName: 'Typhoon Lagoon', type: 'water-park' }
    ]
  },
  {
    id: 'disneyland-california',
    name: 'Disneyland Resort',
    location: 'Anaheim, CA',
    description: 'The original Disney theme park resort with two parks',
    parks: [
      { id: 'disneyland', name: 'Disneyland Park', shortName: 'Disneyland', type: 'theme-park' },
      { id: 'disney-california-adventure', name: 'Disney California Adventure', shortName: 'California Adventure', type: 'theme-park' }
    ]
  },
  {
    id: 'universal-orlando',
    name: 'Universal Orlando Resort',
    location: 'Orlando, FL',
    description: 'Movie magic comes to life with thrilling attractions and immersive experiences',
    parks: [
      { id: 'universal-studios-orlando', name: 'Universal Studios Florida', shortName: 'Universal Studios', type: 'theme-park' },
      { id: 'islands-of-adventure', name: 'Universal\'s Islands of Adventure', shortName: 'Islands of Adventure', type: 'theme-park' },
      { id: 'epic-universe', name: 'Universal Epic Universe', shortName: 'Epic Universe', type: 'theme-park' },
      { id: 'volcano-bay', name: 'Universal\'s Volcano Bay', shortName: 'Volcano Bay', type: 'water-park' }
    ]
  },
  {
    id: 'universal-hollywood',
    name: 'Universal Studios Hollywood',
    location: 'Hollywood, CA',
    description: 'The entertainment capital of LA with studio tours and movie-based attractions',
    parks: [
      { id: 'universal-studios-hollywood', name: 'Universal Studios Hollywood', shortName: 'Universal Studios Hollywood', type: 'theme-park' }
    ]
  },
  {
    id: 'six-flags-magic-mountain',
    name: 'Six Flags Magic Mountain',
    location: 'Valencia, CA',
    description: 'The thrill capital of the world with over 19 roller coasters',
    parks: [
      { id: 'six-flags-magic-mountain', name: 'Six Flags Magic Mountain', shortName: 'Magic Mountain', type: 'theme-park' }
    ]
  },
  {
    id: 'six-flags-great-adventure',
    name: 'Six Flags Great Adventure',
    location: 'Jackson, NJ',
    description: 'East coast thrills with world-class roller coasters',
    parks: [
      { id: 'six-flags-great-adventure', name: 'Six Flags Great Adventure', shortName: 'Great Adventure', type: 'theme-park' },
      { id: 'six-flags-hurricane-harbor-nj', name: 'Six Flags Hurricane Harbor', shortName: 'Hurricane Harbor', type: 'water-park' }
    ]
  },
  {
    id: 'cedar-point',
    name: 'Cedar Point',
    location: 'Sandusky, OH',
    description: 'America\'s roller coast with record-breaking coasters',
    parks: [
      { id: 'cedar-point', name: 'Cedar Point', shortName: 'Cedar Point', type: 'theme-park' },
      { id: 'cedar-point-shores', name: 'Cedar Point Shores', shortName: 'Cedar Point Shores', type: 'water-park' }
    ]
  },
  {
    id: 'knott-berry-farm',
    name: 'Knott\'s Berry Farm',
    location: 'Buena Park, CA',
    description: 'America\'s first theme park with classic attractions and seasonal events',
    parks: [
      { id: 'knotts-berry-farm', name: 'Knott\'s Berry Farm', shortName: 'Knott\'s Berry Farm', type: 'theme-park' },
      { id: 'knotts-soak-city', name: 'Knott\'s Soak City', shortName: 'Soak City', type: 'water-park' }
    ]
  }
]

export const sampleAttractions: Record<string, Attraction[]> = {
  'universal-studios-orlando': [
    {
      id: 'harry-potter-escape-gringotts',
      name: 'Harry Potter and the Escape from Gringotts',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'transformers-3d',
      name: 'Transformers: The Ride 3D',
      type: 'thrill',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'simpsons-ride',
      name: 'The Simpsons Ride',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'mummy-revenge',
      name: 'Revenge of the Mummy',
      type: 'thrill',
      currentWaitTime: 60,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'diagon-alley',
      name: 'Diagon Alley Experience',
      type: 'experience',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'men-in-black',
      name: 'Men in Black: Alien Attack',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'fast-furious',
      name: 'Fast & Furious - Supercharged',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'islands-of-adventure': [
    {
      id: 'hagrid-motorbike',
      name: "Hagrid's Magical Creatures Motorbike Adventure",
      type: 'thrill',
      currentWaitTime: 90,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'velocicoaster',
      name: 'VelociCoaster',
      type: 'thrill',
      currentWaitTime: 75,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'forbidden-journey',
      name: 'Harry Potter and the Forbidden Journey',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'hulk-coaster',
      name: 'The Incredible Hulk Coaster',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'jurassic-park-river',
      name: 'Jurassic Park River Adventure',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'amazing-spiderman',
      name: 'The Amazing Adventures of Spider-Man',
      type: 'thrill',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'epic-universe': [
    {
      id: 'dark-universe',
      name: 'Dark Universe Experience',
      type: 'thrill',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'super-nintendo-world',
      name: 'Super Nintendo World',
      type: 'experience',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'mario-kart',
      name: 'Mario Kart: Bowser\'s Challenge',
      type: 'family',
      currentWaitTime: 65,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'how-to-train-dragon',
      name: 'How to Train Your Dragon',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'hollywood-studios': [
    {
      id: 'rise-of-resistance',
      name: 'Star Wars: Rise of the Resistance',
      type: 'thrill',
      currentWaitTime: 120,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'smugglers-run',
      name: 'Millennium Falcon: Smugglers Run',
      type: 'thrill',
      currentWaitTime: 85,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'tower-of-terror',
      name: 'The Twilight Zone Tower of Terror',
      type: 'thrill',
      currentWaitTime: 60,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'rock-n-roller',
      name: "Rock 'n' Roller Coaster",
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'toy-story-midway',
      name: 'Toy Story Midway Mania',
      type: 'family',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'animal-kingdom': [
    {
      id: 'avatar-flight-passage',
      name: 'Avatar Flight of Passage',
      type: 'thrill',
      currentWaitTime: 95,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'expedition-everest',
      name: 'Expedition Everest',
      type: 'thrill',
      currentWaitTime: 70,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'kilimanjaro-safari',
      name: 'Kilimanjaro Safaris',
      type: 'experience',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'dinosaur',
      name: 'DINOSAUR',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'navi-river',
      name: "Na'vi River Journey",
      type: 'family',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'magic-kingdom': [
    {
      id: 'space-mountain',
      name: 'Space Mountain',
      type: 'thrill',
      currentWaitTime: 65,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'seven-dwarfs-mine-train',
      name: 'Seven Dwarfs Mine Train',
      type: 'family',
      currentWaitTime: 80,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'pirates-caribbean',
      name: 'Pirates of the Caribbean',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'haunted-mansion',
      name: 'Haunted Mansion',
      type: 'family',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'big-thunder-mountain',
      name: 'Big Thunder Mountain Railroad',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'splash-mountain',
      name: 'Tiana\'s Bayou Adventure',
      type: 'thrill',
      currentWaitTime: 70,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'epcot': [
    {
      id: 'guardians-galaxy',
      name: 'Guardians of the Galaxy: Cosmic Rewind',
      type: 'thrill',
      currentWaitTime: 85,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'frozen-ever-after',
      name: 'Frozen Ever After',
      type: 'family',
      currentWaitTime: 75,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'test-track',
      name: 'Test Track Presented by Chevrolet',
      type: 'thrill',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'remy-ratatouille',
      name: 'Remy\'s Ratatouille Adventure',
      type: 'family',
      currentWaitTime: 60,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'spaceship-earth',
      name: 'Spaceship Earth',
      type: 'experience',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'soarin',
      name: 'Soarin\' Around the World',
      type: 'family',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'disneyland': [
    {
      id: 'rise-of-resistance-dl',
      name: 'Star Wars: Rise of the Resistance',
      type: 'thrill',
      currentWaitTime: 110,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'matterhorn-bobsleds',
      name: 'Matterhorn Bobsleds',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'space-mountain-dl',
      name: 'Space Mountain',
      type: 'thrill',
      currentWaitTime: 65,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'indiana-jones-adventure',
      name: 'Indiana Jones Adventure',
      type: 'thrill',
      currentWaitTime: 75,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'pirates-caribbean-dl',
      name: 'Pirates of the Caribbean',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'haunted-mansion-dl',
      name: 'Haunted Mansion',
      type: 'family',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'disney-california-adventure': [
    {
      id: 'web-slingers',
      name: 'WEB SLINGERS: A Spider-Man Adventure',
      type: 'family',
      currentWaitTime: 70,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'guardians-galaxy-mission-breakout',
      name: 'Guardians of the Galaxy – Mission: BREAKOUT!',
      type: 'thrill',
      currentWaitTime: 60,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'radiator-springs-racers',
      name: 'Radiator Springs Racers',
      type: 'thrill',
      currentWaitTime: 90,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'soarin-over-california',
      name: 'Soarin\' Around the World',
      type: 'family',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'incredicoaster',
      name: 'Incredicoaster',
      type: 'thrill',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'universal-studios-hollywood': [
    {
      id: 'studio-tour',
      name: 'Universal Studio Tour',
      type: 'experience',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'harry-potter-forbidden-journey-hollywood',
      name: 'Harry Potter and the Forbidden Journey',
      type: 'thrill',
      currentWaitTime: 60,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'transformers-hollywood',
      name: 'Transformers: The Ride-3D',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'jurassic-world-ride',
      name: 'Jurassic World – The Ride',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'mummy-hollywood',
      name: 'Revenge of the Mummy – The Ride',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'six-flags-magic-mountain': [
    {
      id: 'x2',
      name: 'X2',
      type: 'thrill',
      currentWaitTime: 80,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'twisted-colossus',
      name: 'Twisted Colossus',
      type: 'thrill',
      currentWaitTime: 65,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'tatsu',
      name: 'Tatsu',
      type: 'thrill',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'goliath-mm',
      name: 'Goliath',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'batman-the-ride-mm',
      name: 'Batman The Ride',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'full-throttle',
      name: 'Full Throttle',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'six-flags-great-adventure': [
    {
      id: 'kingda-ka',
      name: 'Kingda Ka',
      type: 'thrill',
      currentWaitTime: 90,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'el-toro',
      name: 'El Toro',
      type: 'thrill',
      currentWaitTime: 70,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'nitro',
      name: 'Nitro',
      type: 'thrill',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'batman-the-ride-ga',
      name: 'Batman The Ride',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'superman-ultimate-flight',
      name: 'Superman: Ultimate Flight',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'cedar-point': [
    {
      id: 'steel-vengeance',
      name: 'Steel Vengeance',
      type: 'thrill',
      currentWaitTime: 95,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'millennium-force',
      name: 'Millennium Force',
      type: 'thrill',
      currentWaitTime: 75,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'maverick',
      name: 'Maverick',
      type: 'thrill',
      currentWaitTime: 80,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'valravn',
      name: 'Valravn',
      type: 'thrill',
      currentWaitTime: 60,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'raptor',
      name: 'Raptor',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'gatekeeper',
      name: 'GateKeeper',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'knotts-berry-farm': [
    {
      id: 'hangtime',
      name: 'HangTime',
      type: 'thrill',
      currentWaitTime: 60,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'ghostrider',
      name: 'GhostRider',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'xcelerator',
      name: 'Xcelerator',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'silver-bullet',
      name: 'Silver Bullet',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'knotts-berry-tales',
      name: 'Knott\'s Berry Tales',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ]
}

// Function to initialize sample data
export async function initializeSampleData() {
  try {
    // Ensure spark is available
    if (!window.spark || !window.spark.kv) {
      console.error('❌ Spark KV not available')
      return false
    }
    
    const { kv } = window.spark
    
    console.log('🔄 Starting sample data initialization...')
    
    // Check if data is already initialized to avoid unnecessary re-seeding
    const existingKeys = await kv.keys()
    const attractionKeys = existingKeys.filter(key => key.startsWith('attractions-'))
    
    // If we already have data for most parks, skip re-initialization
    const expectedParks = Object.keys(sampleAttractions)
    const existingParks = attractionKeys.map(key => key.replace('attractions-', ''))
    const missingParks = expectedParks.filter(park => !existingParks.includes(park))
    
    if (missingParks.length === 0 && attractionKeys.length > 0) {
      console.log('✅ Sample data already initialized, skipping...')
      return true
    }
    
    console.log(`🔄 Initializing missing parks: ${missingParks.length > 0 ? missingParks.join(', ') : 'all parks'}`)
    
    // Initialize data for missing or all parks
    let totalSeeded = 0
    const parksToInit = missingParks.length > 0 ? missingParks : expectedParks
    
    for (const parkId of parksToInit) {
      try {
        const attractions = sampleAttractions[parkId]
        if (attractions && Array.isArray(attractions)) {
          await kv.set(`attractions-${parkId}`, attractions)
          totalSeeded += attractions.length
          console.log(`✅ Seeded ${attractions.length} attractions for ${parkId}`)
          
          // Add a small delay to prevent overwhelming the storage system
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      } catch (parkError) {
        console.error(`❌ Failed to seed ${parkId}:`, parkError)
      }
    }
    
    console.log(`✅ Sample data initialization completed: ${totalSeeded} attractions seeded for ${parksToInit.length} parks`)
    
    // Quick verification for a few key parks
    const keyParks = ['universal-studios-orlando', 'islands-of-adventure', 'magic-kingdom']
    for (const parkId of keyParks) {
      try {
        const data = await kv.get<Attraction[]>(`attractions-${parkId}`)
        if (data && Array.isArray(data) && data.length > 0) {
          console.log(`✅ Verified ${parkId}: ${data.length} attractions`)
        } else {
          console.warn(`⚠️ Verification concern for ${parkId}: ${data?.length || 0} attractions`)
        }
      } catch (verifyError) {
        console.error(`❌ Verification failed for ${parkId}:`, verifyError)
      }
    }
    
    console.log('🎉 Sample data initialization completed successfully')
    return true
  } catch (error) {
    console.error('❌ Error initializing sample data:', error)
    return false
  }
}