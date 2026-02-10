---
description: Publish to npm - bump version, tag, and push (GHA handles npm publish)
---

Prepare and trigger an npm publish via GitHub Actions.

## 1. Ask: Dev or Release?

Ask the user: **"Dev release or stable release?"**

- **dev**: Dev prerelease based on current stable version (e.g., `1.0.1` → `1.0.1-dev.1`). Tag `dev.0` means same commit as stable.
- **release**: Full semver bump based on commits (patch/minor/major)

---

## Dev Flow

Dev releases are lightweight — just a git tag on the current commit. No version bump commit needed.
GHA sets `package.json` version from the tag at build time.

### D1. Pre-flight

```bash
git branch --show-current   # Must be dev
git status --short           # Must be clean
git fetch origin && git status -sb  # Must be up to date
```

Must be on `dev` branch, clean, and up to date. If not, stop and fix first.

### D2. Determine Next Dev Tag

Dev versions are based on the **current stable version** (not the next one).

```bash
# Get the stable base version from the latest stable tag
BASE=$(git tag --list 'v*' --sort=-version:refname | grep -v dev | head -1 | sed 's/^v//')

# Find the latest dev tag for this base and increment
LAST_DEV=$(git tag --list "v${BASE}-dev.*" --sort=-version:refname | head -1)
if [ -z "$LAST_DEV" ]; then
  NEXT_NUM=1
else
  LAST_NUM=$(echo "$LAST_DEV" | grep -o '[0-9]*$')
  NEXT_NUM=$((LAST_NUM + 1))
fi
NEW_VERSION="${BASE}-dev.${NEXT_NUM}"
```

### D3. Tag and Push (triggers GHA)

```bash
git tag "v${NEW_VERSION}"
git push origin dev && git push --tags
```

### D4. Report

```
Pushed v$NEW_VERSION - GitHub Actions will publish to npm @dev
Monitor: https://github.com/AerionDyseti/vector-memory-mcp/actions
```

---

## Release Flow

Stable releases go through a PR from `dev` → `main`. Main is protected — no direct pushes.

### R1. Pre-flight

```bash
git branch --show-current   # Must be dev
git status --short          # Must be clean
git fetch origin && git status -sb  # Must be up to date
```

Must be on `dev` branch, clean, and up to date. If not, stop and fix first.

### R2. Analyze Commits

```bash
# Current version on main
git show origin/main:package.json | grep '"version"'

# Last stable tag
git tag --list 'v*' --sort=-version:refname | grep -v dev | head -1

# Commits on dev since last stable release
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

### R5. Prepare Release Commit

Update CHANGELOG and bump version on `dev`:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- [new features]

### Changed
- [changes]

### Fixed
- [bug fixes]
```

```bash
npm version X.Y.Z --no-git-tag-version
git add CHANGELOG.md package.json
git commit -m "chore: release vX.Y.Z"
git push origin dev
```

### R6. Create PR (dev → main)

```bash
gh pr create --base main --head dev \
  --title "Release vX.Y.Z" \
  --body "$(cat <<'PREOF'
## Release vX.Y.Z

[Summary of changes from CHANGELOG]
PREOF
)"
```

### R7. Merge PR and Tag

After PR is merged:

```bash
git checkout main && git pull origin main
git tag vX.Y.Z
git push --tags
```

Then reset dev to main and tag dev.0:

```bash
git checkout dev && git reset --hard main
git tag "vX.Y.Z-dev.0"
git push origin dev --force && git push --tags
```

### R8. Report

```
✅ Released vX.Y.Z via PR merge
⏳ GitHub Actions workflow triggered - will:
   - Publish to npm @latest
   - Create GitHub Release automatically

Monitor: https://github.com/AerionDyseti/vector-memory-mcp/actions
Release will appear at: https://github.com/AerionDyseti/vector-memory-mcp/releases/tag/vX.Y.Z
```
