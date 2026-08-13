import type { NextConfig } from 'next';

interface ParkSlugRedirect {
  source: string;
  destination: string;
  permanent: boolean;
}

/**
 * Legacy → canonical park slug aliases.
 *
 * Islands of Adventure was seeded into Firestore with the upstream
 * ThemeParks Wiki API's own slug ("universal-islands-of-adventure") instead
 * of park-registry.ts's canonical slug ("islands-of-adventure"). The seed
 * script now resolves the registry slug (see `resolveParkSlug` in
 * scripts/seed-parks.ts), but **production Firestore still contains only the
 * legacy-slug document** — no canonical-slug doc exists yet.
 *
 * That ordering is why this is data rather than a hardcoded redirect: the
 * parks listing links each park by the slug stored on its Firestore doc, so
 * today every link to Islands of Adventure points at the legacy slug.
 * Redirecting the legacy slug to a canonical slug with no document behind it
 * turns a working park page into "park unavailable", and a `permanent: true`
 * (308) redirect is cached by browsers/CDNs long after the data is corrected
 * — making the breakage outlive the misconfiguration.
 */
export const LEGACY_PARK_SLUG_ALIASES: ReadonlyArray<{
  legacySlug: string;
  canonicalSlug: string;
}> = [{ legacySlug: 'universal-islands-of-adventure', canonicalSlug: 'islands-of-adventure' }];

/**
 * Opt-in flag for the legacy→canonical slug redirects above.
 *
 * Deliberately OFF by default: the redirects are only correct once the
 * canonical-slug document actually exists in the target environment's
 * Firestore. Verify with `npx tsx scripts/reconcile-parks.ts` (dry-run —
 * reports slug/registry parity for the live `parks` collection) and only
 * then set `ENABLE_CANONICAL_PARK_SLUG_REDIRECTS=true` for that environment.
 */
export const CANONICAL_PARK_SLUG_REDIRECT_FLAG = 'ENABLE_CANONICAL_PARK_SLUG_REDIRECTS';

export function canonicalParkSlugRedirectsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[CANONICAL_PARK_SLUG_REDIRECT_FLAG] === 'true';
}

/**
 * Builds the legacy→canonical park slug redirects.
 *
 * Always `permanent: false`: slug identity follows the data, and data can be
 * reseeded, rolled back, or corrected. A permanently-cached redirect cannot
 * be undone by fixing the data, so this stays a temporary redirect even
 * after the canonical doc exists.
 */
export function canonicalParkSlugRedirects(
  enabled: boolean = canonicalParkSlugRedirectsEnabled()
): ParkSlugRedirect[] {
  if (!enabled) return [];

  return LEGACY_PARK_SLUG_ALIASES.flatMap(({ legacySlug, canonicalSlug }) => [
    {
      source: `/parks/${legacySlug}`,
      destination: `/parks/${canonicalSlug}`,
      permanent: false,
    },
    {
      source: `/parks/${legacySlug}/:path*`,
      destination: `/parks/${canonicalSlug}/:path*`,
      permanent: false,
    },
  ]);
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  async redirects() {
    return canonicalParkSlugRedirects();
  },
};

export default nextConfig;
