/**
 * Regression coverage for Islands of Adventure slug identity.
 *
 * Root cause: the Firestore `parks` doc for Islands of Adventure was seeded
 * with the upstream ThemeParks Wiki API's own slug
 * ("universal-islands-of-adventure") instead of park-registry.ts's canonical
 * slug ("islands-of-adventure"). `scripts/seed-parks.ts` now resolves the
 * registry slug (`resolveParkSlug`), but the seed has NOT been applied to
 * production — production Firestore still contains only the legacy-slug
 * document and zero canonical-slug documents.
 *
 * The first attempt at backward compatibility shipped a `permanent: true`
 * redirect from the legacy slug to the canonical slug. With current
 * production data that redirect is actively harmful: the parks listing links
 * each park by the slug on its Firestore doc (i.e. the legacy slug today), so
 * every Islands of Adventure link would be 308-redirected to a URL with no
 * matching document — "park unavailable" — and a 308 is cached by browsers
 * and CDNs long after the data is fixed.
 *
 * The contract pinned here is therefore:
 *  1. by default there is NO park-slug redirect, so the legacy URL keeps
 *     resolving against the document that actually exists today;
 *  2. the alias is retained as data and can be enabled per environment once
 *     the canonical doc exists; and
 *  3. when enabled it is a *temporary* redirect — never `permanent: true` —
 *     so it can be undone by fixing data.
 */
import { describe, it, expect } from 'vitest';
import nextConfig, {
  CANONICAL_PARK_SLUG_REDIRECT_FLAG,
  LEGACY_PARK_SLUG_ALIASES,
  canonicalParkSlugRedirects,
  canonicalParkSlugRedirectsEnabled,
} from '../../next.config';

const LEGACY_SLUG = 'universal-islands-of-adventure';
const CANONICAL_SLUG = 'islands-of-adventure';

describe('next.config.ts — Islands of Adventure slug compatibility', () => {
  it('emits no park-slug redirect by default, so the legacy URL still works with current data', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];

    expect(redirects.some((r) => r.source.startsWith(`/parks/${LEGACY_SLUG}`))).toBe(false);
    expect(redirects).toEqual([]);
  });

  it('never emits a permanent redirect, even when the alias is explicitly enabled', () => {
    const redirects = canonicalParkSlugRedirects(true);

    expect(redirects.length).toBeGreaterThan(0);
    for (const redirect of redirects) {
      expect(redirect.permanent).toBe(false);
    }
  });

  it('retains the legacy→canonical alias as data for post-reseed enablement', () => {
    expect(LEGACY_PARK_SLUG_ALIASES).toContainEqual({
      legacySlug: LEGACY_SLUG,
      canonicalSlug: CANONICAL_SLUG,
    });

    const redirects = canonicalParkSlugRedirects(true);
    expect(redirects).toContainEqual({
      source: `/parks/${LEGACY_SLUG}`,
      destination: `/parks/${CANONICAL_SLUG}`,
      permanent: false,
    });
    expect(redirects).toContainEqual({
      source: `/parks/${LEGACY_SLUG}/:path*`,
      destination: `/parks/${CANONICAL_SLUG}/:path*`,
      permanent: false,
    });
  });

  it('only enables the alias for an explicit opt-in flag value', () => {
    expect(canonicalParkSlugRedirectsEnabled({})).toBe(false);
    expect(
      canonicalParkSlugRedirectsEnabled({ [CANONICAL_PARK_SLUG_REDIRECT_FLAG]: 'false' })
    ).toBe(false);
    expect(canonicalParkSlugRedirectsEnabled({ [CANONICAL_PARK_SLUG_REDIRECT_FLAG]: '1' })).toBe(
      false
    );
    expect(canonicalParkSlugRedirectsEnabled({ [CANONICAL_PARK_SLUG_REDIRECT_FLAG]: 'true' })).toBe(
      true
    );
  });
});
