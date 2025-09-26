import type { Attraction } from '@/App'

export const sampleAttractions: Record<string, Attraction[]> = {
  'universal-orlando': [
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
  ]
}

// Function to initialize sample data
export async function initializeSampleData() {
  const { kv } = window.spark
  
  try {
    console.log('Starting sample data initialization...')
    
    // Force clear and re-initialize data
    for (const [parkId, attractions] of Object.entries(sampleAttractions)) {
      await kv.set(`attractions-${parkId}`, attractions)
      console.log(`✅ Force seeded ${attractions.length} attractions for ${parkId}`)
    }
    
    // Verify all data was saved correctly
    for (const parkId of Object.keys(sampleAttractions)) {
      const data = await kv.get<Attraction[]>(`attractions-${parkId}`)
      console.log(`📊 Verified ${parkId}: ${data?.length || 0} attractions stored`)
    }
    
    console.log('✅ Sample data initialization completed successfully')
  } catch (error) {
    console.error('❌ Error initializing sample data:', error)
  }
}