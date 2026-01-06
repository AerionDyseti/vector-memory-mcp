---
description: Publish to npm - dev (dogfood) or release (stable) (project)
---

Publish a new version to npm.

## 1. Ask: Dev or Release?

Ask the user: **"Publish to dev (dogfood) or release (stable)?"**

- **dev**: Merge to `dev` branch, publish to `@dev` tag
- **release**: Merge to `main` branch, publish to `@latest` tag

---

## Dev Publish Flow

### D1. Pre-flight

```bash
git status --short
git branch --show-current
grep '"version"' package.json
```

### D2. Merge to dev branch

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

Analyze commits since last release using semver:

| Bump | Trigger |
|------|---------|
| **MAJOR** | `BREAKING CHANGE:` in body, or `feat!:`, `fix!:` |
| **MINOR** | `feat:` commits |
| **PATCH** | `fix:`, `docs:`, `refactor:`, `perf:`, `test:`, `chore:` |

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

### R6. Merge to main

```bash
git checkout main
git merge --no-ff dev -m "Release vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags
```

### R7. Build and Publish

```bash
bun run build
bun run test && npm publish --access public
```

### R8. Report

```
Published to latest: X.Y.Z
Branch: main
Tag: vX.Y.Z
npm: https://www.npmjs.com/package/@aeriondyseti/vector-memory-mcp
```
