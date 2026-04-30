# Skill: E2E Testing with Playwright (Next.js + Firebase)

## Pattern: Route Interception for Firebase Apps

When testing a Next.js app backed by Firebase, use `page.route()` to intercept:

1. **Firestore REST API** — `**/firestore.googleapis.com/**`
2. **Firebase Auth** — `**/identitytoolkit.googleapis.com/**`
3. **App API routes** — `**/api/wait-times*`, etc.

This removes the need for Firebase emulators in E2E tests (those belong in integration tests).

```typescript
test.beforeEach(async ({ page }) => {
  await page.route('**/api/wait-times*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockData) })
  );
  await page.route('**/firestore.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ documents: [] }) })
  );
});
```

## Pattern: Asserting No Duplicates

For bugs where elements render more than once:

```typescript
const elements = page.getByText('No active trip');
await expect(elements.first()).toBeVisible();
const count = await elements.count();
expect(count).toBe(1); // CRITICAL: not duplicated
```

## Pattern: Bounding Box Overlap Detection

To verify two elements don't visually overlap:

```typescript
const boxA = await elementA.boundingBox();
const boxB = await elementB.boundingBox();
if (boxA && boxB) {
  const overlaps =
    boxA.x < boxB.x + boxB.width &&
    boxA.x + boxA.width > boxB.x &&
    boxA.y < boxB.y + boxB.height &&
    boxA.y + boxA.height > boxB.y;
  expect(overlaps).toBe(false);
}
```

## Pattern: Testing Loading States

Delay API responses to verify skeleton UI renders immediately:

```typescript
await page.route('**/api/**', async (route) => {
  await new Promise((r) => setTimeout(r, 2000)); // artificial delay
  await route.fulfill({ status: 200, body: JSON.stringify(data) });
});
await page.goto('/parks/my-park');
const skeleton = page.locator('.animate-pulse');
await expect(skeleton.first()).toBeVisible({ timeout: 3000 });
```

## Fixture Organization

- `e2e/fixtures/park-data.ts` — exported constants: MOCK_PARK, MOCK_ATTRACTIONS, MOCK_WAIT_TIMES, etc.
- `e2e/fixtures/api-handlers.ts` — reusable `mockParkPageAPIs(page)` helper
- Tests import directly from fixtures — no runtime file reads

## Config: Chromium-Only for Speed

```typescript
projects: [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
],
```

Add back Firefox/WebKit only for cross-browser release gates.
