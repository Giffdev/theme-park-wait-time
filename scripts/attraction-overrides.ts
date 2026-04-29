import type { AttractionType } from './enrich-attraction-types';

/**
 * Manual overrides for well-known attractions.
 * Key: lowercase attraction name (partial match).
 * Value: AttractionType classification.
 */
export const ATTRACTION_OVERRIDES: Record<string, AttractionType> = {
  // === THRILL RIDES ===
  // Disney
  'space mountain': 'thrill',
  'big thunder mountain': 'thrill',
  'expedition everest': 'thrill',
  'rock \'n\' roller coaster': 'thrill',
  'tower of terror': 'thrill',
  'guardians of the galaxy: cosmic rewind': 'thrill',
  'tron lightcycle': 'thrill',
  'test track': 'thrill',
  'mission: space': 'thrill',
  'splash mountain': 'thrill',
  'tiana\'s bayou adventure': 'thrill',
  'avatar flight of passage': 'thrill',
  'star wars: rise of the resistance': 'thrill',
  'slinky dog dash': 'thrill',
  'crush\'s coaster': 'thrill',
  'indiana jones adventure': 'thrill',
  'incredicoaster': 'thrill',
  'matterhorn bobsleds': 'thrill',
  'radiator springs racers': 'thrill',
  // Universal
  'hagrid\'s magical creatures motorbike adventure': 'thrill',
  'velocicoaster': 'thrill',
  'jurassic world velocicoaster': 'thrill',
  'the incredible hulk coaster': 'thrill',
  'hollywood rip ride rockit': 'thrill',
  'revenge of the mummy': 'thrill',
  'harry potter and the forbidden journey': 'thrill',
  'harry potter and the escape from gringotts': 'thrill',
  'jurassic park river adventure': 'thrill',
  'jurassic world: the ride': 'thrill',
  'the amazing adventures of spider-man': 'thrill',
  'transformers: the ride-3d': 'thrill',
  // Six Flags / Others
  'kingda ka': 'thrill',
  'el toro': 'thrill',
  'top thrill dragster': 'thrill',
  'steel vengeance': 'thrill',
  'millennium force': 'thrill',
  'fury 325': 'thrill',
  'superman: escape from krypton': 'thrill',
  'x2': 'thrill',
  'iron gwazi': 'thrill',
  'montu': 'thrill',
  'sheikra': 'thrill',
  'mako': 'thrill',
  'kraken': 'thrill',
  'manta': 'thrill',

  // === FAMILY RIDES ===
  'it\'s a small world': 'family',
  'pirates of the caribbean': 'family',
  'haunted mansion': 'family',
  'jungle cruise': 'family',
  'peter pan\'s flight': 'family',
  'buzz lightyear': 'family',
  'the many adventures of winnie the pooh': 'family',
  'toy story mania': 'family',
  'frozen ever after': 'family',
  'living with the land': 'family',
  'spaceship earth': 'family',
  'kilimanjaro safaris': 'family',
  'na\'avi river journey': 'family',
  'flight of the hippogriff': 'family',
  'cat in the hat': 'family',
  'e.t. adventure': 'family',

  // === SHOWS ===
  'fantasmic': 'show',
  'happily ever after': 'show',
  'illuminations': 'show',
  'harmonious': 'show',
  'epcot forever': 'show',
  'luminous': 'show',
  'festival of the lion king': 'show',
  'finding nemo: the big blue': 'show',
  'indiana jones epic stunt spectacular': 'show',
  'muppet*vision 3d': 'show',

  // === CHARACTER MEETS ===
  'meet mickey': 'character-meet',
  'meet minnie': 'character-meet',
  'princess fairytale hall': 'character-meet',
  'character spot': 'character-meet',

  // === EXPERIENCES ===
  'walt disney\'s enchanted tiki room': 'experience',
  'hall of presidents': 'experience',
  'carousel of progress': 'experience',
  'the seas with nemo & friends': 'experience',
};
