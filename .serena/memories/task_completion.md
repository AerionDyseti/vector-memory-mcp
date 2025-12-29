# Task Completion Checklist

When completing a task in this codebase, follow these steps:

## 1. Type Check
```bash
bun run typecheck
```
Ensure there are no TypeScript errors before committing.

## 2. Run Tests
```bash
bun test
```
All tests must pass. If you modified existing functionality, ensure existing tests still pass.

## 3. Test Coverage (Optional)
```bash
bun test --coverage
```
Check that new code has reasonable test coverage.

## 4. Manual Testing
If the change affects the MCP tools, test by:
1. Running `bun run start`
2. Testing with Claude Code or another MCP client
3. Verify the tool works as expected

## 5. Code Review Checklist
- [ ] TypeScript strict mode passes
- [ ] All tests pass
- [ ] Code follows existing patterns (service layer, repository pattern)
- [ ] Imports use `.js` extension
- [ ] Type-only imports use `import type`
- [ ] No console.log statements left in (except for server startup)
- [ ] Async operations properly awaited

## 6. Git Commit
```bash
git add .
git commit -m "descriptive message"
```

## Notes
- There is no separate linter or formatter configured (Bun/TypeScript handles most style)
- The project uses Bun's built-in test runner
- No build step required for development (Bun runs TypeScript directly)
