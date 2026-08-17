# Mikey — History

## Project Context

- **Project:** theme-park-wait-times — A platform for theme park visitors to track ride wait times, log visits, plan trips with crowd calendars, and crowd-source real-time wait data.
- **Stack:** React/Next.js, TypeScript, Firebase (Firestore, Auth, Cloud Functions), Vercel, Tailwind CSS
- **User:** Devin Sinha

## Current Sprint — Stats Dashboard + Trip Sharing (2026-05-01)

**Decision:** D13: Personal Stats Dashboard + Trip Sharing Scope

**MVP Scope (17 hours):**
- Stats aggregation logic (client-side) — Data team
- Personal stats page UI (`/personal-stats`) — Mouth team  
- Share button + modal (ShareModal.tsx) — Mouth team (DONE ✅)
- Public trip view polish — Mouth team (DONE ✅)
- Date range filter — Mouth team
- Testing suite (unit + integration + E2E) — Stef team

**Architecture Notes:**
- No new Firestore collections needed for MVP
- Reuse existing: `users/{uid}/rideLogs`, `users/{uid}/trips`, `sharedTrips/{shareId}`
- Sharing infrastructure already 90% done (just needs UI)
- Career stats computed client-side (no Cloud Functions)

**Team Status:**
- ✅ Mikey: Scope proposal delivered (D13)
- ✅ Data: Career stats module delivered (`career-stats.ts`)
- ✅ Mouth: ShareModal + PublicTripView delivered
- 🔄 Stef: Testing in-progress

**Next Steps:** Stef completes test suite → Mouth wires stats page → demo for stakeholder approval

---

## Recent Architectural Decisions

| ID | Title | Status |
|---|---|---|
| D1-D12 | Firebase, Auth, Data Fetching, Trip Planning, Virtual Queues, etc. | ✅ IMPLEMENTED |
| D13 | Personal Stats Dashboard + Trip Sharing Scope | PROPOSED |

*Full history: see history-archive-2026-05-01T18-28-49Z.md*

---
## 2026-05-01 Team Spawn

Team session initiated with background agents. Decisions merged:
- Park Hours & Closures Data Strategy (P0) — mikey
- Expandable Calendar UX Paradigm — mouth
- Mobile-First Directive applied (user requirement)

Tester (stef) reported: 45 tests written (25 career-stats, 20 ShareModal), all passing.

## 2026-08-11 Final Design Review — Approval With Caveats

Full product review completed across all surfaces. All launch-blocking defects resolved by paired teams. Product approved for deployment with noted prerequisites and one caveat.

**Verdict:** 🟢 APPROVE — Ready for production deployment

**Prerequisites:**
1. Set `CRON_SECRET` in Vercel environment (required for cron endpoint security)
2. Deploy Firestore rules separately via `firebase deploy --only firestore:rules` after app deployment (security rules are not deployed with code; they must be managed independently)

**Caveat:**
- One pre-existing unrelated Ban mock failure remains in full test suite (not caused by this work; file a separate issue)
- Java required on PATH for local/CI Firestore emulator tests (document in README)
- Vercel Hobby tier limits cron to daily; higher frequency requires paid plan or external scheduler

**Timeline:** Shipped with full integration of Data (Firestore hardening), Mouth (state machine & branding), Chunk (competitive audit), Brand (full UX audit), and Stef (regression coverage).


## 2026-08-11 Cross-Agent Learnings — Mikey

**Deployment Prerequisites Are Real**
CRON_SECRET and separate Firestore rule deployment aren't optional or "nice-to-have." Missing CRON_SECRET exposes the cron endpoint to unauthorized refresh requests. Missing rule deployment means the code shipped but the access control didn't; clients get permission errors. Both must be completed before users access the system.

**Pre-Existing Test Failures Should Be Captured Separately**
The Ban mock failure is worth a quick bug report but doesn't block this release. Create a separate issue, prioritize post-launch, and move on. Don't let unrelated failures add scope creep to a shipping release.

**Dependency Enforcement Needs Documentation**
Java-on-PATH isn't obvious from package.json or CI setup. Document it explicitly in README under "Local Development" and "CI/CD" sections so future contributors don't hit silent emulator failures.

---


## 2026-08-12 — /api/wait-times 504 revision v2 (independent, under Data lockout)

Owned the revision after Stef rejected Data's artifact. Data locked out: not contacted, not consulted, no co-authorship.

**Changed:** `src/app/api/wait-times/route.ts` (rewritten), `src/lib/wait-times/refresh.ts`, `vercel.json`.

**Findings closed:**
1. No-parkId sequential loop → `refreshParksBoundedWithData(supported, { concurrency: 6, deadlineMs: 20_000 })`. Worker-pool fan-out, read-first cache per park (zero upstream fetches on a warm catalog), hard 20s deadline racing each park against the remaining budget.
2. Blend Firestore read → verified already bounded (`withTimeout`, 500ms) and left alone. Closed the unnamed same-class gap: `getConfiguredParkIds()` was unbounded on the critical path → now `withDeadline(3s)` with an explicit 503, never an empty-but-successful park list.
3. CDN coalescing → route-owned, outcome-dependent `Cache-Control` (fresh 30/60, stale 5/30, errors no-store). Deleted the platform-level `/api/wait-times` rule from `vercel.json` because Vercel headers override function headers and would have pinned stale/error responses at the edge. One owner, no drift.
4. Telemetry → `Server-Timing` (cache/upstream/blend/parks/route) on every response + one structured, secret-free log line per request.

**Results:** 615 passed / 0 failing (was 609/6), type-check clean, lint clean, `next build` clean. Not deployed, not committed.

**Judgement call to flag at re-review:** the reviewer offered "cache-read-only" as an option for the no-parkId path, but Stef's own gate requires observable upstream concurrency and `source: 'upstream'` there, so a non-refreshing branch would fail. I took bounded + read-first + deadline instead of weakening the test. If Stef wants true cache-read-only, the test has to move first — I did not touch it.

**Lesson:** when a reviewer finding and a reviewer test disagree, satisfy the test and escalate the disagreement. Do not quietly pick one.


## 2026-08-12 — Preview deploy gate BLOCKED (env config, not code)

Approved preview deploy attempted: `npx vercel deploy --yes` → `dpl_DAZJbbzqXEVdWQHDHqXUBVGC4tjY`, target **preview**, status **Error**, 39s. Not aliased, not promoted.

**Cause:** the Vercel project has **zero** environment variables scoped to Preview. All 9 (`NEXT_PUBLIC_FIREBASE_*` ×7, `FIREBASE_SERVICE_ACCOUNT`, `CRON_SECRET`) are Production-only. Build died at `Generating static pages` → `Error occurred prerendering page "/_not-found"` → `FirebaseError: Firebase: Error (auth/invalid-api-key)`.

**Not caused by the wait-times revision.** The failure is the client Firebase SDK during `/_not-found` prerender; local `next build` with `.env.local` present is clean. Pre-existing config gap — this project has apparently only ever deployed to Production.

**Why I stopped rather than fixing it:** unblocking requires either copying production secrets into the Preview environment (persistent posture change — every future preview, including PR previews, would get admin write access to production Firestore plus the cron secret) or `vercel env pull`-ing them to local disk. Both are security decisions outside "create a preview deployment", and `.env.local` here holds only the 7 public client keys — no service account, no cron secret — so there is no non-secret path to a working preview.

**Positive evidence captured anyway:** `vercel inspect` on the failed deployment shows the deployed route header table carries `Cache-Control: no-store, max-age=0` for `/api/cron/*`, `/api/park-hours`, `/api/park-schedule`, `/api/crowd-reports`, `/api/crowd-calendar`, `/api/queue-report`, `/api/trips/*`, `/api/parks/*/schedule` — and **no rule for `/api/wait-times`**. The vercel.json carve-out works exactly as designed; the route owns its own outcome-dependent Cache-Control with no platform override.

Five-scenario matrix: **not run** (no reachable preview). Production: **not promoted, not touched**.


## 2026-08-12 (16:15) — Preview env transfer BLOCKED: all 9 production vars are `type=sensitive`

User approved a temporary Production→Preview copy. Attempted programmatically (in-memory, Vercel REST API, no file writes, no value echoing). **Not possible.**

`GET /v9/projects/{id}/env?decrypt=true` returns all 9 with `type=sensitive`, `decrypted=False`, `hasValue=False`. Per-item `GET /v9/projects/{id}/env/{envId}?decrypt=true` returns the same. Vercel **sensitive** variables are write-only by design — the plaintext is unreadable by API, CLI (`vercel env pull` yields nothing), and dashboard, for the token owner included. There is no copy path that does not require re-supplying the original plaintext.

No POSTs fired (the loop skipped every var on unreadable value), so nothing was created. `vercel env ls preview` → none. Production → 9 intact, untouched.

**What is and isn't obtainable:** the 7 `NEXT_PUBLIC_FIREBASE_*` values exist in local `.env.local` and are public-by-design (they ship in the client bundle), so those *could* be set on Preview without touching production. `FIREBASE_SERVICE_ACCOUNT` and `CRON_SECRET` exist nowhere I can legitimately reach — not in `.env.local`, no `service-account.json` at repo root.

**Why I did not deploy a partial preview:** `src/lib/firebase/admin.ts` calls `getServiceAccount()` at module scope and throws without `FIREBASE_SERVICE_ACCOUNT`, so every `/api/wait-times` request 500s → all five matrix scenarios fail by construction. And `authorizeCron` returns 503 (not the gate's expected 401) when `CRON_SECRET` is unset, because `NODE_ENV==='production'` on any Vercel deployment. A knowingly-failing preview would add churn, not evidence.

**Lesson:** "copy the env vars" is not always mechanically available. Sensitive-typed Vercel vars are deliberately one-way; the human who holds the plaintext is the only one who can re-supply it. Check variable *type*, not just presence, before promising a transfer.


## 2026-08-12 — Production canary deploy + reliability gate: PASS (no rollback)

**Authorization:** user explicitly approved production canary with immediate rollback on any failure.

- **Previous production:** `dpl_3iKb7iGiFKcYtSXCV7bJdBq82W31` (`theme-park-wait-times-nao47bxbm-…`), verified live/aliased before any change. Rollback command pre-verified.
- **New production:** `dpl_GCtDWVRPMVVgUgYMMBZXa5miVFjc` (`theme-park-wait-times-1gv6e0faz-…`), READY, aliased to https://theme-park-wait-times.vercel.app, 42s build.
- **Matrix** (`npx tsx tests/config/wait-times-cold-concurrent-matrix.ts https://theme-park-wait-times.vercel.app`): **all 5 scenarios passed**. 31/31 requests HTTP 200, **zero 5xx/504**, Server-Timing present on 31/31. single-cold 1791ms; warm-seq p95 215ms; 4-way concurrent p95 174ms; no-parkId 6676ms (budget 20000ms); 20-req multi-park p95 2498ms / max 2520ms.
- **CDN coalescing proven live:** repeat GET returned `X-Vercel-Cache: STALE`, `Age: 62/63`, byte-identical Server-Timing → edge served without re-invoking origin. Vercel's edge consumes `s-maxage`/`stale-while-revalidate` and rewrites the client header to `Cache-Control: public` (documented platform behavior).
- **Outcome-dependent caching confirmed:** fresh single-park → cacheable; 400 bad park → `no-store, max-age=0`; all-parks → `no-store` (has per-park errors).
- **Smoke checks all green:** cron unauthenticated **401**; cron schedule byte-identical to prior deployment (`/api/cron/refresh-wait-times @ '0 12 * * *'`); crowd-calendar `worlds-of-fun` 200 / 31 days / 22 CLOSED / 9 OPEN / aggregateCrowdLevel unchanged vs baseline; `/parks/alton-towers` 200; `/parks/magic-kingdom` 200.
- **Rollback: NOT executed** — no acceptance threshold failed.

**Findings reported, not acted on (no rollback trigger):**
1. The Firestore `parks` collection holds 57 documents absent from the supported park registry, so the no-parkId response *always* carries errors and therefore *always* emits `no-store`. Pre-existing data drift; the all-parks path will never be edge-cached until the registry/collection are reconciled.
2. The production deploy shipped the **entire working tree** (67 changed files across the whole team), not just my 3 wait-times files.

**Constraints honored:** no commit, no push, no Firebase rules deploy, no seeding, no secret exposure, no self-approval. Temp artifact `matrix-run.json` deleted.

---


## 2026-08-13 Cross-Agent Learning — Wait-Times 504 Retrospective (Final)

**Reviewer Independence Is Structural, Not Just Process**
Stef's test gate and Data's implementation created a bottleneck that had to be broken by independent architecture (Mikey under lockout). This pattern works well: implementation team (Data) solves, independent reviewer (Stef) validates contract, architect bridges gaps. The lockout rule (strict: no co-authorship once locked) forces rigor but requires complete, test-proven solutions and clear escalation paths.

**Telemetry Must Be Built In from the Start**
Server-Timing headers + structured logs (timings only, no trace data) gave real-time production visibility that wouldn't exist without explicit instrumentation. Production responses showed exact stage durations and cache behavior (edge coalescing proven via `X-Vercel-Cache: STALE`, `Age`, matching Server-Timing). This informed post-deploy monitoring and prevented blind firefighting.

**Edge Caching Defeats Unbounded Requests**
CDN's `stale-while-revalidate` absorbed multiple concurrent clients into a single origin invocation (proven in production: repeat requests had same response byte-by-byte and Server-Timing). Blanket `no-store` defeated this layer. Outcome-dependent caching (fresh → cacheable, error → no-store) lets the edge help without sacrificing correctness.

**Orphan Data Must Be Tracked Explicitly**
57 Firestore park docs outside the supported registry caused all-parks responses to always include errors, defeating edge caching and proving why registry/collection reconciliation isn't optional. Pre-existing drift, not a regression, but data quality debt accumulates silently. Recommend explicit team task to reconcile.

**Uncommitted Production Requires Audit Strategy**
Shipping a 67-file team working tree without a commit makes "what went to production?" answerable only via diff against prior deployment hash, not via `git log`. Future deployments should have an explicit commit strategy (branch protection, PR requirement, signed commits, or documented diff audit).

---

## Follow-Ups

### 1. Reconcile Firestore Parks Collection & Supported Registry
**Owner:** Data team
**Priority:** Medium (blocking all-parks edge caching)
**Description:** 57 documents in `parks` collection are absent from `SEED_DESTINATION_IDS` registry. Options: delete orphans, add to registry, or reconcile upstream. Until resolved, all-parks responses include errors and use `no-store`.

### 2. Decide Commit Strategy for Deployed Working Trees
**Owner:** Mikey/Team
**Priority:** Medium (audit trail clarity)
**Description:** `dpl_GCtDWVRPMVVgUgYMMBZXa5miVFjc` is tracked only via Vercel deployment hash, not Git. Future multi-team deployments should use either: (a) explicit commit to a deploy branch, (b) signed tag on main, or (c) documented diff audit log.

### 3. Monitor Production Server-Timing Telemetry (24–48h)
**Owner:** On-call (if established)
**Priority:** High (establish baseline)
**Description:** Watch `/api/wait-times` Server-Timing headers for anomalies: cache-read timing jumps (Firestore latency), upstream-read timing jumps (ThemeParks.wiki or third-party latency), blend-timing outliers (forecast aggregation slow), or route-total approaching 20s deadline. Flag any values > p95 from the deployed matrix.
