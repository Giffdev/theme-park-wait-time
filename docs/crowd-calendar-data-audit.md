# Crowd Calendar Data Audit — False "Closed" Status

> **Owner:** Chunk (Data Engineer)
> **Date:** 2026-08-12
> **Trigger:** User observation — "Crowd calendar shows Worlds of Fun as closed in August when it is open."
> **Status:** Audit complete. Documentation only — Data owns the code fix.

---

## 1. Scope & Method

Audited every park reachable through the two family registries that feed the crowd calendar:

- `src/lib/constants.ts` → `PARK_FAMILIES` (park-level `id` = **slug**)
- `src/lib/crowd-calendar/park-families.ts` → `PARK_FAMILY_REGISTRY` (park-level `parkId` = **UUID**)
- Both derive from the single canonical source `src/lib/parks/park-registry.ts` (`DESTINATION_FAMILIES`, 9 families, 143 park entity IDs).

Consumers audited: `src/app/api/crowd-calendar/route.ts` (both the real-data path `computeFamilyCrowdDays` and the fallback path `generatePlaceholderData`), `src/lib/parks/park-schedule-check.ts` (`getParkOperatingStatus` / `batchGetParkOperatingStatus`), `src/types/crowd-calendar.ts`, and the UI status rendering in `src/components/crowd-calendar/CalendarDayCell.tsx` / `MiniMonth.tsx`.

Checks performed:
- **Static code read** of both family registries, the route, and the schedule-check module.
- **Live, read-only, unauthenticated calls** to the public ThemeParks Wiki API (`api.themeparks.wiki/v1`) to verify entity-ID validity and actual August 2026 schedules — no secrets or credentialed production access used.
- **UUID shape scan** of `park-registry.ts` (143 IDs) for length/format anomalies.
- **Test inventory** of `tests/api/crowd-calendar-quality.test.ts` to check whether the failure mode is covered.

No Firestore production documents were read directly (would require the service-account credential, which is out of scope for a secretless audit). Firestore-dependent claims below are inferred from code paths and are labeled as such.

---

## 2. Invariants the system is supposed to hold

1. Every park entity ID used to call ThemeParks Wiki must be a valid entity **UUID** — the API does not accept slugs.
2. A schedule lookup has exactly three outcomes: **open**, **legitimately closed** (API succeeded, no operating segment for the date), or **unknown** (API/network failure, bad ID, cache miss). Only the first two may be shown to users as `OPEN` / `CLOSED`; the third must render as `NO_DATA`.
3. `hasData: false` must never be interpreted as `isOpen: false` downstream.
4. Firestore cache keys (`parkSchedules/{parkId}/daily/{date}`) must use the same identifier space (UUID) as the live API calls that populate them.

---

## 3. Confirmed defects

### Defect A — Fallback registry uses slugs instead of UUIDs (design-review root cause, confirmed)

`src/lib/constants.ts` builds `PARK_FAMILIES` with `parks: dest.parks.map((p) => ({ id: p.slug, name: p.name }))`. The sibling registry `src/lib/crowd-calendar/park-families.ts` builds `PARK_FAMILY_REGISTRY` from the same source but correctly uses `p.id` (UUID). `route.ts`'s `generatePlaceholderData()` (the schedule-aware fallback path) reads from `PARK_FAMILIES`, so it calls `batchGetParkOperatingStatus` with slugs.

**Evidence (live, read-only):**
```
GET https://api.themeparks.wiki/v1/entity/worlds-of-fun/schedule            → 404 Not Found
GET https://api.themeparks.wiki/v1/entity/bb731eae-...-89d79b031743/schedule → 200 OK (Worlds of Fun, OPERATING 2026-08-12)
```
Every fallback-path lookup 404s → `hasData: false` for every date, for every park, every time the fallback path is used.

### Defect B — `hasData` is ignored and collapsed into `CLOSED` (design-review root cause, confirmed, and found in **both** code paths)

In `route.ts`:
- `generatePlaceholderData()`: `if (!parkSchedule.isOpen) return { status: 'CLOSED' }` — checked before/without checking `hasData`.
- `computeFamilyCrowdDays()` (the **real-data** path, not just the fallback): same pattern — `if (parkStatus) { if (!parkStatus.isOpen) return { status: 'CLOSED' } }`.

Both call sites treat "the schedule check failed" (`hasData:false`, `isOpen:false` by construction in `park-schedule-check.ts`) identically to "the API confirmed the park is closed today" (`hasData:true`, `isOpen:false`). This means **any** schedule-lookup failure — bad ID, transient network error, rate limiting, ThemeParks Wiki outage — renders `CLOSED` instead of `NO_DATA`, regardless of which code path (real or fallback) triggered it.

### Defect C — 11 malformed entity UUIDs in the canonical registry (newly found, not in the original design review)

Scanning all 143 `id` fields in `src/lib/parks/park-registry.ts` for non-standard length found 11 IDs that are 37 characters (one extra hex digit inserted mid-string) instead of the correct 36. Each was confirmed live against the public schedule API — the malformed ID 404s; I traced 6 of them to the correct ID via `GET /v1/destinations` for independent confirmation:

| Park | Family | Registry ID (malformed) | Correct ID (from live API) | Live check |
|---|---|---|---|---|
| Universal Studios Florida | Universal Orlando | `eb3f4560-2383-4a36-9152-6b3e5ed66bc57` | *(not resolved — Orlando destination not reached in paged fetch)* | 404 confirmed |
| Epic Universe | Universal Orlando | `12dbb85b-265f-44e6-bccf-f1faa172111fc` | *(not resolved)* | 404 confirmed |
| Volcano Bay | Universal Orlando | `fe78a026-b91b-470c-b906-9d2266b6922da` | *(not resolved)* | 404 confirmed |
| Universal Studios Beijing | Universal Beijing | `68e1d8f0-ed42-4351-af25-160421e337ce0` | *(not resolved)* | 404 confirmed |
| Universal Studios Singapore | Universal Singapore | `f95d7f76-2024-4510-b799-26ee122d0e448` | `f95d7f76-2024-4510-b799-26e122d0e448` | 404 (malformed) |
| Six Flags Magic Mountain | Six Flags Magic Mountain | `c6073ab0-83aa-4e25-8d60-12c8f256884bc` | `c6073ab0-83aa-4e25-8d60-12c8f25684bc` | 404 (malformed) |
| Six Flags Great America | Six Flags Great America | `15805a4d-4023-4702-b9f2-3d3cab2e0c11e` | `15805a4d-4023-4702-b9f2-3d3cab2e0c1e` | 404 (malformed) |
| Six Flags Discovery Kingdom | Six Flags Discovery Kingdom | `3237a0c2-8e35-4a1c-9356-a3119d5988e7c` | *(not resolved)* | 404 confirmed |
| Six Flags Frontier City | Six Flags Frontier City | `589627eb-fe16-4373-a2db-08d73805fb11f` | `589627eb-fe16-4373-a2db-08d73805fb1f` | 404 (malformed) |
| SeaWorld Orlando | SeaWorld Orlando | `27d64dee-d85e-48dc-ad6d-80774455cd946` | `27d64dee-d85e-48dc-ad6d-8077445cd946` | 404 (malformed), 200 (correct) |
| Aquatica Orlando | SeaWorld Orlando | `9e2867f8-68eb-454f-b367-0ed0fd772d72a` | `9e2867f8-68eb-454f-b367-0ed0fd72d72a` | 404 (malformed) |

**Impact:** these are permanent, deterministic 404s — not transient. Because of Defect B, every one of these parks shows `CLOSED` (not `NO_DATA`) on **every** day, on the **real-data path**, independent of the slug/fallback bug. Universal Studios Florida is one of the platform's original 6 launch parks (per Chunk history, 2026-04-28 architecture decision), so this has likely been silently wrong since launch.

Also confirmed: the same malformed Universal Studios Florida ID 404s against `/entity/{id}/live`, so this park's real-time wait-time polling (`src/app/api/wait-times/route.ts`, which resolves park IDs via `getParkById`/`getParkBySlug` from the same registry) is presumably affected too — flagged for Data/Chunk follow-up, not re-verified end-to-end here since wait-times ownership is Data's, not this audit's primary target.

### Defect D — Oceans of Fun's registry ID is not malformed, it's the wrong (stale) entity entirely (newly found)

`951987f7-3387-4221-8368-2859469aebcd` (36 chars, well-formed) 404s. Querying the live Worlds of Fun destination tree (`GET /v1/entity/c4231018-.../children`) shows Oceans of Fun's actual current entity ID is **`b5a89552-3381-47ad-88cc-ab0087019c8b`**. The ID in our registry does not match any live entity — it appears to reference a decommissioned/renumbered park record, not a typo. Confirmed the correct ID returns a valid August schedule (see matrix below).

### Defect E — Test coverage gap (found while auditing, informational only — Stef/Data own tests)

`tests/api/crowd-calendar-quality.test.ts` mocks `batchGetParkOperatingStatus` to resolve an **empty `Map()`** for the "estimated" fallback case, which only exercises the "no schedule map entry at all" branch (`status: 'NO_DATA'`). It does not simulate the actual failure shape produced by `park-schedule-check.ts` on a real API/ID failure — a populated map with `{ isOpen: false, hasData: false }` per date — which is the shape that triggers Defect B's false `CLOSED`. The regression this incident represents would not be caught by the current suite.

---

## 4. Validation matrix (live API, read-only, 2026-08-12 run)

All times/dates below are the park's **local** date as returned by the API's `date` field (already timezone-normalized; not derived by us from `openingTime`/`closingTime` offsets).

| Park (family) | Entity ID used | Case type | Date(s) checked | Result | Assessment |
|---|---|---|---|---|---|
| Worlds of Fun (Worlds of Fun) | `bb731eae-...031743` (valid) | August open day | 2026-08-12 → 2026-08-30 | `OPERATING` every day | Correctly open; **this is the exact case the user reported as wrongly CLOSED** — driven by Defects A+B, not by this park's own ID |
| Worlds of Fun (Worlds of Fun) | same | Month boundary / legitimate gap | 2026-08-31 – 2026-09-04 | No schedule entries at all (API succeeds, no OPERATING segment) | **Legitimate seasonal closure** (weekday shutdown after Labor Day) — code correctly returns `hasData:true, isOpen:false` here since the API call itself succeeds; correctly renders CLOSED |
| Oceans of Fun (Worlds of Fun) | `951987f7-...aebcd` (registry, wrong/stale) | Any date | 2026-08-12 | 404 | **Confirmed defect (D)** — false CLOSED regardless of date |
| Oceans of Fun (Worlds of Fun) | `b5a89552-...019c8b` (correct, live) | August, reduced schedule | 2026-08-12 (Wed) OPERATING; 2026-08-13–14 no entry; 2026-08-15–16 OPERATING; 2026-08-29–30 OPERATING | Weekday closures, weekend operation | **Legitimate reduced/seasonal schedule** (water park operates Fri–Sun in late August) — correctly distinguishable from Defect D once the ID is fixed |
| Magic Kingdom (Walt Disney World) | `75ea578a-...765ef9` (valid) | August open day + month boundary | 2026-08-12, 2026-08-31, 2026-09-01 | `TICKETED_EVENT` + `OPERATING` segments present, correctly spans the month boundary | **Control — works correctly** (Disney, one required matrix park) |
| Islands of Adventure (Universal Orlando) | `267615cc-...ca591f` (valid) | August open day + month boundary | 2026-08-12, 2026-08-31, 2026-09-01 | `EXTRA_HOURS` + `OPERATING`, correct | **Control — works correctly** |
| Universal Studios Florida (Universal Orlando) | `eb3f4560-...66bc57` (malformed) | Any date | 2026-08-12 | 404 | **Confirmed defect (C)** — false CLOSED on the real-data path, not just fallback; this is a required matrix park (Universal) and an original launch park |
| SeaWorld San Diego (SeaWorld San Diego) | `75122979-...a227c` (valid) | August open day + timezone-sensitive (Pacific evening event) | 2026-08-12, 2026-09-11 (`TICKETED_EVENT` closes at `00:00` local, crossing midnight) | Correct `date` field attribution, no rollover bug observed | **Control — works correctly**, and demonstrates the API's `date` field (not our own UTC parsing) is what our code keys off, so this specific park/date class is not exposed to a timezone-normalization bug |
| SeaWorld Orlando + Aquatica Orlando (SeaWorld Orlando) | malformed (both) | Any date | 2026-08-12 | 404 both | **Confirmed defect (C)** — the "another regional/SeaWorld park" matrix slot is also affected |

**Net read:** of the representative set required by the audit (Worlds of Fun, Oceans of Fun, one Disney, one Universal, one other SeaWorld/regional), **4 of 5 families have at least one park with a confirmed false-CLOSED exposure** (Worlds of Fun via A+B, Oceans of Fun via D+B, Universal Orlando via C+B, SeaWorld Orlando via C+B). Only Walt Disney World's Magic Kingdom is clean end-to-end in this sample. Legitimate closures (Worlds of Fun's Sept weekday shutdown, Oceans of Fun's Aug weekday reduced schedule) were also confirmed and are correctly distinguishable from the bug once `hasData` is respected — they already return `hasData:true` today.

---

## 5. Firestore cache key shape (code-level review only — no production reads)

`parkSchedules/{parkId}/daily/{date}` is written only on a **successful** upstream fetch (`res.ok`). Consequences:
- For the 12 broken park IDs (Defects C+D), the cache is **never populated** — every request re-attempts the live fetch, fails again, and repeats indefinitely. No self-healing, no error surfaced, just a silent permanent `CLOSED`.
- For slug-keyed fallback lookups (Defect A), the same applies — cache never populates under the wrong key, so there's no risk of slug-keyed docs polluting the UUID-keyed cache, but every fallback invocation re-pays the failed network round-trip.
- Family-level cache (`crowdCalendar/{familyId}/monthly/{month}`) is unaffected — `familyId` is computed identically (`slug` minus `-dest` suffix) in both registries, so family-level keys already agree.

---

## 6. Secondary finding: live-forecast "today" selection uses UTC date, not park-local date

`computeFamilyCrowdDays()` computes `todayStr = new Date().toISOString().slice(0, 10)` (UTC) and filters live forecast entries with `e.time.startsWith(todayStr)`, where `e.time` carries the park's local offset. For parks whose local date has already rolled over relative to UTC (or not yet rolled over), this can cause the "prefer live data for today" branch to silently match zero forecast entries for part of the local day, falling back to historical day-of-week aggregates instead of live data. This does **not** produce a false-CLOSED status (that's governed only by `hasData`/`isOpen`), but it is a real timezone/date-normalization gap the audit was asked to check. Distinct from Defects A–D; not required to fix this incident, flagged for a future pass.

---

## 7. Recommended monitoring / quality gates (Data to implement; documentation-only recommendation from this audit)

1. **UUID format assertion at load time.** Validate every `id` in `park-registry.ts` matches `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` (a unit test or build-time script), so malformed/duplicated-character IDs like Defect C fail CI instead of failing silently in production.
2. **Registry parity check.** Assert `PARK_FAMILIES` (constants.ts) and `PARK_FAMILY_REGISTRY` (crowd-calendar/park-families.ts) resolve to the same park IDs for every family — would have caught Defect A immediately.
3. **Never collapse `hasData:false` into `CLOSED`.** Both call sites in `route.ts` should check `hasData` before `isOpen` and route unknown outcomes to `NO_DATA`, matching the type system's existing three-state `ParkDayStatus`.
4. **Test the real failure shape.** Update the fallback quality test to mock `batchGetParkOperatingStatus` returning `{ isOpen: false, hasData: false }` entries (not an empty `Map`), so the exact regression behind this incident is under regression coverage (Defect E).
5. **Periodic live entity-ID health check.** A scheduled (even weekly) read-only ping of `/entity/{id}/schedule` for every registry ID, alerting on non-200s, would have caught Defects C/D long before a user noticed.
6. **Fix Oceans of Fun's ID** to `b5a89552-3381-47ad-88cc-ab0087019c8b` and the 11 malformed IDs listed in §3 (6 corrected values verified live; the remaining 5 need a fresh `/v1/destinations` lookup for their families — Universal Orlando, Universal Beijing, Six Flags Discovery Kingdom — before correcting).

---

## 8. Summary for report-out

- **Files changed by this audit:** none (documentation only). This file is new: `docs/crowd-calendar-data-audit.md`.
- **Evidence sources:** live reads of `https://api.themeparks.wiki/v1/entity/{id}/schedule`, `/v1/entity/{id}/live`, `/v1/entity/{id}/children`, and `/v1/destinations` (all public, unauthenticated, read-only); static reads of `src/lib/constants.ts`, `src/lib/crowd-calendar/park-families.ts`, `src/lib/parks/park-registry.ts`, `src/app/api/crowd-calendar/route.ts`, `src/lib/parks/park-schedule-check.ts`, `src/types/crowd-calendar.ts`, `src/components/crowd-calendar/CalendarDayCell.tsx`, `tests/api/crowd-calendar-quality.test.ts`.
- **Affected scope:** 5 of 9 park families in the registry carry at least one park exposed to false `CLOSED` (Worlds of Fun, SeaWorld Orlando, Universal Orlando, Universal Beijing, Universal Singapore, Six Flags Magic Mountain, Six Flags Great America, Six Flags Discovery Kingdom, Six Flags Frontier City — 9 families, 12 individual parks), plus every family whenever it falls onto the slug-based fallback path (Defect A, applies platform-wide, worst for sparse-coverage parks like Worlds of Fun/Oceans of Fun as the design review predicted).
- **Confirmed defects beyond the original design review:** Defect C (11 malformed UUIDs) and Defect D (Oceans of Fun's wrong/stale UUID) — both are independent of the fallback/slug bug and affect the real-data path too. Defect E (test gap) is informational.
- **Follow-up beyond Data's current planned fix:** correcting the 11 malformed IDs + Oceans of Fun's ID (§3, §7.6); adding the CI-time UUID/parity assertions (§7.1–2); updating the fallback test to the real failure shape (§7.4); the UTC-vs-local "today" forecast selection gap (§6) as a separate, lower-severity ticket.
