---
description: Publish to npm - bump version, tag, and push (GHA handles npm publish)
---

Prepare and trigger an npm publish via GitHub Actions.

## 1. Ask: Dev or Release?

Ask the user: **"Dev release or stable release?"**

- **dev**: Increment prerelease version (e.g., `0.9.0-dev.5` → `0.9.0-dev.6`)
- **release**: Full semver bump based on commits (patch/minor/major)

---

## Dev Flow

### D1. Pre-flight

```bash
git status --short
git fetch origin && git status -sb
grep '"version"' package.json
```

Must be clean and up to date. If not, stop and fix.

### D2. Bump Dev Version

```bash
npm version prerelease --preid=dev --no-git-tag-version
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
git push && git push --tags
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

### R8. Create GitHub Release

Extract the changelog content for this version and create a GitHub Release:

```bash
# Extract changelog section for this version (between current version header and next version header)
# Then create the release with gh CLI
gh release create vX.Y.Z \
  --title "vX.Y.Z - [Brief Description]" \
  --notes "[Changelog content for this version]"
```

**Note**: Include the full changelog section with:
- Breaking Changes (if major version)
- Added features
- Changed items
- Fixed issues
- Removed items
- Installation instructions
- Link to full changelog comparison

### R9. Report

```
Pushed vX.Y.Z - GitHub Actions will publish to npm @latest
GitHub Release created: https://github.com/AerionDyseti/vector-memory-mcp/releases/tag/vX.Y.Z
Monitor: https://github.com/AerionDyseti/vector-memory-mcp/actions
```
