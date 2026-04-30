/**
 * Location metadata for destinations.
 * Maps destination ID → geographic info for display on park cards.
 *
 * NOTE: This data is NOT in the ThemeParks Wiki API — it's hand-curated.
 * If a destination is missing, the UI gracefully omits the location line.
 */

export interface ParkLocation {
  city: string;
  state?: string; // US/Canada states/provinces
  country: string;
  countryCode: string; // ISO 3166-1 alpha-2
}

/** Keyed by destination ID from park-registry.ts */
export const DESTINATION_LOCATIONS: Record<string, ParkLocation> = {
  // ─── Disney US ─────────────────────────────────────────────────────────────
  'e957da41-3552-4cf6-b636-5babc5cbc4e5': { city: 'Orlando', state: 'FL', country: 'United States', countryCode: 'US' },
  'bfc89fd6-314d-44b4-b89e-df1a89cf991e': { city: 'Anaheim', state: 'CA', country: 'United States', countryCode: 'US' },

  // ─── Disney International ──────────────────────────────────────────────────
  'e8d0207f-da8a-4048-bec8-117aa946b2c2': { city: 'Marne-la-Vallée', country: 'France', countryCode: 'FR' },
  'faff60df-c766-4470-8adb-dee78e813f42': { city: 'Urayasu', country: 'Japan', countryCode: 'JP' },
  'abcfffe7-01f2-4f92-ae61-5093346f5a68': { city: 'Lantau Island', country: 'Hong Kong', countryCode: 'HK' },
  '6e1464ca-1e9b-49c3-8937-c5c6f6675057': { city: 'Shanghai', country: 'China', countryCode: 'CN' },

  // ─── Universal ─────────────────────────────────────────────────────────────
  '89db5d43-c434-4097-b71f-f6869f495a22': { city: 'Orlando', state: 'FL', country: 'United States', countryCode: 'US' },
  '9fc68f1c-3f5e-4f09-89f2-aab2cf1a0741': { city: 'Los Angeles', state: 'CA', country: 'United States', countryCode: 'US' },
  '93741329-da8b-45c3-9be4-6473074d92b9': { city: 'Osaka', country: 'Japan', countryCode: 'JP' },
  '40ebecca-2221-4230-9814-6a00b3fbb558': { city: 'Beijing', country: 'China', countryCode: 'CN' },
  '0b150288-3934-49c3-a7fe-8f8103f44e71': { city: 'Singapore', country: 'Singapore', countryCode: 'SG' },

  // ─── Six Flags ─────────────────────────────────────────────────────────────
  '17e01e63-d22f-414f-b65b-1786acbd918c': { city: 'Valencia', state: 'CA', country: 'United States', countryCode: 'US' },
  '8d8e39eb-4b0a-48b9-ac67-444dd6e97519': { city: 'Jackson', state: 'NJ', country: 'United States', countryCode: 'US' },
  '96fc6528-d143-4c6c-a2ac-01e3c1192d21': { city: 'Gurnee', state: 'IL', country: 'United States', countryCode: 'US' },
  '5dd95124-888c-449d-9a65-46d7ecc8878c': { city: 'Arlington', state: 'TX', country: 'United States', countryCode: 'US' },
  'a8ea944a-5ab7-42ed-bb02-ed08e64f125a': { city: 'Austell', state: 'GA', country: 'United States', countryCode: 'US' },
  'da6388a0-cbfe-49f9-9c63-12e1f63dda62': { city: 'San Antonio', state: 'TX', country: 'United States', countryCode: 'US' },
  'a2cfe9e9-6734-4b9e-90c2-6427fa303e5c': { city: 'Agawam', state: 'MA', country: 'United States', countryCode: 'US' },
  'b3c6033a-4dc2-476c-98d2-ce31c6b961a7': { city: 'Bowie', state: 'MD', country: 'United States', countryCode: 'US' },
  '314e42e5-95e7-448f-a127-01699a4fba04': { city: 'Eureka', state: 'MO', country: 'United States', countryCode: 'US' },
  '32fd247c-f2dd-44d6-aa2b-10c158df162f': { city: 'Vallejo', state: 'CA', country: 'United States', countryCode: 'US' },
  'dfa64b30-f5af-444c-a7f8-3db78537a0f8': { city: 'Darien Center', state: 'NY', country: 'United States', countryCode: 'US' },
  'd6e6386c-02c0-4e0e-b1f4-e9f831a1d3e6': { city: 'Queensbury', state: 'NY', country: 'United States', countryCode: 'US' },
  'd0f897aa-0598-4219-abbc-50b95985da01': { city: 'Oklahoma City', state: 'OK', country: 'United States', countryCode: 'US' },
  '271f07d8-9dcc-4529-925e-8760be79ffcd': { city: 'Mexico City', country: 'Mexico', countryCode: 'MX' },
  '6d6099c4-170d-4beb-85c2-73b26249eead': { city: 'Montreal', state: 'QC', country: 'Canada', countryCode: 'CA' },

  // ─── Cedar Fair ────────────────────────────────────────────────────────────
  'ee2ec4b5-3bc3-403c-9e30-7fa607e6311e': { city: 'Sandusky', state: 'OH', country: 'United States', countryCode: 'US' },
  '694e1f6e-d6a2-4c86-9749-5da1a9cb8924': { city: 'Mason', state: 'OH', country: 'United States', countryCode: 'US' },
  '71f82221-5f3e-4e2c-b09c-31c149e0dd59': { city: 'Doswell', state: 'VA', country: 'United States', countryCode: 'US' },
  '025c75ed-80a8-4bba-8b80-192e2ceff58c': { city: 'Charlotte', state: 'NC', country: 'United States', countryCode: 'US' },
  'b23d90e6-47f4-4258-8690-e74d777fca0f': { city: 'Vaughan', state: 'ON', country: 'Canada', countryCode: 'CA' },
  'b1444147-b93a-4f73-b12d-28f9b1f7ec7c': { city: 'Buena Park', state: 'CA', country: 'United States', countryCode: 'US' },
  '119fce4a-9662-484f-ac3a-d62d16bdc7ab': { city: 'Santa Clara', state: 'CA', country: 'United States', countryCode: 'US' },
  'd5f3aa8d-2ef9-4436-9829-b1f6774f592b': { city: 'Allentown', state: 'PA', country: 'United States', countryCode: 'US' },
  'd4c0e0c4-18c6-4918-a505-209d839c2615': { city: 'Shakopee', state: 'MN', country: 'United States', countryCode: 'US' },
  '6a33b034-2e39-46ea-8808-a06b29b9b2d6': { city: 'Muskegon', state: 'MI', country: 'United States', countryCode: 'US' },
  'c4231018-dc6f-4d8d-bfc2-7a21a6c9e9fa': { city: 'Kansas City', state: 'MO', country: 'United States', countryCode: 'US' },

  // ─── SeaWorld / Busch Gardens ──────────────────────────────────────────────
  '643e837e-b244-4663-8d3a-148c26ecba9c': { city: 'Orlando', state: 'FL', country: 'United States', countryCode: 'US' },
  '1f1f9558-4e81-48a7-aad5-9879b633802b': { city: 'San Diego', state: 'CA', country: 'United States', countryCode: 'US' },
  '211e981b-ee64-4ff9-8b06-0abf26e63874': { city: 'San Antonio', state: 'TX', country: 'United States', countryCode: 'US' },
  '1d92560c-474f-4425-906d-e9dd2f2da6ca': { city: 'Tampa', state: 'FL', country: 'United States', countryCode: 'US' },
  '0704cf65-5c67-42f3-a054-f45e03a412cf': { city: 'Williamsburg', state: 'VA', country: 'United States', countryCode: 'US' },

  // ─── LEGOLAND ──────────────────────────────────────────────────────────────
  '7a4adf8d-8c3f-4300-b277-19707e4f8e12': { city: 'Winter Haven', state: 'FL', country: 'United States', countryCode: 'US' },
  'be4e3681-7e3c-43a5-89e6-bb4863d8fe35': { city: 'Carlsbad', state: 'CA', country: 'United States', countryCode: 'US' },
  '3e1bcfe5-3b59-4d9c-a495-c7323157bae6': { city: 'Goshen', state: 'NY', country: 'United States', countryCode: 'US' },
  '97501356-1021-4bb7-9a90-2f3fc96b435d': { city: 'Billund', country: 'Denmark', countryCode: 'DK' },
  '7c48a21b-221c-42f8-8339-6334c5f2fb12': { city: 'Windsor', country: 'United Kingdom', countryCode: 'GB' },

  // ─── Independent US ────────────────────────────────────────────────────────
  '6c3cd0cc-57b5-431b-926c-2658e8104057': { city: 'Pigeon Forge', state: 'TN', country: 'United States', countryCode: 'US' },
  '6e1c96c1-dafc-4c26-a3d3-1b28c888daa8': { city: 'Hershey', state: 'PA', country: 'United States', countryCode: 'US' },
  '8fba5a14-8d04-455c-acf8-eccaaa0f58d9': { city: 'Branson', state: 'MO', country: 'United States', countryCode: 'US' },
  '1dea1b67-0d06-4ad2-9145-8fc1783fd4e8': { city: 'West Mifflin', state: 'PA', country: 'United States', countryCode: 'US' },
  '81f7c819-3e1f-4d42-b675-90100976949e': { city: 'Elysburg', state: 'PA', country: 'United States', countryCode: 'US' },

  // ─── European Parks ────────────────────────────────────────────────────────
  '85e3b542-af91-4f8a-8d28-445868a7c8fd': { city: 'Rust', country: 'Germany', countryCode: 'DE' },
  '21776b5a-1444-4924-8ab2-6c66d9219628': { city: 'Kaatsheuvel', country: 'Netherlands', countryCode: 'NL' },
  '0257ff9f-c73c-4855-b5b4-774755c4d146': { city: 'Brühl', country: 'Germany', countryCode: 'DE' },
  '8e6bf2ae-77ac-403d-8e10-d7cd9b6c05d7': { city: 'Alton', country: 'United Kingdom', countryCode: 'GB' },
  '818f544a-38db-4255-b5db-6bf2cb39b7b3': { city: 'Chertsey', country: 'United Kingdom', countryCode: 'GB' },
  '498b1747-cc17-4490-aee9-a45147f0f706': { city: 'Salou', country: 'Spain', countryCode: 'ES' },
  '6cc48df2-f126-4f28-905d-b4c2c15765f2': { city: 'Plailly', country: 'France', countryCode: 'FR' },
  'b1387675-bb84-4eb4-aae6-af96d586c3d6': { city: 'Gothenburg', country: 'Sweden', countryCode: 'SE' },
  'be901819-52b2-4a98-8f31-5fecb993bcd6': { city: 'Castelnuovo del Garda', country: 'Italy', countryCode: 'IT' },

  // ─── Asian Parks ───────────────────────────────────────────────────────────
  'd5487510-2e13-4eb5-9fab-9a9c11cec738': { city: 'Yongin', country: 'South Korea', countryCode: 'KR' },
  '126bee75-8235-4007-8fe8-48aa52e33188': { city: 'Seoul', country: 'South Korea', countryCode: 'KR' },
  'a39233ea-13b5-41b0-9f96-5da787e1de33': { city: 'Fujiyoshida', country: 'Japan', countryCode: 'JP' },
  '259cf011-6195-42dd-bfdb-640969e0bfb9': { city: 'Guangzhou', country: 'China', countryCode: 'CN' },
  '38ca7997-883b-4ae8-a87c-69a74967d59e': { city: 'Zhuhai', country: 'China', countryCode: 'CN' },
  'cb785f25-3dac-48bb-9560-479aa9ebf942': { city: 'Chuncheon', country: 'South Korea', countryCode: 'KR' },
  'ae0cd07c-87f3-41d9-a825-0fded65d626c': { city: 'Nagoya', country: 'Japan', countryCode: 'JP' },

  // ─── Australian Parks ────────────────────────────────────────────────────────
  '6b397295-c007-4965-83a3-ad8a3d329a0f': { city: 'Gold Coast', state: 'QLD', country: 'Australia', countryCode: 'AU' },
  'ba435567-3d0b-48f0-b1b6-8121a4427ae2': { city: 'Gold Coast', state: 'QLD', country: 'Australia', countryCode: 'AU' },
  '8245df87-88c2-48f0-a086-44b3e2ab90ce': { city: 'Gold Coast', state: 'QLD', country: 'Australia', countryCode: 'AU' },
  '07d71a54-1409-4276-891a-569fc4d442cd': { city: 'Gold Coast', state: 'QLD', country: 'Australia', countryCode: 'AU' },

  // ─── Additional European Parks ───────────────────────────────────────────────
  'b55f40bd-7f8b-4cf5-b3f5-c3c2a4927832': { city: 'Nimtofte', country: 'Denmark', countryCode: 'DK' },
  'c3975a6c-bd4c-4757-9a24-e67047a56cde': { city: 'Sierksdorf', country: 'Germany', countryCode: 'DE' },
  '4809bc90-1580-4738-9a77-a713fed396a8': { city: 'Günzburg', country: 'Germany', countryCode: 'DE' },
  '17058277-57f8-43f1-91c8-0af2c2fe50bc': { city: 'Madrid', country: 'Spain', countryCode: 'ES' },
  '22489737-c1f7-4ac9-b79b-b664e5efd866': { city: 'Haßloch', country: 'Germany', countryCode: 'DE' },
  'c0eddd5b-da82-4161-9a5f-2eb4ab5f82e7': { city: 'De Panne', country: 'Belgium', countryCode: 'BE' },
  '7e95a960-dd7f-41a4-938c-4abe417c24f2': { city: 'Lichtaart', country: 'Belgium', countryCode: 'BE' },
  'c4307928-fc3c-47df-b976-305026751727': { city: 'Chessington', country: 'United Kingdom', countryCode: 'GB' },
  'f9497403-adf3-4409-bd79-bb5b54000e45': { city: 'Les Avenières', country: 'France', countryCode: 'FR' },
  '46ad6ab4-90db-4c39-b9a4-be833266c210': { city: 'Chasseneuil-du-Poitou', country: 'France', countryCode: 'FR' },
  '0976f1b8-5782-4cda-887f-dc1d537d8d6e': { city: 'Soltau', country: 'Germany', countryCode: 'DE' },
  'bda7d2f4-6622-4f8f-80c6-a46986d73469': { city: 'Romsey', country: 'United Kingdom', countryCode: 'GB' },
  'df686841-3a46-4ac7-a1c7-8f3cac840a2b': { city: 'San Martín de la Vega', country: 'Spain', countryCode: 'ES' },
  'c11ad942-8f5d-4642-862c-30d8b7a414e3': { city: 'Sevenum', country: 'Netherlands', countryCode: 'NL' },
  '66fbd0d1-14dd-4f1a-bb18-5e0b7447f07d': { city: 'Blackpool', country: 'United Kingdom', countryCode: 'GB' },
  '9c6a0987-e519-4d6e-b011-e6c47a60641b': { city: 'Biddinghuizen', country: 'Netherlands', countryCode: 'NL' },
  '85c5cdc5-95c3-4190-9a05-9707b634889d': { city: 'Ieper', country: 'Belgium', countryCode: 'BE' },
  '8d8a8cc7-4523-4437-8bb6-5c87a26ba5ce': { city: 'Wavre', country: 'Belgium', countryCode: 'BE' },
  'd7d1b145-234d-4c30-91e9-e0638cc1e4d8': { city: 'Savio', country: 'Italy', countryCode: 'IT' },
  '7b1d2346-363e-4a36-be23-5637fc6d508a': { city: 'Bottrop', country: 'Germany', countryCode: 'DE' },

  // ─── Middle East ─────────────────────────────────────────────────────────────
  '0307219d-b1a1-4be6-a1e0-ae8cff7a0b63': { city: 'Riyadh', country: 'Saudi Arabia', countryCode: 'SA' },

  // ─── Additional US Water Parks / Six Flags ───────────────────────────────────
  '2b6b1661-1eef-4d93-9861-920fd11a567e': { city: 'Galveston', state: 'TX', country: 'United States', countryCode: 'US' },
  '6e425f9f-8193-46cf-a30c-8ababdaa48de': { city: 'Marietta', state: 'GA', country: 'United States', countryCode: 'US' },
  '264d93c9-815b-4aa1-99a9-874d4afc2fd6': { city: 'Oklahoma City', state: 'OK', country: 'United States', countryCode: 'US' },
  '24198718-af4d-4306-b34f-0f36b40af61c': { city: 'Spring', state: 'TX', country: 'United States', countryCode: 'US' },
  '3708aa63-8d54-4ed0-ae3a-37b726aaae46': { city: 'New Braunfels', state: 'TX', country: 'United States', countryCode: 'US' },
  '1b41ac41-e8bd-4085-b39a-7ae3181efe1d': { city: 'Concord', state: 'CA', country: 'United States', countryCode: 'US' },
  'afd094fc-7675-47f3-a3d8-1674fd80fec0': { city: 'Rockford', state: 'IL', country: 'United States', countryCode: 'US' },
  '86d891aa-c2e5-47ff-9da7-d8ab160c1cb5': { city: 'Oaxtepec', country: 'Mexico', countryCode: 'MX' },
  'f342a6ed-ea22-43e0-a092-89996c4e8db7': { city: 'Phoenix', state: 'AZ', country: 'United States', countryCode: 'US' },
  '4a2cc72e-04ef-4108-ab63-6d8416263efd': { city: 'Winter Haven', state: 'FL', country: 'United States', countryCode: 'US' },
};

/**
 * Look up location by destination ID.
 * Returns undefined if destination not in map (graceful degradation).
 */
export function getLocationByDestinationId(destinationId: string): ParkLocation | undefined {
  return DESTINATION_LOCATIONS[destinationId];
}

/** Format location for display: "Orlando, FL" or "Osaka, Japan" */
export function formatLocation(loc: ParkLocation): string {
  if (loc.state) {
    return `${loc.city}, ${loc.state}`;
  }
  return `${loc.city}, ${loc.country}`;
}
