import { test, expect } from '@playwright/test';
import { MOCK_PARK, MOCK_PARK_SLUG, MOCK_ATTRACTIONS, MOCK_WAIT_TIMES } from './fixtures/park-data';

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
    const canonicalParkId = '267615cc-8943-4c2a-ae2c-5da728ca591f';
    const stringFields = (value: Record<string, unknown>) => Object.fromEntries(
      Object.entries(value).map(([key, fieldValue]) => [
        key,
        fieldValue === null
          ? { nullValue: null }
          : typeof fieldValue === 'number'
            ? { integerValue: String(fieldValue) }
            : { stringValue: String(fieldValue) },
      ]),
    );
    const firestoreDocument = (
      collection: string,
      id: string,
      value: Record<string, unknown>,
    ) => ({
      name: `projects/theme-park-log-and-wait-time/databases/(default)/documents/${collection}/${id}`,
      fields: stringFields(value),
      createTime: '2026-08-21T20:00:00.000Z',
      updateTime: '2026-08-21T20:00:00.000Z',
    });
    let nextMessageSequence = 1;
    let pendingListenMessages: Array<[number, unknown[]]> = [];
    const chunk = (payload: unknown) => {
      const json = JSON.stringify(payload);
      return `${json.length}\n${json}`;
    };
    const queueListenResponse = (requestBody: string) => {
      const parameters = new URLSearchParams(requestBody);
      const listenRequest = [...parameters.entries()]
        .filter(([key]) => key.endsWith('___data__'))
        .map(([, value]) => JSON.parse(value) as {
            addTarget?: {
              targetId?: number;
              documents?: { documents?: string[] };
              query?: { structuredQuery?: { from?: Array<{ collectionId?: string }> } };
            };
          })
        .find((request) => request.addTarget);
      if (!listenRequest?.addTarget) return;
      const targetId = listenRequest.addTarget?.targetId ?? 2;
      const documentPath = listenRequest.addTarget?.documents?.documents?.[0] ?? '';
      const collectionId = listenRequest.addTarget?.query?.structuredQuery?.from?.[0]?.collectionId;
      const documents = documentPath.endsWith(`/parks/${canonicalParkId}`)
        ? [firestoreDocument('parks', canonicalParkId, {
            ...MOCK_PARK,
            id: canonicalParkId,
            timezone: 'America/New_York',
          })]
        : collectionId === 'attractions'
          ? MOCK_ATTRACTIONS.map((attraction) => firestoreDocument(
              'attractions',
              attraction.id,
              { ...attraction, parkId: canonicalParkId },
            ))
          : [];
      const messages: Array<[number, unknown[]]> = [
        [nextMessageSequence++, [{ targetChange: { targetChangeType: 'ADD', targetIds: [targetId] } }]],
        ...documents.map((document, index) => [
          nextMessageSequence + index,
          [{ documentChange: { document, targetIds: [targetId] } }],
        ] as [number, unknown[]]),
        [
          nextMessageSequence + documents.length,
          [{
            targetChange: {
              targetChangeType: 'CURRENT',
              targetIds: [targetId],
              resumeToken: 'CgkIsr7frOeylgM=',
              readTime: '2026-08-21T20:00:00.000Z',
            },
          }],
        ],
        [
          nextMessageSequence + documents.length + 1,
          [{
            targetChange: {
              resumeToken: 'CgkIsr7frOeylgM=',
              readTime: '2026-08-21T20:00:00.001Z',
            },
          }],
        ],
      ];
      nextMessageSequence += documents.length + 2;
      pendingListenMessages.push(...messages);
    };

    // Mock API routes before navigating
    await page.route('**/api/park-hours*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fetchedAt: '2026-08-21T20:00:00.000Z',
          parks: [{
            parkId: canonicalParkId,
            slug: MOCK_PARK_SLUG,
            timezone: 'America/New_York',
            phase: 'OPEN',
            todayHours: { openTime: '08:00', closeTime: '22:00' },
            localTime: '4:00 PM',
          }],
        }),
      })
    );
    await page.route('**/api/park-schedule*', (route) => {
      const date = new URL(route.request().url()).searchParams.get('date') ?? '2026-08-21';
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          parkId: canonicalParkId,
          date,
          timezone: 'America/New_York',
          segments: [{
            type: 'OPERATING',
            description: null,
            openingTime: `${date}T08:00:00-04:00`,
            closingTime: `${date}T22:00:00-04:00`,
          }],
          hasData: true,
          fetchedAt: '2026-08-21T20:00:00.000Z',
        }),
      });
    });
    await page.route('**/api/queue-report*', (route) => {
      const requestId = (route.request().postDataJSON() as { requestId?: string } | null)?.requestId;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(route.request().method() === 'POST'
          ? { success: true, requestId, outcome: 'created' }
          : { reports: [] }),
      });
    });
    await page.route('**/api/wait-times*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entries: MOCK_WAIT_TIMES }) })
    );

    // Mock Firestore REST calls — return park + attractions + wait times
    await page.route('**/firestore.googleapis.com/**', (route) => {
      const url = route.request().url();
      if (url.includes('/google.firestore.v1.Firestore/Listen/channel')) {
        const requestUrl = new URL(url);
        const isInitialHandshake = route.request().method() === 'POST'
          && !requestUrl.searchParams.has('SID');
        if (isInitialHandshake) {
          queueListenResponse(route.request().postData() ?? '');
          return route.fulfill({
            status: 200,
            contentType: 'text/plain; charset=utf-8',
            headers: {
              'Access-Control-Allow-Credentials': 'true',
              'Access-Control-Allow-Origin': 'http://localhost:3000',
              'Access-Control-Expose-Headers': 'X-Client-Wire-Protocol, X-HTTP-Session-Id, X-HTTP-Initial-Response',
            },
            body: chunk([[0, ['c', 'report-wait-time-fixture', '', 8, 12, 30000]]]),
          });
        }
        if (route.request().method() === 'POST') {
          queueListenResponse(route.request().postData() ?? '');
          return route.fulfill({
            status: 200,
            contentType: 'text/plain; charset=utf-8',
            headers: {
              'Access-Control-Allow-Credentials': 'true',
              'Access-Control-Allow-Origin': 'http://localhost:3000',
            },
            body: chunk([1, nextMessageSequence - 1, 0]),
          });
        }
        const messages = pendingListenMessages.length > 0
          ? pendingListenMessages.splice(0)
          : [[nextMessageSequence++, ['noop']] as [number, unknown[]]];
        return route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          headers: {
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Origin': 'http://localhost:3000',
            'Access-Control-Expose-Headers': 'X-Client-Wire-Protocol, X-HTTP-Session-Id, X-HTTP-Initial-Response',
          },
          body: chunk(messages),
        });
      }
      if (url.includes(`/documents/parks/${canonicalParkId}`)) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(firestoreDocument('parks', canonicalParkId, {
            ...MOCK_PARK,
            id: canonicalParkId,
            timezone: 'America/New_York',
          })),
        });
      }
      const requestBody = route.request().postData() ?? '';
      if (requestBody.includes('"collectionId":"attractions"')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_ATTRACTIONS.map((attraction) => ({
            document: firestoreDocument(
              'attractions',
              attraction.id,
              { ...attraction, parkId: canonicalParkId },
            ),
            readTime: '2026-08-21T20:00:00.000Z',
          }))),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    const encodeTokenPart = (value: object) => Buffer
      .from(JSON.stringify(value))
      .toString('base64url');
    const nowSeconds = Math.floor(Date.now() / 1000);
    const idToken = [
      encodeTokenPart({ alg: 'RS256', typ: 'JWT', kid: 'e2e-fixture' }),
      encodeTokenPart({
        aud: 'theme-park-log-and-wait-time',
        auth_time: nowSeconds,
        email: 'tester@parkpulse.dev',
        exp: nowSeconds + 3600,
        firebase: {
          identities: { email: ['tester@parkpulse.dev'] },
          sign_in_provider: 'password',
        },
        iat: nowSeconds,
        iss: 'https://securetoken.google.com/theme-park-log-and-wait-time',
        sub: 'user-e2e-001',
        user_id: 'user-e2e-001',
      }),
      'e2e-fixture',
    ].join('.');
    const mockUser = {
      localId: 'user-e2e-001',
      email: 'tester@parkpulse.dev',
      emailVerified: true,
      displayName: 'E2E Tester',
      providerUserInfo: [{
        providerId: 'password',
        federatedId: 'tester@parkpulse.dev',
        email: 'tester@parkpulse.dev',
        displayName: 'E2E Tester',
      }],
      validSince: String(nowSeconds),
    };
    await page.route('**/identitytoolkit.googleapis.com/**', (route) => {
      const body = route.request().url().includes('accounts:signInWithPassword')
        ? {
            ...mockUser,
            idToken,
            refreshToken: 'e2e-refresh-token',
            expiresIn: '3600',
            registered: true,
          }
        : route.request().url().includes('accounts:lookup')
          ? { users: [mockUser] }
          : {};
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
    await page.route('**/securetoken.googleapis.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: idToken,
          expires_in: '3600',
          refresh_token: 'e2e-refresh-token',
          token_type: 'Bearer',
          user_id: 'user-e2e-001',
        }),
      })
    );

    // Mock wait time report submission
    await page.route('**/waitTimeReports*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    );

    await page.goto('/auth/signin');
    await page.getByPlaceholder('Email address').fill('tester@parkpulse.dev');
    await page.getByPlaceholder('Password').fill('e2e-password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/parks');
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

    await expect(page.getByRole('button', { name: /i also rode this/i }))
      .toBeVisible({ timeout: 15000 });

    // UnifiedLogSheet should open — identified by its heading
    const sheetHeading = page.getByRole('heading', { name: /report wait time/i });
    await expect(sheetHeading).toBeVisible({ timeout: 5000 });

    const sheet = sheetHeading.locator('xpath=ancestor::div[contains(@class, "fixed")][1]');
    await expect(sheet).toHaveCSS('max-width', '448px');
    const sheetBounds = await sheet.boundingBox();
    const viewport = page.viewportSize();
    expect(sheetBounds).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(sheetBounds!.width).toBeLessThanOrEqual(448);
    expect(Math.abs(sheetBounds!.x - (viewport!.width - sheetBounds!.width) / 2)).toBeLessThanOrEqual(1);
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
    await expect(expandBtn).toBeVisible({ timeout: 15000 });
    await expandBtn.click();

    // The rating stars should now be visible (ride log section expanded)
    const ratingLabel = page.getByText('Rating', { exact: true });
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
    await expect(expandBtn).toBeVisible({ timeout: 15000 });
    await expandBtn.click();

    // Resolve the fixture's bounded active-trip lookup through the current UI.
    const logStandaloneBtn = page.getByRole('button', { name: 'Log standalone' });
    await expect(logStandaloneBtn).toBeVisible();
    await logStandaloneBtn.click();
    await page.getByRole('button', { name: 'Change' }).click();

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

  test('FAB button does not overlap the modal submit action', async ({ page }) => {
    await page.goto(`/parks/${MOCK_PARK_SLUG}`);

    const attractionRow = page.getByText(MOCK_ATTRACTIONS[0].name).first();
    await expect(attractionRow).toBeVisible({ timeout: 15000 });
    await attractionRow.click();

    const reportBtn = page.getByRole('button', { name: /report wait time/i });
    await expect(reportBtn).toBeVisible();
    await reportBtn.click();

    await expect(page.getByRole('button', { name: /i also rode this/i }))
      .toBeVisible({ timeout: 15000 });

    // UnifiedLogSheet is open — the QuickLogFAB should NOT be visible/overlapping
    // The FAB has aria-label "Log a ride"
    const fab = page.getByRole('button', { name: /log a ride/i });

    const submitBtn = page.getByRole('button', { name: /submit/i }).first();
    await expect(fab).toBeVisible();
    await expect(submitBtn).toBeVisible();
    const fabBox = await fab.boundingBox();
    const submitBox = await submitBtn.boundingBox();
    expect(fabBox).not.toBeNull();
    expect(submitBox).not.toBeNull();
    const overlaps =
      fabBox!.x < submitBox!.x + submitBox!.width &&
      fabBox!.x + fabBox!.width > submitBox!.x &&
      fabBox!.y < submitBox!.y + submitBox!.height &&
      fabBox!.y + fabBox!.height > submitBox!.y;
    expect(overlaps).toBe(false);
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
    await expect(expandBtn).toBeVisible({ timeout: 15000 });
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
    await submitBtn.click({ trial: true });
  });
});
