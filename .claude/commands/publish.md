---
description: Analyze commits, bump version, tag and push to trigger npm publish (project)
---

Release a new version. Tagging triggers GitHub Actions to publish to npm.

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

## 5. Bump, Tag, and Push

```bash
# Bump version in package.json
npm version [major|minor|patch] --no-git-tag-version

# Commit and tag
git add package.json
git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z

# Push (triggers GHA publish)
git push && git push --tags
```

## 6. Monitor

After push:
- GitHub Actions will run tests and publish to npm
- Check: https://github.com/AerionDyseti/vector-memory-mcp/actions

Report the tag pushed and link to the GHA run.
