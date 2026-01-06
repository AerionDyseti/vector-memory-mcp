---
description: Analyze commits, bump version, tag, and publish to npm (project)
---

Release a new version to npm.

## 1. Pre-flight Checks

```bash
# Must be on main
git branch --show-current

# Must be clean
git status --short

# Must be up to date
git fetch origin && git status -sb
```

If not on main, not clean, or behind origin: stop and fix first.

## 2. Get Current State

```bash
# Current version
grep '"version"' package.json

# Last version tag
git tag --list 'v*' --sort=-version:refname | head -1

# Commits since last tag
git log $(git tag --list 'v*' --sort=-version:refname | head -1)..HEAD --oneline
```

## 3. Determine Version Bump

Analyze commit messages using semver:

| Bump | Trigger |
|------|---------|
| **MAJOR** | `BREAKING CHANGE:` in body, or `feat!:`, `fix!:` |
| **MINOR** | `feat:` commits |
| **PATCH** | `fix:`, `docs:`, `refactor:`, `perf:`, `test:`, `chore:` |

Use the highest applicable level.

## 4. Confirm with User

Present:
- Current version → Proposed version
- Commits being released
- Changelog summary by category

Ask: "Release vX.Y.Z? (yes/no)"

## 5. Bump Version

```bash
npm version [major|minor|patch] --no-git-tag-version
```

## 6. Commit, Tag, and Publish

```bash
# Commit version bump
git add package.json
git commit -m "chore: release vX.Y.Z"

# Tag
git tag vX.Y.Z

# Run tests and publish
bun run test && npm publish --access public

# Push commit and tag
git push && git push --tags
```

## 7. Report

Confirm:
- Version published: X.Y.Z
- npm URL: https://www.npmjs.com/package/@aeriondyseti/vector-memory-mcp
- Tag pushed: vX.Y.Z
