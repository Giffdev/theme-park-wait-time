# Skill: Firebase Security Rules Testing

## When to use
When testing Firestore Security Rules against a Firebase Emulator to verify allow/deny access patterns.

## Pattern

### 1. Setup
```typescript
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'test-project',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf-8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

beforeEach(async () => { await testEnv.clearFirestore(); });
afterAll(async () => { await testEnv.cleanup(); });
```

### 2. Seed data (bypass rules)
```typescript
await testEnv.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), 'collection/doc'), data);
});
```

### 3. Test allow/deny
```typescript
// Unauthenticated
const unauth = testEnv.unauthenticatedContext();
await expect(getDoc(doc(unauth.firestore(), path))).resolves.toBeDefined(); // allow
await expect(setDoc(doc(unauth.firestore(), path), data)).rejects.toThrow(); // deny

// Authenticated
const auth = testEnv.authenticatedContext('user-id');
await expect(getDoc(doc(auth.firestore(), path))).resolves.toBeDefined(); // allow
```

### 4. Test data validation in rules
```typescript
// Rules enforce waitMinutes >= -1 && <= 300
await expect(setDoc(ref, { ...data, waitMinutes: 301 })).rejects.toThrow();
await expect(setDoc(ref, { ...data, waitMinutes: -2 })).rejects.toThrow();
await expect(setDoc(ref, { ...data, waitMinutes: 30 })).resolves.toBeUndefined();
```

## Key gotchas
- Use `127.0.0.1` not `localhost` for emulator host (avoids IPv6 issues)
- Always `clearFirestore()` in `beforeEach` for test isolation
- `withSecurityRulesDisabled` is for seeding only — never use it to test access
- Import `doc`, `setDoc`, `getDoc` from `firebase/firestore` (not the admin SDK)
