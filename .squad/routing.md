# Work Routing

How to decide who handles what for theme-park-wait-times.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Trip UI and ride-visit interactions | Frontend | Create/edit trip screens, add/remove ride visits, form state, loading/error states, responsive interaction behavior |
| React timing, polling, and browser event lifecycle | Scheduler | Hooks, timers, async scheduling, visibility/connectivity handling, Strict Mode cleanup, deterministic fake-timer tests |
| Firestore data and migration safety | Backend | Trip and ride-visit models, reads, writes, queries, security-aware data access, backward-compatible migrations |
| Persistence and failure recovery | Reliability | Reload durability, concurrent writes, retries, offline behavior, stale state, idempotency, partial failure recovery |
| Tests and reproduction | Tester | Reproduce reported failures, unit/integration/E2E coverage, regression tests, acceptance-gate execution |
| Architecture, scope, and review | Lead | Map the app, define ownership boundaries, control recovery scope, review cross-cutting changes, gate completion |
| Session logging and shared memory | Scribe | Decision merging, roster history, session logs, cross-agent context propagation |
| Work monitoring | Ralph | Scan and drive the issue/PR work queue using Ralph's current instructions |
| Responsible AI review | Rai | Safety, privacy, bias, credential exposure, and project-appropriate RAI checks |
| Verification and devil's advocacy | Fact Checker | Verify claims and evidence, challenge assumptions, run pre-mortems, flag contradictions |

## Primary Routing Rules

1. UI behavior belongs to Frontend; Firestore contracts belong to Backend.
2. React timing, polling, async scheduling, visibility/connectivity transitions, and Strict Mode lifecycle cleanup belong to Scheduler.
3. Cross-cutting durability failures involving persistence, concurrency, offline use, retries, or reloads belong to Reliability, with Backend consulted for Firestore contract changes.
4. Reproduction and regression proof belong to Tester; implementation remains with the routed domain owner.
5. Architecture, ambiguous ownership, scope changes, and final review belong to Lead.
6. No recovery task is complete until Tester has executed the shared acceptance gate and Lead has reviewed the evidence.

## Shared Recovery Acceptance Gate

Every recovery candidate must prove this exact end-to-end flow:

1. Create and save a simple trip.
2. Add ride visits to the trip.
3. Reload and confirm the trip and ride visits persist.

Speculative patches, isolated unit success, and code review without this proof do not satisfy completion.

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage, identify the primary concern, and assign `squad:{member}` | Lead |
| `squad:lead` | Architecture, review, scope, or completion gating | Lead |
| `squad:frontend` | Trip and ride-visit UI work | Frontend |
| `squad:scheduler` | React timing, polling, and event lifecycle work | Scheduler |
| `squad:backend` | Firestore model/read/write/migration work | Backend |
| `squad:tester` | Reproduction and regression coverage | Tester |
| `squad:reliability` | Persistence, concurrency, offline, retry, or reload work | Reliability |

## Rules

1. Route by primary concern using the table above; Lead resolves ambiguity.
2. Spawn Tester alongside implementation when a recovery behavior changes.
3. Route cross-domain designs and final recovery evidence through Lead.
4. Scribe runs after substantial work and does not own application changes.
5. Rai and Fact Checker retain their policy-defined review triggers.
