---
updated_at: 2026-05-01T09:47:02.606-07:00
focus_area: Auto-refresh architecture shipped; stale data caching bug fixed
active_issues: []
---

# What We're Focused On

The team just completed the **auto-refresh feature sprint** (2026-05-01). Key work shipped:

## Auto-Refresh Feature ✅ Complete
- **Architecture:** Custom useAutoRefresh hook + useVisibility API wrapper (no SWR/React Query library)
- **Per-page staleness thresholds:** Wait times 2min, schedule 30min, calendar 1hr, trips 5min
- **Wired into 4 pages:** Park detail, parks list, calendar, trips
- **Subtle UI:** Green pulse indicator on refresh when background refresh active
- **Test coverage:** 27 unit tests (8 useVisibility + 19 useAutoRefresh), all passing

## Stale Data Caching Bug ✅ Fixed
- **Root cause:** Triple-layer caching (Vercel edge + browser HTTP + no cache:no-store on client)
- **Fix applied:** `force-dynamic` on API route, `Cache-Control: no-store` headers, `cache: 'no-store'` on client fetches
- **Impact:** Refresh button now always triggers fresh server-side scrape → Firestore write → client read

## Documentation ✅ Updated
- 7 new decisions merged into decisions.md (D27–D33)
- 4 user directives captured (D8–D11)
- 11 inbox files processed and cleared
- Agent history files updated with sprint work
- Archive files created for history files exceeding 15KB threshold

**Next priorities:**
- Monitor auto-refresh UX in staging
- Gather user feedback on staleness thresholds
- Consider extending pattern to other pages if successful
