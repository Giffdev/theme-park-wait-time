# Skill: Vercel Deployment & Git Push

## When to use
When an approved, reviewed commit must be pushed and released to production.

## Deployment contract
D48 is authoritative:

- This repository has no Vercel Git integration.
- A Git push does not deploy.
- Deploy exactly the reviewed commit from a clean detached worktree pinned to its SHA.
- Never deploy from the dirty development checkout.
- A release is complete only after the deployment and production alias are verified and live smoke checks pass.

## Prerequisites
- Git remote `origin`: `https://github.com/Giffdev/theme-park-wait-time.git`
- Release branch: `master` (tracking `origin/master`)
- GitHub CLI authenticated as `Giffdev`
- Vercel scope/project: `giffdevs-projects/theme-park-wait-times`
- Production URL: https://theme-park-wait-times.vercel.app

## Safe deployment flow

### 1. Identify and verify the reviewed commit
```powershell
$sha = git rev-parse HEAD
git show --stat --oneline $sha
git status --short
```

Do not proceed until `$sha` is the reviewed commit. The development checkout may contain unrelated changes; those changes must not enter the deployment.

### 2. Push the reviewed commit
Verify the remote and account, then push the reviewed branch:

```powershell
git remote -v
gh auth status
gh auth switch --user Giffdev  # only if needed
git push origin master
git rev-parse origin/master
```

Confirm `origin/master` resolves to `$sha`. This publishes source control only; it does not deploy.

### 3. Create a clean detached worktree at the exact SHA
Run from the repository root:

```powershell
$repoRoot = (Get-Location).Path
$shortSha = $sha.Substring(0, 12)
$deployWorktree = Join-Path (Split-Path $repoRoot -Parent) "theme-park-wait-times-deploy-$shortSha"
git worktree add --detach $deployWorktree $sha
git -C $deployWorktree status --short
git -C $deployWorktree rev-parse HEAD
```

The status output must be empty and the reported SHA must equal `$sha`.

### 4. Link and deploy from the detached worktree
```powershell
Set-Location $deployWorktree
npx vercel link --yes --scope giffdevs-projects --project theme-park-wait-times
git status --short
$deploymentOutput = npx vercel deploy --prod --yes --scope giffdevs-projects
if ($LASTEXITCODE -ne 0) { throw "Vercel production deployment failed." }
$deploymentUrl = ($deploymentOutput | Select-Object -Last 1).Trim()
if ([string]::IsNullOrWhiteSpace($deploymentUrl)) { throw "Vercel did not return a deployment URL." }

$newDeploymentJson = npx vercel inspect $deploymentUrl --format=json --scope giffdevs-projects
if ($LASTEXITCODE -ne 0) { throw "Could not inspect the new deployment." }
$newDeploymentId = ($newDeploymentJson | ConvertFrom-Json).id
if ([string]::IsNullOrWhiteSpace($newDeploymentId)) { throw "The new deployment has no inspectable deployment ID." }
```

The link metadata is local deployment configuration, not source. Confirm `git status --short` remains empty before deploying. Preserve `$deploymentUrl` and `$newDeploymentId` as release evidence.

### 5. Verify deployment, alias, and production
```powershell
$productionAlias = "https://theme-park-wait-times.vercel.app"
$aliasDeploymentJson = npx vercel inspect $productionAlias --format=json --scope giffdevs-projects
if ($LASTEXITCODE -ne 0) { throw "Could not inspect the production alias." }
$aliasDeploymentId = ($aliasDeploymentJson | ConvertFrom-Json).id
if ([string]::IsNullOrWhiteSpace($aliasDeploymentId)) { throw "The production alias has no inspectable deployment ID." }
if ($aliasDeploymentId -ne $newDeploymentId) {
    throw "Production alias mismatch: expected $newDeploymentId, resolved $aliasDeploymentId."
}

Invoke-WebRequest -Uri "https://theme-park-wait-times.vercel.app" -Method Head
```

Verify:

1. The new deployment inspection reports `Ready` and production-targeted.
2. The production alias inspection resolves to exactly `$newDeploymentId`.
3. The release-specific smoke-test paths and APIs return the expected status and behavior.
4. The live behavior corresponds to the reviewed SHA, not merely to a successful build.

### 6. Clean up the worktree
Return to the repository root before removal:

```powershell
Set-Location $repoRoot
git worktree remove $deployWorktree
git worktree prune
git worktree list
```

If deployment or smoke tests fail, preserve the deployment ID and evidence, return to the repository root, and remove the detached worktree after investigation.

## Troubleshooting

### Git remote is missing
```powershell
git remote add origin https://github.com/Giffdev/theme-park-wait-time.git
```

Re-verify the remote before pushing. Do not use an empty commit as a deployment trigger; no Git webhook is connected.

### Vercel CLI appears stuck after upload
Spinner rendering can make terminal capture appear frozen. Allow the command time to finish, inspect the deployment in another shell with `npx vercel ls --prod --scope giffdevs-projects`, and capture the eventual deployment ID or error. Do not replace the CLI deployment with a Git push.

### Deployment shows old code
1. Compare `$sha`, `origin/master`, and the detached worktree's `HEAD`.
2. Confirm the CLI command ran inside the detached worktree.
3. Confirm the deployment is `Ready`, production-targeted, and assigned the production alias.
4. Inspect the deployment in the Vercel dashboard: https://vercel.com/giffdevs-projects/theme-park-wait-times
5. Repeat release-specific live smoke checks.

### API returns 500 or stale data
1. Check whether upstream wait-time data is current.
2. Check Firestore reads/writes and permissions.
3. Verify dynamic rendering and cache headers on affected API routes.
4. Distinguish Vercel edge, browser, and Next.js server caching before attributing stale data to deployment.

## Key gotchas
- Push and deploy are separate required steps.
- The deployment source must be the clean detached worktree at the reviewed SHA.
- Account and project scope matter: use `Giffdev` and `giffdevs-projects/theme-park-wait-times`.
- Region is `iad1`.
- Production verification must include both deployment/alias state and release-specific live behavior.

## Confidence
**High** — D48 is the canonical team requirement, and the clean exact-commit worktree flow has been used successfully for production.

## Domain
Deployment & DevOps

## Applies To
All agents who ship approved changes to production.
