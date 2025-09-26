import type { Attraction } from '@/App'
import type { ExtendedAttraction } from '@/types'

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
      id: 'ollivanders',
      name: 'Ollivanders',
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
    },
    {
      id: 'et-adventure',
      name: 'E.T. Adventure',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'hogwarts-express-kings-cross',
      name: 'Hogwarts Express - King\'s Cross Station',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'despicable-me-minion-mayhem',
      name: 'Despicable Me Minion Mayhem',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'shrek-4d',
      name: 'Shrek 4-D',
      type: 'show',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'universal-horror-makeup-show',
      name: 'Universal Orlando\'s Horror Make-Up Show',
      type: 'show',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'diagon-alley-experience',
      name: 'The Wizarding World of Harry Potter - Diagon Alley',
      type: 'experience',
      currentWaitTime: 0,
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
    },
    {
      id: 'flight-of-hippogriff',
      name: 'Flight of the Hippogriff',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'cat-in-hat',
      name: 'The Cat in the Hat',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'hogwarts-express-hogsmeade',
      name: 'Hogwarts Express - Hogsmeade Station',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'dudley-do-right',
      name: "Dudley Do-Right's Ripsaw Falls",
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'popeye-blutos',
      name: "Popeye & Bluto's Bilge-Rat Barges",
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'jurassic-world-velociraptor',
      name: 'Jurassic World VelociCoaster',
      type: 'thrill',
      currentWaitTime: 75,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'seuss-landing-carousel',
      name: 'Caro-Seuss-el',
      type: 'family',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'storm-force-acceleration',
      name: 'Storm Force Accelatron',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'epic-universe': [
    {
      id: 'mario-kart',
      name: 'Mario Kart: Bowser\'s Challenge',
      type: 'family',
      currentWaitTime: 65,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'donkey-kong-mine-cart',
      name: 'Donkey Kong\'s Mine Cart Madness',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'yoshi-adventure',
      name: 'Yoshi\'s Adventure',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'dark-universe-monsters',
      name: 'Monsters Unchained',
      type: 'thrill',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'how-to-train-dragon-riders',
      name: 'How to Train Your Dragon - Isle of Berk',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'celestial-park',
      name: 'Stardust Racers',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'hollywood-studios': [
    // Star Wars Galaxy's Edge
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
    // Major Thrill Rides
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
    // Toy Story Land
    {
      id: 'toy-story-midway',
      name: 'Toy Story Midway Mania',
      type: 'family',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'slinky-dog-dash',
      name: 'Slinky Dog Dash',
      type: 'family',
      currentWaitTime: 70,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'alien-swirling-saucers',
      name: 'Alien Swirling Saucers',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Other Attractions
    {
      id: 'mickey-minnie-runaway-railway',
      name: 'Mickey & Minnie\'s Runaway Railway',
      type: 'family',
      currentWaitTime: 65,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'star-tours',
      name: 'Star Tours – The Adventures Continue',
      type: 'thrill',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'indiana-jones-epic-stunt',
      name: 'Indiana Jones Epic Stunt Spectacular',
      type: 'show',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'muppet-vision-3d',
      name: 'MuppetVision 3D',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'lightning-mcqueen-racing',
      name: 'Lightning McQueen\'s Racing Academy',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'beauty-and-beast-live',
      name: 'Beauty and the Beast – Live at Hollywood Studios',
      type: 'show',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'frozen-sing-along',
      name: 'For the First Time in Forever: A Frozen Sing-Along Celebration',
      type: 'show',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'fantasmic',
      name: 'Fantasmic!',
      type: 'show',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'animal-kingdom': [
    // Pandora - The World of Avatar
    {
      id: 'avatar-flight-passage',
      name: 'Avatar Flight of Passage',
      type: 'thrill',
      currentWaitTime: 95,
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
    },
    // Major Thrill Rides
    {
      id: 'expedition-everest',
      name: 'Expedition Everest',
      type: 'thrill',
      currentWaitTime: 70,
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
    // Animal Experiences
    {
      id: 'kilimanjaro-safari',
      name: 'Kilimanjaro Safaris',
      type: 'experience',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'maharajah-jungle-trek',
      name: 'Maharajah Jungle Trek',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'gorilla-falls-exploration',
      name: 'Gorilla Falls Exploration Trail',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'wildlife-express-train',
      name: 'Wildlife Express Train',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'affection-section',
      name: 'The Boneyard',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Shows and Entertainment
    {
      id: 'festival-of-lion-king',
      name: 'Festival of the Lion King',
      type: 'show',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'nemo-musical',
      name: 'Finding Nemo - The Musical',
      type: 'show',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'rivers-of-light',
      name: 'Rivers of Light',
      type: 'show',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'up-great-bird-adventure',
      name: 'UP! A Great Bird Adventure',
      type: 'show',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Family Rides
    {
      id: 'tricera-top-spin',
      name: 'TriceraTop Spin',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'primeval-whirl',
      name: 'Primeval Whirl',
      type: 'family',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString()
    }
  ],
  'magic-kingdom': [
    // Major Thrill Rides
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
      id: 'big-thunder-mountain',
      name: 'Big Thunder Mountain Railroad',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'tianas-bayou-adventure',
      name: 'Tiana\'s Bayou Adventure',
      type: 'thrill',
      currentWaitTime: 70,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Classic Dark Rides
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
      id: 'its-a-small-world',
      name: 'it\'s a small world',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'jungle-cruise',
      name: 'Jungle Cruise',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'peter-pans-flight',
      name: 'Peter Pan\'s Flight',
      type: 'family',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Fantasyland Attractions
    {
      id: 'winnie-the-pooh',
      name: 'The Many Adventures of Winnie the Pooh',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'under-the-sea',
      name: 'Under the Sea ~ Journey of The Little Mermaid',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'dumbo-flying-elephant',
      name: 'Dumbo the Flying Elephant',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'mad-tea-party',
      name: 'Mad Tea Party',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'its-tough-bug',
      name: 'it\'s tough to be a bug!',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Tomorrowland Attractions
    {
      id: 'buzz-lightyear',
      name: 'Buzz Lightyear\'s Space Ranger Spin',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'monsters-inc-laugh-floor',
      name: 'Monsters, Inc. Laugh Floor',
      type: 'show',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'carousel-of-progress',
      name: 'Walt Disney\'s Carousel of Progress',
      type: 'experience',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'peoplemover',
      name: 'Tomorrowland Transit Authority PeopleMover',
      type: 'experience',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'astro-orbitor',
      name: 'Astro Orbitor',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Adventureland
    {
      id: 'tiki-room',
      name: 'Walt Disney\'s Enchanted Tiki Room',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'swiss-family-treehouse',
      name: 'Swiss Family Treehouse',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Liberty Square
    {
      id: 'liberty-square-riverboat',
      name: 'Liberty Square Riverboat',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'hall-of-presidents',
      name: 'The Hall of Presidents',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Main Street USA
    {
      id: 'walt-disney-railroad',
      name: 'Walt Disney World Railroad',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'epcot': [
    // Future World Attractions
    {
      id: 'guardians-galaxy',
      name: 'Guardians of the Galaxy: Cosmic Rewind',
      type: 'thrill',
      currentWaitTime: 85,
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
    },
    {
      id: 'living-with-the-land',
      name: 'Living with the Land',
      type: 'experience',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'the-seas-with-nemo',
      name: 'The Seas with Nemo & Friends',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'turtle-talk-with-crush',
      name: 'Turtle Talk with Crush',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'journey-into-imagination',
      name: 'Journey Into Imagination With Figment',
      type: 'family',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // World Showcase Attractions
    {
      id: 'frozen-ever-after',
      name: 'Frozen Ever After',
      type: 'family',
      currentWaitTime: 75,
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
      id: 'gran-fiesta-tour',
      name: 'Gran Fiesta Tour Starring The Three Caballeros',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'american-adventure',
      name: 'The American Adventure',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'impressions-de-france',
      name: 'Impressions de France',
      type: 'show',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Additional Experiences
    {
      id: 'awesome-planet',
      name: 'Awesome Planet',
      type: 'show',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'circle-of-life',
      name: 'The Circle of Life',
      type: 'show',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'disneyland': [
    // Star Wars Galaxy's Edge
    {
      id: 'rise-of-resistance-dl',
      name: 'Star Wars: Rise of the Resistance',
      type: 'thrill',
      currentWaitTime: 110,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'smugglers-run-dl',
      name: 'Millennium Falcon: Smugglers Run',
      type: 'thrill',
      currentWaitTime: 75,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Major Thrill Rides
    {
      id: 'indiana-jones-adventure',
      name: 'Indiana Jones Adventure',
      type: 'thrill',
      currentWaitTime: 75,
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
      id: 'big-thunder-mountain-dl',
      name: 'Big Thunder Mountain Railroad',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'star-tours-dl',
      name: 'Star Tours - The Adventures Continue',
      type: 'thrill',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Classic Dark Rides
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
    },
    {
      id: 'jungle-cruise-dl',
      name: 'Jungle Cruise',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'its-a-small-world-dl',
      name: 'it\'s a small world',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Fantasyland
    {
      id: 'peter-pans-flight-dl',
      name: 'Peter Pan\'s Flight',
      type: 'family',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'winnie-the-pooh-dl',
      name: 'The Many Adventures of Winnie the Pooh',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'snow-white-enchanted-wish',
      name: 'Snow White\'s Enchanted Wish',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'pinocchio-daring-journey',
      name: 'Pinocchio\'s Daring Journey',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'alice-wonderland',
      name: 'Alice in Wonderland',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'mr-toads-wild-ride-dl',
      name: 'Mr. Toad\'s Wild Ride',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Tomorrowland
    {
      id: 'buzz-lightyear-dl',
      name: 'Buzz Lightyear Astro Blasters',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'astro-orbitor-dl',
      name: 'Astro Orbitor',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Other Attractions
    {
      id: 'splash-mountain-dl',
      name: 'Critter Country Splash Mountain',
      type: 'thrill',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'enchanted-tiki-room-dl',
      name: 'Walt Disney\'s Enchanted Tiki Room',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'disneyland-railroad',
      name: 'Disneyland Railroad',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'mark-twain-riverboat-dl',
      name: 'Mark Twain Riverboat',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'disney-california-adventure': [
    // Avengers Campus
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
    // Cars Land
    {
      id: 'radiator-springs-racers',
      name: 'Radiator Springs Racers',
      type: 'thrill',
      currentWaitTime: 90,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'luigis-rollickin-roadsters',
      name: 'Luigi\'s Rollickin\' Roadsters',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'maters-junkyard-jamboree',
      name: 'Mater\'s Junkyard Jamboree',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Pixar Pier
    {
      id: 'incredicoaster',
      name: 'Incredicoaster',
      type: 'thrill',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'pixar-pal-a-round',
      name: 'Pixar Pal-A-Round',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'toy-story-midway-mania-dca',
      name: 'Toy Story Midway Mania!',
      type: 'family',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'inside-out-emotional-whirlwind',
      name: 'Inside Out Emotional Whirlwind',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'silly-symphony-swings',
      name: 'Silly Symphony Swings',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Hollywood Land
    {
      id: 'soarin-over-california',
      name: 'Soarin\' Around the World',
      type: 'family',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'monsters-inc-mike-sulley',
      name: 'Monsters, Inc. Mike & Sulley to the Rescue!',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'hyperion-theater',
      name: 'Hyperion Theater',
      type: 'show',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'animation-academy',
      name: 'Animation Academy',
      type: 'experience',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Paradise Gardens Park
    {
      id: 'little-mermaid-ariel',
      name: 'The Little Mermaid ~ Ariel\'s Undersea Adventure',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'golden-zephyr',
      name: 'Golden Zephyr',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'jumpin-jellyfish',
      name: 'Jumpin\' Jellyfish',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Grizzly Peak
    {
      id: 'grizzly-river-run',
      name: 'Grizzly River Run',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'redwood-creek-challenge',
      name: 'Redwood Creek Challenge Trail',
      type: 'experience',
      currentWaitTime: 0,
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

// Extended attraction data with additional properties for ride logging
export const extendedAttractions: Record<string, ExtendedAttraction[]> = {
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
      id: 'horror-nights-house-1',
      name: 'Halloween Horror Nights House #1',
      type: 'experience',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      isSeasonal: true,
      seasonalPeriod: 'Halloween (Sept-Nov)'
    },
    {
      id: 'horror-nights-house-2',
      name: 'Halloween Horror Nights House #2',
      type: 'experience',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      isSeasonal: true,
      seasonalPeriod: 'Halloween (Sept-Nov)'
    },
    {
      id: 'jaws',
      name: 'Jaws',
      type: 'thrill',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      isDefunct: true
    },
    {
      id: 'back-to-the-future',
      name: 'Back to the Future: The Ride',
      type: 'thrill',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      isDefunct: true
    },
    {
      id: 'ollivanders',
      name: 'Ollivanders',
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
    },
    {
      id: 'et-adventure',
      name: 'E.T. Adventure',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'hogwarts-express-kings-cross',
      name: 'Hogwarts Express - King\'s Cross Station',
      type: 'experience',
      currentWaitTime: 10,
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
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'incredible-hulk',
      name: 'The Incredible Hulk Coaster',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'jurassic-park-river-adventure',
      name: 'Jurassic Park River Adventure',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'amazing-adventures-spiderman',
      name: 'The Amazing Adventures of Spider-Man',
      type: 'thrill',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'epic-universe': [
    {
      id: 'stardust-racers',
      name: 'Stardust Racers',
      type: 'thrill',
      currentWaitTime: 85,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      variants: [
        { id: 'star-track', name: 'Star Track', description: 'Blue track themed to celestial racing' },
        { id: 'nova-track', name: 'Nova Track', description: 'Red track themed to cosmic speed' }
      ]
    },
    {
      id: 'ministry-of-magic',
      name: 'Harry Potter and the Battle at the Ministry',
      type: 'thrill',
      currentWaitTime: 70,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'donkey-kong-mine-cart',
      name: 'Mine-Cart Madness',
      type: 'family',
      currentWaitTime: 65,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'battlestar-galactica': [
    {
      id: 'battlestar-galactica-dueling',
      name: 'Battlestar Galactica: HUMAN vs CYLON',
      type: 'thrill',
      currentWaitTime: 60,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      variants: [
        { id: 'human-track', name: 'HUMAN (Sit-down)', description: 'Traditional sit-down coaster experience' },
        { id: 'cylon-track', name: 'CYLON (Inverted)', description: 'Feet-dangling inverted coaster experience' }
      ]
    }
  ],
  'magic-kingdom': [
    // Major Thrill Rides
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
      id: 'big-thunder-mountain',
      name: 'Big Thunder Mountain Railroad',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'tianas-bayou-adventure',
      name: 'Tiana\'s Bayou Adventure',
      type: 'thrill',
      currentWaitTime: 70,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Classic Dark Rides
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
      id: 'its-a-small-world',
      name: 'it\'s a small world',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'jungle-cruise',
      name: 'Jungle Cruise',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'peter-pans-flight',
      name: 'Peter Pan\'s Flight',
      type: 'family',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Fantasyland Attractions
    {
      id: 'winnie-the-pooh',
      name: 'The Many Adventures of Winnie the Pooh',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'under-the-sea',
      name: 'Under the Sea ~ Journey of The Little Mermaid',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'dumbo-flying-elephant',
      name: 'Dumbo the Flying Elephant',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'mad-tea-party',
      name: 'Mad Tea Party',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'its-tough-bug',
      name: 'it\'s tough to be a bug!',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Tomorrowland Attractions
    {
      id: 'buzz-lightyear',
      name: 'Buzz Lightyear\'s Space Ranger Spin',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'monsters-inc-laugh-floor',
      name: 'Monsters, Inc. Laugh Floor',
      type: 'show',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'carousel-of-progress',
      name: 'Walt Disney\'s Carousel of Progress',
      type: 'experience',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'peoplemover',
      name: 'Tomorrowland Transit Authority PeopleMover',
      type: 'experience',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'astro-orbitor',
      name: 'Astro Orbitor',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Adventureland
    {
      id: 'tiki-room',
      name: 'Walt Disney\'s Enchanted Tiki Room',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'swiss-family-treehouse',
      name: 'Swiss Family Treehouse',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Liberty Square
    {
      id: 'liberty-square-riverboat',
      name: 'Liberty Square Riverboat',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'hall-of-presidents',
      name: 'The Hall of Presidents',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Main Street USA
    {
      id: 'walt-disney-railroad',
      name: 'Walt Disney World Railroad',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Seasonal Events
    {
      id: 'mickeys-very-merry-christmas-party',
      name: 'Mickey\'s Very Merry Christmas Party',
      type: 'show',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      isSeasonal: true,
      seasonalPeriod: 'Christmas (Nov-Dec)'
    },
    {
      id: 'mickeys-not-so-scary-halloween-party',
      name: 'Mickey\'s Not-So-Scary Halloween Party',
      type: 'show',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      isSeasonal: true,
      seasonalPeriod: 'Halloween (Aug-Nov)'
    },
    // Defunct Attractions
    {
      id: 'old-splash-mountain',
      name: 'Splash Mountain (Original)',
      type: 'thrill',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      isDefunct: true
    },
    {
      id: 'mr-toads-wild-ride',
      name: 'Mr. Toad\'s Wild Ride',
      type: 'family',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      isDefunct: true
    }
  ]
}

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
    
    // Initialize data for missing or all parks using the comprehensive sample attractions
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