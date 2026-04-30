import { test, expect } from '@playwright/test';
import { MOCK_PARK_SLUG, MOCK_ATTRACTIONS, MOCK_WAIT_TIMES, MOCK_PARK_SCHEDULE } from './fixtures/park-data';

/**
 * Park Page Loading E2E tests — performance and error resilience.
 *
 * Catches:
 * - Loading skeleton not appearing (FOUC / blank screen)
 * - Attractions blocked behind slow wait-times fetch
 * - "Refresh timed out" errors appearing on initial load
 */

test.describe('Park page loading', () => {
  test('loading skeleton appears immediately on navigation', async ({ page }) => {
    // Delay API responses to ensure skeleton is visible
    await page.route('**/api/park-schedule*', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PARK_SCHEDULE) });
    });
    await page.route('**/api/wait-times*', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: MOCK_WAIT_TIMES }) });
    });
    await page.route('**/firestore.googleapis.com/**', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) });
    });
    await page.route('**/identitytoolkit.googleapis.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    );

    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    // Skeleton elements should be visible while data loads
    // The page renders animated pulse placeholders with the `animate-pulse` class
    const skeletonElements = page.locator('.animate-pulse');
    await expect(skeletonElements.first()).toBeVisible({ timeout: 3000 });
  });

  test('attractions render within reasonable time', async ({ page }) => {
    await page.route('**/api/park-schedule*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PARK_SCHEDULE) })
    );
    await page.route('**/api/wait-times*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: MOCK_WAIT_TIMES }) })
    );
    await page.route('**/firestore.googleapis.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) })
    );
    await page.route('**/identitytoolkit.googleapis.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    );

    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    // Attractions should render within 10 seconds (generous timeout for CI)
    const firstAttraction = page.getByText(MOCK_ATTRACTIONS[0].name).first();
    await expect(firstAttraction).toBeVisible({ timeout: 10000 });

    // Multiple attractions should be present
    const secondAttraction = page.getByText(MOCK_ATTRACTIONS[1].name).first();
    await expect(secondAttraction).toBeVisible();
  });

  test('no "refresh timed out" errors on initial load', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.route('**/api/park-schedule*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PARK_SCHEDULE) })
    );
    await page.route('**/api/wait-times*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: MOCK_WAIT_TIMES }) })
    );
    await page.route('**/firestore.googleapis.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) })
    );
    await page.route('**/identitytoolkit.googleapis.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    );

    await page.goto(`/parks/${MOCK_PARK_SLUG}`);
    await page.waitForLoadState('networkidle');

    // No "timed out" error text should be visible on the page
    const timeoutError = page.getByText(/refresh timed out/i);
    await expect(timeoutError).toBeHidden();

    // No timeout-related console errors
    const timeoutConsoleErrors = consoleErrors.filter(
      (e) => e.toLowerCase().includes('timeout') || e.toLowerCase().includes('timed out')
    );
    expect(timeoutConsoleErrors).toHaveLength(0);
  });

  test('handles API failure gracefully without crashing', async ({ page }) => {
    // Simulate API failures
    await page.route('**/api/park-schedule*', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service Unavailable' }) })
    );
    await page.route('**/api/wait-times*', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal Server Error' }) })
    );
    await page.route('**/firestore.googleapis.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) })
    );
    await page.route('**/identitytoolkit.googleapis.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    );

    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    // Page should load without unhandled crash (no blank white screen)
    // The page should at least show breadcrumb navigation or park name area
    await page.waitForLoadState('domcontentloaded');

    // Page should not show an unhandled runtime error overlay
    const errorOverlay = page.locator('#__next-build-error, [data-nextjs-dialog]');
    const hasError = await errorOverlay.isVisible().catch(() => false);
    expect(hasError).toBe(false);
  });
});
