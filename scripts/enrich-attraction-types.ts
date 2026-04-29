import { adminDb } from '../src/lib/firebase/admin';
import { ATTRACTION_OVERRIDES } from './attraction-overrides';

export type AttractionType =
  | 'thrill'
  | 'family'
  | 'show'
  | 'experience'
  | 'parade'
  | 'character-meet'
  | 'dining-experience';

interface AttractionDoc {
  id: string;
  name: string;
  entityType: string;
  attractionType?: AttractionType;
}

// Keyword rules ordered by precedence
const KEYWORD_RULES: Array<{ keywords: string[]; type: AttractionType }> = [
  { keywords: ['coaster', 'mountain', 'tower', 'launch', 'rapids'], type: 'thrill' },
  { keywords: ['meet', 'greet', 'character'], type: 'character-meet' },
  { keywords: ['parade', 'cavalcade'], type: 'parade' },
  { keywords: ['show', 'theater', 'theatre', 'fireworks', 'spectacular', 'musical'], type: 'show' },
  { keywords: ['tour', 'walk', 'trail', 'exhibit'], type: 'experience' },
];

function classifyByOverride(name: string): AttractionType | null {
  const lowerName = name.toLowerCase();
  for (const [key, type] of Object.entries(ATTRACTION_OVERRIDES)) {
    if (lowerName.includes(key)) {
      return type;
    }
  }
  return null;
}

function classifyByKeywords(name: string): AttractionType | null {
  const lowerName = name.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((kw) => lowerName.includes(kw))) {
      return rule.type;
    }
  }
  return null;
}

function classifyByEntityType(entityType: string): AttractionType | 'SKIP' | null {
  switch (entityType) {
    case 'SHOW':
      return 'show';
    case 'RESTAURANT':
      return 'dining-experience';
    case 'MERCHANDISE':
      return 'SKIP';
    default:
      return null;
  }
}

function classify(attraction: AttractionDoc): AttractionType | 'SKIP' {
  // 1. Manual overrides (highest precedence)
  const override = classifyByOverride(attraction.name);
  if (override) return override;

  // 2. Keyword matching on name
  const keyword = classifyByKeywords(attraction.name);
  if (keyword) return keyword;

  // 3. entityType mapping for non-rides
  const entityMapping = classifyByEntityType(attraction.entityType);
  if (entityMapping) return entityMapping;

  // 4. Default: ATTRACTION with no keywords → family
  if (attraction.entityType === 'ATTRACTION') {
    return 'family';
  }

  // Unknown entity types without keyword matches → family
  return 'family';
}

async function main(): Promise<void> {
  console.log('🎢 Enriching attraction types...\n');

  const snapshot = await adminDb.collection('attractions').get();
  const total = snapshot.size;
  console.log(`Found ${total} attractions in Firestore.\n`);

  const summary: Record<AttractionType | 'skipped', number> = {
    thrill: 0,
    family: 0,
    show: 0,
    experience: 0,
    parade: 0,
    'character-meet': 0,
    'dining-experience': 0,
    skipped: 0,
  };

  const BATCH_SIZE = 499;
  let classified = 0;
  let batchDocs: Array<{ ref: FirebaseFirestore.DocumentReference; type: AttractionType }> = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() as AttractionDoc;
    const result = classify(data);

    if (result === 'SKIP') {
      summary.skipped++;
      classified++;
      continue;
    }

    summary[result]++;
    batchDocs.push({ ref: doc.ref, type: result });

    // Flush batch when full
    if (batchDocs.length >= BATCH_SIZE) {
      const batch = adminDb.batch();
      for (const item of batchDocs) {
        batch.update(item.ref, { attractionType: item.type });
      }
      await batch.commit();
      console.log(`  Classified ${classified + batchDocs.length}/${total} attractions...`);
      classified += batchDocs.length;
      batchDocs = [];
    }
  }

  // Flush remaining
  if (batchDocs.length > 0) {
    const batch = adminDb.batch();
    for (const item of batchDocs) {
      batch.update(item.ref, { attractionType: item.type });
    }
    await batch.commit();
    classified += batchDocs.length;
  }

  console.log(`\n✅ Classified ${classified}/${total} attractions.\n`);
  console.log('📊 Summary:');
  console.log('─'.repeat(35));
  for (const [type, count] of Object.entries(summary)) {
    if (count > 0) {
      console.log(`  ${type.padEnd(20)} ${count}`);
    }
  }
  console.log('─'.repeat(35));
  console.log(`  ${'TOTAL'.padEnd(20)} ${total}`);
}

main().catch((err) => {
  console.error('❌ Enrichment failed:', err);
  process.exit(1);
});
