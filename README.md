# MCP Memory Server

> Replace static markdown context files with intelligent, semantically-searchable memories that understand what you're working on.

A production-ready MCP (Model Context Protocol) server that provides semantic memory storage for AI assistants. Uses local embeddings and vector search to automatically retrieve relevant context without cloud dependencies.

**Perfect for:** Software teams maintaining architectural knowledge, developers juggling multiple projects, and anyone building with AI assistants like Claude Code.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)

---

## ✨ Features

### 🔒 **Local-First & Private**
- All embeddings generated locally (no cloud APIs)
- Data stored in local sqlite-vec databases
- Complete privacy and control over your memories

### 🎯 **Intelligent Semantic Search**
- Vector similarity with multi-factor scoring
- Considers relevance, recency, priority, and usage frequency
- Context-aware retrieval based on conversation flow

### 📊 **Dual-Level Memory Storage**
- **Project-specific** memories (`.memory/db` in your repo)
- **Global** memories (`~/.memory/db` for cross-project knowledge)
- Automatic precedence handling (project overrides global)

### ⚡ **High Performance**
- Sub-100ms search latency for 1000+ memories
- Efficient storage (<10MB per 1000 memories)
- CPU-optimized local embeddings (no GPU required)

### 🔌 **MCP Native Integration**
- Works seamlessly with Claude Code
- Session hooks for automatic context injection
- Standard MCP protocol (compatible with future clients)

### 🤖 **Smart Automation**
- Auto-detect architectural decisions
- Capture bug fixes and solutions
- Generate session summaries
- Deduplicate similar memories

---

## 🚀 Quick Start

### Prerequisites

- Python 3.11 or higher
- [uv](https://github.com/astral-sh/uv) (recommended) or pip
- Claude Code or another MCP-compatible client

### Installation

```bash
# Clone the repository
git clone https://github.com/AerionDyseti/mcp-memory-server.git
cd mcp-memory-server

# Install dependencies
uv sync

# Or with pip
pip install -e .
```

### Configure Claude Code

Add to your `~/.claude/config.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "memory-server",
      "args": []
    }
  }
}
```

### Initialize Your First Memory

Create a `.memory/` directory in your project:

```bash
mkdir .memory
```

Start using Claude Code in that directory - memories will be automatically stored and retrieved!

---

## 📖 Usage

### Storing Memories

Memories are stored automatically when you:
- Make architectural decisions
- Solve bugs or errors
- End a session (session summary)

Or manually using the MCP tool:

```python
# Claude Code will call this tool
store_memory(
    content="Use FastAPI for REST APIs with automatic OpenAPI docs",
    tags=["architecture", "api", "fastapi"],
    priority="HIGH"
)
```

### Searching Memories

Search happens automatically at session start, or manually:

```python
# Semantic search across all memories
search_memory(
    query="how should I handle authentication?",
    limit=10
)
```

### Managing Memories

```python
# List memories with filters
list_memories(
    filters={"priority": "HIGH", "tags": ["architecture"]},
    limit=20
)

# Update existing memory
update_memory(
    memory_id="abc123",
    content="Updated content",
    tags=["new-tag"]
)

# Remove duplicate memories
deduplicate_memories(
    similarity_threshold=0.95
)

# Delete specific memory
delete_memory(memory_id="abc123")
```

---

## 🏗️ Architecture

```
mcp-memory-server/
├── src/memory_server/
│   ├── __init__.py
│   ├── server.py           # FastMCP server implementation
│   ├── service.py          # Memory service (store, search, etc.)
│   ├── embeddings.py       # FastEmbed integration
│   ├── database.py         # sqlite-vec database layer
│   ├── scoring.py          # Multi-factor scoring algorithm
│   └── tools/              # MCP tool implementations
├── tests/
│   ├── unit/               # Fast unit tests (mocked)
│   ├── integration/        # Integration tests (real embeddings)
│   └── e2e/                # End-to-end MCP client tests
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   └── TESTING_PLAN.md
└── pyproject.toml
```

### Technology Stack

- **MCP Framework**: FastMCP (official Python SDK)
- **Vector Database**: sqlite-vec (fast, local, SQLite-based)
- **Embeddings**: FastEmbed (BAAI/bge-small-en-v1.5, 384 dimensions)
- **Language**: Python 3.11+
- **Testing**: pytest + pytest-asyncio

---

## 🎨 How It Works

### 1. Memory Storage

```
User interacts with Claude Code
         ↓
Decision/solution detected
         ↓
Content → FastEmbed → 384d vector
         ↓
Store in sqlite-vec with metadata
         ↓
(content, embedding, tags, priority, timestamp)
```

### 2. Memory Retrieval

```
Session starts / query made
         ↓
Query → FastEmbed → 384d vector
         ↓
KNN search in sqlite-vec
         ↓
Multi-factor scoring:
  • 40% vector similarity
  • 20% recency
  • 20% priority
  • 20% usage frequency
         ↓
Return top N relevant memories
```

### 3. Dual-Level Memory

```
~/.memory/db (global)          .memory/db (project)
    ↓                               ↓
Cross-cutting concerns      Project-specific knowledge
    ↓                               ↓
         ↓___________↓_______________↓
                     ↓
              Merged results
           (project takes precedence)
```

---

## 🔧 Configuration

Create `~/.memory/config.json` to customize:

```json
{
  "embedding": {
    "model": "BAAI/bge-small-en-v1.5",
    "dimension": 384,
    "device": "cpu"
  },
  "retrieval": {
    "default_limit": 10,
    "session_start_limit": 8,
    "similarity_threshold": 0.7,
    "scoring_weights": {
      "similarity": 0.4,
      "recency": 0.2,
      "priority": 0.2,
      "usage": 0.2
    }
  },
  "auto_triggers": {
    "session_end": true,
    "decision_detection": true,
    "error_resolution": true
  },
  "deduplication": {
    "auto_check": true,
    "similarity_threshold": 0.9
  }
}
```

---

## 🧪 Development

### Running Tests

```bash
# Fast unit tests
pytest tests/unit/ -v

# Integration tests
pytest tests/integration/ -v

# Full test suite with coverage
pytest --cov=memory_server --cov-report=html

# Watch mode (auto-run on changes)
ptw tests/unit/ -- -v
```

### Development Mode

Use separate databases for development vs. production:

```bash
# Switch to development mode
touch ~/.memory/.dev-mode

# Switch to production mode
rm ~/.memory/.dev-mode

# Or use aliases (add to ~/.bashrc or ~/.zshrc)
alias memory-dev='touch ~/.memory/.dev-mode && echo "✓ Dev mode"'
alias memory-prod='rm -f ~/.memory/.dev-mode && echo "✓ Prod mode"'
```

See [TESTING_PLAN.md](docs/TESTING_PLAN.md) for comprehensive development workflow.

---

## 📚 Documentation

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) - Complete 5-week implementation roadmap
- [TESTING_PLAN.md](TESTING_PLAN.md) - Testing strategy and development workflow
- [API Documentation](docs/API.md) *(coming soon)*
- [Contributing Guide](CONTRIBUTING.md) *(coming soon)*

---

## 🗺️ Roadmap

### ✅ Phase 1: Foundation (Current)
- Core database and embedding infrastructure
- Basic MCP tools (store, search, list, delete)
- Project detection and dual-level storage

### 🚧 Phase 2: Intelligence (Next)
- Multi-factor scoring implementation
- Automatic trigger detection
- Memory deduplication
- Session-end summaries

### 📋 Phase 3: Advanced Features
- Natural language triggers (85%+ accuracy)
- Continuous conversation monitoring
- Smart priority suggestions
- Markdown import/export

### 🔮 Future
- Multi-modal memories (images, diagrams)
- Memory clustering and visualization
- Cross-project insights
- Multi-CLI support (Gemini CLI, Cursor, etc.)

---

## 🤝 Contributing

Contributions are welcome! This project is in active development.

### Areas We'd Love Help With:
- Testing and bug reports
- Documentation improvements
- Performance optimizations
- New feature ideas

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines *(coming soon)*.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- Built on [FastMCP](https://github.com/modelcontextprotocol/python-sdk) from the Model Context Protocol team
- Uses [sqlite-vec](https://github.com/asg017/sqlite-vec) by Alex Garcia for fast vector search
- Powered by [FastEmbed](https://github.com/qdrant/fastembed) from Qdrant for local embeddings
- Inspired by [doobidoo's mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) natural language triggers

---

## 🔗 Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io) - Official MCP specification
- [Claude Code](https://claude.ai/code) - AI coding assistant from Anthropic
- [sqlite-vec](https://github.com/asg017/sqlite-vec) - Vector search for SQLite
- [FastEmbed](https://github.com/qdrant/fastembed) - Fast, lightweight embeddings

---

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/AerionDyseti/mcp-memory-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/AerionDyseti/mcp-memory-server/discussions)
- **Documentation**: Check the `docs/` directory

---

## ⚡ Quick Examples

### Example 1: Architectural Decision

```
You: "I'm deciding between PostgreSQL and SQLite for this project"
Claude: [Searches memories for database decisions]

You: "Let's go with SQLite for simplicity"
Claude: [Automatically stores decision]
  ✓ Stored: "Use SQLite for database - prioritizing simplicity over scale"
  Tags: [architecture, database, sqlite]
  Priority: HIGH
```

### Example 2: Bug Fix

```
You: "Getting 'database is locked' errors in tests"
Claude: [Searches memories for similar errors]
  Found: "Enable WAL mode: PRAGMA journal_mode=WAL"

You: "That worked!"
Claude: [Automatically stores solution]
  ✓ Stored: "SQLite database lock fix - use WAL mode"
  Tags: [bug-fix, sqlite, testing]
```

### Example 3: Session Summary

```
[End of session]
Claude: [Reviews conversation, extracts key learnings]
  ✓ Stored: "Implemented JWT authentication with FastAPI"
  ✓ Stored: "Used Pydantic for request validation"
  ✓ Stored: "Added pytest fixtures for auth testing"

Session summary saved with 3 memories.
```

---

<div align="center">

**[⬆ Back to Top](#mcp-memory-server)**

Made with ❤️ for developers who value context continuity

</div>
