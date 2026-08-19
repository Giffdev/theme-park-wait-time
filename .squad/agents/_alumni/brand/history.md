# Brand — History

## Context

- **Project:** theme-park-wait-times (ParkFlow)
- **Stack:** Next.js 15, React 19, TypeScript 5.8, Firebase 11.6, Tailwind CSS 4, Vitest 3
- **User:** Devin Sinha
- **Role:** UX Reviewer — gates frontend deploys by verifying end-to-end user flows
- **Added:** 2026-04-30 — created because UI bugs kept shipping (dead-end buttons, state not refreshing after mutations, edit modals missing features)

## Known UI Bug Patterns (from prior issues)

- State not refreshing after mutations (trip name edit, trip completion → banner)
- Buttons linking to wrong pages (Log Ride → ride history instead of logging flow)
- Edit modals missing features present in create flow (wait time unknown option)
- Park picker not populated in trip logging flow
- Active trip banner not dismissing after trip actions

## Learnings

(Will be populated as reviews happen)

## 2026-08-11 Full UX Audit — Complete

Comprehensive review across all product surfaces (homepage, parks, waits, calendar, trips, ride log, dashboard, auth, mobile nav). Key findings:
- **P0 Launch Blocker:** Crowd calendar silently serving deterministic mock data as real intelligence → resolved via Data + Mouth teams with `dataQuality` disclosure
- **P1 Launch Required:** Calendar mobile nav missing (RESOLVED), unresolved trip conflict state (RESOLVED), trip time calculation missing (RESOLVED)
- **P2 Polish:** Accessibility gaps, visual hierarchy, state clarity → backlog post-launch

All launch-blocking and required defects addressed by paired teams. Product ready for deployment.


## 2026-08-11 Cross-Agent Learnings — Brand

**UX Audit Timing Is Critical**
Catching the P0 data-trust defect (fake crowd calendar data shipped without disclosure) before launch prevented a user harm scenario (booking flights based on algorithmically generated numbers). Audits at decision inflection points (before ship) are more effective than post-mortems.

**Trust Defects Travel Up Through the UI**
Backend `dataQuality` disclosure metadata only prevents harm if the UI enforces a corresponding covenant: label every estimate, refuse to render unlabeled responses, flag coverage below threshold. The contract must be end-to-end; middleware compliance alone is insufficient.

**Full Product Surfaces Reveal Second-Order Issues**
Fixing the crowd calendar P0 created cascade effects: the calendar page needed mobile nav fixes, state claims needed validation, and trip calculations needed audit. A single-component review would have missed these; only the full surface audit caught them.
