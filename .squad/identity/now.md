---
updated_at: 2026-08-21T09:32:28.452-07:00
focus_area: Park schedule correctness—date-specific calendars with timezone-aware rendering; pending official-source reconciliation
active_issues:
  - Official source verification (dollywood.com) blocked by JS/WAF
  - Fact Checker locked out for revision per protocol
  - Next phase: official source reconciliation when accessible
---

# What We're Focused On

Park schedule correctness and date-specific calendar implementation. Completed 2026-08-21 orchestration validates timezone-aware rendering and date-boundary handling across Frontend, Backend, and Tester.

## Park Schedule Implementation (2026-08-21)

- Frontend: Park-local time rendering + date-boundary handling
- Backend: Park-hours API contract with date-specific calendar data + epoch-based open state
- Tester: Comprehensive coverage for date isolation, seasonal closures, timezone boundaries, midnight rollover
- Fact Checker: Verification report rejected per first-party source protocol; locked out for revision
- Lead reviewer: Independent verification of Dollywood 2026-08-21 (ThemeParks.wiki 09:00-20:00 ET); approved combined diff
- Durable requirement: Park schedules are date-specific calendars, never treat as recurring defaults

## Pending

- Official source reconciliation (dollywood.com verification unavailable due to JS/WAF)
- Edge cases: closed days, special-event hours, weekday variation

## Catalog Implementation (2026-08-17)

- Catalog code shipped
- Production upsert-only reconciliation completed successfully
- Deletion and retirement remain review-only and disabled
- Pending upserts: 0
