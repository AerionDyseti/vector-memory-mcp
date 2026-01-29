# Dev Branch Integration Plan

> **For Claude:** Execute this plan task-by-task, verifying each step before proceeding.

**Goal:** Integrate valuable features from `origin/dev` into `main`, including Node.js compatibility, while preserving our simplified GHA publish workflow.

**Approach:** Manual integration (not merge) to selectively bring in features while avoiding conflicts with recent hybrid memory work.

---

## Task 1: Add Node.js Runtime Support

**Files:**
- Modify: `package.json` - Add dependency, update entry points
- Modify: `src/http/server.ts` - Add runtime detection and Node.js server

### Step 1.1: Add @hono/node-server dependency

```bash
bun add @hono/node-server
```

### Step 1.2: Update package.json entry points

Change `main` and `bin` to point to compiled output:

```json
{
  "main": "dist/src/index.js",
  "bin": {
    "vector-memory-mcp": "dist/src/index.js"
  },
  "files": [
    "dist",
    "scripts",
    "hooks",
    "README.md",
    "LICENSE"
  ]
}
```

### Step 1.3: Update npm scripts for build workflow

```json
{
  "scripts": {
    "start": "node dist/src/index.js",
    "start:bun": "bun run src/index.ts",
    "dev": "bun --watch run src/index.ts",
    "build": "tsc",
    "prebuild": "rm -rf dist",
    "typecheck": "bunx tsc --noEmit",
    "prepublishOnly": "bun run build"
  }
}
```

### Step 1.4: Update src/http/server.ts with runtime detection

Add port availability checking and Node.js server support from dev branch.

### Step 1.5: Verify build works

```bash
bun run build
node dist/src/index.js --help
```

---

## Task 2: Windows Path Fix

**Files:**
- Modify: `src/config/index.ts`

### Step 2.1: Update path resolution

Replace `path.startsWith("/")` with `isAbsolute(path)` for cross-platform support.

### Step 2.2: Add VERSION export

Export version from package.json for runtime access.

---

## Task 3: Update GHA Publish Workflow

**Files:**
- Modify: `.github/workflows/publish.yml`

### Step 3.1: Add build step before publish

```yaml
- name: Build
  run: bun run build

- name: Publish to npm
  run: npm publish --access public --tag ${{ steps.npm-tag.outputs.tag }}
```

---

## Task 4: Add Benchmark Suite

**Files:**
- Create: `tests/benchmark/` directory (copy from dev)
- Modify: `package.json` - Add benchmark script

### Step 4.1: Copy benchmark files from dev

```bash
git checkout origin/dev -- tests/benchmark/
git checkout origin/dev -- tests/benchmark.test.ts
```

### Step 4.2: Add benchmark script to package.json

```json
{
  "scripts": {
    "benchmark": "bun test tests/benchmark.test.ts --preload ./tests/preload.ts"
  }
}
```

---

## Task 5: Add Test Coverage Improvements

**Files:**
- Create: `tests/e2e.test.ts` (321 lines)
- Create: `tests/http.test.ts` (212 lines)
- Create: `tests/config.test.ts` (83 lines)

### Step 5.1: Copy test files from dev

```bash
git checkout origin/dev -- tests/e2e.test.ts
git checkout origin/dev -- tests/http.test.ts
git checkout origin/dev -- tests/config.test.ts
```

### Step 5.2: Verify tests pass

```bash
bun run test
```

---

## Task 6: Update .gitignore

**Files:**
- Modify: `.gitignore`

### Step 6.1: Add dist/ to gitignore

```
dist/
```

---

## Task 7: Final Verification & Commit

### Step 7.1: Run full test suite

```bash
bun run build
bun run test
```

### Step 7.2: Test Node.js execution

```bash
node dist/src/index.js --help
```

### Step 7.3: Commit all changes

```bash
git add -A
git commit -m "feat: Add Node.js compatibility and dev branch features

- Add Node.js runtime support via @hono/node-server
- Add auto-select port when configured port is in use
- Fix Windows path handling with isAbsolute()
- Add search quality benchmark suite
- Add E2E, HTTP, and config test coverage
- Update GHA to build before publish"
```

---

## Excluded from Integration

- ❌ `integrations/claude-code/` directory move (discuss separately)
- ❌ Old publish scripts (superseded by GHA)
- ❌ Version number from dev (we're at 0.9.0-dev.5)
- ❌ TODO.md (not relevant)
