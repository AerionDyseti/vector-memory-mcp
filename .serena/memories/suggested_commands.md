# Suggested Commands

## Development Commands

### Run the Server
```bash
# Start the MCP server
bun run start

# Development mode (watch for changes)
bun run dev
```

### Testing
```bash
# Run all tests
bun test

# Run tests with coverage
bun test --coverage

# Run a specific test file
bun test tests/memory.test.ts
```

### Type Checking
```bash
# Check TypeScript types (no emit)
bun run typecheck
```

### Install Dependencies
```bash
bun install
```

## Environment Variables
- `VECTOR_MEMORY_DB_PATH` - Custom database path (default: `~/.local/share/vector-memory-mcp/memories.db`)
- `VECTOR_MEMORY_MODEL` - Embedding model (default: `Xenova/all-MiniLM-L6-v2`)

## Git Commands
```bash
git status
git add .
git commit -m "message"
git push origin main
```

## System Utilities (Linux/WSL)
```bash
ls -la          # List files
cd <dir>        # Change directory
grep -r "pattern" src/   # Search in files
find . -name "*.ts"      # Find files
```
