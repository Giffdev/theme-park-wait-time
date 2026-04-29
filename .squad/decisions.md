# Squad Decisions

## Active Decisions

### 1. Firebase Infrastructure Patterns

**Author:** Data  
**Date:** 2026-04-28  
**Status:** Proposed

#### Context
Setting up the Firebase client-side infrastructure for the project. Needed to make several small design calls.

#### Decisions
1. **Single-instance guard** — `getApps().length > 0 ? getApp() : initializeApp(config)` in `config.ts`. Next.js hot-reload re-evaluates modules; this prevents `FirebaseError: Firebase App already exists`.
2. **Auth context as 'use client' component** — `auth-context.tsx` is a React client component. Server components that need auth should use the Admin SDK (`admin.ts`, to be built later) or pass the user down.
3. **Generic Firestore helpers** — `firestore.ts` exports generic CRUD functions (`getDocument<T>`, `addDocument`, etc.) rather than collection-specific functions. The `services/` layer will compose these for domain logic. Keeps the firebase layer thin and reusable.
4. **Vercel region `iad1`** — US East (Virginia), same AWS region as Firebase's default `us-east1`. Minimizes latency between Vercel edge and Firestore.
5. **Security rules: `allow write: if false` for public collections** — All public data (parks, attractions, wait times, crowd calendar) is write-protected from clients. Only the Admin SDK (Cloud Functions + seeding scripts) can write. This is the strongest default; we relax per-collection as needed.

#### Required Dependencies
- `firebase` (v9+ — modular SDK)
- `react`, `react-dom` (peer deps for auth-context)

---

### 2. App Name "ParkPulse" as Working Title

**Date:** 2026-04-28
**Author:** Mouth (Frontend Dev)
**Status:** Proposed

#### Context
The architecture doc refers to the project as "Theme Park Wait Times" throughout. During scaffold, used **ParkPulse** as the user-facing brand name in the UI (header, footer, metadata, auth pages) because it's shorter, more memorable, and works well as a logo lockup with the 🎢 emoji.

#### Decision
Use "ParkPulse" as the working app name in all UI surfaces. The repo stays `theme-park-wait-times`.

#### Impact
- All page titles use `ParkPulse` via the root layout metadata template
- Header/footer show "ParkPulse" branding
- Easy to change later since it's all in layout.tsx and metadata

#### Notes
Team consensus needed — Devin may want a different name.

---

### 3. Vitest over Jest for test runner

**Author:** Stef (Tester)  
**Date:** 2026-04-28  
**Status:** Proposed

#### Context
Need to choose a test runner for the Next.js 14+ / TypeScript project.

#### Decision
Use **Vitest** (v3.x) instead of Jest.

#### Rationale
1. **Native TypeScript** — no separate ts-jest config or babel transforms needed
2. **ESM-first** — aligns with Next.js App Router's ESM module system
3. **Speed** — Vitest is significantly faster than Jest for TypeScript projects (no transform overhead)
4. **Compatible API** — `describe/it/expect` work identically; migration to/from Jest is trivial
5. **Vite ecosystem** — `@vitejs/plugin-react` gives us JSX support with zero config
6. **Coverage** — `@vitest/coverage-v8` is built-in and works out of the box

#### Alternatives considered
- **Jest** — industry standard but requires extra config for TS + ESM; slower feedback loop
- **Bun test** — too new, limited ecosystem support for Firebase testing libraries

#### Impact
- All `*.test.ts` files use Vitest globals (`describe`, `it`, `expect`, `vi`)
- Two Vitest configs: `vitest.config.ts` (unit, jsdom) and `vitest.integration.config.ts` (integration, node)
- Coverage thresholds enforced at 80% lines/functions, 75% branches

### 4. Client-Side Data Fetching for Parks Pages

**Author:** Mouth (Frontend Dev)  
**Date:** 2026-04-29  
**Status:** Proposed

#### Context
Parks listing and park detail pages need to show live wait times from Firestore. Had to choose between server components (SSR/ISR) vs client components.

#### Decision
Both parks pages are `'use client'` components that fetch directly from Firestore using the client SDK.

#### Rationale
1. Wait times are inherently real-time — stale SSR data defeats the purpose
2. Refresh button requires client-side state (loading, refetching)
3. Sort toggle on park detail needs interactive state
4. Client SDK reads are allowed by Firestore security rules (public collections)
5. ISR revalidation (from Phase 1 plan) can be revisited if we add a server-rendered shell later

#### Tradeoff
- No SEO benefit from server-rendered wait times (acceptable — these are logged-in/app-like pages)
- First paint shows skeleton instead of data (but loads fast due to small payloads)

#### Impact
- `src/app/parks/page.tsx` — client component
- `src/app/parks/[parkId]/page.tsx` — client component
- Pattern for future real-time pages: client component + Firestore client SDK + refresh button

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
