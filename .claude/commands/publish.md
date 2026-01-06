---
description: Publish to npm - dev (dogfood) or release (stable) (project)
---

Publish a new version to npm.

## 1. Ask: Dev or Release?

Ask the user: **"Publish to dev (dogfood) or release (stable)?"**

- **dev**: Quick publish to `dev` tag for testing. No changelog, no git tag.
- **release**: Full release to `latest` tag. Changelog, git tag, the works.

---

## Dev Publish Flow

### D1. Pre-flight

```bash
git status --short
grep '"version"' package.json
```

### D2. Bump Dev Version

Increment the dev version (e.g., `0.9.0-dev.1` → `0.9.0-dev.2`):

```bash
npm version prerelease --preid=dev --no-git-tag-version
```

### D3. Publish

```bash
bun run test && npm publish --access public --tag dev
```

### D4. Commit (optional)

```bash
git add package.json && git commit -m "chore: publish $(grep '"version"' package.json | cut -d'"' -f4) to dev"
git push
```

### D5. Report

```
Published to dev tag: X.Y.Z-dev.N
Install with: bunx --bun @aeriondyseti/vector-memory-mcp@dev
```

---

## Release Publish Flow

### R1. Pre-flight Checks

```bash
# Must be on main
git branch --show-current

# Must be clean
git status --short

# Must be up to date
git fetch origin && git status -sb
```

If not on main, not clean, or behind origin: stop and fix first.

### R2. Get Current State

```bash
# Current version
grep '"version"' package.json

# Last version tag
git tag --list 'v*' --sort=-version:refname | head -1

# Commits since last tag (or last release version)
git log $(git tag --list 'v*' --sort=-version:refname | head -1)..HEAD --oneline
```

### R3. Determine Version Bump

Analyze commit messages using semver:

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
- Changelog summary by category

Ask: "Release vX.Y.Z? (yes/no)"

### R5. Update CHANGELOG.md

Add a new section at the top of CHANGELOG.md:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- [new features]

### Changed
- [changes to existing features]

### Fixed
- [bug fixes]
```

Update the comparison links at the bottom.

### R6. Bump Version

```bash
npm version X.Y.Z --no-git-tag-version
```

### R7. Commit, Tag, and Publish

```bash
# Commit changelog and version bump
git add CHANGELOG.md package.json
git commit -m "chore: release vX.Y.Z"

# Tag
git tag vX.Y.Z

# Run tests and publish
bun run test && npm publish --access public

# Push commit and tag
git push && git push --tags
```

### R8. Report

Confirm:
- Version published: X.Y.Z
- npm URL: https://www.npmjs.com/package/@aeriondyseti/vector-memory-mcp
- Tag pushed: vX.Y.Z
