/**
 * Backward-compatible entrypoint for the canonical park catalog sync.
 *
 * This command previously copied every ThemeParks.wiki destination into
 * Firestore, including parks the application registry did not support. That
 * created orphan documents and duplicate slugs. The canonical registry is now
 * the only supported identity source, so both sync commands share one
 * deterministic implementation.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import {
  syncCanonicalParkCatalog,
  type LegacyCatalogEntrypointIo,
} from './seed-parks';
import { formatSafeCatalogDiagnostic } from './reconcile-park-catalog';

export async function runSyncAllParks(argv: string[]): Promise<number> {
  return syncCanonicalParkCatalog(argv);
}

export async function runSyncAllParksEntrypoint(
  argv: string[] = process.argv.slice(2),
  options: {
    run?: (argv: string[]) => Promise<number>;
    io?: LegacyCatalogEntrypointIo;
  } = {}
): Promise<number> {
  const io = options.io ?? { err: (line: string) => console.error(line) };
  try {
    const exitCode = await (options.run ?? runSyncAllParks)(argv);
    if (exitCode !== 0) {
      io.err(`Park catalog sync exited with code ${exitCode}; no success was reported.`);
    }
    return exitCode;
  } catch (error) {
    io.err(`Park catalog sync failed: ${formatSafeCatalogDiagnostic(error)}`);
    return 1;
  }
}

const isDirectlyExecuted =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectlyExecuted) {
  runSyncAllParksEntrypoint().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
