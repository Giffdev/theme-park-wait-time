# Stef — History Archive

**Last Updated:** 2026-04-29 (Pre-auto-refresh sprint)

## Archived Test Suites

### Unit Tests (Vitest)

- **Firebase helpers:** getDocument, addDocument, updateDocument CRUD operations
- **User service:** createOrUpdateUser, getUserPreferences, updateUserPreferences
- **Trip service:** createTrip, updateTripStats, getTrips, completeTrip with edge cases
- **Data transformation:** formatWaitTimeEntry, processParkData, mergeAttractionsWithWaitTimes

### Integration Tests

- **Firebase emulator:** Firestore emulator on 8080, Auth emulator on 9099
- **Auth flow:** Sign-in, sign-up, logout, session persistence
- **Ride log persistence:** Create, update, delete operations
- **Trip-Ride association:** Cascade delete, stats recalculation

### E2E Tests (Playwright)

- **Architecture:** Chromium-only, mocked backends via page.route()
- **Park flows:** Load wait times, click attractions, open detail view
- **Wait time sort:** Verify sort persistence
- **Mobile responsiveness:** Navigation, touch interactions

**Total Coverage:** ~150+ test cases, 80% lines/functions threshold

## See active history for current sprint work.
