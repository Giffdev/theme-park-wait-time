import { test, expect } from '@playwright/test';
import { MOCK_PARK_SLUG, MOCK_ATTRACTIONS, MOCK_WAIT_TIMES, MOCK_PARK_SCHEDULE } from './fixtures/park-data';

/**
 * Filter Pills E2E tests — AttractionFilterChips on park drill-down page.
 *
 * Catches:
 * - Filter pills rendering for categories that don't exist in this park
 * - Thrill filter not hiding non-thrill attractions
 * - Shows disappearing when a tier-2 filter is active (design intent: shows always visible)
 * - Deselect not restoring full list
 */

test.describe('Filter pills on park drill-down', () => {
  test.beforeEach(async ({ page }) => {
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
  });

  test('filter pills render only for categories that have attractions', async ({ page }) => {
    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    // Wait for content to load
    const firstAttraction = page.getByText(MOCK_ATTRACTIONS[0].name).first();
    await expect(firstAttraction).toBeVisible({ timeout: 15000 });

    // The "All" pill should always be present
    const allPill = page.getByRole('button', { name: 'All' });
    await expect(allPill).toBeVisible();

    // Entity type pills should be present
    const ridesPill = page.getByRole('button', { name: 'All Rides' });
    await expect(ridesPill).toBeVisible();

    const showsPill = page.getByRole('button', { name: 'Shows' });
    await expect(showsPill).toBeVisible();

    // Tier 2 pills: "Thrill" and "Family" should render (we have those types)
    const thrillPill = page.getByRole('button', { name: 'Thrill' });
    await expect(thrillPill).toBeVisible();

    const familyPill = page.getByRole('button', { name: 'Family' });
    await expect(familyPill).toBeVisible();
  });

  test('clicking "Thrill" pill shows only thrill rides', async ({ page }) => {
    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    const firstAttraction = page.getByText(MOCK_ATTRACTIONS[0].name).first();
    await expect(firstAttraction).toBeVisible({ timeout: 15000 });

    // Click the "Thrill" tier-2 filter pill
    const thrillPill = page.getByRole('button', { name: 'Thrill' });
    await thrillPill.click();

    // Thrill rides should be visible
    await expect(page.getByText('Velocicoaster').first()).toBeVisible();
    await expect(page.getByText("Hagrid's Magical Creatures").first()).toBeVisible();

    // Family ride should be hidden
    await expect(page.getByText('The Cat in the Hat').first()).toBeHidden();
    await expect(page.getByText('Flight of the Hippogriff').first()).toBeHidden();
  });

  test('shows remain visible when a tier-2 filter is active', async ({ page }) => {
    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    const firstAttraction = page.getByText(MOCK_ATTRACTIONS[0].name).first();
    await expect(firstAttraction).toBeVisible({ timeout: 15000 });

    // Activate the Thrill filter
    const thrillPill = page.getByRole('button', { name: 'Thrill' });
    await thrillPill.click();

    // Shows should remain visible (design decision: shows are never hidden by tier-2 filters)
    // Look for shows in our fixture data
    await expect(page.getByText("Poseidon's Fury").first()).toBeVisible();
    await expect(page.getByText('The Mystic Fountain').first()).toBeVisible();
  });

  test('deselecting a pill restores all attractions', async ({ page }) => {
    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    const firstAttraction = page.getByText(MOCK_ATTRACTIONS[0].name).first();
    await expect(firstAttraction).toBeVisible({ timeout: 15000 });

    // Count initial visible attractions
    const thrillPill = page.getByRole('button', { name: 'Thrill' });

    // Select thrill filter
    await thrillPill.click();
    // Family rides should be hidden
    await expect(page.getByText('The Cat in the Hat').first()).toBeHidden();

    // Deselect thrill filter (click again)
    await thrillPill.click();

    // All attractions should be back
    await expect(page.getByText('The Cat in the Hat').first()).toBeVisible();
    await expect(page.getByText('Velocicoaster').first()).toBeVisible();
    await expect(page.getByText("Poseidon's Fury").first()).toBeVisible();
  });
});
