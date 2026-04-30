/**
 * Comprehensive park registry — ALL parks from the ThemeParks Wiki API.
 * Grouped by destination family for UI navigation.
 *
 * IDs are ThemeParks Wiki entity UUIDs.
 * Slugs are URL-safe identifiers for routing.
 */

export interface ParkEntry {
  id: string;
  name: string;
  slug: string;
}

export interface DestinationEntry {
  id: string;
  name: string;
  slug: string;
  parks: ParkEntry[];
}

export interface DestinationFamily {
  familyId: string;
  familyName: string;
  destinations: DestinationEntry[];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''®™]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ─── US Disney ───────────────────────────────────────────────────────────────

const WALT_DISNEY_WORLD: DestinationEntry = {
  id: 'e957da41-3552-4cf6-b636-5babc5cbc4e5',
  name: 'Walt Disney World',
  slug: 'walt-disney-world',
  parks: [
    { id: '75ea578a-adc8-4116-a54d-dccb60765ef9', name: 'Magic Kingdom', slug: 'magic-kingdom' },
    { id: '47f90d2c-e191-4239-a466-5892ef59a88b', name: 'EPCOT', slug: 'epcot' },
    { id: '288747d1-8b4f-4a64-867e-ea7c9b27bad8', name: "Disney's Hollywood Studios", slug: 'hollywood-studios' },
    { id: '1c84a229-8862-4648-9c71-378ddd2c7693', name: "Disney's Animal Kingdom", slug: 'animal-kingdom' },
    { id: 'b070cbc5-feaa-4b87-a8c1-f94cca037a18', name: "Disney's Typhoon Lagoon", slug: 'typhoon-lagoon' },
    { id: 'ead53ea5-22e5-4095-9a83-8c29300d7c63', name: "Disney's Blizzard Beach", slug: 'blizzard-beach' },
  ],
};

const DISNEYLAND_RESORT: DestinationEntry = {
  id: 'bfc89fd6-314d-44b4-b89e-df1a89cf991e',
  name: 'Disneyland Resort',
  slug: 'disneyland-resort',
  parks: [
    { id: '7340550b-c14d-4def-80bb-acdb51d49a66', name: 'Disneyland', slug: 'disneyland' },
    { id: '832fcd51-ea19-4e77-85c7-75d5843b127c', name: 'Disney California Adventure', slug: 'disney-california-adventure' },
  ],
};

// ─── International Disney ────────────────────────────────────────────────────

const DISNEYLAND_PARIS: DestinationEntry = {
  id: 'e8d0207f-da8a-4048-bec8-117aa946b2c2',
  name: 'Disneyland Paris',
  slug: 'disneyland-paris',
  parks: [
    { id: 'dae968d5-630d-4719-8b06-3d107e944401', name: 'Disneyland Park Paris', slug: 'disneyland-park-paris' },
    { id: 'ca888437-ebb4-4d50-aed2-d227f7096968', name: 'Disney Adventure World', slug: 'disney-adventure-world' },
  ],
};

const TOKYO_DISNEY: DestinationEntry = {
  id: 'faff60df-c766-4470-8adb-dee78e813f42',
  name: 'Tokyo Disney Resort',
  slug: 'tokyo-disney-resort',
  parks: [
    { id: '3cc919f1-d16d-43e0-8c3f-1dd269bd1a42', name: 'Tokyo Disneyland', slug: 'tokyo-disneyland' },
    { id: '67b290d5-3478-4f23-b601-2f8fb71ba803', name: 'Tokyo DisneySea', slug: 'tokyo-disneysea' },
  ],
};

const HONG_KONG_DISNEY: DestinationEntry = {
  id: 'abcfffe7-01f2-4f92-ae61-5093346f5a68',
  name: 'Hong Kong Disneyland',
  slug: 'hong-kong-disneyland',
  parks: [
    { id: 'bd0eb47b-2f02-4d4d-90fa-cb3a68988e3b', name: 'Hong Kong Disneyland', slug: 'hong-kong-disneyland-park' },
  ],
};

const SHANGHAI_DISNEY: DestinationEntry = {
  id: '6e1464ca-1e9b-49c3-8937-c5c6f6675057',
  name: 'Shanghai Disney Resort',
  slug: 'shanghai-disney-resort',
  parks: [
    { id: 'ddc4357c-c148-4b36-9888-07894fe75e83', name: 'Shanghai Disneyland', slug: 'shanghai-disneyland' },
  ],
};

// ─── Universal ───────────────────────────────────────────────────────────────

const UNIVERSAL_ORLANDO: DestinationEntry = {
  id: '89db5d43-c434-4097-b71f-f6869f495a22',
  name: 'Universal Orlando Resort',
  slug: 'universal-orlando',
  parks: [
    { id: 'eb3f4560-2383-4a36-9152-6b3e5ed66bc57', name: 'Universal Studios Florida', slug: 'universal-studios-florida' },
    { id: '267615cc-8943-4c2a-ae2c-5da728ca591f', name: 'Islands of Adventure', slug: 'islands-of-adventure' },
    { id: '12dbb85b-265f-44e6-bccf-f1faa172111fc', name: 'Epic Universe', slug: 'epic-universe' },
    { id: 'fe78a026-b91b-470c-b906-9d2266b6922da', name: "Volcano Bay", slug: 'volcano-bay' },
  ],
};

const UNIVERSAL_HOLLYWOOD: DestinationEntry = {
  id: '9fc68f1c-3f5e-4f09-89f2-aab2cf1a0741',
  name: 'Universal Studios Hollywood',
  slug: 'universal-studios-hollywood',
  parks: [
    { id: 'bc4005c5-8c7e-41d7-b349-cdddf1796427', name: 'Universal Studios Hollywood', slug: 'universal-hollywood' },
  ],
};

const UNIVERSAL_JAPAN: DestinationEntry = {
  id: '93741329-da8b-45c3-9be4-6473074d92b9',
  name: 'Universal Studios Japan',
  slug: 'universal-studios-japan',
  parks: [
    { id: '47f61fac-7586-41ac-ae80-61c9257cf33e', name: 'Universal Studios Japan', slug: 'universal-japan' },
  ],
};

const UNIVERSAL_BEIJING: DestinationEntry = {
  id: '40ebecca-2221-4230-9814-6a00b3fbb558',
  name: 'Universal Beijing Resort',
  slug: 'universal-beijing',
  parks: [
    { id: '68e1d8f0-ed42-4351-af25-160421e337ce0', name: 'Universal Studios Beijing', slug: 'universal-beijing-park' },
  ],
};

const UNIVERSAL_SINGAPORE: DestinationEntry = {
  id: '0b150288-3934-49c3-a7fe-8f8103f44e71',
  name: 'Universal Studios Singapore',
  slug: 'universal-singapore',
  parks: [
    { id: 'f95d7f76-2024-4510-b799-26ee122d0e448', name: 'Universal Studios Singapore', slug: 'universal-singapore-park' },
  ],
};

// ─── Six Flags ───────────────────────────────────────────────────────────────

const SIX_FLAGS_MAGIC_MOUNTAIN: DestinationEntry = {
  id: '17e01e63-d22f-414f-b65b-1786acbd918c',
  name: 'Six Flags Magic Mountain',
  slug: 'six-flags-magic-mountain',
  parks: [
    { id: 'c6073ab0-83aa-4e25-8d60-12c8f256884bc', name: 'Six Flags Magic Mountain', slug: 'magic-mountain' },
  ],
};

const SIX_FLAGS_GREAT_ADVENTURE: DestinationEntry = {
  id: '8d8e39eb-4b0a-48b9-ac67-444dd6e97519',
  name: 'Six Flags Great Adventure',
  slug: 'six-flags-great-adventure',
  parks: [
    { id: '556f0126-8082-4b66-aeee-1e3593fed188', name: 'Six Flags Great Adventure', slug: 'great-adventure' },
  ],
};

const SIX_FLAGS_GREAT_AMERICA: DestinationEntry = {
  id: '96fc6528-d143-4c6c-a2ac-01e3c1192d21',
  name: 'Six Flags Great America',
  slug: 'six-flags-great-america-dest',
  parks: [
    { id: '15805a4d-4023-4702-b9f2-3d3cab2e0c11e', name: 'Six Flags Great America', slug: 'six-flags-great-america' },
  ],
};

const SIX_FLAGS_OVER_TEXAS: DestinationEntry = {
  id: '5dd95124-888c-449d-9a65-46d7ecc8878c',
  name: 'Six Flags Over Texas',
  slug: 'six-flags-over-texas',
  parks: [
    { id: '4535960b-45fb-49fb-a38a-59cf602a0a9c', name: 'Six Flags Over Texas', slug: 'over-texas' },
  ],
};

const SIX_FLAGS_OVER_GEORGIA: DestinationEntry = {
  id: 'a8ea944a-5ab7-42ed-bb02-ed08e64f125a',
  name: 'Six Flags Over Georgia',
  slug: 'six-flags-over-georgia',
  parks: [
    { id: '0c7ab128-259a-4390-93b9-d2e0233dfc16', name: 'Six Flags Over Georgia', slug: 'over-georgia' },
  ],
};

const SIX_FLAGS_FIESTA_TEXAS: DestinationEntry = {
  id: 'da6388a0-cbfe-49f9-9c63-12e1f63dda62',
  name: 'Six Flags Fiesta Texas',
  slug: 'six-flags-fiesta-texas',
  parks: [
    { id: '8be1e984-1e5f-40d0-a750-ce8e4dc2e87c', name: 'Six Flags Fiesta Texas', slug: 'fiesta-texas' },
  ],
};

const SIX_FLAGS_NEW_ENGLAND: DestinationEntry = {
  id: 'a2cfe9e9-6734-4b9e-90c2-6427fa303e5c',
  name: 'Six Flags New England',
  slug: 'six-flags-new-england',
  parks: [
    { id: 'd553882d-5316-4fca-9530-cc898258aec0', name: 'Six Flags New England', slug: 'new-england' },
  ],
};

const SIX_FLAGS_AMERICA: DestinationEntry = {
  id: 'b3c6033a-4dc2-476c-98d2-ce31c6b961a7',
  name: 'Six Flags America',
  slug: 'six-flags-america',
  parks: [
    { id: 'd4c88416-3361-494d-8905-23a83e9cb091', name: 'Six Flags America', slug: 'sf-america' },
  ],
};

const SIX_FLAGS_ST_LOUIS: DestinationEntry = {
  id: '314e42e5-95e7-448f-a127-01699a4fba04',
  name: 'Six Flags St. Louis',
  slug: 'six-flags-st-louis',
  parks: [
    { id: '815e6367-9bbe-449e-a639-a093e216188f', name: 'Six Flags St. Louis', slug: 'sf-st-louis' },
  ],
};

const SIX_FLAGS_DISCOVERY_KINGDOM: DestinationEntry = {
  id: '32fd247c-f2dd-44d6-aa2b-10c158df162f',
  name: 'Six Flags Discovery Kingdom',
  slug: 'six-flags-discovery-kingdom',
  parks: [
    { id: '3237a0c2-8e35-4a1c-9356-a3119d5988e7c', name: 'Six Flags Discovery Kingdom', slug: 'discovery-kingdom' },
  ],
};

const SIX_FLAGS_DARIEN_LAKE: DestinationEntry = {
  id: 'dfa64b30-f5af-444c-a7f8-3db78537a0f8',
  name: 'Six Flags Darien Lake',
  slug: 'six-flags-darien-lake',
  parks: [
    { id: 'ab49b801-9b07-4cbc-9b3e-9896e538872e', name: 'Six Flags Darien Lake', slug: 'darien-lake' },
  ],
};

const SIX_FLAGS_GREAT_ESCAPE: DestinationEntry = {
  id: 'd6e6386c-02c0-4e0e-b1f4-e9f831a1d3e6',
  name: 'Six Flags Great Escape',
  slug: 'six-flags-great-escape',
  parks: [
    { id: '000c724a-cd0f-41a1-b355-f764902c2b55', name: 'Six Flags Great Escape', slug: 'great-escape' },
  ],
};

const SIX_FLAGS_FRONTIER_CITY: DestinationEntry = {
  id: 'd0f897aa-0598-4219-abbc-50b95985da01',
  name: 'Six Flags Frontier City',
  slug: 'six-flags-frontier-city',
  parks: [
    { id: '589627eb-fe16-4373-a2db-08d73805fb11f', name: 'Six Flags Frontier City', slug: 'frontier-city' },
  ],
};

const SIX_FLAGS_MEXICO: DestinationEntry = {
  id: '271f07d8-9dcc-4529-925e-8760be79ffcd',
  name: 'Six Flags Mexico',
  slug: 'six-flags-mexico',
  parks: [
    { id: 'd67e40f9-9c02-4bfe-8ee1-b714deda9906', name: 'Six Flags Mexico', slug: 'sf-mexico' },
  ],
};

const LA_RONDE: DestinationEntry = {
  id: '6d6099c4-170d-4beb-85c2-73b26249eead',
  name: 'La Ronde',
  slug: 'la-ronde',
  parks: [
    { id: 'd2bef7bc-f9fc-4272-a6f1-2539d7413911', name: 'La Ronde', slug: 'la-ronde-park' },
  ],
};

// ─── Cedar Fair ──────────────────────────────────────────────────────────────

const CEDAR_POINT: DestinationEntry = {
  id: 'ee2ec4b5-3bc3-403c-9e30-7fa607e6311e',
  name: 'Cedar Point',
  slug: 'cedar-point-dest',
  parks: [
    { id: 'c8299e1a-0098-4677-8ead-dd0da204f8dc', name: 'Cedar Point', slug: 'cedar-point' },
  ],
};

const KINGS_ISLAND: DestinationEntry = {
  id: '694e1f6e-d6a2-4c86-9749-5da1a9cb8924',
  name: 'Kings Island',
  slug: 'kings-island-dest',
  parks: [
    { id: 'a0df8d87-7f72-4545-a58d-eb8aa76f914b', name: 'Kings Island', slug: 'kings-island' },
  ],
};

const KINGS_DOMINION: DestinationEntry = {
  id: '71f82221-5f3e-4e2c-b09c-31c149e0dd59',
  name: 'Kings Dominion',
  slug: 'kings-dominion-dest',
  parks: [
    { id: '95162318-b955-4b7e-b601-a99033aa0279', name: 'Kings Dominion', slug: 'kings-dominion' },
  ],
};

const CAROWINDS: DestinationEntry = {
  id: '025c75ed-80a8-4bba-8b80-192e2ceff58c',
  name: 'Carowinds',
  slug: 'carowinds-dest',
  parks: [
    { id: '24cdcaa8-0500-4340-9725-992865eb18d6', name: 'Carowinds', slug: 'carowinds' },
  ],
};

const CANADAS_WONDERLAND: DestinationEntry = {
  id: 'b23d90e6-47f4-4258-8690-e74d777fca0f',
  name: "Canada's Wonderland",
  slug: 'canadas-wonderland-dest',
  parks: [
    { id: '66f5d97a-a530-40bf-a712-a6317c96b06d', name: "Canada's Wonderland", slug: 'canadas-wonderland' },
  ],
};

const KNOTTS_BERRY_FARM: DestinationEntry = {
  id: 'b1444147-b93a-4f73-b12d-28f9b1f7ec7c',
  name: "Knott's Berry Farm",
  slug: 'knotts-berry-farm-dest',
  parks: [
    { id: '0a6123bb-1e8c-4b18-a2d3-2696cf2451f5', name: "Knott's Berry Farm", slug: 'knotts-berry-farm' },
  ],
};

const GREAT_AMERICA_CF: DestinationEntry = {
  id: '119fce4a-9662-484f-ac3a-d62d16bdc7ab',
  name: 'Great America',
  slug: 'great-america-dest',
  parks: [
    { id: 'bdf9b533-144c-4b78-aa2f-5173c5ce5e85', name: 'Great America', slug: 'great-america' },
  ],
};

const DORNEY_PARK: DestinationEntry = {
  id: 'd5f3aa8d-2ef9-4436-9829-b1f6774f592b',
  name: 'Dorney Park',
  slug: 'dorney-park-dest',
  parks: [
    { id: '19d7f29b-e2e7-4c95-bd12-2d4e37d14ccf', name: 'Dorney Park', slug: 'dorney-park' },
  ],
};

const VALLEYFAIR: DestinationEntry = {
  id: 'd4c0e0c4-18c6-4918-a505-209d839c2615',
  name: 'Valleyfair',
  slug: 'valleyfair-dest',
  parks: [
    { id: '1989dca9-c8d3-43b8-b0dd-e5575f692b95', name: 'Valleyfair', slug: 'valleyfair' },
  ],
};

const MICHIGANS_ADVENTURE: DestinationEntry = {
  id: '6a33b034-2e39-46ea-8808-a06b29b9b2d6',
  name: "Michigan's Adventure",
  slug: 'michigans-adventure-dest',
  parks: [
    { id: 'e9805d65-edad-4700-8942-946e6a2b4784', name: "Michigan's Adventure", slug: 'michigans-adventure' },
  ],
};

const WORLDS_OF_FUN: DestinationEntry = {
  id: 'c4231018-dc6f-4d8d-bfc2-7a21a6c9e9fa',
  name: 'Worlds of Fun',
  slug: 'worlds-of-fun-dest',
  parks: [
    { id: 'bb731eae-7bd3-4713-bd7b-89d79b031743', name: 'Worlds of Fun', slug: 'worlds-of-fun' },
    { id: '951987f7-3387-4221-8368-2859469aebcd', name: 'Oceans of Fun', slug: 'oceans-of-fun' },
  ],
};

// ─── SeaWorld / Busch Gardens ────────────────────────────────────────────────

const SEAWORLD_ORLANDO: DestinationEntry = {
  id: '643e837e-b244-4663-8d3a-148c26ecba9c',
  name: 'SeaWorld Orlando',
  slug: 'seaworld-orlando-dest',
  parks: [
    { id: '27d64dee-d85e-48dc-ad6d-80774455cd946', name: 'SeaWorld Orlando', slug: 'seaworld-orlando' },
    { id: '9e2867f8-68eb-454f-b367-0ed0fd772d72a', name: 'Aquatica Orlando', slug: 'aquatica-orlando' },
  ],
};

const SEAWORLD_SAN_DIEGO: DestinationEntry = {
  id: '1f1f9558-4e81-48a7-aad5-9879b633802b',
  name: 'SeaWorld San Diego',
  slug: 'seaworld-san-diego-dest',
  parks: [
    { id: '75122979-ddea-414d-b633-6b09042a227c', name: 'SeaWorld San Diego', slug: 'seaworld-san-diego' },
  ],
};

const SEAWORLD_SAN_ANTONIO: DestinationEntry = {
  id: '211e981b-ee64-4ff9-8b06-0abf26e63874',
  name: 'SeaWorld San Antonio',
  slug: 'seaworld-san-antonio-dest',
  parks: [
    { id: 'dd0e159a-4e4b-48e5-8949-353794ef2ecb', name: 'SeaWorld San Antonio', slug: 'seaworld-san-antonio' },
  ],
};

const BUSCH_GARDENS_TAMPA: DestinationEntry = {
  id: '1d92560c-474f-4425-906d-e9dd2f2da6ca',
  name: 'Busch Gardens Tampa',
  slug: 'busch-gardens-tampa-dest',
  parks: [
    { id: 'fc40c99a-be0a-42f4-a483-1e939db275c2', name: 'Busch Gardens Tampa Bay', slug: 'busch-gardens-tampa' },
  ],
};

const BUSCH_GARDENS_WILLIAMSBURG: DestinationEntry = {
  id: '0704cf65-5c67-42f3-a054-f45e03a412cf',
  name: 'Busch Gardens Williamsburg',
  slug: 'busch-gardens-williamsburg-dest',
  parks: [
    { id: '98f634cd-c388-439c-b309-960f9475b84d', name: 'Busch Gardens Williamsburg', slug: 'busch-gardens-williamsburg' },
  ],
};

// ─── Independent US Parks ────────────────────────────────────────────────────

const DOLLYWOOD: DestinationEntry = {
  id: '6c3cd0cc-57b5-431b-926c-2658e8104057',
  name: 'Dollywood',
  slug: 'dollywood-dest',
  parks: [
    { id: '7502308a-de08-41a3-b997-961f8275ab3c', name: 'Dollywood', slug: 'dollywood' },
  ],
};

const HERSHEYPARK: DestinationEntry = {
  id: '6e1c96c1-dafc-4c26-a3d3-1b28c888daa8',
  name: 'Hersheypark',
  slug: 'hersheypark-dest',
  parks: [
    { id: '0f044655-cd94-4bb8-a8e3-c789f4eca787', name: 'Hersheypark', slug: 'hersheypark' },
  ],
};

const SILVER_DOLLAR_CITY: DestinationEntry = {
  id: '8fba5a14-8d04-455c-acf8-eccaaa0f58d9',
  name: 'Silver Dollar City',
  slug: 'silver-dollar-city-dest',
  parks: [
    { id: 'd21fac4f-1099-4461-849c-0f8e0d6e85a6', name: 'Silver Dollar City', slug: 'silver-dollar-city' },
  ],
};

const KENNYWOOD: DestinationEntry = {
  id: '1dea1b67-0d06-4ad2-9145-8fc1783fd4e8',
  name: 'Kennywood',
  slug: 'kennywood-dest',
  parks: [
    { id: '3dada5aa-0feb-4a3a-8c2d-685901f256be', name: 'Kennywood', slug: 'kennywood' },
  ],
};

const KNOEBELS: DestinationEntry = {
  id: '81f7c819-3e1f-4d42-b675-90100976949e',
  name: 'Knoebels',
  slug: 'knoebels-dest',
  parks: [
    { id: 'fd747bb4-393f-4dff-afdd-9ee2533a1869', name: 'Knoebels Amusement Park', slug: 'knoebels' },
  ],
};

// ─── European Parks ──────────────────────────────────────────────────────────

const EUROPA_PARK: DestinationEntry = {
  id: '85e3b542-af91-4f8a-8d28-445868a7c8fd',
  name: 'Europa-Park',
  slug: 'europa-park-dest',
  parks: [
    { id: '639738d3-9574-4f60-ab5b-4c392901320b', name: 'Europa-Park', slug: 'europa-park' },
    { id: '58392c29-d79d-49e4-9c35-0100d417d24e', name: 'Rulantica', slug: 'rulantica' },
  ],
};

const EFTELING: DestinationEntry = {
  id: '21776b5a-1444-4924-8ab2-6c66d9219628',
  name: 'Efteling',
  slug: 'efteling-dest',
  parks: [
    { id: '30713cf6-69a9-47c9-a505-52bb965f01be', name: 'Efteling', slug: 'efteling' },
  ],
};

const PHANTASIALAND: DestinationEntry = {
  id: '0257ff9f-c73c-4855-b5b4-774755c4d146',
  name: 'Phantasialand',
  slug: 'phantasialand-dest',
  parks: [
    { id: 'abb67808-61e3-49ef-996c-1b97ed64fac6', name: 'Phantasialand', slug: 'phantasialand' },
  ],
};

const ALTON_TOWERS: DestinationEntry = {
  id: '8e6bf2ae-77ac-403d-8e10-d7cd9b6c05d7',
  name: 'Alton Towers',
  slug: 'alton-towers-dest',
  parks: [
    { id: '0d8ea921-37b1-4a9a-b8ef-5b45afea847b', name: 'Alton Towers', slug: 'alton-towers' },
  ],
};

const THORPE_PARK: DestinationEntry = {
  id: '818f544a-38db-4255-b5db-6bf2cb39b7b3',
  name: 'Thorpe Park',
  slug: 'thorpe-park-dest',
  parks: [
    { id: 'b08d9272-d070-4580-9fcd-375270b191a7', name: 'Thorpe Park', slug: 'thorpe-park' },
  ],
};

const PORTAVENTURA: DestinationEntry = {
  id: '498b1747-cc17-4490-aee9-a45147f0f706',
  name: 'PortAventura World',
  slug: 'portaventura-world',
  parks: [
    { id: '32608bdc-b3fa-478e-a8c0-9dde197a4212', name: 'PortAventura Park', slug: 'portaventura-park' },
    { id: 'd06d91b8-7702-42c3-a8af-7d0161d471bf', name: 'Ferrari Land', slug: 'ferrari-land' },
  ],
};

const PARC_ASTERIX: DestinationEntry = {
  id: '6cc48df2-f126-4f28-905d-b4c2c15765f2',
  name: 'Parc Asterix',
  slug: 'parc-asterix-dest',
  parks: [
    { id: '9e938687-fd99-46f3-986a-1878210378f8', name: 'Parc Asterix', slug: 'parc-asterix' },
  ],
};

const LISEBERG: DestinationEntry = {
  id: 'b1387675-bb84-4eb4-aae6-af96d586c3d6',
  name: 'Liseberg',
  slug: 'liseberg-dest',
  parks: [
    { id: '93142d7e-024a-4877-9c72-f8e904a37c0c', name: 'Liseberg', slug: 'liseberg' },
  ],
};

const GARDALAND: DestinationEntry = {
  id: 'be901819-52b2-4a98-8f31-5fecb993bcd6',
  name: 'Gardaland',
  slug: 'gardaland-dest',
  parks: [
    { id: '043211c0-76f2-4456-89f8-4001be01018d', name: 'Gardaland', slug: 'gardaland' },
  ],
};

// ─── LEGOLAND ────────────────────────────────────────────────────────────────

const LEGOLAND_FLORIDA: DestinationEntry = {
  id: '7a4adf8d-8c3f-4300-b277-19707e4f8e12',
  name: 'LEGOLAND Florida',
  slug: 'legoland-florida-dest',
  parks: [
    { id: 'bb285952-7e52-4a07-a312-d0a1ed91a9ac', name: 'LEGOLAND Florida', slug: 'legoland-florida' },
  ],
};

const LEGOLAND_CALIFORNIA: DestinationEntry = {
  id: 'be4e3681-7e3c-43a5-89e6-bb4863d8fe35',
  name: 'LEGOLAND California',
  slug: 'legoland-california-dest',
  parks: [
    { id: '722116aa-56be-4466-8c6f-a5acbac05da2', name: 'LEGOLAND California', slug: 'legoland-california' },
  ],
};

const LEGOLAND_NEW_YORK: DestinationEntry = {
  id: '3e1bcfe5-3b59-4d9c-a495-c7323157bae6',
  name: 'LEGOLAND New York',
  slug: 'legoland-new-york-dest',
  parks: [
    { id: '39c46e22-9031-41ff-84d6-fcd1d0a62867', name: 'LEGOLAND New York', slug: 'legoland-new-york' },
  ],
};

const LEGOLAND_BILLUND: DestinationEntry = {
  id: '97501356-1021-4bb7-9a90-2f3fc96b435d',
  name: 'LEGOLAND Billund',
  slug: 'legoland-billund-dest',
  parks: [
    { id: '99e7087b-951a-4322-84a8-572f26bc324d', name: 'LEGOLAND Billund', slug: 'legoland-billund' },
  ],
};

const LEGOLAND_WINDSOR: DestinationEntry = {
  id: '7c48a21b-221c-42f8-8339-6334c5f2fb12',
  name: 'LEGOLAND Windsor',
  slug: 'legoland-windsor-dest',
  parks: [
    { id: 'a4f71074-e616-4de4-9278-72fdecbdc995', name: 'LEGOLAND Windsor', slug: 'legoland-windsor' },
  ],
};

// ─── Asian Parks ─────────────────────────────────────────────────────────────

const EVERLAND: DestinationEntry = {
  id: 'd5487510-2e13-4eb5-9fab-9a9c11cec738',
  name: 'Everland Resort',
  slug: 'everland-dest',
  parks: [
    { id: 'b4dd937f-a79d-4b82-922f-e8ab0fbf5b5b', name: 'Everland', slug: 'everland' },
  ],
};

const LOTTE_WORLD: DestinationEntry = {
  id: '126bee75-8235-4007-8fe8-48aa52e33188',
  name: 'Lotte World',
  slug: 'lotte-world-dest',
  parks: [
    { id: 'd8a17554-14d9-44a1-915a-035bfeff884c', name: 'Lotte World Adventure', slug: 'lotte-world' },
  ],
};

const FUJI_Q: DestinationEntry = {
  id: 'a39233ea-13b5-41b0-9f96-5da787e1de33',
  name: 'Fuji-Q Highland',
  slug: 'fuji-q-dest',
  parks: [
    { id: 'ae527507-b1d0-4d40-83ea-143d87bef989', name: 'Fuji-Q Highland', slug: 'fuji-q-highland' },
  ],
};

// ─── Grouped into families ───────────────────────────────────────────────────

export const DESTINATION_FAMILIES: DestinationFamily[] = [
  {
    familyId: 'disney',
    familyName: 'Disney Parks',
    destinations: [
      WALT_DISNEY_WORLD,
      DISNEYLAND_RESORT,
      DISNEYLAND_PARIS,
      TOKYO_DISNEY,
      HONG_KONG_DISNEY,
      SHANGHAI_DISNEY,
    ],
  },
  {
    familyId: 'universal',
    familyName: 'Universal Parks',
    destinations: [
      UNIVERSAL_ORLANDO,
      UNIVERSAL_HOLLYWOOD,
      UNIVERSAL_JAPAN,
      UNIVERSAL_BEIJING,
      UNIVERSAL_SINGAPORE,
    ],
  },
  {
    familyId: 'six-flags',
    familyName: 'Six Flags',
    destinations: [
      SIX_FLAGS_MAGIC_MOUNTAIN,
      SIX_FLAGS_GREAT_ADVENTURE,
      SIX_FLAGS_GREAT_AMERICA,
      SIX_FLAGS_OVER_TEXAS,
      SIX_FLAGS_OVER_GEORGIA,
      SIX_FLAGS_FIESTA_TEXAS,
      SIX_FLAGS_NEW_ENGLAND,
      SIX_FLAGS_AMERICA,
      SIX_FLAGS_ST_LOUIS,
      SIX_FLAGS_DISCOVERY_KINGDOM,
      SIX_FLAGS_DARIEN_LAKE,
      SIX_FLAGS_GREAT_ESCAPE,
      SIX_FLAGS_FRONTIER_CITY,
      SIX_FLAGS_MEXICO,
      LA_RONDE,
    ],
  },
  {
    familyId: 'cedar-fair',
    familyName: 'Cedar Fair',
    destinations: [
      CEDAR_POINT,
      KINGS_ISLAND,
      KINGS_DOMINION,
      CAROWINDS,
      CANADAS_WONDERLAND,
      KNOTTS_BERRY_FARM,
      GREAT_AMERICA_CF,
      DORNEY_PARK,
      VALLEYFAIR,
      MICHIGANS_ADVENTURE,
      WORLDS_OF_FUN,
    ],
  },
  {
    familyId: 'seaworld',
    familyName: 'SeaWorld & Busch Gardens',
    destinations: [
      SEAWORLD_ORLANDO,
      SEAWORLD_SAN_DIEGO,
      SEAWORLD_SAN_ANTONIO,
      BUSCH_GARDENS_TAMPA,
      BUSCH_GARDENS_WILLIAMSBURG,
    ],
  },
  {
    familyId: 'legoland',
    familyName: 'LEGOLAND',
    destinations: [
      LEGOLAND_FLORIDA,
      LEGOLAND_CALIFORNIA,
      LEGOLAND_NEW_YORK,
      LEGOLAND_BILLUND,
      LEGOLAND_WINDSOR,
    ],
  },
  {
    familyId: 'independent-us',
    familyName: 'Independent US Parks',
    destinations: [
      DOLLYWOOD,
      HERSHEYPARK,
      SILVER_DOLLAR_CITY,
      KENNYWOOD,
      KNOEBELS,
    ],
  },
  {
    familyId: 'european',
    familyName: 'European Parks',
    destinations: [
      EUROPA_PARK,
      EFTELING,
      PHANTASIALAND,
      ALTON_TOWERS,
      THORPE_PARK,
      PORTAVENTURA,
      PARC_ASTERIX,
      LISEBERG,
      GARDALAND,
    ],
  },
  {
    familyId: 'asian',
    familyName: 'Asian Parks',
    destinations: [
      EVERLAND,
      LOTTE_WORLD,
      FUJI_Q,
    ],
  },
];

// ─── Utility functions ───────────────────────────────────────────────────────

/** Get all parks as a flat list */
export function getAllParks(): ParkEntry[] {
  return DESTINATION_FAMILIES.flatMap((f) =>
    f.destinations.flatMap((d) => d.parks)
  );
}

/** Find a park by slug */
export function getParkBySlug(slug: string): (ParkEntry & { destinationName: string; destinationId: string }) | undefined {
  for (const family of DESTINATION_FAMILIES) {
    for (const dest of family.destinations) {
      const park = dest.parks.find((p) => p.slug === slug);
      if (park) {
        return { ...park, destinationName: dest.name, destinationId: dest.id };
      }
    }
  }
  return undefined;
}

/** Find a park by UUID */
export function getParkById(id: string): (ParkEntry & { destinationName: string; destinationId: string }) | undefined {
  for (const family of DESTINATION_FAMILIES) {
    for (const dest of family.destinations) {
      const park = dest.parks.find((p) => p.id === id);
      if (park) {
        return { ...park, destinationName: dest.name, destinationId: dest.id };
      }
    }
  }
  return undefined;
}

/** Get all destinations in a family */
export function getDestinationsByFamily(familyId: string): DestinationEntry[] {
  const family = DESTINATION_FAMILIES.find((f) => f.familyId === familyId);
  return family?.destinations ?? [];
}

/** Get all family IDs */
export function getAllFamilyIds(): string[] {
  return DESTINATION_FAMILIES.map((f) => f.familyId);
}

export { slugify };
