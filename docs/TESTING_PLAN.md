# Testing & Development Flow Plan

## Overview

This document outlines the comprehensive testing strategy and development workflow for the memory-server MCP project, including test repository structure, isolation strategies, and dogfooding approaches.

---

## Part 1: Language & Technology Stack

### Final Decision: Python ✅

**Rationale:**
- **Official FastMCP Support**: Part of official MCP Python SDK (lower risk, long-term support)
- **CPU-Optimized Embeddings**: FastEmbed designed for local CPU usage without GPU
- **Proven Expertise**: Leverages existing Python/MCP experience from favor-tools project
- **Mature RAG Ecosystem**: Significantly more developed for semantic search applications
- **Testing Patterns**: Proven pytest-asyncio patterns already established

**Technology Stack:**
```
- MCP Framework: FastMCP (official SDK)
- Database: sqlite-vec with Python sqlite3
- Embeddings: FastEmbed (BAAI/bge-small-en-v1.5, 384d)
- Testing: pytest + pytest-asyncio + FastMCP Client
- Transport: stdio (Claude Code requirement)
```

### TypeScript Considered

TypeScript/Node.js was evaluated but declined because:
- FastMCP support is third-party (less mature)
- Transformers.js optimized for WebGPU (requires GPU)
- Smaller RAG/semantic search ecosystem
- Type safety benefits outweighed by Python ecosystem advantages

**Note**: Can revisit TypeScript in future if requirements change (e.g., GPU available, web UI needed).

---

## Part 2: Dogfooding Strategy

### The Challenge

When developing an MCP memory server, we want to dogfood it (use it while building it), but:
- Development changes can corrupt production memories
- Test data pollutes real memories
- Debugging requires isolated test databases
- Crashes could lose important data

### Selected Approach: Hybrid Launcher (Option 4) ✅

**Implementation:**

#### Launcher Script
```bash
#!/bin/bash
# ~/.local/bin/memory-server-launcher

# Check for dev mode flag file
if [ -f ~/.memory/.dev-mode ]; then
    export MEMORY_ENV=dev
    export MEMORY_DB=~/.memory/dev.db
    echo "[DEV MODE] Using development database" >&2
else
    export MEMORY_ENV=prod
    export MEMORY_DB=~/.memory/prod.db
fi

# Auto-backup prod before each session
if [ "$MEMORY_ENV" = "prod" ]; then
    mkdir -p ~/.memory/backups
    cp ~/.memory/prod.db ~/.memory/backups/auto-$(date +%Y%m%d-%H%M).db 2>/dev/null || true
fi

exec memory-server "$@"
```

#### Claude Code Configuration
```json
// ~/.claude/config.json
{
  "mcpServers": {
    "memory": {
      "command": "memory-server-launcher",
      "args": []
    }
  }
}
```

#### Shell Aliases (add to ~/.bashrc or ~/.zshrc)
```bash
# Memory server mode switching
alias memory-dev='touch ~/.memory/.dev-mode && echo "✓ Development mode enabled"'
alias memory-prod='rm -f ~/.memory/.dev-mode && echo "✓ Production mode enabled"'
alias memory-status='[ -f ~/.memory/.dev-mode ] && echo "📝 DEV mode" || echo "🚀 PROD mode"'
```

### Daily Workflow

**Development Session:**
```bash
$ memory-dev          # Switch to development mode
$ # Launch Claude Code - uses ~/.memory/dev.db
$ # Make changes, test with dev database
```

**Normal Usage (Dogfooding):**
```bash
$ memory-prod         # Switch to production mode
$ # Launch Claude Code - uses ~/.memory/prod.db (auto-backed up)
$ # Use stable version with real memories
```

**Check Current Mode:**
```bash
$ memory-status
📝 DEV mode           # or 🚀 PROD mode
```

### Benefits of This Approach

✅ **Easy switching** - Single command to change modes
✅ **Visual indicator** - Flag file presence shows mode
✅ **Automatic backups** - Prod DB backed up on each session
✅ **No config editing** - One-time setup, works forever
✅ **Safe defaults** - Defaults to prod if no flag file
✅ **Works anywhere** - Launches from Dock, terminal, anywhere

### Database Organization

```
~/.memory/
├── prod.db              # Production memories (real data)
├── dev.db               # Development memories (test data)
├── .dev-mode            # Flag file (exists = dev mode)
└── backups/
    ├── auto-20250106-0900.db
    ├── auto-20250106-1400.db
    └── manual-20250105.db
```

---

## Part 3: Test Repository Structure

### Hybrid Tiered Approach (Recommended) ✅

Start simple and grow complexity as features mature.

#### Phase 1: Simple Structure (Weeks 1-2)

```
memory-server/
├── tests/
│   ├── fixtures/
│   │   └── test-project/
│   │       ├── .memory/
│   │       │   └── .gitkeep
│   │       ├── README.md
│   │       ├── MEMORIES-SEED.md      # Pre-made memories to import
│   │       └── src/
│   │           ├── auth.py
│   │           ├── database.py
│   │           └── api.py
│   ├── unit/
│   │   ├── test_embeddings.py
│   │   ├── test_storage.py
│   │   └── test_tools.py
│   ├── integration/
│   │   ├── test_end_to_end.py
│   │   └── test_mcp_client.py
│   └── conftest.py                   # Shared fixtures
├── .memory/
│   └── dev.db                        # Development database
└── src/
    └── memory_server/
```

**Initial Test Data:** 15-20 realistic memories covering:
- Architectural decisions (5-7 memories)
- Bug fixes with solutions (4-6 memories)
- Code patterns and snippets (4-6 memories)
- Configuration notes (2-3 memories)

#### Phase 2: Multi-Project Structure (Weeks 3-4)

Add second project directory to test context switching:

```
tests/fixtures/
├── test-project-backend/
│   ├── .memory/db
│   ├── src/
│   └── docs/
└── test-project-frontend/
    ├── .memory/db
    ├── src/
    └── docs/
```

**Expanded Test Data:** 25-30 memories total
- 15 in backend project
- 10 in frontend project
- Tests project detection and context switching

#### Phase 3: Complex Scenarios (Week 5+, if needed)

Expand to monorepo structure for stress testing:

```
tests/fixtures/
└── test-monorepo/
    ├── .memory/db                    # Root-level memories
    ├── services/
    │   ├── auth-service/.memory/db
    │   ├── payment-service/.memory/db
    │   └── notification-service/.memory/db
    └── packages/
        ├── ui-components/.memory/db
        └── shared-types/.memory/db
```

**Comprehensive Test Data:** 40-50+ memories
- Tests memory precedence
- Tests complex project detection
- Performance validation

### Test Memory Seed Format

**File:** `tests/fixtures/test-project/MEMORIES-SEED.md`

```markdown
# Test Memories for Seeding

## Architectural Decision: Use FastAPI for REST API
**Tags:** architecture, api, framework
**Priority:** HIGH
**Category:** architecture
**Content:**
Decided to use FastAPI instead of Flask because:
- Built-in async support
- Automatic OpenAPI documentation
- Pydantic validation
- Better performance for I/O-bound operations

---

## Bug Fix: SQLite Database Lock
**Tags:** bug, database, fix
**Priority:** NORMAL
**Category:** bug-fix
**Content:**
Issue: Getting "database is locked" errors in tests
Solution: Enable WAL mode with PRAGMA journal_mode=WAL
Also set busy_timeout=5000 for better concurrency
Error signature: sqlite3.OperationalError: database is locked

---

## Code Pattern: Async Context Manager
**Tags:** pattern, python, async
**Priority:** NORMAL
**Category:** code-pattern
**Content:**
Standard pattern for resources with async cleanup:

\`\`\`python
from contextlib import asynccontextmanager

@asynccontextmanager
async def db_connection(path):
    conn = await connect(path)
    try:
        yield conn
    finally:
        await conn.close()
\`\`\`

Use for any resource requiring cleanup in async code.

---

## Configuration: Environment Variables
**Tags:** config, env, best-practice
**Priority:** NORMAL
**Category:** configuration
**Content:**
Best practice for configuration:
- Use .env files for local development
- Use environment variables in production
- Never commit .env to git
- Use python-dotenv for loading

Example:
DATABASE_URL=sqlite:///./test.db
MEMORY_DB_PATH=~/.memory/db
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
```

**Seeding Script:**

```python
# tests/fixtures/seed_memories.py
import asyncio
from pathlib import Path
from memory_server.service import MemoryService

async def seed_from_markdown(service: MemoryService, seed_file: Path):
    """Parse MEMORIES-SEED.md and populate database."""
    content = seed_file.read_text()
    memories = parse_seed_format(content)

    for memory in memories:
        await service.store_memory(
            content=memory["content"],
            tags=memory["tags"],
            priority=memory["priority"],
            category=memory["category"],
            source="seed"
        )

    print(f"✓ Seeded {len(memories)} test memories")

def parse_seed_format(content: str) -> list[dict]:
    """Parse markdown seed format into memory dictionaries."""
    # Parse markdown structure
    # Extract metadata and content
    # Return list of memory dicts
    pass
```

---

## Part 4: Testing Strategy

### Test Hierarchy

#### Level 1: Unit Tests (tests/unit/)

**Purpose:** Test individual components in isolation

**Characteristics:**
- Mock all external dependencies
- In-memory database (`:memory:`)
- Fast execution (< 1 second total)
- No real embeddings (mocked)

**Example Tests:**
- `test_embeddings.py` - Embedding service (mocked)
- `test_storage.py` - Database operations (in-memory)
- `test_tools.py` - MCP tool parameter validation
- `test_scoring.py` - Multi-factor scoring algorithm
- `test_deduplication.py` - Duplicate detection logic

**Example:**
```python
# tests/unit/test_scoring.py
import pytest
from memory_server.scoring import calculate_score

def test_scoring_weights():
    """Test multi-factor scoring calculation."""
    score = calculate_score(
        similarity=0.9,
        recency_days=1,
        priority="HIGH",
        access_count=10
    )

    # Expected: 0.4*0.9 + 0.2*recency + 0.2*0.75 + 0.2*usage
    assert 0.7 < score < 0.9
    assert isinstance(score, float)

@pytest.mark.parametrize("priority,expected", [
    ("CORE", 1.0),
    ("HIGH", 0.75),
    ("NORMAL", 0.5),
    ("LOW", 0.25),
])
def test_priority_scores(priority, expected):
    """Test priority score mapping."""
    from memory_server.scoring import priority_to_score
    assert priority_to_score(priority) == expected
```

#### Level 2: Integration Tests (tests/integration/)

**Purpose:** Test component interactions with real dependencies

**Characteristics:**
- Real embeddings (FastEmbed)
- Real database (temporary file)
- Medium speed (5-15 seconds total)
- Test actual MCP tool calls

**Example Tests:**
- `test_end_to_end.py` - Store → embed → search → retrieve
- `test_mcp_client.py` - MCP protocol with FastMCP Client
- `test_vector_search.py` - Real vector similarity search
- `test_import.py` - Import from MEMORIES-SEED.md

**Example:**
```python
# tests/integration/test_end_to_end.py
import pytest
from memory_server.service import MemoryService

@pytest.mark.asyncio
async def test_store_and_search_flow(memory_service):
    """Test complete store → search workflow."""
    # Store memories
    result1 = await memory_service.store_memory(
        content="Use FastAPI for REST APIs",
        tags=["architecture", "api"],
        priority="HIGH"
    )

    result2 = await memory_service.store_memory(
        content="SQLite WAL mode for concurrency",
        tags=["database", "performance"],
        priority="NORMAL"
    )

    # Search for similar content
    results = await memory_service.search_memory(
        query="building REST API",
        limit=5
    )

    # Assertions
    assert len(results) > 0
    assert results[0]["content"] == "Use FastAPI for REST APIs"
    assert results[0]["similarity"] > 0.7
    assert "score_breakdown" in results[0]
```

#### Level 3: E2E Tests (tests/e2e/)

**Purpose:** Test complete system with real MCP client

**Characteristics:**
- Full MCP client-server interaction
- Real embeddings and database
- Slower execution (20-60 seconds total)
- Test session hooks and complex scenarios

**Example Tests:**
- `test_session_hooks.py` - Session start/end memory injection
- `test_multi_project.py` - Context switching between projects
- `test_import_workflow.py` - Full markdown import flow
- `test_performance.py` - Search latency benchmarks

**Example:**
```python
# tests/e2e/test_mcp_client.py
import pytest
from mcp.client.session import ClientSession
from memory_server import create_mcp_server

@pytest.mark.asyncio
async def test_full_mcp_interaction():
    """Test complete MCP client → server flow."""
    server = create_mcp_server()

    async with ClientSession(server) as client:
        await client.initialize()

        # List available tools
        tools = await client.list_tools()
        tool_names = [t.name for t in tools.tools]
        assert "store_memory" in tool_names
        assert "search_memory" in tool_names

        # Call store_memory tool
        result = await client.call_tool(
            "store_memory",
            {
                "content": "Test memory content",
                "tags": ["test"],
                "priority": "NORMAL"
            }
        )

        assert result.isSuccess
        memory_id = result.result["memory_id"]

        # Search for stored memory
        search_result = await client.call_tool(
            "search_memory",
            {"query": "test memory", "limit": 5}
        )

        assert search_result.isSuccess
        memories = search_result.result["memories"]
        assert len(memories) > 0
        assert memories[0]["id"] == memory_id
```

### Test Fixtures (conftest.py)

```python
# tests/conftest.py
import pytest
import asyncio
from pathlib import Path
from memory_server.service import MemoryService
from memory_server.embeddings import EmbeddingService

@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
def test_db_path(tmp_path):
    """Provide temporary database path for each test."""
    db_path = tmp_path / "test.db"
    yield str(db_path)
    # Cleanup happens automatically with tmp_path

@pytest.fixture
async def memory_service(test_db_path):
    """Provide isolated memory service instance."""
    service = MemoryService(db_path=test_db_path)
    await service.initialize()
    yield service
    await service.cleanup()

@pytest.fixture
def mock_embedder():
    """Provide mock embedder for fast unit tests."""
    class MockEmbedder:
        def embed(self, texts: list[str]) -> list[list[float]]:
            """Return deterministic mock embeddings."""
            import hashlib
            embeddings = []
            for text in texts:
                # Generate deterministic vector from text hash
                hash_val = int(hashlib.md5(text.encode()).hexdigest()[:8], 16)
                vector = [(hash_val % 1000 + i) / 1000.0 for i in range(384)]
                embeddings.append(vector)
            return embeddings

    return MockEmbedder()

@pytest.fixture
async def seeded_memory_service(memory_service):
    """Memory service with pre-populated test data."""
    from tests.fixtures.seed_memories import SEED_MEMORIES

    for memory in SEED_MEMORIES:
        await memory_service.store_memory(**memory)

    return memory_service

@pytest.fixture
def test_project_path():
    """Path to test project fixture."""
    return Path(__file__).parent / "fixtures" / "test-project"
```

### Test Data Patterns

#### Mock Embedding Strategies

**Strategy 1: Deterministic Mocks**
```python
def mock_embedding(text: str, dimension: int = 384) -> list[float]:
    """Generate deterministic embedding from text hash."""
    import hashlib
    hash_val = int(hashlib.md5(text.encode()).hexdigest(), 16)
    return [(hash_val % 1000) / 1000.0] * dimension
```

**Strategy 2: Similarity-Controlled Mocks**
```python
class MockEmbedder:
    def __init__(self):
        self.cache = {}

    def create_similar(self, text1: str, text2: str, similarity: float):
        """Create two embeddings with specific similarity score."""
        import random

        # Generate first embedding
        emb1 = [random.random() for _ in range(384)]
        norm1 = sum(x**2 for x in emb1) ** 0.5
        emb1 = [x/norm1 for x in emb1]

        # Create second embedding with controlled similarity
        noise = [random.random() for _ in range(384)]
        emb2 = [
            similarity * e1 + (1 - similarity) * n
            for e1, n in zip(emb1, noise)
        ]
        norm2 = sum(x**2 for x in emb2) ** 0.5
        emb2 = [x/norm2 for x in emb2]

        self.cache[text1] = emb1
        self.cache[text2] = emb2
        return emb1, emb2
```

#### Test Corpus

```python
# tests/fixtures/seed_memories.py
SEED_MEMORIES = [
    {
        "content": "Use FastAPI for REST APIs with automatic OpenAPI documentation",
        "tags": ["architecture", "api", "fastapi"],
        "priority": "HIGH",
        "category": "architecture",
    },
    {
        "content": "SQLite WAL mode enables concurrent reads: PRAGMA journal_mode=WAL",
        "tags": ["database", "sqlite", "performance"],
        "priority": "NORMAL",
        "category": "configuration",
    },
    {
        "content": "Auth error: JWT token expired. Solution: Implement token refresh mechanism",
        "tags": ["bug", "auth", "jwt"],
        "priority": "NORMAL",
        "category": "bug-fix",
    },
    {
        "content": "Python async context manager pattern for resource cleanup",
        "tags": ["pattern", "python", "async"],
        "priority": "NORMAL",
        "category": "code-pattern",
    },
    # ... 15-20 total memories
]
```

---

## Part 5: Development Workflow

### Daily Development Flow

#### Morning Setup (2 minutes)
```bash
# 1. Switch to development mode
memory-dev

# 2. Pull latest changes
git pull

# 3. Sync dependencies (if needed)
uv sync

# 4. Run fast tests to verify setup
pytest tests/unit/ -v
```

#### Development Loop (Iterate)
```bash
# 1. Write failing test first (TDD)
# Edit: tests/unit/test_search.py

# 2. Run specific test (fast feedback)
pytest tests/unit/test_search.py::test_semantic_search -v

# 3. Implement feature
# Edit: src/memory_server/search.py

# 4. Re-run test until passing
pytest tests/unit/test_search.py::test_semantic_search -v

# 5. Refactor with test safety net

# 6. Run all unit tests
pytest tests/unit/ -v

# 7. Run integration tests if unit tests pass
pytest tests/integration/ -v
```

#### Watch Mode (Continuous Testing)
```bash
# Install pytest-watch
uv pip install pytest-watch

# Auto-run tests on file changes
ptw tests/unit/ -- -v

# Or with coverage
ptw tests/unit/ -- --cov=memory_server --cov-report=term
```

#### Pre-Commit Checklist (5 minutes)
```bash
# 1. Run full test suite
pytest --cov=memory_server

# 2. Check coverage (target: 80%+)
pytest --cov=memory_server --cov-report=html
open htmlcov/index.html  # Review coverage

# 3. Format code
black src/ tests/
ruff check src/ tests/ --fix

# 4. Type check
mypy src/

# 5. Commit if all checks pass
git add .
git commit -m "Add semantic search functionality"
```

#### Pre-Push Checklist (10 minutes)
```bash
# 1. Run full test suite including E2E
pytest -v

# 2. Run performance benchmarks
pytest tests/e2e/test_performance.py -v

# 3. Verify search latency < 100ms
# Check benchmark output

# 4. Push if all pass
git push
```

### Dogfooding Session (Production Mode)

```bash
# 1. Switch to production mode
memory-prod

# 2. Verify mode
memory-status  # Should show "🚀 PROD mode"

# 3. Use Claude Code normally
# - Stable version of memory-server
# - Real memories in ~/.memory/prod.db
# - Automatic backups created

# 4. Take notes on what works/doesn't work

# 5. Switch back to dev when ready to fix issues
memory-dev
```

### Switching Between Modes

```bash
# Quick reference
memory-dev        # Enable development mode
memory-prod       # Enable production mode
memory-status     # Check current mode

# Manual check (if aliases not available)
ls ~/.memory/.dev-mode && echo "DEV" || echo "PROD"

# Force production mode (delete flag file)
rm -f ~/.memory/.dev-mode

# Force development mode (create flag file)
touch ~/.memory/.dev-mode
```

---

## Part 6: Testing Tools & Configuration

### Required Packages

```toml
# pyproject.toml
[project]
dependencies = [
    "mcp",
    "fastembed",
    "sqlite-vec",
    "pydantic",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "pytest-cov>=4.1.0",
    "pytest-watch>=4.2.0",
    "black>=24.0.0",
    "ruff>=0.1.0",
    "mypy>=1.8.0",
]
```

### pytest Configuration

```toml
# pyproject.toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
asyncio_mode = "auto"
markers = [
    "unit: Unit tests (fast, mocked dependencies)",
    "integration: Integration tests (real embeddings, DB)",
    "e2e: End-to-end tests (full MCP client)",
    "slow: Slow tests (skip for rapid feedback)",
    "benchmark: Performance benchmark tests",
]

# Coverage settings
[tool.coverage.run]
source = ["src/memory_server"]
omit = ["tests/*", "*/migrations/*"]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise NotImplementedError",
    "if TYPE_CHECKING:",
    "if __name__ == .__main__.:",
]
```

### Running Specific Test Subsets

```bash
# Unit tests only (fast)
pytest tests/unit/ -v

# Integration tests only
pytest tests/integration/ -v

# E2E tests only
pytest tests/e2e/ -v

# All tests except slow
pytest -m "not slow" -v

# Benchmarks only
pytest -m benchmark -v

# Specific test file
pytest tests/unit/test_scoring.py -v

# Specific test function
pytest tests/unit/test_scoring.py::test_scoring_weights -v

# With coverage
pytest --cov=memory_server --cov-report=term-missing

# Verbose output with print statements
pytest -v -s

# Stop on first failure
pytest -x

# Run last failed tests
pytest --lf

# Run tests in parallel (requires pytest-xdist)
pytest -n auto
```

---

## Part 7: Performance Testing

### Benchmark Tests

```python
# tests/e2e/test_performance.py
import pytest
import time
from memory_server.service import MemoryService

@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_search_latency(seeded_memory_service):
    """Verify search latency < 100ms for 1000 memories."""
    service = seeded_memory_service

    # Seed 1000 memories
    for i in range(1000):
        await service.store_memory(
            content=f"Test memory {i}: Some content about topic {i % 10}",
            tags=[f"tag{i % 5}"],
            priority="NORMAL"
        )

    # Benchmark search performance
    query = "topic about content"
    iterations = 10

    start = time.perf_counter()
    for _ in range(iterations):
        results = await service.search_memory(query, limit=10)
        assert len(results) > 0
    duration = (time.perf_counter() - start) / iterations

    # Assert < 100ms average
    assert duration < 0.1, f"Search took {duration*1000:.1f}ms (target: <100ms)"

    print(f"\n✓ Search latency: {duration*1000:.1f}ms (target: <100ms)")

@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_embedding_throughput(memory_service):
    """Test embedding generation throughput."""
    texts = [f"Test document {i}" for i in range(100)]

    start = time.perf_counter()
    embeddings = await memory_service.embedder.embed(texts)
    duration = time.perf_counter() - start

    throughput = len(texts) / duration
    print(f"\n✓ Embedding throughput: {throughput:.1f} docs/sec")

    # Should be > 50 docs/sec on CPU
    assert throughput > 50, f"Too slow: {throughput:.1f} docs/sec"

@pytest.mark.benchmark
@pytest.mark.asyncio
async def test_storage_size(tmp_path):
    """Verify database size is reasonable."""
    db_path = tmp_path / "size_test.db"
    service = MemoryService(db_path=str(db_path))
    await service.initialize()

    # Store 1000 memories
    for i in range(1000):
        await service.store_memory(
            content=f"Memory {i}: " + "x" * 100,  # ~100 chars each
            tags=["test"],
            priority="NORMAL"
        )

    # Check database size
    import os
    size_mb = os.path.getsize(db_path) / (1024 * 1024)

    # Should be < 10MB for 1000 memories with 384d embeddings
    assert size_mb < 10, f"Database too large: {size_mb:.1f}MB"

    print(f"\n✓ Storage: {size_mb:.2f}MB for 1000 memories")
```

---

## Part 8: Continuous Integration

### Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/psf/black
    rev: 24.1.1
    hooks:
      - id: black
        args: [--line-length=100]

  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.14
    hooks:
      - id: ruff
        args: [--fix, --exit-non-zero-on-fix]

  - repo: local
    hooks:
      - id: pytest-unit
        name: pytest-unit
        entry: pytest tests/unit/ -v
        language: system
        pass_filenames: false
        always_run: true
```

### GitHub Actions (Future)

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dependencies
        run: |
          pip install uv
          uv sync --all-extras

      - name: Run tests
        run: pytest --cov=memory_server --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage.xml
```

---

## Part 9: Troubleshooting

### Common Issues

#### "Database is locked" errors

**Cause:** Multiple connections trying to write simultaneously

**Solution:**
```python
# Enable WAL mode
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA busy_timeout=5000")
```

#### Tests fail with "No module named 'memory_server'"

**Cause:** Package not installed in editable mode

**Solution:**
```bash
uv pip install -e .
```

#### Embedding tests are slow

**Cause:** Using real embeddings in unit tests

**Solution:** Use mock embedder fixture:
```python
async def test_with_mock(mock_embedder):
    service = MemoryService(embedder=mock_embedder)
    # Fast test with mocked embeddings
```

#### "Dev mode not working"

**Cause:** Flag file not being detected

**Debug:**
```bash
# Check if file exists
ls -la ~/.memory/.dev-mode

# Check launcher script
cat ~/.local/bin/memory-server-launcher

# Test manually
touch ~/.memory/.dev-mode
memory-server  # Should print "[DEV MODE]" to stderr
```

---

## Summary

### Key Decisions

1. **Language:** Python (FastMCP official, FastEmbed CPU-optimized)
2. **Dogfooding:** Hybrid launcher with flag file (~/.memory/.dev-mode)
3. **Test Structure:** Tiered approach (start simple, grow complex)
4. **Testing Levels:** Unit (mocked) → Integration (real) → E2E (full MCP)

### Quick Reference Commands

```bash
# Mode switching
memory-dev        # Development mode
memory-prod       # Production mode
memory-status     # Check mode

# Testing
pytest tests/unit/                    # Fast unit tests
pytest tests/integration/             # Integration tests
pytest tests/e2e/                     # Full E2E tests
pytest --cov=memory_server            # With coverage

# Watch mode
ptw tests/unit/ -- -v                 # Auto-run tests

# Pre-commit
black src/ tests/                     # Format
ruff check src/ tests/ --fix          # Lint
mypy src/                             # Type check
pytest --cov=memory_server            # Full test
```

### Success Metrics

- ✅ Search latency < 100ms for 1000 memories
- ✅ Test coverage > 80%
- ✅ All tests pass in < 60 seconds
- ✅ Storage < 10MB for 1000 memories
- ✅ Zero production data corruption

---

*Last Updated: 2025-01-06*
*Version: 1.0 (Initial)*
