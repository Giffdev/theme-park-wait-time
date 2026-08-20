import { afterEach, describe, expect, it, vi } from 'vitest';
import { refreshAllParksWaitTimes } from '../client';

function validResponse() {
  return {
    fetchedAt: '2026-08-20T02:55:00.000Z',
    stale: false,
    parkMeta: {
      'supported-park': {
        stale: false,
        source: 'upstream',
        fetchedAt: '2026-08-20T02:54:59.000Z',
        ageSeconds: 0,
      },
    },
    parks: {
      'supported-park': [
        {
          attractionId: 'ride',
          attractionName: 'Ride',
          status: 'OPERATING',
          waitMinutes: 20,
          fetchedAt: '2026-08-20T02:54:59.000Z',
        },
      ],
    },
  };
}

const malformedPayloads: Array<[string, () => unknown]> = [
  [
    'missing parkMeta',
    () => {
      const { parkMeta: _parkMeta, ...payload } = validResponse();
      return payload;
    },
  ],
  [
    'an invalid source enum',
    () => ({
      ...validResponse(),
      parkMeta: {
        'supported-park': {
          ...validResponse().parkMeta['supported-park'],
          source: 'themeparks-provider',
        },
      },
    }),
  ],
  [
    'a malformed parks entry',
    () => ({
      ...validResponse(),
      parks: {
        'supported-park': [
          {
            attractionId: 'ride',
            attractionName: 42,
            status: 'OPERATING',
            waitMinutes: 20,
          },
        ],
      },
    }),
  ],
];

describe('refreshAllParksWaitTimes response validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(malformedPayloads)('rejects %s through the public client', async (_name, payload) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload(),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(refreshAllParksWaitTimes()).rejects.toThrow(
      'Wait-time refresh returned an invalid response'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
