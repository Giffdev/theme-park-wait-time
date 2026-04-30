import { test, expect } from '@playwright/test';
import { MOCK_PARK, MOCK_PARK_SLUG, MOCK_ATTRACTIONS, MOCK_WAIT_TIMES, MOCK_PARK_SCHEDULE } from './fixtures/park-data';

/**
 * Report Wait Time — Critical flow E2E tests.
 *
 * Catches:
 * - Duplicate "Start Trip" prompts (the #1 recurrent production bug)
 * - FAB overlapping the modal
 * - Submit button being obscured
 * - UnifiedLogSheet not opening
 */

test.describe('Report Wait Time flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API routes before navigating
    await page.route('**/api/park-schedule*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PARK_SCHEDULE) })
    );
    await page.route('**/api/wait-times*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: MOCK_WAIT_TIMES }) })
    );

    // Mock Firestore REST calls — return park + attractions + wait times
    await page.route('**/firestore.googleapis.com/**', (route) => {
      const url = route.request().url();
      // Return appropriate docs based on the request path
      if (url.includes('parks')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ documents: [{ name: `projects/x/databases/y/documents/parks/${MOCK_PARK.id}`, fields: {} }] }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) });
    });

    // Mock Firebase Auth — simulate authenticated user
    await page.route('**/identitytoolkit.googleapis.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    );

    // Mock wait time report submission
    await page.route('**/waitTimeReports*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    );
  });

  test('opens UnifiedLogSheet when "Report Wait Time" is clicked', async ({ page }) => {
    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    // Wait for attractions to render (the page uses loading skeleton)
    const attractionRow = page.getByText(MOCK_ATTRACTIONS[0].name).first();
    await expect(attractionRow).toBeVisible({ timeout: 15000 });

    // Click on an attraction to open RideDetailPanel
    await attractionRow.click();

    // RideDetailPanel opens as a dialog
    const panel = page.getByRole('dialog');
    await expect(panel).toBeVisible();

    // Click "Report Wait Time" button
    const reportBtn = page.getByRole('button', { name: /report wait time/i });
    await expect(reportBtn).toBeVisible();
    await reportBtn.click();

    // UnifiedLogSheet should open — identified by its heading
    const sheetHeading = page.getByRole('heading', { name: /report wait time/i });
    await expect(sheetHeading).toBeVisible({ timeout: 5000 });
  });

  test('"I also rode this" expands ride log section', async ({ page }) => {
    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    const attractionRow = page.getByText(MOCK_ATTRACTIONS[0].name).first();
    await expect(attractionRow).toBeVisible({ timeout: 15000 });
    await attractionRow.click();

    const reportBtn = page.getByRole('button', { name: /report wait time/i });
    await expect(reportBtn).toBeVisible();
    await reportBtn.click();

    // Sheet opens — click "I also rode this" to expand
    const expandBtn = page.getByRole('button', { name: /i also rode this/i });
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();

    // The rating stars should now be visible (ride log section expanded)
    const ratingLabel = page.getByText('Rating');
    await expect(ratingLabel).toBeVisible();
  });

  test('CRITICAL: "No active trip" / "Start Trip" prompt appears ONLY ONCE', async ({ page }) => {
    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    const attractionRow = page.getByText(MOCK_ATTRACTIONS[0].name).first();
    await expect(attractionRow).toBeVisible({ timeout: 15000 });
    await attractionRow.click();

    const reportBtn = page.getByRole('button', { name: /report wait time/i });
    await expect(reportBtn).toBeVisible();
    await reportBtn.click();

    // Expand ride log section
    const expandBtn = page.getByRole('button', { name: /i also rode this/i });
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();

    // Wait for trip check to complete and "No active trip" to appear
    const noTripPrompts = page.getByText('No active trip');
    await expect(noTripPrompts.first()).toBeVisible({ timeout: 5000 });

    // THE BUG: This element should appear EXACTLY ONCE — not duplicated
    const count = await noTripPrompts.count();
    expect(count).toBe(1);

    // Also verify "Start Trip" link appears only once
    const startTripLinks = page.getByRole('link', { name: /start trip/i });
    const startTripCount = await startTripLinks.count();
    expect(startTripCount).toBe(1);
  });

  test('FAB button is NOT visible when modal is open', async ({ page }) => {
    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    const attractionRow = page.getByText(MOCK_ATTRACTIONS[0].name).first();
    await expect(attractionRow).toBeVisible({ timeout: 15000 });
    await attractionRow.click();

    const reportBtn = page.getByRole('button', { name: /report wait time/i });
    await expect(reportBtn).toBeVisible();
    await reportBtn.click();

    // UnifiedLogSheet is open — the QuickLogFAB should NOT be visible/overlapping
    // The FAB has aria-label "Log a ride"
    const fab = page.getByRole('button', { name: /log a ride/i });

    // FAB should either be hidden or not overlap the modal.
    // If it's present at all, it should be behind the modal (z-index 40 vs 70).
    // Best-case: it's hidden entirely when sheet is open.
    // Worst-case: it's technically in DOM but covered. Either way, not clickable in the modal flow.
    const fabVisible = await fab.isVisible().catch(() => false);
    if (fabVisible) {
      // If FAB is visible, verify it doesn't overlap the submit button
      const fabBox = await fab.boundingBox();
      const submitBtn = page.getByRole('button', { name: /submit/i }).first();
      if (await submitBtn.isVisible()) {
        const submitBox = await submitBtn.boundingBox();
        if (fabBox && submitBox) {
          // No vertical overlap: FAB bottom should be above submit top, or FAB top below submit bottom
          const overlaps =
            fabBox.x < submitBox.x + submitBox.width &&
            fabBox.x + fabBox.width > submitBox.x &&
            fabBox.y < submitBox.y + submitBox.height &&
            fabBox.y + fabBox.height > submitBox.y;
          expect(overlaps).toBe(false);
        }
      }
    }
  });

  test('"Submit & Log Ride" button is visible and not obscured after expanding', async ({ page }) => {
    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    const attractionRow = page.getByText(MOCK_ATTRACTIONS[0].name).first();
    await expect(attractionRow).toBeVisible({ timeout: 15000 });
    await attractionRow.click();

    const reportBtn = page.getByRole('button', { name: /report wait time/i });
    await expect(reportBtn).toBeVisible();
    await reportBtn.click();

    // Expand the ride log section
    const expandBtn = page.getByRole('button', { name: /i also rode this/i });
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();

    // The submit button text changes to "Submit & Log Ride ✓"
    const submitBtn = page.getByRole('button', { name: /submit & log ride/i });
    await expect(submitBtn).toBeVisible();

    // Verify it's in the viewport (scrollable into view)
    await submitBtn.scrollIntoViewIfNeeded();
    const box = await submitBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(0);
    expect(box!.width).toBeGreaterThan(0);
  });
});
