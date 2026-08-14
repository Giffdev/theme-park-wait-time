import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WOF_UUID = 'bb731eae-7bd3-4713-bd7b-89d79b031743';
const OOF_UUID = 'b5a89552-3381-47ad-88cc-ab0087019c8b';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  fetch: vi.fn(),
}));

function firestoreRef(): Record<string, unknown> {
  const ref: Record<string, unknown> = {};
  ref.collection = vi.fn().mockReturnValue(ref);
  ref.doc = vi.fn().mockReturnValue(ref);
  ref.get = mocks.get;
  ref.set = mocks.set;
  return ref;
}

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: () => firestoreRef() },
}));

vi.stubGlobal('fetch', mocks.fetch);

import {
  batchGetParkOperatingStatus,
  getParkOperatingStatus,
} from '@/lib/parks/park-schedule-check';

function scheduleResponse(
  id: string,
  entries: Array<{ date: string; type?: string }>
) {
  return {
    ok: true,
    json: async () => ({
      id,
      name: id === WOF_UUID ? 'Worlds of Fun' : 'Oceans of Fun',
      timezone: 'America/Chicago',
      schedule: entries.map((entry) => ({
        date: entry.date,
        type: entry.type ?? 'OPERATING',
        description: null,
        openingTime: `${entry.date}T11:00:00-05:00`,
        closingTime: `${entry.date}T20:00:00-05:00`,
      })),
    }),
  };
}

describe('park schedule rolling-window boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T17:00:00.000Z'));
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ exists: false, data: () => undefined });
    mocks.set.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks past and beyond-horizon dates NO_DATA while preserving closed days inside coverage', async () => {
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.includes(WOF_UUID)) {
        return scheduleResponse(WOF_UUID, [
          { date: '2026-08-14' },
          { date: '2026-08-15' },
          { date: '2026-08-16' },
          { date: '2026-08-22' },
          { date: '2026-09-12' },
        ]);
      }
      return scheduleResponse(OOF_UUID, [
        { date: '2026-08-15' },
        { date: '2026-08-16' },
        { date: '2026-09-07' },
      ]);
    });

    const result = await batchGetParkOperatingStatus(
      [WOF_UUID, OOF_UUID],
      ['2026-08-01', '2026-08-14', '2026-08-17', '2026-09-13']
    );

    expect(result.get(WOF_UUID)?.get('2026-08-01')).toMatchObject({
      isOpen: false,
      hasData: false,
    });
    expect(result.get(WOF_UUID)?.get('2026-08-14')).toMatchObject({
      isOpen: true,
      hasData: true,
    });
    expect(result.get(WOF_UUID)?.get('2026-08-17')).toMatchObject({
      isOpen: false,
      hasData: true,
    });
    expect(result.get(WOF_UUID)?.get('2026-09-13')).toMatchObject({
      isOpen: false,
      hasData: false,
    });

    // Oceans of Fun has no Aug 14 OPERATING entry, but Aug 14 is the
    // park-local current date and falls inside its published horizon.
    expect(result.get(OOF_UUID)?.get('2026-08-14')).toMatchObject({
      isOpen: false,
      hasData: true,
    });
  });

  it('refetches when the published horizon advances within the normal cache TTL', async () => {
    let cachedDoc: Record<string, unknown> | undefined;
    mocks.get.mockImplementation(async () => ({
      exists: cachedDoc !== undefined,
      data: () => cachedDoc,
    }));
    mocks.set.mockImplementation(async (data: Record<string, unknown>) => {
      cachedDoc = data;
    });
    mocks.fetch
      .mockResolvedValueOnce(
        scheduleResponse(WOF_UUID, [
          { date: '2026-08-14' },
          { date: '2026-08-15' },
        ])
      )
      .mockResolvedValueOnce(
        scheduleResponse(WOF_UUID, [
          { date: '2026-08-14' },
          { date: '2026-08-15' },
          { date: '2026-08-16' },
        ])
      );

    const beforeAdvance = await getParkOperatingStatus(WOF_UUID, '2026-08-16');

    expect(beforeAdvance).toMatchObject({ isOpen: false, hasData: false });
    expect(mocks.set).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-08-14T23:00:00.000Z'));
    const afterAdvance = await getParkOperatingStatus(WOF_UUID, '2026-08-16');

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(afterAdvance).toMatchObject({ isOpen: true, hasData: true });
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ date: '2026-08-16', hasData: true })
    );
  });

  it('refetches ambiguous legacy empty cache entries instead of replaying false CLOSED', async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({
        parkId: WOF_UUID,
        date: '2026-08-14',
        timezone: 'America/Chicago',
        segments: [],
        fetchedAt: new Date().toISOString(),
      }),
    });
    mocks.fetch.mockResolvedValue(scheduleResponse(WOF_UUID, [{ date: '2026-08-14' }]));

    const status = await getParkOperatingStatus(WOF_UUID, '2026-08-14');

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(status).toMatchObject({ isOpen: true, hasData: true });
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ hasData: true })
    );
  });

  it('returns NO_DATA when an ambiguous legacy cache entry cannot be refreshed', async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({
        parkId: WOF_UUID,
        date: '2026-08-14',
        timezone: 'America/Chicago',
        segments: [],
        fetchedAt: new Date().toISOString(),
      }),
    });
    mocks.fetch.mockResolvedValue({ ok: false });

    const status = await getParkOperatingStatus(WOF_UUID, '2026-08-14');

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(status).toMatchObject({ isOpen: false, hasData: false });
  });

  it('trusts an explicit cached hasData=true empty schedule as a confirmed closure', async () => {
    mocks.get.mockResolvedValue({
      exists: true,
      data: () => ({
        parkId: WOF_UUID,
        date: '2026-08-17',
        timezone: 'America/Chicago',
        segments: [],
        hasData: true,
        fetchedAt: new Date().toISOString(),
      }),
    });

    const status = await getParkOperatingStatus(WOF_UUID, '2026-08-17');

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(status).toMatchObject({ isOpen: false, hasData: true });
  });

  it('uses the park-local date across a UTC month boundary', async () => {
    vi.setSystemTime(new Date('2026-09-01T02:30:00.000Z'));
    mocks.fetch.mockResolvedValue(scheduleResponse(WOF_UUID, [{ date: '2026-09-02' }]));

    const result = await batchGetParkOperatingStatus(
      [WOF_UUID],
      ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-03']
    );

    expect(result.get(WOF_UUID)?.get('2026-08-30')).toMatchObject({
      isOpen: false,
      hasData: false,
    });
    expect(result.get(WOF_UUID)?.get('2026-08-31')).toMatchObject({
      isOpen: false,
      hasData: true,
    });
    expect(result.get(WOF_UUID)?.get('2026-09-01')).toMatchObject({
      isOpen: false,
      hasData: true,
    });
    expect(result.get(WOF_UUID)?.get('2026-09-03')).toMatchObject({
      isOpen: false,
      hasData: false,
    });
  });
});
