---
description: Publish to npm - bump version, tag, and push (GHA handles npm publish)
---

Prepare and trigger an npm publish via GitHub Actions.

## 1. Ask: Dev or Release?

Ask the user: **"Dev release or stable release?"**

- **dev**: Dev prerelease based on current stable version (e.g., `1.0.1` → `1.0.1-dev.1`, then `1.0.1-dev.2`)
- **release**: Full semver bump based on commits (patch/minor/major)

---

## Dev Flow

### D1. Pre-flight

```bash
git branch --show-current   # Must be dev
git status --short           # Must be clean
git fetch origin && git status -sb  # Must be up to date
grep '"version"' package.json
```

Must be on `dev` branch, clean, and up to date. If not, stop and fix first.

### D2. Bump Dev Version

Determine the next dev version based on the **current stable version**, not the next one.

1. Get the current stable base version (strip any existing `-dev.N` suffix):
   ```bash
   CURRENT=$(grep '"version"' package.json | cut -d'"' -f4)
   BASE=$(echo "$CURRENT" | sed 's/-dev\.[0-9]*//')
   ```

2. Find the latest dev tag for this base version and increment:
   ```bash
   LAST_DEV=$(git tag --list "v${BASE}-dev.*" --sort=-version:refname | head -1)
   if [ -z "$LAST_DEV" ]; then
     NEXT_NUM=1
   else
     LAST_NUM=$(echo "$LAST_DEV" | grep -o '[0-9]*$')
     NEXT_NUM=$((LAST_NUM + 1))
   fi
   NEW_VERSION="${BASE}-dev.${NEXT_NUM}"
   ```

3. Set the version:
   ```bash
   npm version "$NEW_VERSION" --no-git-tag-version
   ```

### D3. Commit and Tag

```bash
VERSION=$(grep '"version"' package.json | cut -d'"' -f4)
git add package.json
git commit -m "chore: bump version to $VERSION"
git tag "v$VERSION"
```

### D4. Push (triggers GHA)

```bash
git push origin dev && git push --tags
```

### D5. Report

```
Pushed v$VERSION - GitHub Actions will publish to npm @dev
Monitor: https://github.com/AerionDyseti/vector-memory-mcp/actions
```

---

## Release Flow

### R1. Pre-flight

```bash
git branch --show-current   # Must be main
git status --short          # Must be clean
git fetch origin && git status -sb  # Must be up to date
```

If not on main, not clean, or behind origin: stop and fix first.

### R2. Analyze Commits

```bash
# Current version
grep '"version"' package.json

# Last stable tag
git tag --list 'v*' --sort=-version:refname | grep -v dev | head -1

# Commits since last stable release
LAST_TAG=$(git tag --list 'v*' --sort=-version:refname | grep -v dev | head -1)
git log ${LAST_TAG}..HEAD --oneline
```

### R3. Determine Version Bump

Analyze commit messages:

| Bump | Trigger |
|------|---------|
| **MAJOR** | `BREAKING CHANGE:` in body, or `feat!:`, `fix!:` |
| **MINOR** | `feat:` commits |
| **PATCH** | `fix:`, `docs:`, `refactor:`, `perf:`, `test:`, `chore:` |

Use the highest applicable level.

### R4. Confirm with User

Present:
- Current version → Proposed version
- Commits being released

Ask: "Release vX.Y.Z? (yes/no)"

### R5. Update CHANGELOG.md

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

### R6. Bump, Commit, Tag

```bash
npm version X.Y.Z --no-git-tag-version
git add CHANGELOG.md package.json
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z
```

### R7. Push (triggers GHA)

```bash
git push && git push --tags
```

**Note**: The GitHub Actions workflow will automatically:
1. Publish to npm with `@latest` tag
2. Extract CHANGELOG content for this version
3. Create a GitHub Release with the changelog as release notes

### R8. Report

```
✅ Pushed vX.Y.Z
⏳ GitHub Actions workflow triggered - will:
   - Publish to npm @latest
   - Create GitHub Release automatically

Monitor: https://github.com/AerionDyseti/vector-memory-mcp/actions
Release will appear at: https://github.com/AerionDyseti/vector-memory-mcp/releases/tag/vX.Y.Z
```
