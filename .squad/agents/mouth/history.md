# Mouth — History

## Project Context

- **Project:** theme-park-wait-times — A platform for theme park visitors to track ride wait times, log visits, plan trips with crowd calendars, and crowd-source real-time wait data.
- **Stack:** React/Next.js, TypeScript, Firebase, Vercel, Tailwind CSS
- **User:** Devin Sinha
- **Design direction:** Modern, clean, data-focused but exciting. Deep Ocean Blue primary, Warm Coral accents, Inter font family. Mobile-first. Better UX than thrill-data.com.
- **PRD color scheme:** oklch-based triadic palette with WCAG AA+ contrast ratios defined.

## Architecture Decisions (via Scribe — 2026-04-28)

### Component & Routing Scope

**Next.js App Router (not Pages Router)**
- Server components for data fetching, layout optimization
- File-based routing: `app/parks/[parkId]/page.tsx`, `app/user/trips/page.tsx`
- ISR strategy: Park pages revalidate every 1 hour, crowd calendar every 6 hours

**What Ports from Prototype**
- UI components: shadcn/Radix primitives (Button, Card, Tabs, Modal, Drawer)
- Type definitions: Extended Park, Attraction, Ride types (added Firestore IDs)
- Styling: Tailwind config, oklch triadic palette, CSS variables
- UX patterns: Mobile nav (bottom drawer), park selector (modal), ride timer (countdown), multi-day trip builder

**What Gets Rewritten**
- Routing: React Router DOM → Next.js file-based
- State management: context → Server Components + cache strategy
- Data fetching: Promise-based client-side → RSC + Firestore Client SDK

### Public vs Private Data Boundary

- **Public (no auth required):** Parks list, attractions, live wait times, crowd calendar predictions, crowd report aggregates
- **Private (auth required):** User profiles, trip plans, ride logs, user-submitted reports
- **Pattern:** Maximize audience for read path, protect user data on write path

### Five-Phase Build Plan

- **Phase 1 (Mouth focus):** Scaffold + component library + static park data layout
- **Phase 2:** Live wait times widgets (requires Chunk's API integration)
- **Phase 3:** User ride logging UI (requires Data's auth + schema)
- **Phase 4:** Crowd calendar views (requires Chunk's data aggregation)
- **Phase 5:** Crowd-source submission flows (requires Stef's validation)

## Learnings

- `create-next-app` refuses non-empty directories. When other agents have already scaffolded files (firebase config, test utils, etc.), manually create package.json/tsconfig/next.config instead.
- Tailwind v4 uses `@theme` blocks in CSS for design tokens instead of `tailwind.config.ts`. oklch color system works great for the palette.
- Existing test-utils with `@firebase/rules-unit-testing` have a peer dep conflict with firebase@11. Exclude them from the Next.js build via tsconfig `exclude` and eslintrc `ignorePatterns`.
- Always use `<Link>` from `next/link` for internal navigation — Next.js ESLint config enforces this strictly.
- Mobile bottom nav needs `pb-[env(safe-area-inset-bottom)]` for iPhone notch/home indicator safe areas and pages need `pb-24 md:pb-0` to avoid content being hidden behind it.

## Phase 1 Completion (2026-04-29)

- **Scaffold:** 14 routes (home, parks, attractions, wait-times, crowd-calendar, user-account, about, pricing, faq, auth pages, settings, etc.)
- **Design:** oklch-based triadic color system integrated. Responsive layout (mobile-first) with safe-area padding.
- **TypeScript:** All routes and layouts type-safe with extracted Park, Attraction, CrowdLevel types.
- **Build:** Next.js build passes. ESLint clean. Ready for feature integration.
- **Brand:** "ParkPulse" working UI name (decision filed for consensus).
- **Deliverables:** All files in `src/app/`, `src/components/`, `src/lib/ui/` organized by feature.
- **Next:** Awaiting Data's Firestore integration and real-time data feeds.
