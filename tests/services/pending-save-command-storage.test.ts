import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configurePendingSaveCommandAfterMigrationForTests,
  configurePendingSaveCommandRemovalFailureForTests,
  configurePendingSaveCommandStorageForTests,
  loadPendingSaveCommand,
  removePendingSaveCommand,
  resetPendingSaveCommandStorageForTests,
  storePendingSaveCommand,
} from '@/lib/services/pending-save-command-storage';
import {
  createPendingRideSaveCommand,
  restorePendingRideSaveCommand,
  persistPendingRideSaveCommand,
  rideSaveContext,
} from '@/lib/services/pending-ride-save-command';

const valid = (value: unknown): value is { requestId: string; notes?: string } => (
  Boolean(value)
  && typeof value === 'object'
  && typeof (value as { requestId?: unknown }).requestId === 'string'
);

configurePendingSaveCommandStorageForTests('pending-save-storage-unit');

describe('pending save command storage', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    configurePendingSaveCommandAfterMigrationForTests(null);
    configurePendingSaveCommandRemovalFailureForTests(null);
    await resetPendingSaveCommandStorageForTests();
    localStorage.clear();
  });

  it('serializes competing clients so exactly one different request wins an empty context', async () => {
    const first = { requestId: 'ride-first', notes: 'first tab' };
    const second = { requestId: 'ride-second', notes: 'second tab' };

    const results = await Promise.all([
      storePendingSaveCommand('user-a', 'ride:trip-1', first),
      storePendingSaveCommand('user-a', 'ride:trip-1', second),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      expect.objectContaining({ ok: false, reason: 'conflict' }),
    ]);
    const stored = await loadPendingSaveCommand('user-a', 'ride:trip-1', valid);
    expect([first, second]).toContainEqual(stored);
  });

  it('treats the same request ID and exact payload as idempotent', async () => {
    const command = { requestId: 'ride-same', notes: 'exact' };

    expect(await storePendingSaveCommand('user-a', 'ride:trip-1', command))
      .toEqual({ ok: true, idempotent: false });
    expect(await storePendingSaveCommand('user-a', 'ride:trip-1', { ...command }))
      .toEqual({ ok: true, idempotent: true });
  });

  it('rejects the same request ID with a different payload', async () => {
    await storePendingSaveCommand('user-a', 'ride:trip-1', {
      requestId: 'ride-same',
      notes: 'original',
    });

    expect(await storePendingSaveCommand('user-a', 'ride:trip-1', {
      requestId: 'ride-same',
      notes: 'changed',
    })).toEqual({
      ok: false,
      reason: 'conflict',
      existingRequestId: 'ride-same',
    });
  });

  it('only removes the exact request and preserves a winner from a late completion', async () => {
    const winner = { requestId: 'ride-winner', notes: 'live' };
    await storePendingSaveCommand('user-a', 'ride:trip-1', winner);

    expect(await removePendingSaveCommand('user-a', 'ride:trip-1', 'ride-old'))
      .toEqual({
        ok: false,
        reason: 'mismatch',
        existingRequestId: 'ride-winner',
      });
    expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toEqual(winner);

    expect(await removePendingSaveCommand('user-a', 'ride:trip-1', 'ride-winner'))
      .toEqual({ ok: true, removed: true });
    expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toBeNull();
  });

  it('isolates commands by UID and context', async () => {
    const command = { requestId: 'ride-1', notes: 'private' };
    await storePendingSaveCommand('user-a', 'ride:trip-1', command);

    expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toEqual(command);
    expect(await loadPendingSaveCommand('user-b', 'ride:trip-1', valid)).toBeNull();
    expect(await loadPendingSaveCommand('user-a', 'ride:trip-2', valid)).toBeNull();
  });

  it('ignores corrupt legacy storage without deleting it and expires live entries after seven days', async () => {
    localStorage.setItem('tpwt:pending-save:v1:user-a', '{bad json');
    expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toBeNull();
    expect(localStorage.getItem('tpwt:pending-save:v1:user-a')).toBe('{bad json');

    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    await storePendingSaveCommand('user-a', 'ride:trip-1', { requestId: 'ride-1' });
    dateNow.mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);
    expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toBeNull();
  });

  it('ignores an expired legacy entry without deleting its key or unrelated entries', async () => {
    const now = Date.now();
    const legacy = {
      'ride:expired': {
        createdAt: now - 120_000,
        expiresAt: now - 60_000,
        command: { requestId: 'expired' },
      },
      'ride:live': {
        createdAt: now,
        expiresAt: now + 60_000,
        command: { requestId: 'live' },
      },
    };
    const serializedLegacy = JSON.stringify(legacy);
    localStorage.setItem('tpwt:pending-save:v1:user-a', serializedLegacy);

    expect(await loadPendingSaveCommand('user-a', 'ride:expired', valid)).toBeNull();
    expect(await loadPendingSaveCommand('user-a', 'ride:live', valid))
      .toEqual({ requestId: 'live' });
    expect(localStorage.getItem('tpwt:pending-save:v1:user-a')).toBe(serializedLegacy);
  });

  it('rejects a ninth context and cannot bypass capacity by replacing an occupied context', async () => {
    for (let index = 0; index < 8; index += 1) {
      expect((await storePendingSaveCommand('user-a', `ride:trip-${index}`, {
        requestId: `ride-${index}`,
      })).ok).toBe(true);
    }

    expect(await storePendingSaveCommand('user-a', 'ride:trip-8', {
      requestId: 'ride-8',
    })).toEqual({ ok: false, reason: 'capacity' });
    expect(await storePendingSaveCommand('user-a', 'ride:trip-0', {
      requestId: 'replacement',
    })).toEqual({
      ok: false,
      reason: 'conflict',
      existingRequestId: 'ride-0',
    });
    expect(await loadPendingSaveCommand('user-a', 'ride:trip-0', valid))
      .toEqual({ requestId: 'ride-0' });
  });

  it('rejects oversized and aggregate byte-capacity writes without deleting live commands', async () => {
    await storePendingSaveCommand('user-a', 'ride:existing', {
      requestId: 'existing',
      notes: 'a'.repeat(16_000),
    });

    expect(await storePendingSaveCommand('user-a', 'ride:oversized', {
      requestId: 'oversized',
      notes: 'x'.repeat(40_000),
    })).toEqual({ ok: false, reason: 'oversized' });
    expect(await storePendingSaveCommand('user-a', 'ride:new', {
      requestId: 'newest',
      notes: 'é'.repeat(8_500),
    })).toEqual({ ok: false, reason: 'capacity' });
    expect((await loadPendingSaveCommand('user-a', 'ride:existing', valid))?.requestId)
      .toBe('existing');
  });

  it('migrates a legacy command add-only, retains its source, and rejects a conflicting command', async () => {
    const createdAt = Date.now();
    const legacy = { requestId: 'legacy-ride', notes: 'preserve me' };
    const serializedLegacy = JSON.stringify({
      'ride:trip-1': {
        createdAt,
        expiresAt: createdAt + 60_000,
        command: legacy,
      },
    });
    localStorage.setItem('tpwt:pending-save:v1:user-a', serializedLegacy);

    expect(await storePendingSaveCommand('user-a', 'ride:trip-1', {
      requestId: 'new-ride',
      notes: 'must lose',
    })).toEqual({
      ok: false,
      reason: 'conflict',
      existingRequestId: 'legacy-ride',
    });
    expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toEqual(legacy);
    expect(localStorage.getItem('tpwt:pending-save:v1:user-a')).toBe(serializedLegacy);
  });

  it('repeats the same retained legacy import idempotently', async () => {
    const createdAt = Date.now();
    const legacy = { requestId: 'legacy-repeat', notes: 'same payload' };
    const serializedLegacy = JSON.stringify({
      'ride:trip-1': {
        createdAt,
        expiresAt: createdAt + 60_000,
        command: legacy,
      },
    });
    localStorage.setItem('tpwt:pending-save:v1:user-a', serializedLegacy);

    expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toEqual(legacy);
    expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toEqual(legacy);
    expect(await storePendingSaveCommand('user-a', 'ride:trip-1', { ...legacy }))
      .toEqual({ ok: true, idempotent: true });
    expect(localStorage.getItem('tpwt:pending-save:v1:user-a')).toBe(serializedLegacy);
  });

  it('tombstones an exact migrated legacy completion so reload cannot resurrect it', async () => {
      const createdAt = Date.now();
      const legacy = { requestId: 'legacy-complete', notes: 'completed payload' };
      localStorage.setItem('tpwt:pending-save:v1:user-a', JSON.stringify({
        'ride:trip-1': {
          createdAt,
          expiresAt: createdAt + 60_000,
          command: legacy,
        },
      }));

      expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toEqual(legacy);
      expect(await removePendingSaveCommand('user-a', 'ride:trip-1', legacy.requestId))
        .toEqual({ ok: true, removed: true });
      expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toBeNull();
      expect(localStorage.getItem('tpwt:pending-save:v1:user-a')).not.toBeNull();
  });

  it('imports a genuinely new retained legacy request in the same context', async () => {
      const createdAt = Date.now();
      const key = 'tpwt:pending-save:v1:user-a';
      const completed = { requestId: 'legacy-old', notes: 'completed' };
      localStorage.setItem(key, JSON.stringify({
        'ride:trip-1': {
          createdAt,
          expiresAt: createdAt + 60_000,
          command: completed,
        },
      }));
      await loadPendingSaveCommand('user-a', 'ride:trip-1', valid);
      await removePendingSaveCommand('user-a', 'ride:trip-1', completed.requestId);

      const fresh = { requestId: 'legacy-new', notes: 'new request' };
      localStorage.setItem(key, JSON.stringify({
        'ride:trip-1': {
          createdAt: createdAt + 1,
          expiresAt: createdAt + 60_001,
          command: fresh,
        },
      }));

      expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toEqual(fresh);
  });

  it('does not hide a same-ID legacy payload that conflicts with the tombstoned payload', async () => {
      const createdAt = Date.now();
      const key = 'tpwt:pending-save:v1:user-a';
      const completed = { requestId: 'legacy-same', notes: 'completed' };
      localStorage.setItem(key, JSON.stringify({
        'ride:trip-1': {
          createdAt,
          expiresAt: createdAt + 60_000,
          command: completed,
        },
      }));
      await loadPendingSaveCommand('user-a', 'ride:trip-1', valid);
      await removePendingSaveCommand('user-a', 'ride:trip-1', completed.requestId);

      const conflicting = { requestId: 'legacy-same', notes: 'different payload' };
      localStorage.setItem(key, JSON.stringify({
        'ride:trip-1': {
          createdAt: createdAt + 1,
          expiresAt: createdAt + 60_001,
          command: conflicting,
        },
      }));

      expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid))
        .toEqual(conflicting);
  });

  it('aborts command removal and tombstone creation together on transaction failure', async () => {
      const createdAt = Date.now();
      const command = { requestId: 'legacy-atomic', notes: 'recoverable' };
      localStorage.setItem('tpwt:pending-save:v1:user-a', JSON.stringify({
        'ride:trip-1': {
          createdAt,
          expiresAt: createdAt + 60_000,
          command,
        },
      }));
      await loadPendingSaveCommand('user-a', 'ride:trip-1', valid);
      configurePendingSaveCommandRemovalFailureForTests(() => {
        throw new Error('abort removal');
      });

      expect(await removePendingSaveCommand('user-a', 'ride:trip-1', command.requestId))
        .toEqual({ ok: false, reason: 'write-failed' });
      configurePendingSaveCommandRemovalFailureForTests(null);
      expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toEqual(command);
  });

  it('expires and bounds tombstones without deleting a live pending command', async () => {
      const now = Date.now();
      const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
      const live = { requestId: 'live-command', notes: 'must survive pruning' };
      await storePendingSaveCommand('user-a', 'ride:live', live);

      for (let index = 0; index < 33; index += 1) {
        const context = `ride:completed-${index}`;
        const command = { requestId: `completed-${index}`, notes: String(index) };
        await storePendingSaveCommand('user-a', context, command);
        expect(await removePendingSaveCommand('user-a', context, command.requestId))
          .toEqual({ ok: true, removed: true });
        dateNow.mockReturnValue(now + index + 1);
      }

      expect(await loadPendingSaveCommand('user-a', 'ride:live', valid)).toEqual(live);
      expect(await removePendingSaveCommand('user-a', 'ride:completed-32', 'completed-32'))
        .toEqual({ ok: true, removed: false });

      dateNow.mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);
      expect(await loadPendingSaveCommand('user-a', 'ride:live', valid)).toBeNull();
  });

  it('preserves an IndexedDB winner and a conflicting retained legacy source', async () => {
    const winner = { requestId: 'indexeddb-winner', notes: 'authoritative' };
    await storePendingSaveCommand('user-a', 'ride:trip-1', winner);
    const createdAt = Date.now();
    const serializedLegacy = JSON.stringify({
      'ride:trip-1': {
        createdAt,
        expiresAt: createdAt + 60_000,
        command: { requestId: 'legacy-loser', notes: 'old bundle' },
      },
    });
    localStorage.setItem('tpwt:pending-save:v1:user-a', serializedLegacy);

    expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toEqual(winner);
    expect(localStorage.getItem('tpwt:pending-save:v1:user-a')).toBe(serializedLegacy);
  });

  it('retains an old-tab command changed after import while IndexedDB keeps its winner', async () => {
    const createdAt = Date.now();
    const imported = { requestId: 'legacy-snapshot', notes: 'snapshot payload' };
    const changed = { requestId: 'legacy-changed', notes: 'old tab changed it' };
    localStorage.setItem('tpwt:pending-save:v1:user-a', JSON.stringify({
      'ride:trip-1': {
        createdAt,
        expiresAt: createdAt + 60_000,
        command: imported,
      },
    }));
    configurePendingSaveCommandAfterMigrationForTests(() => {
      configurePendingSaveCommandAfterMigrationForTests(null);
      localStorage.setItem('tpwt:pending-save:v1:user-a', JSON.stringify({
        'ride:trip-1': {
          createdAt,
          expiresAt: createdAt + 60_000,
          command: changed,
        },
      }));
    });

    expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toEqual(imported);
    expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid)).toEqual(imported);
    expect(JSON.parse(localStorage.getItem('tpwt:pending-save:v1:user-a') ?? '{}'))
      .toEqual({
        'ride:trip-1': {
          createdAt,
          expiresAt: createdAt + 60_000,
          command: changed,
        },
      });
  });

  it('retains a new old-tab context and unrelated legacy entries added after import', async () => {
    const createdAt = Date.now();
    const first = {
      createdAt,
      expiresAt: createdAt + 60_000,
      command: { requestId: 'legacy-first', notes: 'initial' },
    };
    const newContext = {
      createdAt: createdAt + 1,
      expiresAt: createdAt + 60_001,
      command: { requestId: 'legacy-new-context', notes: 'old tab' },
    };
    const unrelated = {
      createdAt: createdAt + 2,
      expiresAt: createdAt + 60_002,
      command: { requestId: 'legacy-unrelated', notes: 'leave alone' },
    };
    localStorage.setItem('tpwt:pending-save:v1:user-a', JSON.stringify({
      'ride:trip-1': first,
    }));
    configurePendingSaveCommandAfterMigrationForTests(() => {
      configurePendingSaveCommandAfterMigrationForTests(null);
      localStorage.setItem('tpwt:pending-save:v1:user-a', JSON.stringify({
        'ride:trip-1': first,
        'ride:trip-2': newContext,
        'trip:new': unrelated,
      }));
    });

    expect(await loadPendingSaveCommand('user-a', 'ride:trip-1', valid))
      .toEqual(first.command);
    expect(JSON.parse(localStorage.getItem('tpwt:pending-save:v1:user-a') ?? '{}'))
      .toEqual({
        'ride:trip-1': first,
        'ride:trip-2': newContext,
        'trip:new': unrelated,
      });
    expect(await loadPendingSaveCommand('user-a', 'ride:trip-2', valid))
      .toEqual(newContext.command);
  });

  it('reports unavailable IndexedDB instead of pretending a command is durable', async () => {
    const indexedDb = window.indexedDB;
    await resetPendingSaveCommandStorageForTests();
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
    try {
      expect(await storePendingSaveCommand('user-a', 'ride:trip-1', {
        requestId: 'ride-1',
      })).toEqual({ ok: false, reason: 'unavailable' });
    } finally {
      Object.defineProperty(window, 'indexedDB', { configurable: true, value: indexedDb });
    }
  });

  it('restores complete ride commands across reload-style calls', async () => {
    const command = createPendingRideSaveCommand({
      parkId: 'magic-kingdom',
      attractionId: 'space-mountain',
      parkName: 'Magic Kingdom',
      attractionName: 'Space Mountain',
      rodeAt: new Date('2026-08-17T20:00:00.000Z'),
      waitTimeMinutes: 25,
      attractionClosed: false,
      source: 'manual',
      rating: 5,
      notes: 'frozen',
    }, 'trip-1');
    await persistPendingRideSaveCommand('user-a', rideSaveContext('manual'), command);

    expect(await restorePendingRideSaveCommand('user-a', rideSaveContext('manual')))
      .toEqual(command);
    expect(await restorePendingRideSaveCommand('user-b', rideSaveContext('manual')))
      .toBeNull();
  });
});
