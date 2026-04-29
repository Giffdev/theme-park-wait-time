import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
  test('homepage loads without errors', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Theme Park/i);
  });

  test('parks page renders park list', async ({ page }) => {
    await page.goto('/parks');
    // At minimum the page should load and contain a heading
    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
  });

  test('no console errors on homepage', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out known benign errors (e.g. Firebase emulator connection)
    const critical = errors.filter(
      (e) => !e.includes('Firebase') && !e.includes('emulator'),
    );
    expect(critical).toHaveLength(0);
  });

  test('mobile viewport shows bottom navigation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    // Mobile nav should be visible at mobile breakpoint
    const nav = page.getByRole('navigation');
    await expect(nav).toBeVisible();
  });
});
