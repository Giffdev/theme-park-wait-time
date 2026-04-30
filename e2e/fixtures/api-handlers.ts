import { Page } from '@playwright/test';
import {
  MOCK_PARK,
  MOCK_PARK_ID,
  MOCK_ATTRACTIONS,
  MOCK_WAIT_TIMES,
  MOCK_PARK_SCHEDULE,
} from './park-data';

/**
 * Intercepts Firestore and API calls and returns fixture data.
 * This allows E2E tests to run without a real Firebase backend.
 */
export async function mockParkPageAPIs(page: Page) {
  // Intercept the park schedule API
  await page.route('**/api/park-schedule*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PARK_SCHEDULE),
    });
  });

  // Intercept the wait-times API (refresh calls)
  await page.route('**/api/wait-times*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ entries: MOCK_WAIT_TIMES, parkId: MOCK_PARK_ID }),
    });
  });

  // Intercept Firestore REST calls (for getCollection)
  // The app uses Firebase JS SDK which calls Firestore REST under the hood
  await page.route('**/firestore.googleapis.com/**', async (route) => {
    // Let these pass through or mock them — for now, fulfill with empty
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ documents: [] }),
    });
  });

  // Intercept Firebase Auth calls
  await page.route('**/identitytoolkit.googleapis.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

/**
 * Injects mock data into the page via localStorage/sessionStorage
 * and stubs out firebase modules using page.addInitScript.
 */
export async function injectMockFirebaseData(page: Page) {
  await page.addInitScript({
    content: `
      // Store mock data globally for the app's firebase getCollection calls
      window.__E2E_MOCK_DATA__ = {
        park: ${JSON.stringify(MOCK_PARK)},
        attractions: ${JSON.stringify(MOCK_ATTRACTIONS)},
        waitTimes: ${JSON.stringify(MOCK_WAIT_TIMES)},
      };
    `,
  });
}

/**
 * Mock the trip service to return no active trip (triggers "Start Trip" prompt).
 */
export async function mockNoActiveTrip(page: Page) {
  await page.addInitScript({
    content: `
      window.__E2E_MOCK_TRIP__ = null;
    `,
  });
}

/**
 * Mock authenticated user state.
 * This sets a flag the auth context can pick up in E2E mode.
 */
export async function mockAuthenticatedUser(page: Page) {
  await page.addInitScript({
    content: `
      window.__E2E_MOCK_USER__ = {
        uid: 'user-e2e-001',
        email: 'tester@parkpulse.dev',
        displayName: 'E2E Tester',
      };
    `,
  });
}
