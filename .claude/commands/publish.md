---
description: Analyze commits, bump version, and publish to npm (project)
---

Publish a new version to npm based on commits since last release.

## 1. Get Current State

```bash
# Current version
cat package.json | grep '"version"'

# Find last version tag
git tag --list 'v*' --sort=-version:refname | head -1

# Commits since last tag (or all commits if no tag)
git log $(git tag --list 'v*' --sort=-version:refname | head -1)..HEAD --oneline 2>/dev/null || git log --oneline
```

## 2. Analyze Commits for Version Bump

Review commit messages and determine version bump using semver:

**MAJOR** (breaking changes):
- Commits with `BREAKING CHANGE:` in body
- Commits with `!` after type (e.g., `feat!:`, `fix!:`)

**MINOR** (new features):
- `feat:` commits

**PATCH** (fixes, improvements):
- `fix:` commits
- `docs:`, `refactor:`, `perf:`, `test:`, `chore:` commits

Use the highest applicable bump level.

## 3. Confirm with User

Present:
- Current version
- Proposed new version
- Summary of changes by category

Ask: "Publish as vX.Y.Z? (yes/no)"

## 4. Update Version

If confirmed, update `package.json`:
```bash
# Use npm version to bump (also creates git tag)
npm version [major|minor|patch] --no-git-tag-version
```

## 5. Commit and Tag

```bash
git add package.json
git commit -m "chore: bump version to X.Y.Z"
git tag vX.Y.Z
```

## 6. Publish

```bash
bun run publish:npm
```

## 7. Push

After successful publish:
```bash
git push && git push --tags
```

Report the published version and npm URL.
