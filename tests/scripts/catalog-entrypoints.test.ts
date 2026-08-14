import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runLiveCatalogReconcile } = vi.hoisted(() => ({
  runLiveCatalogReconcile: vi.fn(),
}));

vi.mock('../../src/lib/firebase/admin', () => ({
  adminDb: {},
  adminApp: {},
}));

vi.mock('../../scripts/reconcile-park-catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../scripts/reconcile-park-catalog')>()),
  runLiveCatalogReconcile,
}));

import {
  runSeedParksEntrypoint,
  syncCanonicalParkCatalog,
} from '../../scripts/seed-parks';
import {
  runSyncAllParks,
  runSyncAllParksEntrypoint,
} from '../../scripts/sync-all-parks';

describe('legacy catalog entrypoints', () => {
  beforeEach(() => {
    runLiveCatalogReconcile.mockReset().mockResolvedValue(0);
  });

  it.each([
    ['seed-parks', syncCanonicalParkCatalog],
    ['sync-all-parks', runSyncAllParks],
  ])('%s delegates to the manifest-first reconciler', async (_name, entrypoint) => {
    const argv = [
      '--apply-upserts',
      '--yes',
      '--manifest-file',
      'reviewed-catalog-manifest.json',
      '--manifest-id',
      'reviewed-manifest-id',
      '--phase',
      'parks',
      '--phase-digest',
      'reviewed-phase-digest',
    ];

    await expect(entrypoint(argv)).resolves.toBe(0);
    expect(runLiveCatalogReconcile).toHaveBeenCalledWith(argv);
  });

  it('keeps seed-parks dry-run by default when no apply flags are provided', async () => {
    await syncCanonicalParkCatalog([]);

    expect(runLiveCatalogReconcile).toHaveBeenCalledWith([]);
  });

  it.each([
    ['seed-parks', runSeedParksEntrypoint],
    ['sync-all-parks', runSyncAllParksEntrypoint],
  ])('%s reports a manifest-load failure safely and exits non-zero', async (_name, entrypoint) => {
    const stderr: string[] = [];
    runLiveCatalogReconcile.mockRejectedValueOnce(
      new Error('manifest load failed token=super-secret https://private.example/catalog')
    );

    await expect(
      entrypoint([], { io: { err: (line) => stderr.push(line) } })
    ).resolves.toBe(1);
    expect(stderr.join('\n')).toMatch(/manifest load failed/i);
    expect(stderr.join('\n')).toContain('token=[redacted]');
    expect(stderr.join('\n')).toContain('[redacted-url]');
    expect(stderr.join('\n')).not.toContain('super-secret');
    expect(stderr.join('\n')).not.toContain('private.example');
  });

  it.each([
    ['seed-parks', runSeedParksEntrypoint],
    ['sync-all-parks', runSyncAllParksEntrypoint],
  ])('%s surfaces a reconciler CLI failure and preserves its non-zero exit', async (
    _name,
    entrypoint
  ) => {
    const stderr: string[] = [];
    runLiveCatalogReconcile.mockResolvedValueOnce(2);

    await expect(
      entrypoint(['--apply-upserts'], {
        io: { err: (line) => stderr.push(line) },
      })
    ).resolves.toBe(2);
    expect(stderr.join('\n')).toMatch(/exited with code 2/i);
  });
});
