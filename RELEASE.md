# PDF Health Check — Release Cheat Sheet

> **Audience:** Developer building and shipping updates.
> Never commit actual env secrets — keep those in shell env or a local `.env.build` (gitignored).

---

## Prerequisites

### Always required
| What | Where to get it |
|------|----------------|
| `GH_TOKEN` | GitHub → Settings → Developer Settings → Personal Access Tokens (classic). Needs **repo** + **write:packages** scopes. |
| Node 20 + npm | `node -v` — must be 20.x |
| electron-builder | Already in devDependencies — `npm install` if missing |

### Mac only
| What | Where to get it |
|------|----------------|
| `APPLE_ID` | Your Apple ID email (e.g. `paul@example.com`) |
| `APPLE_APP_PASSWORD` | [appleid.apple.com](https://appleid.apple.com) → App-Specific Passwords |
| `APPLE_TEAM_ID` | `F5HD4RNX7P` (hardcoded in notarize.js — keep this handy) |
| Xcode Command Line Tools | `xcode-select --install` |

### Windows only
| What | Where |
|------|-------|
| Windows build machine or VM | Cross-compile from Mac **not supported** for NSIS installer |
| Code-signing cert (optional) | `CSC_LINK` (path to `.p12`) + `CSC_KEY_PASSWORD`. Without it the installer works but Windows SmartScreen will warn users on first run. |

---

## Step-by-step release process

### 1 — Set your environment variables

Secrets are stored in `.env.build` (gitignored — never commit this file).
The `npm run release` scripts load it automatically via `dotenv-cli`.

**`.env.build` format** (`KEY=VALUE`, no `export` prefix):
```
GH_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxx
APPLE_ID=paul@example.com
APPLE_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
```

> `APPLE_APP_PASSWORD` must be an **app-specific** password from appleid.apple.com —
> not your Apple ID login password. Variable must be named exactly `APPLE_APP_PASSWORD`
> (not `APPLE_APP_SPECIFIC_PASSWORD`) to match what `notarize.js` reads.

**Windows** — add to `.env.build` on the Windows build machine:
```
GH_TOKEN=github_pat_xxxxxxxxxxxxxxxxxxxx
CSC_LINK=C:\path\to\cert.p12
CSC_KEY_PASSWORD=your-cert-password
```

### 2 — Bump the version

Edit `package.json` — change `"version"` following semver:
- **Patch** (bug fixes): `1.2.1` → `1.2.2`
- **Minor** (new features): `1.2.1` → `1.3.0`
- **Major** (breaking changes): `1.2.1` → `2.0.0`

```bash
# Or use npm (Mac/Windows):
npm version patch   # or minor / major
```

### 3 — Commit, tag, and push

```bash
git add package.json
git commit -m "Release v1.3.0 — New Report builder"
git tag v1.3.0
git push origin main
git push origin v1.3.0
```

> ⚠️ **Don't push the tag before the commit** — electron-updater reads the
> GitHub release assets, which are created from the tag. If the tag points to
> the wrong commit the update manifest will be wrong.

### 4 — Build & publish

**Mac:**
```bash
npm run release
# Builds DMG + ZIP for arm64 and x64, notarizes, uploads to GitHub Releases
```

**Windows** (run on a Windows machine):
```powershell
npm run release:win
# Builds NSIS installer, uploads to GitHub Releases
```

**Both platforms at once** (if you have a CI system):
```bash
npm run build:all   # builds both — does NOT publish (use for local testing)
```

### 5 — Verify the release on GitHub

1. Go to `https://github.com/paulvandelft992/pdf-health-check/releases`
2. Confirm the new release is listed and marked **Latest** (not Draft/Pre-release)
3. Check the assets include:
   - `PDF-Health-Check-arm64.dmg` (Mac Apple Silicon)
   - `PDF-Health-Check-x64.dmg` (Mac Intel)
   - `PDF-Health-Check-arm64-mac.zip` + `PDF-Health-Check-x64-mac.zip` (required by auto-updater)
   - `latest-mac.yml` (auto-updater manifest — **must be present**)
   - `PDF-Health-Check-Setup.exe` + `latest.yml` (Windows)

### 5b — Stable download links (for SharePoint / intranet pages)

Artifact names are versioned stripped, so these URLs **never change** between releases.
GitHub automatically redirects `/releases/latest/download/` to the current latest release.

| Platform | Link to paste in SharePoint |
|----------|----------------------------|
| Mac — Apple Silicon (M1/M2/M3) | `https://github.com/paulvandelft992/pdf-health-check/releases/latest/download/PDF-Health-Check-arm64.dmg` |
| Mac — Intel | `https://github.com/paulvandelft992/pdf-health-check/releases/latest/download/PDF-Health-Check-x64.dmg` |
| Windows | `https://github.com/paulvandelft992/pdf-health-check/releases/latest/download/PDF-Health-Check-Setup.exe` |
| Release notes page | `https://github.com/paulvandelft992/pdf-health-check/releases/latest` |

> These links resolve instantly — no login or GitHub account required as long as the
> repository is public. If you ever need to make the repo private, you'll need to host
> the assets elsewhere (e.g. an Azure Blob storage URL from SharePoint).

### 6 — How users receive the update

Users do **not** need to re-download the app. The auto-updater handles it:

| Event | What happens |
|-------|-------------|
| App launch | Checks GitHub releases immediately |
| Every 4 hours | Background check while app is running |
| Update found | In-app banner: "Version x.x.x is available" |
| Download complete | Prompt to install now or on next quit |
| Install | `autoUpdater.quitAndInstall()` — app restarts with new version |

> Update checks only run in **packaged** builds (`app.isPackaged === true`).
> Running `npm start` / `electron .` in dev mode intentionally skips them.

---

## Common errors and fixes

### `GH_TOKEN` not set / 401 from GitHub
```
Error: GitHub Personal Access Token is not set, neither programmatically, nor using env 'GH_TOKEN'
```
**Root causes (in order of likelihood):**

1. **`.env.build` uses shell `export` syntax** — `dotenv-cli` expects plain `KEY=VALUE`.
   Remove the `export ` prefix from every line in `.env.build`.

2. **Running the script without the `dotenv` prefix** — `electron-builder` does not read
   `.env.build` on its own. The `npm run release` script already includes
   `dotenv -e .env.build --` but running `electron-builder` directly won't pick it up.

3. **`GH_TOKEN` expired or revoked** — Generate a new token at
   GitHub → Settings → Developer settings → Personal access tokens (classic).
   Required scopes: `repo` + `write:packages`.

4. **Wrong variable name** — Must be `GH_TOKEN` (not `GITHUB_TOKEN` or similar).

---

### Notarization fails — Apple ID / password wrong
```
Error: HTTP status code: 401. Unable to authenticate.
```
**Fix:**
1. Confirm `APPLE_ID` is your Apple Developer account email (not a team alias)
2. Confirm `APPLE_APP_PASSWORD` is an **app-specific** password from appleid.apple.com,
   not your Apple ID login password
3. The app-specific password is revoked if you change your Apple ID password — generate a new one

---

### Notarization fails — wrong team ID
```
Error: Team with ID "XXXXXXXXXX" not found
```
**Fix:** Confirm `APPLE_TEAM_ID=F5HD4RNX7P` matches what's in `notarize.js`.
Check at [developer.apple.com](https://developer.apple.com) → Membership.

---

### Notarization times out
```
Error: Polling timed out after 120000ms
```
**Fix:** Apple's notarization service can be slow. Re-run `npm run release` — it will
re-attempt. If it keeps failing, check Apple's System Status page.

---

### Auto-update not detected — `app.isPackaged` issue *(experienced in v1.2.1)*
```
// Users on older build never see the update banner
```
**Root cause:** The updater was guarded by `if (!app.isPackaged) return` but some
older build paths set `isPackaged = false` even in production (if the `.asar` was
absent or the app was run from an unpacked directory).

**Fix (already applied in this codebase):**
- `_initAutoUpdater()` checks `app.isPackaged` — confirmed working in `>= v1.2.1`
- If users on older versions still don't auto-update, they must manually download the
  new DMG/installer from the GitHub releases page

**Prevention:** After each release, install the built DMG on a clean machine (not your
dev machine) and confirm the update banner appears within ~30 seconds of launch.

---

### Duplicate release tag / wrong version in update manifest
*(Experienced in v1.2.1 — two commits with the same release message)*

**Symptoms:** `latest-mac.yml` on GitHub points to an old version, or the app
updates to the wrong build.

**Fix:**
1. Delete the bad tag locally and on GitHub:
   ```bash
   git tag -d v1.2.1
   git push origin :refs/tags/v1.2.1
   ```
2. Delete the GitHub release (keep the assets if needed as a backup)
3. Re-tag the correct commit and re-publish:
   ```bash
   git tag v1.2.1 <correct-commit-sha>
   git push origin v1.2.1
   npm run release
   ```

---

### Windows SmartScreen warning on first install
```
Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app…
```
**Cause:** The installer is unsigned (no `CSC_LINK`).
**Fix options:**
- Users click "More info" → "Run anyway" (acceptable for internal distribution)
- Or sign the build with a code-signing certificate (`CSC_LINK` + `CSC_KEY_PASSWORD`)

---

### Windows build fails on Mac (`wine` / cross-compile error)
```
Error: wine is required
```
**Fix:** Windows builds must run on a Windows machine. The `npm run build:win`
command only works natively on Windows. Use a VM or CI runner.

---

### `latest.yml` / `latest-mac.yml` missing from GitHub release
```
Error: ENOENT: no such file or directory 'latest-mac.yml'
```
**Cause:** Build succeeded but publish step failed part-way through.
**Fix:** Run `npm run release` again — electron-builder will re-upload missing assets
without rebuilding the full app if the DMG/ZIP files already exist in `dist/`.

---

### Old users stuck on an ancient version and not receiving updates
**Cause:** Versions before the auto-updater was added (before v1.0.0) have no
update mechanism at all.
**Fix:** Manually distribute the new DMG/installer link to those users.
After they install it once, future updates will be automatic.

---

## Quick reference — npm scripts

| Script | Platform | What it does |
|--------|----------|-------------|
| `npm start` | Any | Run in dev mode (no auto-update, Developer menu visible) |
| `npm run build:mac` | Mac | Build DMG + ZIP locally (no publish) |
| `npm run build:win` | Windows | Build NSIS installer locally (no publish) |
| `npm run build:all` | Mac | Build Mac + Windows locally (no publish) |
| `npm run release` | Mac | Build + publish Mac release to GitHub |
| `npm run release:win` | Windows | Build + publish Windows release to GitHub |

---

## Files to never commit

| File / pattern | Contains |
|----------------|---------|
| `.env`, `.env.build` | Build secrets |
| `app-config.js` | Backend URL + API key |
| `dist/` | Build artefacts |
| `GH_TOKEN`, `APPLE_*`, `CSC_*` | Auth credentials — shell env only |

---

## Checklist before every release

- [ ] Version bumped in `package.json`
- [ ] `CHANGELOG` / release notes drafted (paste into GitHub release description)
- [ ] All env vars exported in current shell session
- [ ] `git status` is clean (no uncommitted changes)
- [ ] Commit message follows pattern: `Release vX.Y.Z — brief description`
- [ ] Tag pushed: `git push origin vX.Y.Z`
- [ ] GitHub release shows as **Latest** (not Draft)
- [ ] `latest-mac.yml` present in release assets
- [ ] `latest.yml` present (if Windows build included)
- [ ] Tested update banner on a clean installed copy (not dev machine)
