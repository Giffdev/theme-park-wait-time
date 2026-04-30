# Mouth — History

## Project Context

- **Project:** theme-park-wait-times — A platform for theme park visitors to track ride wait times, log visits, plan trips with crowd calendars, and crowd-source real-time wait data.
- **Stack:** React/Next.js, TypeScript, Firebase, Vercel, Tailwind CSS
- **User:** Devin Sinha
- **Design direction:** Modern, clean, data-focused but exciting. Deep Ocean Blue primary, Warm Coral accents, Inter font family. Mobile-first. Better UX than thrill-data.com.
- **PRD color scheme:** oklch-based triadic palette with WCAG AA+ contrast ratios defined.

*Detailed history of Phase 1–3 UI implementation archived in history-archive.md.*

---

## Scribe Batch Update (2026-04-29T22:06:00Z)

**Orchestration:** ParkFlow Rename + Parks Page Redesign  
**Status:** ✅ Complete. Deployed to production.

### Your Contributions

1. **ParkFlow Brand Rename**
   - Renamed app from "ParkPulse" to "ParkFlow" across all UI surfaces, metadata, constants, tests
   - Brand name now consistent across layout, footer, auth pages, about page, shared trips
   - Updated `APP_NAME` constant and all title templates

2. **Parks Page Redesign**
   - Migrated from dense 5-column grid to spacious 3-column layout (`grid-cols-3`)
   - Container max-width `max-w-6xl` for optimal readability
   - Added "View Park →" CTA to ParkCard (hover animation, improves discoverability)
   - Added coverage summary at page bottom (shows resort groups, parks, theme/water park counts)

3. **Friendly URL Slugs**
   - Migrated URLs from UUIDs (`/parks/75ea578a-adc8...`) to human-readable slugs (`/parks/magic-kingdom`)
   - Park detail page queries by slug, resolves to UUID for data ops
   - Attraction detail pages fully support slug-based routing
   - Updated ActiveTimer interface with optional `parkSlug` field (backward-compatible)

4. **Park Status UX Pattern**
   - Added open/closed status to park listing cards
   - Graceful degradation: `/api/park-hours` is non-blocking; missing data doesn't break cards
   - Closed parks muted with subtle tint (`bg-primary-50/60`), remain visible/clickable
   - Timezone display as abbreviations (ET, CT, PT) for compact cards
   - Detail page open/closed computed client-side from schedule.segments

5. **Parks Page Layout & Location Data**
   - Container widened to `max-w-[1600px]` for ultrawide monitors
   - Progressive responsive grid: 1→2→3→4→5 columns (lg: 3 cols instead of 4)
   - Added geographic location metadata (city/state/country) to park cards
   - Integrated location-based search
   - Mapped location data to `src/lib/parks/park-locations.ts` (curated, separate from registry)

### Decisions Processed

- Friendly URL Slugs for Parks and Attractions
- Park Status UX Pattern  
- ParkFlow Rename + Parks Page Redesign
- Parks Page Layout & Location Data

### Tests & Deployment

✅ All tests passing  
✅ No breaking changes  
✅ Data contracts unchanged  
✅ Deployed to production with Data team  

### Key Handoff Notes

- **Location gaps:** New park destinations need entry in `park-locations.ts`
- **SEO:** External refs should use "ParkFlow" branding
- **Dependencies:** Requires Data's `/api/park-hours` endpoint

---

## Learnings & Key Context

- **Server vs Client components:** Extract auth-dependent sections into client components using `useAuth()` hook; keep page layout as server component
- **Slug-based routing:** Firestore queries use slug field for UX-friendly URLs; resolve to UUID for data operations
- **Graceful degradation:** Non-blocking API calls (schedule, hours) should not prevent primary content display
- **Progressive responsive grid:** Use Tailwind breakpoints strategically; lg:grid-cols-3 works better at 1280px than lg:grid-cols-4
- **Location metadata:** Keep curated location data separate from upstream API registry structure
- **Favorite park families (2026-04-29):** Added localStorage-based favorites (`parkflow-favorite-families` key) that pin families to top of Parks page. Stores `familyId` values (not names) for stability. Star icon toggle (lucide `Star`, amber fill when active). Sorted: favorites alphabetical first, then non-favorites alphabetical. No page jump — uses CSS transition on icon color. Name↔ID mapping built from `DESTINATION_FAMILIES` registry at module level.
- **Homepage auth redirect (2026-04-29):** Converted `src/app/page.tsx` to client component with `useAuth()` + `useRouter()`. Authenticated users get `router.replace('/parks')` — returns `null` during loading/redirect to avoid flash. FeatureCards merged "Log Your Trip" + "My Ride History" into single card (uses "My Ride History" description), grid now `lg:grid-cols-3`.
- **Location display deduplication (2026-04-29):** Removed per-card location from parks listing (redundant within family groups — kept on family header only). Added location + family membership to park detail page header using `MapPin` icon + "Part of [destination] · [family]" pattern. Uses `getLocationByDestinationId`/`formatLocation` and `DESTINATION_FAMILIES.find()` for lookup.

