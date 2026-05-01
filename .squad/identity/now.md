---
updated_at: 2026-05-01T11:12:02.959-07:00
focus_area: API 500 bug fixed (slug→UUID), deploy pipeline restored (git remote + Vercel auto-deploy), deployment process documented as team skill
active_issues: []
---

# What We're Focused On

The team just completed critical bug fixes and deployment recovery (2026-05-01). Key work shipped:

## API 500 Bug ✅ Fixed
- **Root cause:** Wait times slug query using `slug` instead of park UUID from Firestore
- **Fix applied:** Updated API route to parse slug from URL, fetch park UUID, then query wait times correctly
- **Impact:** `/api/wait-times?slug=...` now returns data instead of 500 error

## Deploy Pipeline Restored ✅ Complete
- **Incident:** Git remote was missing after environment setup, blocking all deploys
- **Resolution:** Re-added remote: `git remote add origin https://github.com/Giffdev/theme-park-wait-time.git`
- **Process validated:** `git push origin master` → Vercel auto-detects → builds + deploys to https://theme-park-wait-times.vercel.app
- **Key insight:** No manual `npx vercel --prod` needed; auto-deploy on push is reliable

## Deployment Skill Documented ✅ Complete
- **Created:** `.squad/skills/vercel-deploy/SKILL.md`
- **Covers:** Full push & deploy flow, git remote setup, GitHub account switching (Giffdev), Vercel verification, troubleshooting
- **Confidence:** Medium (validated end-to-end in one session)
- **User directive:** D12 merged into decisions.md to capture team's request

## Prior Work (2026-05-01 Auto-Refresh Sprint)
- **Architecture:** Custom useAutoRefresh hook + useVisibility API wrapper
- **Per-page staleness thresholds:** Wait times 2min, schedule 30min, calendar 1hr, trips 5min
- **Test coverage:** 27 unit tests, all passing
- **Documentation:** 7 decisions + 4 directives merged into decisions.md

**Next priorities:**
- Monitor deployment stability post-recovery
- Gather user feedback on auto-refresh UX in staging
- Continue extending auto-refresh pattern to other pages if successful
