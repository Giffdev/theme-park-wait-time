# Skill: Vercel Deployment & Git Push

## When to use
When shipping code changes to production. Vercel auto-deploys on push to `master` — no manual CLI commands needed.

## Prerequisites
- Git remote `origin` configured to `https://github.com/Giffdev/theme-park-wait-time.git`
- Branch: `master` (tracking `origin/master`)
- GitHub CLI authenticated as `Giffdev` account
- Vercel project: `giffdevs-projects/theme-park-wait-times` (region: `iad1`)

## Deployment Flow

### Step 1: Verify Git Remote
```bash
git remote -v
# Output should show:
# origin  https://github.com/Giffdev/theme-park-wait-time.git (fetch)
# origin  https://github.com/Giffdev/theme-park-wait-time.git (push)
```

If remote is missing:
```bash
git remote add origin https://github.com/Giffdev/theme-park-wait-time.git
```

### Step 2: Switch GitHub Account (if needed)
By default, `gh` uses `devsin_microsoft`. For this repo, use `Giffdev`:
```bash
gh auth switch --user Giffdev
```

To verify active account:
```bash
gh auth status
```

### Step 3: Make and Commit Changes
```bash
# Make code changes
git add .
git commit -m "Your descriptive commit message"
```

### Step 4: Push to Git
```bash
# Push to master (upstream already set after clone/initial push)
git push origin master
# Or just:
git push
```

Vercel automatically detects the push and starts building + deploying.

### Step 5: Verify Deployment
```bash
# Show recent deploys with status
npx vercel ls
```

**Live URL:** https://theme-park-wait-times.vercel.app

## Troubleshooting

### Git remote is missing
**Symptom:** `git remote -v` shows empty output

**Fix:**
```bash
git remote add origin https://github.com/Giffdev/theme-park-wait-time.git
git push origin master
```

### `npx vercel --prod` hangs
**Symptom:** CLI deploy takes too long or freezes

**Fix:** Don't use `npx vercel --prod`. Use `git push` instead — Vercel auto-deploys. The CLI can be slow and is unnecessary.

### Deploy shows old code
**Symptom:** Live site hasn't updated despite pushing

**Check:**
1. Verify commits are in git history: `git log --oneline` (should show your commit)
2. Check Vercel dashboard for build status: https://vercel.com/giffdevs-projects/theme-park-wait-times
3. Ensure you pushed to `master` branch: `git branch -vv`

### API returns 500 or stale data
**Symptom:** `fetchedAt` timestamp in API response is old, or `/api/wait-times` errors

**Debug:**
1. Check if the web scraper is running correctly (verify parks data is current)
2. Check Firestore writes — may have permission issues or data validation errors
3. Verify `force-dynamic` is set on the API route to bypass caching layers
4. Check browser cache with `Cache-Control: no-store` header

## Key Gotchas

- **No manual CLI deploy needed** — `npx vercel --prod` is slow and unnecessary. Just push to git.
- **Account context matters** — pushing requires `Giffdev` account auth, not `devsin_microsoft`
- **Triple-layer caching** — Vercel edge cache + browser HTTP cache + Next.js server cache. Ensure `force-dynamic` and cache headers are set on API routes.
- **Region is `iad1`** — US East (Virginia). Minimizes latency to Firebase in `us-east1`.

## Confidence
**Medium** — Confirmed in one session (2026-05-01), process validated end-to-end. Tested successful push → auto-deploy → live verification.

## Domain
Deployment & DevOps

## Applies To
All agents who need to ship changes to production.
