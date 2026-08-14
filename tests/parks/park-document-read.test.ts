import { describe, expect, it } from 'vitest';
import {
  filterCurrentParkDocuments,
  selectCurrentParkDocument,
} from '@/lib/parks/park-document-read';
import {
  RETIRED_PARK_REPLACEMENTS,
  isRetiredParkId,
  resolveCurrentParkId,
} from '@/lib/parks/park-registry';

const OCEANS_CURRENT = 'b5a89552-3381-47ad-88cc-ab0087019c8b';
const OCEANS_RETIRED = '951987f7-3387-4221-8368-2859469aebcd';
const ARLINGTON_CURRENT = 'a96eb7c6-1fd3-4363-84d9-c84e23f886f1';
const ARLINGTON_RETIRED = '08e5d95c-7c73-4c65-b17a-06fede1801fb';
const OKC_CURRENT = '3964ae15-a1a8-41a1-aea9-23b456e2911f';
const OKC_RETIRED = 'aa8c2744-b792-4802-8a70-8bba51bc73da';

describe('park Firestore read reconciliation', () => {
  it('pins every evidence-backed retired identity to its current replacement', () => {
    expect(RETIRED_PARK_REPLACEMENTS).toMatchObject({
      [OCEANS_RETIRED]: OCEANS_CURRENT,
      [ARLINGTON_RETIRED]: ARLINGTON_CURRENT,
      [OKC_RETIRED]: OKC_CURRENT,
    });
    expect(isRetiredParkId(OCEANS_RETIRED)).toBe(true);
    expect(resolveCurrentParkId(OKC_RETIRED)).toBe(OKC_CURRENT);
  });

  it('removes retired park documents before the directory is rendered', () => {
    const documents = [
      { id: OCEANS_RETIRED, slug: 'oceans-of-fun', name: 'Oceans of Fun' },
      { id: OCEANS_CURRENT, slug: 'oceans-of-fun', name: 'Oceans of Fun' },
      { id: ARLINGTON_RETIRED, slug: 'hurricane-harbor-arlington', name: 'Old Arlington' },
      { id: ARLINGTON_CURRENT, slug: 'hurricane-harbor-arlington', name: 'Current Arlington' },
      { id: OKC_RETIRED, slug: 'hurricane-harbor-oklahoma-city', name: 'Old OKC' },
      { id: OKC_CURRENT, slug: 'hurricane-harbor-oklahoma-city', name: 'Current OKC' },
    ];

    expect(filterCurrentParkDocuments(documents).map((doc) => doc.id)).toEqual([
      OCEANS_CURRENT,
      ARLINGTON_CURRENT,
      OKC_CURRENT,
    ]);
  });

  it('selects canonical Oceans of Fun even when Firestore returns the retired doc first', () => {
    const selected = selectCurrentParkDocument(
      [
        { id: OCEANS_RETIRED, slug: 'oceans-of-fun' },
        { id: OCEANS_CURRENT, slug: 'oceans-of-fun' },
      ],
      'oceans-of-fun'
    );

    expect(selected?.id).toBe(OCEANS_CURRENT);
  });

  it('rejects unknown slugs instead of returning the first current document', () => {
    expect(
      selectCurrentParkDocument(
        [{ id: OCEANS_CURRENT, slug: 'oceans-of-fun' }],
        'not-a-real-park'
      )
    ).toBeUndefined();
  });

  it('rejects stale upstream slugs rather than falling back to a current document', () => {
    expect(
      selectCurrentParkDocument(
        [
          {
            id: '267615cc-8943-4c2a-ae2c-5da728ca591f',
            slug: 'universal-islands-of-adventure',
          },
        ],
        'universal-islands-of-adventure'
      )
    ).toBeUndefined();
  });

  it('does not collapse legitimate shared slugs without retirement evidence', () => {
    const documents = [
      { id: '7340550b-c14d-4def-80bb-acdb51d49a66', slug: 'disneyland-park' },
      { id: 'dae968d5-630d-4719-8b06-3d107e944401', slug: 'disneyland-park' },
    ];

    expect(filterCurrentParkDocuments(documents)).toEqual([
      expect.objectContaining({
        id: '7340550b-c14d-4def-80bb-acdb51d49a66',
        slug: 'disneyland',
      }),
      expect.objectContaining({
        id: 'dae968d5-630d-4719-8b06-3d107e944401',
        slug: 'disneyland-park-paris',
      }),
    ]);
  });

  it('removes Firestore park documents outside the supported canonical registry', () => {
    const documents = [
      { id: OCEANS_CURRENT, slug: 'oceans-of-fun' },
      { id: '00000000-0000-4000-8000-000000000001', slug: 'unsupported-park' },
    ];

    expect(filterCurrentParkDocuments(documents)).toEqual([
      expect.objectContaining({ id: OCEANS_CURRENT, slug: 'oceans-of-fun' }),
    ]);
  });

  it('overlays registry routing and family fields onto drifted Firestore documents', () => {
    const [document] = filterCurrentParkDocuments([
      {
        id: OCEANS_CURRENT,
        name: 'Drifted Name',
        slug: 'drifted-slug',
        destinationName: 'Drifted Destination',
        familyName: 'Drifted Family',
      },
    ]);

    expect(document).toMatchObject({
      id: OCEANS_CURRENT,
      name: 'Oceans of Fun',
      slug: 'oceans-of-fun',
      destinationName: 'Worlds of Fun',
      familyId: 'cedar-fair',
      familyName: 'Cedar Fair',
    });
  });
});
