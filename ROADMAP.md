# Roadmap

Current version: **0.8.0**

## Completed

### v0.8.0 - Batch Operations & Checkpoints
- Batch memory operations (store/update/delete/get multiple)
- Checkpoint system for session continuity
- Session-start hook for automatic context loading
- HTTP/SSE transport for Claude Desktop
- Graceful shutdown handling

### v0.5.0 - Foundation
- Core database with LanceDB
- Embedding generation with @huggingface/transformers
- Basic MCP tools (store, search, get, delete)
- TypeScript implementation
- Local-first, privacy-focused design

---

## Planned

### Enhanced Search & Scoring
- Multi-factor scoring algorithm (similarity, recency, priority, usage frequency)
- Configurable scoring weights
- Priority levels for memories
- Usage tracking and frequency-based ranking
- Metadata filtering and advanced tagging

### Dual-Level Memory System
- Project-specific memories (`.vector-memory/` in repo)
- Global memories (`~/.local/share/vector-memory-mcp/`)
- Automatic precedence handling (project overrides global)
- Project detection and context switching

### Smart Automation
- Auto-detect architectural decisions
- Capture bug fixes and solutions automatically
- Generate session-end summaries
- Natural language trigger detection
- Continuous conversation monitoring

### Advanced Features
- Memory deduplication with similarity threshold
- Batch import/export (markdown, JSON)
- Memory clustering and visualization
- Cross-project insights
- Multi-modal memories (images, diagrams)
- Multi-CLI support (Cursor, Windsurf, etc.)

---

## Ideas / Exploring

- Vector database alternatives (if LanceDB limitations arise)
- Web UI for memory management
- Team/shared memory spaces
- Memory expiration and archival
- Integration with other knowledge bases
