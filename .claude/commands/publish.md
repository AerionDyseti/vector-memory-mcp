---
description: Publish to npm - dev (dogfood) or release (stable) (project) (project)
---

Publish a new version to npm.

**Usage:** `/publish <mode> [version]`
- `/publish dev` - Increment dev.X counter, publish to @dev tag
- `/publish release` - Analyze commits, suggest version, publish to @latest tag
- `/publish release 0.10.1` - Explicit version, publish to @latest tag

**Argument:** $ARGUMENTS

---

## Parse Arguments

Extract mode and optional version from `$ARGUMENTS`:
- If empty or unclear, ask: **"Publish to dev or release?"**
- If `dev` → Dev Publish Flow
- If `release` or `release X.Y.Z` → Release Publish Flow

---

## Dev Publish Flow

### D1. Pre-flight

```bash
git status --short
git branch --show-current
grep '"version"' package.json
```

### D2. Merge to dev branch (if needed)

```bash
# If not already on dev, merge current branch into dev
git checkout dev
git merge --no-ff [current-branch] -m "Merge [branch] for dev release"
```

### D3. Bump Dev Version

Increment the dev version (e.g., `0.9.0-dev.1` → `0.9.0-dev.2`):

```bash
npm version prerelease --preid=dev --no-git-tag-version
```

### D4. Commit and Push

```bash
git add package.json
git commit -m "chore: publish $(grep '"version"' package.json | cut -d'"' -f4) to dev"
git push origin dev
```

### D5. Build and Publish

```bash
bun run build
bun run test && npm publish --access public --tag dev
```

### D6. Report

```
Published to dev tag: X.Y.Z-dev.N
Branch: dev
Install with: bunx --bun @aeriondyseti/vector-memory-mcp@dev
```

---

## Release Publish Flow

### R1. Pre-flight Checks

```bash
# Should be on dev branch with tested code
git branch --show-current
git status --short

# Check what's being released
git log main..dev --oneline
```

### R2. Determine Version

**If version provided in arguments:** Use that version.

**If no version provided:** Analyze commits since last release using semver:

| Bump | Trigger |
|------|---------|
| **MAJOR** | `BREAKING CHANGE:` in body, or `feat!:`, `fix!:` |
| **MINOR** | `feat:` commits |
| **PATCH** | `fix:`, `docs:`, `refactor:`, `perf:`, `test:`, `chore:` |

```bash
# Get last release version
git describe --tags --abbrev=0 main 2>/dev/null || echo "v0.0.0"

# Get commits since last release
git log main..dev --oneline
```

### R3. Confirm with User

Present:
- Current version → Proposed version
- Commits being released
- Changelog summary

Ask: "Release vX.Y.Z? (yes/no)"

### R4. Update CHANGELOG.md

Add a new section at the top:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- [new features]

### Changed
- [changes]

### Fixed
- [bug fixes]
```

Update comparison links at bottom.

### R5. Bump Version and Commit on dev

```bash
npm version X.Y.Z --no-git-tag-version
git add CHANGELOG.md package.json
git commit -m "chore: release vX.Y.Z"
git push origin dev
```

### R6. Merge to main and Tag

```bash
git checkout main
git merge --no-ff dev -m "Release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

### R7. Build and Publish to @latest

```bash
bun run build
bun run test && npm publish --access public
```

### R8. Reset dev to new baseline

After releasing, reset dev branch to track the new baseline:

```bash
git checkout dev
git merge main  # Fast-forward to release commit

# Reset to X.Y.Z-dev.0 (same version, dev.0 suffix)
npm version X.Y.Z-dev.0 --no-git-tag-version
git add package.json
git commit -m "chore: reset dev to X.Y.Z-dev.0"
git push origin dev
```

### R9. Report

```
Published to latest: X.Y.Z
Branch: main
Tag: vX.Y.Z
npm: https://www.npmjs.com/package/@aeriondyseti/vector-memory-mcp

Dev branch reset to: X.Y.Z-dev.0
```
