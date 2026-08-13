/**
 * Regression guard for platform-level cache headers in `vercel.json`.
 *
 * Two failure modes are pinned here, and they pull in opposite directions:
 *
 *  1. `/api/wait-times` is the one public, read-only endpoint that *must*
 *     stay CDN-cacheable, because cross-instance request coalescing depends
 *     on the route's own `s-maxage`/`stale-while-revalidate` headers
 *     surviving. A `vercel.json` rule that forces `no-store` onto it (either
 *     directly or via a blanket `/api/(.*)` rule) silently defeats that.
 *  2. Every *other* API route handles authenticated, mutation-adjacent, or
 *     per-user data and must remain explicitly `no-store`. A new route added
 *     without a matching rule would inherit whatever default the platform or
 *     a future broad rule provides — this test fails instead, at the moment
 *     the route file is added.
 *
 * The route list is derived from the filesystem rather than hardcoded, so
 * the guard cannot drift from the routes that actually exist.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, sep } from 'path';
import { describe, it, expect } from 'vitest';

interface VercelHeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

const REPO_ROOT = process.cwd();
const API_ROOT = resolve(REPO_ROOT, 'src/app/api');

/** The single public, intentionally CDN-cacheable read endpoint. */
const PUBLIC_CACHEABLE_ROUTES = ['/api/wait-times'];

function readVercelConfig(): { headers?: VercelHeaderRule[] } {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, 'vercel.json'), 'utf8'));
}

/** Walks src/app/api and returns each route's URL path. */
function discoverApiRoutes(dir: string = API_ROOT, prefix = '/api'): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir)) {
    const entryPath = join(dir, entry);
    if (statSync(entryPath).isDirectory()) {
      routes.push(...discoverApiRoutes(entryPath, `${prefix}/${entry}`));
    } else if (entry === 'route.ts' || entry === 'route.tsx') {
      routes.push(prefix);
    }
  }
  return routes;
}

/**
 * Converts a route path to the concrete URL a request would use, replacing
 * Next.js dynamic segments (`[parkId]`) with a representative value so it can
 * be matched against `vercel.json` source patterns.
 */
function concreteUrl(routePath: string): string {
  return routePath.replace(/\[(?:\.\.\.)?([^\]]+)\]/g, 'sample-value');
}

/** Compiles a `vercel.json` header `source` pattern into a matcher. */
function sourceMatcher(source: string): RegExp {
  const pattern = source
    .split('/')
    .map((segment) => {
      if (segment === '') return '';
      if (segment === '(.*)') return '.*';
      if (segment.startsWith(':')) return '[^/]+';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${pattern}$`);
}

function rulesMatching(rules: VercelHeaderRule[], url: string): VercelHeaderRule[] {
  return rules.filter((rule) => sourceMatcher(rule.source).test(url));
}

function cacheControlValues(rules: VercelHeaderRule[]): string[] {
  return rules.flatMap((rule) =>
    rule.headers.filter((h) => h.key.toLowerCase() === 'cache-control').map((h) => h.value)
  );
}

describe('vercel.json — API cache-control policy', () => {
  const config = readVercelConfig();
  const rules = config.headers ?? [];
  const apiRoutes = discoverApiRoutes();

  it('discovers the API routes from the filesystem (sanity check on the guard itself)', () => {
    expect(apiRoutes.length).toBeGreaterThan(1);
    expect(apiRoutes).toContain('/api/wait-times');
    expect(apiRoutes).toContain('/api/cron/refresh-wait-times');
    // Guard against a path-separator bug silently emptying the walk.
    expect(API_ROOT.includes(`src${sep}app${sep}api`)).toBe(true);
  });

  it('keeps every API route other than the public wait-times read path explicitly no-store', () => {
    const missing: string[] = [];

    for (const routePath of apiRoutes) {
      if (PUBLIC_CACHEABLE_ROUTES.includes(routePath)) continue;
      const url = concreteUrl(routePath);
      const values = cacheControlValues(rulesMatching(rules, url));
      const hasNoStore = values.some((value) => /no-store/.test(value));
      if (!hasNoStore) missing.push(routePath);
    }

    // Any route listed here has no `vercel.json` Cache-Control: no-store
    // rule covering it. Add one (or add the route to
    // PUBLIC_CACHEABLE_ROUTES with a deliberate justification).
    expect(missing).toEqual([]);
  });

  it('never forces no-store onto the public wait-times read path', () => {
    for (const routePath of PUBLIC_CACHEABLE_ROUTES) {
      const values = cacheControlValues(rulesMatching(rules, concreteUrl(routePath)));
      expect(values.filter((value) => /no-store/.test(value))).toEqual([]);
    }
  });

  it('has no blanket /api/(.*) rule that would override per-route cache-control', () => {
    expect(rules.map((rule) => rule.source)).not.toContain('/api/(.*)');
  });

  it('declares no cache-control rule that would let a non-public API route be shared by a CDN', () => {
    for (const rule of rules) {
      if (!rule.source.startsWith('/api')) continue;
      const coversPublicRouteOnly = PUBLIC_CACHEABLE_ROUTES.some(
        (routePath) => rule.source === routePath
      );
      if (coversPublicRouteOnly) continue;

      for (const value of cacheControlValues([rule])) {
        expect(value).toMatch(/no-store/);
        expect(value).not.toMatch(/s-maxage/);
        expect(value).not.toMatch(/\bpublic\b/);
      }
    }
  });
});
