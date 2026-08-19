# Project Context

- **Owner:** Devin Sinha
- **Project:** theme-park-wait-times
- **Stack:** React/Next.js, TypeScript, Firebase/Firestore, Vercel, Tailwind CSS
- **Created:** 2026-08-19T09:55:20.065-07:00

## Learnings

### 2026-08-19T09:55:20.065-07:00 — Recovery mandate

Firestore models, writes, reads, and migrations must support the complete trip flow. Core trip logging remained broken too long; verify that a saved trip and its ride visits survive reload instead of relying on speculative data-layer patches.
