# Project Context

- **Owner:** Devin Sinha
- **Project:** theme-park-wait-times
- **Stack:** React/Next.js, TypeScript, Firebase/Firestore, Vercel, Tailwind CSS
- **Created:** 2026-08-19T09:55:20.065-07:00

## Learnings

### 2026-08-19T09:55:20.065-07:00 — Recovery mandate

Reproduce failures before revising them and enforce end-to-end regression coverage. The non-negotiable gate is: save a simple trip, add ride visits, reload, and confirm both persist. Core trip logging remained broken too long for speculative validation.


📌 Team update (2026-08-21T09:32:28.452-07:00): Park schedule correctness requires comprehensive testing of date isolation, seasonal closures, timezone boundaries, and midnight rollover; Tester added full coverage and fixed dayPeriod typo — decided by Devin Sinha and approved by Lead
