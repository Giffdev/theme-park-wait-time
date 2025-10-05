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
    id: 'knotts-berry-farm',
    name: 'Knott\'s Berry Farm',
    location: 'Buena Park, CA',
    description: 'America\'s first theme park with classic attractions and seasonal events',
    parks: [
      { id: 'knotts-berry-farm', name: 'Knott\'s Berry Farm', shortName: 'Knott\'s Berry Farm', type: 'theme-park' },
      { id: 'knotts-soak-city', name: 'Knott\'s Soak City', shortName: 'Soak City', type: 'water-park' }
    ]
  },
  {
    id: 'worlds-of-fun',
    name: 'Worlds of Fun & Oceans of Fun',
    location: 'Kansas City, MO',
    description: 'Midwest thrills with world-class roller coasters and a tropical water park',
    parks: [
      { id: 'worlds-of-fun', name: 'Worlds of Fun', shortName: 'Worlds of Fun', type: 'theme-park' },
      { id: 'oceans-of-fun', name: 'Oceans of Fun', shortName: 'Oceans of Fun', type: 'water-park' }
    ]
  },
  {
    id: 'silverwood',
    name: 'Silverwood Theme Park',
    location: 'Athol, ID',
    description: 'Pacific Northwest\'s largest theme park featuring thrilling coasters and a vintage atmosphere',
    parks: [
      { id: 'silverwood', name: 'Silverwood Theme Park', shortName: 'Silverwood', type: 'theme-park' },
      { id: 'boulder-beach', name: 'Boulder Beach Water Park', shortName: 'Boulder Beach', type: 'water-park' }
    ]
  }
]

export const sampleAttractions: Record<string, ExtendedAttraction[]> = {
  'universal-studios-orlando': [
    {
      id: 'harry-potter-escape-gringotts',
      name: 'Harry Potter and the Escape from Gringotts',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2014
    },
    {
      id: 'transformers-3d',
      name: 'Transformers: The Ride 3D',
      type: 'thrill',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2013
    },
    {
      id: 'simpsons-ride',
      name: 'The Simpsons Ride',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2008
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
    },
    {
      id: 'doctor-doom-fearfall',
      name: 'Doctor Doom\'s Fearfall',
      type: 'thrill',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'one-fish-two-fish',
      name: 'One Fish, Two Fish, Red Fish, Blue Fish',
      type: 'family',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'me-ship-olive',
      name: 'Me Ship, The Olive',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'jurassic-park-discovery-center',
      name: 'Jurassic Park Discovery Center',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'epic-universe': [
    // Super Nintendo World
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
      name: 'Donkey Kong Country Mine-Cart Madness',
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
    // The Wizarding World of Harry Potter - Ministry of Magic
    {
      id: 'ministry-of-magic',
      name: 'Harry Potter and the Battle at the Ministry',
      type: 'thrill',
      currentWaitTime: 90,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'floo-network',
      name: 'The Floo Network',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // How to Train Your Dragon - Isle of Berk
    {
      id: 'how-to-train-dragon-riders',
      name: 'How to Train Your Dragon - Untrainable Dragon',
      type: 'thrill',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'hiccup-wing-gliders',
      name: 'Hiccup\'s Wing Gliders',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Dark Universe
    {
      id: 'dark-universe-monsters',
      name: 'Monsters Unchained: The Frankenstein Experiment',
      type: 'thrill',
      currentWaitTime: 75,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'curse-of-the-werewolf',
      name: 'Curse of the Werewolf',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },

    // Celestial Park
    {
      id: 'stardust-racers',
      name: 'Stardust Racers',
      type: 'thrill',
      currentWaitTime: 85,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'constellation-carousel',
      name: 'Constellation Carousel',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'moon-base',
      name: 'Lunar Lander',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Shows and Entertainment
    {
      id: 'nintendo-power-up-show',
      name: 'Nintendo Power-Up Summer',
      type: 'show',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'dragon-training-academy',
      name: 'Dragon Training Academy',
      type: 'show',
      currentWaitTime: 15,
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
    },
    // Additional Attractions
    {
      id: 'voyage-little-mermaid',
      name: 'The Little Mermaid - A Musical Adventure',
      type: 'show',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'walt-disney-one-mans-dream',
      name: 'Walt Disney: One Man\'s Dream',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'disney-junior-play-dance-party',
      name: 'Disney Junior Play and Dance Party!',
      type: 'show',
      currentWaitTime: 5,
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
    {
      id: 'its-tough-bug',
      name: 'It\'s Tough To Be A Bug!',
      type: 'show',
      currentWaitTime: 5,
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
    // === ACTIVE ATTRACTIONS ===
    
    // Major Thrill Rides
    {
      id: 'space-mountain',
      name: 'Space Mountain',
      type: 'thrill',
      currentWaitTime: 65,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1975
    },
    {
      id: 'seven-dwarfs-mine-train',
      name: 'Seven Dwarfs Mine Train',
      type: 'family',
      currentWaitTime: 80,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2014
    },
    {
      id: 'big-thunder-mountain',
      name: 'Big Thunder Mountain Railroad',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1980
    },
    {
      id: 'tianas-bayou-adventure',
      name: 'Tiana\'s Bayou Adventure',
      type: 'thrill',
      currentWaitTime: 70,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2024
    },
    
    // Classic Dark Rides
    {
      id: 'pirates-caribbean',
      name: 'Pirates of the Caribbean',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1973
    },
    {
      id: 'haunted-mansion',
      name: 'Haunted Mansion',
      type: 'family',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1971
    },
    {
      id: 'its-a-small-world',
      name: 'It\'s A Small World',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1971
    },
    {
      id: 'jungle-cruise',
      name: 'Jungle Cruise',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1971
    },
    {
      id: 'peter-pans-flight',
      name: 'Peter Pan\'s Flight',
      type: 'family',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1971
    },
    
    // Fantasyland Attractions
    {
      id: 'winnie-the-pooh',
      name: 'The Many Adventures of Winnie the Pooh',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1999
    },
    {
      id: 'under-the-sea',
      name: 'Under the Sea ~ Journey of The Little Mermaid',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2012
    },
    {
      id: 'dumbo-flying-elephant',
      name: 'Dumbo the Flying Elephant',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1971
    },
    {
      id: 'mad-tea-party',
      name: 'Mad Tea Party',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1971
    },
    
    // Tomorrowland Attractions
    {
      id: 'buzz-lightyear',
      name: 'Buzz Lightyear\'s Space Ranger Spin',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1998
    },
    {
      id: 'carousel-of-progress',
      name: 'Walt Disney\'s Carousel of Progress',
      type: 'experience',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1975
    },
    {
      id: 'peoplemover',
      name: 'Tomorrowland Transit Authority PeopleMover',
      type: 'experience',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1975
    },
    {
      id: 'astro-orbitor',
      name: 'Astro Orbitor',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1994
    },
    
    // Adventureland
    {
      id: 'tiki-room',
      name: 'Walt Disney\'s Enchanted Tiki Room',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1971
    },
    {
      id: 'swiss-family-treehouse',
      name: 'Swiss Family Treehouse',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1973
    },
    
    // Liberty Square
    {
      id: 'liberty-square-riverboat',
      name: 'Liberty Square Riverboat',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1973
    },
    {
      id: 'hall-of-presidents',
      name: 'The Hall of Presidents',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1971
    },
    
    // Active Shows & Entertainment
    {
      id: 'monsters-inc-laugh-floor',
      name: 'Monsters, Inc. Laugh Floor',
      type: 'show',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2007
    },
    {
      id: 'happily-ever-after',
      name: 'Happily Ever After',
      type: 'show',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      description: 'Nighttime fireworks spectacular',
      openingYear: 2017
    },
    {
      id: 'walt-disney-railroad',
      name: 'Walt Disney World Railroad',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1971
    },
    
    // Active Parades
    {
      id: 'festival-of-fantasy',
      name: 'Festival of Fantasy Parade',
      type: 'parade',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      description: 'Daily afternoon parade celebrating Disney films',
      openingYear: 2014
    },
    
    // Active Character Experiences
    {
      id: 'mickey-toontown-meet',
      name: 'Meet Mickey at Town Square Theater',
      type: 'character-meet',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2012
    },
    {
      id: 'princess-fairytale-hall',
      name: 'Princess Fairytale Hall',
      type: 'character-meet',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2013
    },
    
    // === LIMITED/SEASONAL ATTRACTIONS ===
    
    {
      id: 'mickeys-very-merry-christmas',
      name: 'Mickey\'s Very Merry Christmas Party',
      type: 'show',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'limited',
      description: 'Special ticketed holiday event',
      isSeasonal: true,
      seasonalPeriod: 'Christmas'
    },
    {
      id: 'mickeys-not-so-scary-halloween',
      name: 'Mickey\'s Not-So-Scary Halloween Party',
      type: 'show',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'limited',
      description: 'Special ticketed Halloween event',
      isSeasonal: true,
      seasonalPeriod: 'Halloween'
    },
    
    // === RETIRED ATTRACTIONS ===
    
    {
      id: 'splash-mountain-mk',
      name: 'Splash Mountain',
      type: 'thrill',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'retired',
      description: 'Log flume ride through Song of the South scenes',
      openingYear: 1992,
      closingYear: 2023
    },
    {
      id: 'mr-toads-wild-ride-mk',
      name: 'Mr. Toad\'s Wild Ride',
      type: 'family',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'retired',
      description: 'Dark ride through The Wind in the Willows',
      openingYear: 1971,
      closingYear: 1998
    },
    {
      id: '20000-leagues-mk',
      name: '20,000 Leagues Under the Sea',
      type: 'family',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'retired',
      description: 'Submarine voyage attraction',
      openingYear: 1971,
      closingYear: 1994
    },
    {
      id: 'spectromagic',
      name: 'SpectroMagic',
      type: 'parade',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'retired',
      description: 'Fiber optic and holographic nighttime parade',
      openingYear: 1991,
      closingYear: 2010
    },
    {
      id: 'wishes-fireworks',
      name: 'Wishes: A Magical Gathering of Disney Dreams',
      type: 'show',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'retired',
      description: 'Former nighttime fireworks spectacular',
      openingYear: 2003,
      closingYear: 2017
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
    }
  ],
  'disneyland': [
    // === ACTIVE ATTRACTIONS ===
    
    // Star Wars Galaxy's Edge
    {
      id: 'rise-of-resistance-dl',
      name: 'Star Wars: Rise of the Resistance',
      type: 'thrill',
      currentWaitTime: 110,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2019
    },
    {
      id: 'smugglers-run-dl',
      name: 'Millennium Falcon: Smugglers Run',
      type: 'thrill',
      currentWaitTime: 75,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2019
    },
    
    // Major Thrill Rides
    {
      id: 'indiana-jones-adventure',
      name: 'Indiana Jones Adventure',
      type: 'thrill',
      currentWaitTime: 75,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1995
    },
    {
      id: 'matterhorn-bobsleds',
      name: 'Matterhorn Bobsleds',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1959
    },
    {
      id: 'space-mountain-dl',
      name: 'Space Mountain',
      type: 'thrill',
      currentWaitTime: 65,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1977
    },
    {
      id: 'big-thunder-mountain-dl',
      name: 'Big Thunder Mountain Railroad',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1979
    },
    {
      id: 'star-tours-dl',
      name: 'Star Tours - The Adventures Continue',
      type: 'thrill',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2011
    },
    
    // Classic Dark Rides
    {
      id: 'pirates-caribbean-dl',
      name: 'Pirates of the Caribbean',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1967
    },
    {
      id: 'haunted-mansion-dl',
      name: 'Haunted Mansion',
      type: 'family',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1969
    },
    {
      id: 'jungle-cruise-dl',
      name: 'Jungle Cruise',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1955
    },
    {
      id: 'its-a-small-world-dl',
      name: 'It\'s A Small World',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1966
    },
    
    // Fantasyland Active Rides
    {
      id: 'peter-pans-flight-dl',
      name: 'Peter Pan\'s Flight',
      type: 'family',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1955
    },
    {
      id: 'winnie-the-pooh-dl',
      name: 'The Many Adventures of Winnie the Pooh',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2003
    },
    {
      id: 'snow-white-enchanted-wish',
      name: 'Snow White\'s Enchanted Wish',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2021
    },
    {
      id: 'pinocchio-daring-journey',
      name: 'Pinocchio\'s Daring Journey',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1983
    },
    {
      id: 'alice-wonderland',
      name: 'Alice in Wonderland',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1958
    },
    {
      id: 'mr-toads-wild-ride-dl',
      name: 'Mr. Toad\'s Wild Ride',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1955
    },
    
    // Tomorrowland Active Rides - EXAMPLES FROM USER
    {
      id: 'buzz-lightyear-dl',
      name: 'Buzz Lightyear Astro Blasters',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 2005
    },
    {
      id: 'chip-dale-gadgetcoaster',
      name: 'Chip \'n\' Dale\'s GADGETcoaster',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1993
    },
    {
      id: 'astro-orbitor-dl',
      name: 'Astro Orbitor',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1998
    },
    
    // Active Shows & Entertainment - EXAMPLES FROM USER
    {
      id: 'enchanted-tiki-room-dl',
      name: 'Walt Disney\'s Enchanted Tiki Room',
      type: 'show',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1963
    },
    {
      id: 'dapper-dans',
      name: 'The Dapper Dans',
      type: 'show',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      description: 'Barbershop quartet performing on Main Street',
      openingYear: 1959
    },
    {
      id: 'disneyland-band',
      name: 'The Disneyland Band',
      type: 'show',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      description: 'Marching band performances throughout the park',
      openingYear: 1955
    },
    {
      id: 'fantasmic-dl',
      name: 'Fantasmic!',
      type: 'show',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      description: 'Nighttime spectacular at Rivers of America',
      openingYear: 1992
    },
    
    // Active Parades - EXAMPLES FROM USER
    {
      id: 'paint-the-night',
      name: 'Paint the Night',
      type: 'parade',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      description: 'LED-illuminated nighttime parade',
      openingYear: 2015
    },
    
    // Active Experiences
    {
      id: 'disneyland-railroad',
      name: 'Disneyland Railroad',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1955
    },
    {
      id: 'mark-twain-riverboat-dl',
      name: 'Mark Twain Riverboat',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString(),
      availability: 'active',
      openingYear: 1955
    },
    
    // === LIMITED/SEASONAL ATTRACTIONS - EXAMPLES FROM USER ===
    
    {
      id: 'haunted-mansion-holiday',
      name: 'Haunted Mansion Holiday',
      type: 'family',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'limited',
      description: 'Nightmare Before Christmas overlay during Halloween/Christmas seasons',
      isSeasonal: true,
      seasonalPeriod: 'Halloween/Christmas'
    },
    {
      id: 'hyperspace-mountain',
      name: 'Hyperspace Mountain',
      type: 'thrill',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'limited',
      description: 'Star Wars overlay for Space Mountain',
      isSeasonal: true,
      seasonalPeriod: 'Special Events'
    },
    {
      id: 'shadows-of-memory-skywalker',
      name: 'Shadows of Memory: A Skywalker Saga',
      type: 'experience',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'limited',
      description: 'Limited-time Star Wars experience',
      isSeasonal: true
    },
    
    // === RETIRED ATTRACTIONS - EXAMPLES FROM USER ===
    
    {
      id: '20000-leagues-under-sea',
      name: '20,000 Leagues Under the Sea Exhibit',
      type: 'experience',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'retired',
      description: 'Walk-through attraction based on the Disney film',
      openingYear: 1955,
      closingYear: 1966
    },
    {
      id: 'aladdins-oasis-show',
      name: 'Aladdin\'s Oasis Show',
      type: 'show',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'retired',
      description: 'Live musical show based on Aladdin',
      openingYear: 1993,
      closingYear: 2016
    },
    {
      id: 'chip-dale-treehouse',
      name: 'Chip \'n\' Dale\'s Treehouse',
      type: 'experience',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'retired',
      description: 'Climb-through treehouse attraction',
      openingYear: 1962,
      closingYear: 1999
    },
    {
      id: 'country-bear-jamboree-dl',
      name: 'Country Bear Jamboree',
      type: 'show',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'retired',
      description: 'Audio-animatronic country music show',
      openingYear: 1972,
      closingYear: 2001
    },
    {
      id: 'fantasyland-autopia',
      name: 'Fantasyland Autopia',
      type: 'family',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'retired',
      description: 'Original Autopia location in Fantasyland',
      openingYear: 1955,
      closingYear: 1999
    },
    {
      id: 'splash-mountain-dl',
      name: 'Splash Mountain',
      type: 'thrill',
      currentWaitTime: 0,
      status: 'closed',
      lastUpdated: new Date().toISOString(),
      availability: 'retired',
      description: 'Log flume ride through Song of the South scenes',
      openingYear: 1989,
      closingYear: 2023
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
    },
    {
      id: 'mario-kart-bowsers-challenge-hollywood',
      name: 'Mario Kart: Bowser\'s Challenge',
      type: 'family',
      currentWaitTime: 75,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'flight-of-hippogriff-hollywood',
      name: 'Flight of the Hippogriff',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'ollivanders-hollywood',
      name: 'Ollivanders',
      type: 'experience',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'simpsons-ride-hollywood',
      name: 'The Simpsons Ride',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'despicable-me-minion-mayhem-hollywood',
      name: 'Despicable Me Minion Mayhem',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'super-nintendo-world-power-up-band',
      name: 'Super Nintendo World Experience',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'walking-dead-attractions',
      name: 'The Walking Dead Attractions',
      type: 'experience',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'waterworld',
      name: 'Waterworld',
      type: 'show',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'animal-actors',
      name: 'Universal\'s Animal Actors',
      type: 'show',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'special-effects-show',
      name: 'Special Effects Show',
      type: 'show',
      currentWaitTime: 15,
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
    },
    {
      id: 'ninja-mm',
      name: 'Ninja',
      type: 'thrill',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'revolution',
      name: 'Revolution',
      type: 'thrill',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'viper-mm',
      name: 'Viper',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'riddlers-revenge',
      name: 'Riddler\'s Revenge',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'scream-mm',
      name: 'Scream!',
      type: 'thrill',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'apocalypse',
      name: 'Apocalypse',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'green-lantern',
      name: 'Green Lantern: First Flight',
      type: 'thrill',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'magic-mountain-skycoaster',
      name: 'Lex Luthor: Drop of Doom',
      type: 'thrill',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'superman-escape',
      name: 'Superman: Escape from Krypton',
      type: 'thrill',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'gold-rusher',
      name: 'Gold Rusher',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'canyon-blaster',
      name: 'Canyon Blaster',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'magic-flyer',
      name: 'Magic Flyer',
      type: 'family',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'swashbuckler',
      name: 'Swashbuckler',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'wonder-woman-flight-of-courage',
      name: 'Wonder Woman Flight of Courage',
      type: 'thrill',
      currentWaitTime: 70,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'west-coast-racers',
      name: 'West Coast Racers',
      type: 'thrill',
      currentWaitTime: 60,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'crazanity',
      name: 'CraZanity',
      type: 'thrill',
      currentWaitTime: 20,
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
    },
    {
      id: 'the-joker-ga',
      name: 'The Joker',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'green-lantern-ga',
      name: 'Green Lantern',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'bizarro-ga',
      name: 'Bizarro',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'skull-mountain',
      name: 'Skull Mountain',
      type: 'thrill',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'dark-knight-coaster',
      name: 'The Dark Knight Coaster',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'runaway-mine-train',
      name: 'Runaway Mine Train',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'justice-league-battle',
      name: 'Justice League: Battle for Metropolis',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'safari-off-road',
      name: 'Safari Off Road Adventure',
      type: 'experience',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'skyway',
      name: 'Six Flags Skyway',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'log-flume',
      name: 'Log Flume',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'parachuters',
      name: 'Parachuter\'s Perch',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'tea-cups',
      name: 'Tea Cups',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'wonder-woman-lasso',
      name: 'Wonder Woman Lasso of Truth',
      type: 'thrill',
      currentWaitTime: 65,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'jersey-devil-coaster',
      name: 'Jersey Devil Coaster',
      type: 'thrill',
      currentWaitTime: 75,
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
    },
    {
      id: 'magnum-xl-200',
      name: 'Magnum XL-200',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'rougarou',
      name: 'Rougarou',
      type: 'thrill',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'power-tower',
      name: 'Power Tower',
      type: 'thrill',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'top-thrill-2',
      name: 'Top Thrill 2',
      type: 'thrill',
      currentWaitTime: 120,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'blue-streak',
      name: 'Blue Streak',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'iron-dragon',
      name: 'Iron Dragon',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'mine-ride',
      name: 'Cedar Creek Mine Ride',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'gemini',
      name: 'Gemini',
      type: 'thrill',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'corkscrew',
      name: 'Corkscrew',
      type: 'thrill',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'skyhawk',
      name: 'Skyhawk',
      type: 'thrill',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'windseeker',
      name: 'WindSeeker',
      type: 'thrill',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'wild-mouse',
      name: 'Wild Mouse',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'snake-river-expedition',
      name: 'Snake River Expedition',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'cp-midway-carousel',
      name: 'Cedar Point & Lake Erie Railroad',
      type: 'experience',
      currentWaitTime: 10,
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
    },
    {
      id: 'jaguar',
      name: 'Jaguar!',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'montezoomas-revenge',
      name: 'MonteZOOMa\'s Revenge',
      type: 'thrill',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'timber-mountain-log-ride',
      name: 'Timber Mountain Log Ride',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'calico-river-rapids',
      name: 'Calico River Rapids',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'pony-express',
      name: 'Pony Express',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'coast-rider',
      name: 'Coast Rider',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'calico-mine-ride',
      name: 'Calico Mine Ride',
      type: 'experience',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'waveswinger',
      name: 'Waveswinger',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'grand-sierra-railroad',
      name: 'Knott\'s Bear-y Tales: Return to the Fair',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'bigfoot-rapids',
      name: 'Bigfoot Rapids',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'sierra-sidewinder',
      name: 'Sierra Sidewinder',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'spinning-coaster',
      name: 'Spinning Coaster',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'fiesta-village-carousel',
      name: 'Fiesta Village Carousel',
      type: 'family',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'blizzard-beach': [
    {
      id: 'summit-plummet',
      name: 'Summit Plummet',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'slush-gusher',
      name: 'Slush Gusher',
      type: 'thrill',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'teamboat-springs',
      name: 'Teamboat Springs',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'runoff-rapids',
      name: 'Runoff Rapids',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'toboggan-racers',
      name: 'Toboggan Racers',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'snow-stormers',
      name: 'Snow Stormers',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'downhill-double-dipper',
      name: 'Downhill Double Dipper',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'ski-patrol-training-camp',
      name: 'Ski Patrol Training Camp',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'tikes-peak',
      name: 'Tike\'s Peak',
      type: 'family',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'cross-country-creek',
      name: 'Cross Country Creek',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'melt-away-bay',
      name: 'Melt-Away Bay',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'typhoon-lagoon': [
    {
      id: 'crush-n-gusher',
      name: 'Crush \'n\' Gusher',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'humunga-kowabunga',
      name: 'Humunga Kowabunga',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'mayday-falls',
      name: 'Mayday Falls',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'keelhaul-falls',
      name: 'Keelhaul Falls',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'gangway-falls',
      name: 'Gangway Falls',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'storm-slides',
      name: 'Storm Slides',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'bay-slides',
      name: 'Bay Slides',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'ketchakiddee-creek',
      name: 'Ketchakiddee Creek',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'castaway-creek',
      name: 'Castaway Creek',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'typhoon-lagoon-surf-pool',
      name: 'Typhoon Lagoon Surf Pool',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'volcano-bay': [
    {
      id: 'krakatau-aqua-coaster',
      name: 'Krakatau Aqua Coaster',
      type: 'thrill',
      currentWaitTime: 60,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'ko-okiri-body-plunge',
      name: 'Ko\'okiri Body Plunge',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'kala-serpentine-body-slides',
      name: 'Kala & Ta Nui Serpentine Body Slides',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'punga-racers',
      name: 'Punga Racers',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'ohyah-ohno-drop-slides',
      name: 'Ohyah and Ohno Drop Slides',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'maku-round-raft-rides',
      name: 'Maku & Puihi Round Raft Rides',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'taniwha-tubes',
      name: 'Taniwha Tubes',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'honu-ika-moana',
      name: 'Honu & Ika Moana',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'kopiko-wai-winding-river',
      name: 'Kopiko Wai Winding River',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'waturi-beach',
      name: 'Waturi Beach',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'runamukka-reef',
      name: 'Runamukka Reef',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'tot-tiki-reef',
      name: 'Tot Tiki Reef',
      type: 'family',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'six-flags-hurricane-harbor-nj': [
    {
      id: 'tornado',
      name: 'Tornado',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'cannonball-falls',
      name: 'Cannonball Falls',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'zambezi-zinger',
      name: 'Zambezi Zinger',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'python-plunge',
      name: 'Python Plunge',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'bahama-blaster',
      name: 'Bahama Blaster',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'adventure-river',
      name: 'Adventure River',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'buccaneer-beach-wave-pool',
      name: 'Buccaneer Beach Wave Pool',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'cedar-point-shores': [
    {
      id: 'magnum-walk',
      name: 'Magnum Walk',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'pipeline-paradise',
      name: 'Pipeline Paradise',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'breakwater-falls',
      name: 'Breakwater Falls',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'lakeside-landing',
      name: 'Lakeside Landing',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'point-plummet',
      name: 'Point Plummet',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'splashzone',
      name: 'SplashZone',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'lazy-river',
      name: 'Lazy River',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'wave-pool-shores',
      name: 'Wave Pool',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'knotts-soak-city': [
    {
      id: 'the-wedge',
      name: 'The Wedge',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'pacific-spin',
      name: 'Pacific Spin',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'shore-break',
      name: 'Shore Break',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'sunset-river',
      name: 'Sunset River',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'tidal-wave-bay',
      name: 'Tidal Wave Bay',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'gremmie-lagoon',
      name: 'Gremmie Lagoon',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'worlds-of-fun': [
    // Major Roller Coasters
    {
      id: 'mamba',
      name: 'Mamba',
      type: 'thrill',
      currentWaitTime: 55,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'prowler',
      name: 'Prowler',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'patriot',
      name: 'Patriot',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'spinning-dragons',
      name: 'Spinning Dragons',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'boomerang',
      name: 'Boomerang',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'timber-wolf',
      name: 'Timber Wolf',
      type: 'thrill',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Family Attractions
    {
      id: 'viking-voyager',
      name: 'Viking Voyager',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'le-taxi-tour',
      name: 'Le TaxiTour',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'fury-of-the-nile-river-adventure',
      name: 'Fury of the Nile River Adventure',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'detonator',
      name: 'Detonator',
      type: 'thrill',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'cyclone-sam-log-flume',
      name: 'Cyclone Sam\'s Log Flume',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'bamboozler',
      name: 'Bamboozler',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'mustang-runner',
      name: 'Mustang Runner',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Kids' Attractions
    {
      id: 'camp-snoopy-grand-sierra-railroad',
      name: 'Camp Snoopy Grand Sierra Railroad',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'charlie-brown-wind-up',
      name: 'Charlie Brown\'s Wind Up',
      type: 'family',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'woodstock-express',
      name: 'Woodstock Express',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'snoopy-space-buggies',
      name: 'Snoopy\'s Space Buggies',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Shows and Entertainment
    {
      id: 'peanuts-celebration',
      name: 'Peanuts Celebration',
      type: 'show',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'worlds-of-fun-theater',
      name: 'Worlds of Fun Theater',
      type: 'show',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Flat Rides
    {
      id: 'ripcord',
      name: 'Ripcord',
      type: 'thrill',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'tilt-a-whirl',
      name: 'Tilt-A-Whirl',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'the-orient-express',
      name: 'The Orient Express',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'oceans-of-fun': [
    // Major Water Slides
    {
      id: 'aruba-tuba',
      name: 'Aruba Tuba',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'eclipse',
      name: 'Eclipse',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'hurricane-falls',
      name: 'Hurricane Falls',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'coconut-cove',
      name: 'Coconut Cove',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'surf-city-splashout',
      name: 'Surf City Splashout',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'barracuda-blasters',
      name: 'Barracuda Blasters',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'splashta-mania',
      name: 'Splashta Mania',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'crocodile-isle',
      name: 'Crocodile Isle',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Racing Slides
    {
      id: 'bermuda-triangle',
      name: 'Bermuda Triangle',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'caribbean-cooler',
      name: 'Caribbean Cooler',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Pool Areas
    {
      id: 'calypso-coves-activity-pool',
      name: 'Calypso Cove\'s Activity Pool',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'hurricane-harbor-wave-pool',
      name: 'Hurricane Harbor Wave Pool',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'pelican-cove-kids-area',
      name: 'Pelican Cove Kids Area',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Lazy River
    {
      id: 'castaway-creek-lazy-river',
      name: 'Castaway Creek Lazy River',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Multi-Slide Complex
    {
      id: 'shark-attack',
      name: 'Shark Attack',
      type: 'thrill',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'monsoon-lagoon',
      name: 'Monsoon Lagoon',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'silverwood': [
    // Major Roller Coasters
    {
      id: 'stunt-pilot',
      name: 'Stunt Pilot',
      type: 'thrill',
      currentWaitTime: 65,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'aftershock',
      name: 'Aftershock',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'tremors',
      name: 'Tremors',
      type: 'thrill',
      currentWaitTime: 40,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'timber-terror',
      name: 'Timber Terror',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'corkscrew',
      name: 'Corkscrew',
      type: 'thrill',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'gravity-defying-corkscrew',
      name: 'Gravity Defying Corkscrew',
      type: 'thrill',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Family Coasters
    {
      id: 'spinning-out',
      name: 'Spinning Out',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'tiny-tot-coaster',
      name: 'Tiny Tot Coaster',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Thrill Rides
    {
      id: 'panic-plunge',
      name: 'Panic Plunge',
      type: 'thrill',
      currentWaitTime: 50,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'ripcord',
      name: 'Ripcord',
      type: 'thrill',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'thunder-canyon',
      name: 'Thunder Canyon',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'barnstormer',
      name: 'Barnstormer',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Vintage Attractions
    {
      id: 'narrow-gauge-railroad',
      name: 'Narrow Gauge Railroad',
      type: 'experience',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'antique-carousel',
      name: 'Antique Carousel',
      type: 'family',
      currentWaitTime: 15,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'vintage-cars',
      name: 'Vintage Cars',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Games and Experiences
    {
      id: 'garfield-summer-fair',
      name: 'Garfield\'s Summer Fair',
      type: 'experience',
      currentWaitTime: 5,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'boulder-beach-entrance',
      name: 'Boulder Beach Water Park',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ],
  'boulder-beach': [
    // Major Water Slides
    {
      id: 'velocity-peak',
      name: 'Velocity Peak',
      type: 'thrill',
      currentWaitTime: 60,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'avalanche-mountain',
      name: 'Avalanche Mountain',
      type: 'thrill',
      currentWaitTime: 45,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'magic-carpet-ride',
      name: 'Magic Carpet Ride',
      type: 'family',
      currentWaitTime: 35,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'big-moose-lodge-slides',
      name: 'Big Moose Lodge Slides',
      type: 'family',
      currentWaitTime: 30,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Pool Areas
    {
      id: 'wave-pool',
      name: 'Wave Pool',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'activity-pool',
      name: 'Activity Pool',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'toddler-lagoon',
      name: 'Toddler Lagoon',
      type: 'family',
      currentWaitTime: 10,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Lazy River
    {
      id: 'lazy-river',
      name: 'Lazy River',
      type: 'experience',
      currentWaitTime: 0,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    // Multi-Slide Complex
    {
      id: 'boulder-beach-racers',
      name: 'Boulder Beach Racers',
      type: 'family',
      currentWaitTime: 25,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    },
    {
      id: 'family-fun-slides',
      name: 'Family Fun Slides',
      type: 'family',
      currentWaitTime: 20,
      status: 'operating',
      lastUpdated: new Date().toISOString()
    }
  ]
}

// Extended attraction data with additional properties for ride logging
export const extendedAttractions: Record<string, ExtendedAttraction[]> = {
  // Extended attractions for special features - not currently used by main app
}

export async function initializeSampleData() {
  try {
    // Ensure spark is available with a wait
    let attempts = 0
    while (attempts < 10 && (!window.spark || !window.spark.kv)) {
      console.log(`⏳ Waiting for Spark KV to be available... (${attempts + 1}/10)`)
      await new Promise(resolve => setTimeout(resolve, 100))
      attempts++
    }
    
    if (!window.spark || !window.spark.kv) {
      console.error('❌ Spark KV not available after waiting')
      return false
    }
    
    const { kv } = window.spark
    console.log('🚀 Starting robust sample data initialization...')
    
    // Check if data already exists for key parks
    const keyParks = ['magic-kingdom', 'epcot', 'hollywood-studios', 'animal-kingdom', 'universal-studios-orlando', 'islands-of-adventure']
    let existingCount = 0
    
    for (const parkId of keyParks) {
      try {
        const existing = await kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
        if (existing && Array.isArray(existing) && existing.length > 0) {
          existingCount++
          console.log(`✅ ${parkId} already has ${existing.length} attractions`)
        }
      } catch (err) {
        console.log(`🔍 ${parkId} not found, will seed`)
      }
    }
    
    // If most key parks already have data, skip initialization
    if (existingCount >= 4) {
      console.log(`🎉 Data already initialized (${existingCount}/6 key parks found)`)
      return true
    }
    
    console.log(`📊 Seeding data for all parks (found ${existingCount}/6 key parks)`)
    
    // Initialize all parks at once with better error handling
    let successCount = 0
    const totalParks = Object.keys(sampleAttractions).length
    
    for (const [parkId, attractions] of Object.entries(sampleAttractions)) {
      try {
        if (attractions && Array.isArray(attractions) && attractions.length > 0) {
          // Use a more robust set operation with retries
          let setSuccess = false
          let retries = 0
          
          while (!setSuccess && retries < 3) {
            try {
              await kv.set(`attractions-${parkId}`, attractions)
              // Verify the data was actually set
              const verification = await kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
              if (verification && Array.isArray(verification) && verification.length === attractions.length) {
                setSuccess = true
                successCount++
                console.log(`✅ Successfully seeded ${parkId} (${attractions.length} attractions)`)
              } else {
                throw new Error('Verification failed after set')
              }
            } catch (retryError) {
              retries++
              console.warn(`⚠️ Retry ${retries}/3 for ${parkId}:`, retryError)
              if (retries < 3) {
                await new Promise(resolve => setTimeout(resolve, 100))
              }
            }
          }
          
          if (!setSuccess) {
            console.error(`❌ Failed to seed ${parkId} after 3 retries`)
          }
        }
      } catch (error) {
        console.error(`❌ Error seeding ${parkId}:`, error)
      }
    }
    
    console.log(`🎉 Initialization complete: ${successCount}/${totalParks} parks seeded`)
    
    // Final verification of key parks
    let finalVerifiedCount = 0
    for (const parkId of keyParks) {
      try {
        const data = await kv.get<ExtendedAttraction[]>(`attractions-${parkId}`)
        if (data && Array.isArray(data) && data.length > 0) {
          finalVerifiedCount++
        }
      } catch (verifyError) {
        console.error(`❌ Final verification failed for ${parkId}:`, verifyError)
      }
    }
    
    console.log(`🔍 Final verification: ${finalVerifiedCount}/${keyParks.length} key parks verified`)
    return finalVerifiedCount >= 3 // Require at least half of key parks to be verified
    
  } catch (error) {
    console.error('❌ Critical error during initialization:', error)
    return false
  }
}