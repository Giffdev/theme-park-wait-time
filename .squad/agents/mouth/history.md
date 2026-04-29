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

(none yet)
