# AI Memory System - Implementation Plan

## Project Overview

An MCP (Model Context Protocol) server that provides semantic memory storage using sqlite-vec, replacing traditional markdown files with RAG-powered, searchable memories. Designed for integration with Claude Code and other LLM CLI tools.

### Core Concept

Two-tier semantic memory storage system with project-level (`.memory/db`) and global (`~/.memory/db`) databases, using local embeddings for privacy and performance. Memories are small, narrowly-focused pieces of information that can be semantically searched and automatically retrieved.

---

## Key Design Decisions

### Embedding Strategy

- **Model**: Open-source local embeddings (no cloud APIs)
- **Recommended**: FastEmbed with `BAAI/bge-small-en-v1.5` (384 dimensions)
- **Alternative**: sentence-transformers with `all-MiniLM-L6-v2`
- **Rationale**: 384d provides good balance of performance, storage, and quality

### Storage Architecture

- **Dual-level**: Project (`.memory/db`) + Global (`~/.memory/db`)
- **Precedence**: Project-level memories override global in search results
- **Detection**: Project identified by `.memory/` directory marker (not Git)

### Retrieval Strategy

- **Hybrid**: Automatic retrieval + on-demand MCP tools
- **Scoring**: Multi-factor (40% similarity + 20% recency + 20% priority + 20% usage)
- **Context-aware limits**: Different defaults for session-start vs explicit queries

### Memory Philosophy

- **Focus**: Small, narrowly-focused memories (not large documents)
- **Priority**: Default NORMAL with smart suggestions for HIGH/CORE
- **Automation**: Trigger on key decisions, error resolutions, session-end

---

## Detailed Acceptance Criteria

### 1. Storage Architecture

- [ ] Two sqlite-vec databases: `~/.memory/db` (global) and `.memory/db` (project-level)
- [ ] Project detection via `.memory/` directory marker (not Git root)
- [ ] Project-level memories override global memories in search results
- [ ] Both databases share identical schema but are queried with different context
- [ ] Database created automatically if not present

### 2. Embedding System

- [ ] Use open-source local embedding model (FastEmbed or sentence-transformers)
- [ ] Use 384 dimensions (good balance of performance/storage)
- [ ] Support model versioning in metadata (track which model generated each embedding)
- [ ] Implement lazy migration: re-embed memories when retrieved if model version differs
- [ ] Provide manual `migrate_embeddings` tool to batch re-embed all memories

### 3. Memory Schema

```sql
CREATE TABLE memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    content_hash TEXT UNIQUE NOT NULL,  -- For deduplication

    -- Metadata
    priority TEXT DEFAULT 'NORMAL',  -- CORE, HIGH, NORMAL, LOW
    category TEXT,                    -- User-defined categories
    tags TEXT,                        -- JSON array of tags
    project_id TEXT,                  -- Project identifier
    source TEXT,                      -- auto_decision, auto_error, session_end, manual, import

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Embedding metadata
    embedding_model TEXT NOT NULL,    -- Model name/version
    embedding_model_version TEXT,     -- Specific version
    embedding_dimension INTEGER,      -- 384, 768, etc.

    -- Usage tracking
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP,
    usage_contexts TEXT               -- JSON array of contexts where used
);

CREATE VIRTUAL TABLE vec_memories USING vec0(
    memory_id INTEGER PRIMARY KEY,
    embedding FLOAT[384]              -- Adjust based on chosen model
);

-- Indexes for performance
CREATE INDEX idx_priority ON memories(priority);
CREATE INDEX idx_project_id ON memories(project_id);
CREATE INDEX idx_created_at ON memories(created_at);
CREATE INDEX idx_content_hash ON memories(content_hash);
```

### 4. MCP Tools (7 total)

#### `store_memory`

Store new memory with optional metadata.

- **Parameters**: content, tags[], priority, category, source
- **Auto-generates**: hash, embedding, timestamps
- **Returns**: memory_id, success status
- **Behavior**: Auto-detects duplicates (>0.9 similarity), offers merge

#### `search_memory`

Semantic search with multi-factor scoring.

- **Parameters**: query, limit (context-aware defaults), filters (tags, priority, date_range)
- **Scoring**: 40% similarity + 20% recency + 20% priority + 20% usage frequency
- **Returns**: ranked memories with scores, metadata, score breakdown

#### `list_memories`

List/filter memories by metadata.

- **Parameters**: filters (priority, tags, project_id, date_range), sort_by, limit
- **Returns**: paginated memory list

#### `delete_memory`

Remove memory by ID or hash.

- **Parameters**: memory_id OR content_hash
- **Returns**: success status

#### `update_memory`

Modify memory content or metadata.

- **Parameters**: memory_id, updated_content (optional), metadata updates
- **Behavior**: Re-embeds if content changed
- **Returns**: updated memory

#### `deduplicate_memories`

Find and merge similar memories.

- **Parameters**: similarity_threshold (default 0.95), auto_merge (boolean)
- **Returns**: list of duplicate groups with merge suggestions

#### `import_markdown_memories`

Import from .md files.

- **Parameters**: file_paths[], confirm_import (boolean)
- **Behavior**: Scans for patterns (headings, lists, ADRs)
- **Returns**: preview (if not confirmed) or import results

### 5. MCP Resources (Hybrid Approach)

Expose high-value memories as browsable resources:

- [ ] `memory://core` - Lists all CORE priority memories
- [ ] `memory://high` - Lists all HIGH priority memories
- [ ] `memory://project/{project_id}` - Lists project-specific memories
- [ ] Regular memories accessible via tools only

**Rationale**: Resources are best for static, frequently accessed content. Tools are better for dynamic search/modification.

### 6. Automatic Memory Triggers

#### Session Start

- Auto-retrieve relevant memories based on project context
- **Limit**: 5-8 memories (minimize token usage)
- **Scoring**: Heavily weight priority + project relevance

#### Session End

- Hook calls `_generate_session_summary` internal function
- LLM creates summary, stores as memories with source='session_end'

#### Key Decision Detection

- **Patterns**: "decided to", "chose to", "architecture", "ADR", etc.
- **Behavior**: Prompt LLM: "A decision was detected. Should this be stored as a memory?"

#### Error Resolution Detection

- **Patterns**: Error message → solution provided → confirmation
- **Behavior**: Auto-store: error signature + solution + context

### 7. Priority System

- [ ] Default: All memories are NORMAL unless specified
- [ ] Smart suggestions during storage:
  - "architecture", "security", "cross-cutting" → suggest HIGH/CORE
  - Project-specific tech choices → suggest NORMAL
  - Bug fixes, temporary notes → suggest NORMAL
- [ ] Manual override always available via `priority` parameter
- [ ] Location-based hint: Memories in global DB shown as "consider CORE?" in UI

### 8. Deduplication

- [ ] Auto-detection on `store_memory`: Check if similar memory exists (>0.9 similarity)
- [ ] If duplicate found: Warn user, offer to merge or update existing
- [ ] Manual `deduplicate_memories` tool for bulk cleanup
- [ ] Merge strategy: Keep newer metadata, combine tags, highest priority wins

### 9. Search Retrieval Strategy

Query both databases (project + global) in parallel.

**Multi-factor scoring**:

```python
score = (
    0.4 * vector_similarity +
    0.2 * recency_score +      # Exponential decay from created_at
    0.2 * priority_score +      # CORE=1.0, HIGH=0.75, NORMAL=0.5, LOW=0.25
    0.2 * usage_score           # Log-scaled from access_count
)
```

**Project boost**: Project-level memories get +0.1 boost for project queries

**Context-aware limits**:

- Session start: 5-8 memories
- Explicit MCP tool call: 10-20 memories (configurable)
- Auto-trigger (decision/error): 3-5 memories

**Returns**: Memories with content, metadata, score breakdown (for transparency)

### 10. Error Handling

**Fallback modes**:

1. Vector search fails → Fall back to FTS5 text search
2. Embedding generation fails → Store without embedding, flag for retry
3. Database locked → Retry with exponential backoff (3 attempts)

**Graceful degradation**: Return partial results with warning

**Detailed errors to LLM**: Include error type, suggestion for resolution

**Logging**: All errors logged to `~/.memory/logs/` for debugging

### 11. Configuration

Config file: `~/.memory/config.json`

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

### 12. Markdown Import

- [ ] Auto-scan on first initialization: Look for common memory files
  - Patterns: `MEMORY.md`, `NOTES.md`, `ADR-*.md`, `.claude/*.md`
- [ ] Parse structure: Headings → separate memories, lists → items
- [ ] Present preview to user with suggested priority/tags
- [ ] User confirms/edits before import
- [ ] Set source='import' and track original file path in metadata

### 13. Transport & Integration

- [ ] Stdio transport only (sufficient for Claude Code)
- [ ] FastMCP server implementation
- [ ] Entry point: `uv run memory-server` or `memory-server` script
- [ ] Configuration for Claude Code:

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

---

## Implementation Order

### Phase 1: Foundation (Week 1)

#### 1. Project Setup

- [ ] Initialize project structure with uv/Poetry
- [ ] Install dependencies: `fastmcp`, `sqlite-vec`, `fastembed` or `sentence-transformers`
- [ ] Create basic configuration system
- [ ] Set up logging infrastructure

#### 2. Database Layer

- [ ] Implement sqlite-vec schema (memories table + vec_memories virtual table)
- [ ] Create database manager for dual-level storage (~/.memory/db + .memory/db)
- [ ] Write database initialization and migration utilities
- [ ] Add indexes for performance

#### 3. Embedding Service

- [ ] Implement embedding generation with chosen local model
- [ ] Add model version tracking
- [ ] Create embedding cache (avoid re-embedding same content)
- [ ] Test embedding performance and dimensions

### Phase 2: Core MCP Server (Week 2)

#### 4. Basic MCP Server

- [ ] Set up FastMCP server with stdio transport
- [ ] Implement server lifecycle management
- [ ] Create context detection (project vs global)
- [ ] Add configuration loading

#### 5. Core Tools (Part 1)

- [ ] Implement `store_memory` tool
- [ ] Implement `search_memory` tool with basic vector search
- [ ] Test end-to-end: store → embed → search → retrieve
- [ ] Validate schema and metadata storage

#### 6. Core Tools (Part 2)

- [ ] Implement `list_memories` tool
- [ ] Implement `delete_memory` tool
- [ ] Add basic error handling and validation

### Phase 3: Advanced Features (Week 3)

#### 7. Multi-Factor Scoring

- [ ] Implement scoring algorithm (similarity + recency + priority + usage)
- [ ] Add priority boost logic
- [ ] Test and tune scoring weights
- [ ] Add score breakdown in results

#### 8. Update & Deduplication

- [ ] Implement `update_memory` tool with re-embedding
- [ ] Implement `deduplicate_memories` tool
- [ ] Add duplicate detection on storage
- [ ] Create merge strategies

#### 9. Usage Tracking

- [ ] Add access count increment on retrieval
- [ ] Track last_accessed_at timestamps
- [ ] Store usage contexts (where/how memory was used)
- [ ] Add usage metrics to scoring

### Phase 4: Automation & Intelligence (Week 4)

#### 10. Automatic Triggers

- [ ] Implement session-end memory generation
- [ ] Add key decision detection patterns
- [ ] Add error resolution detection
- [ ] Create LLM prompts for extraction

#### 11. Priority System

- [ ] Implement smart priority suggestions
- [ ] Add pattern-based priority hints
- [ ] Create priority override mechanism
- [ ] Test with various memory types

#### 12. Markdown Import

- [ ] Implement file scanner for .md files
- [ ] Create parser for common structures
- [ ] Build preview/confirmation UI (via tool responses)
- [ ] Implement import with metadata tagging

### Phase 5: Polish & Integration (Week 5)

#### 13. Error Handling & Fallbacks

- [ ] Add FTS5 text search fallback
- [ ] Implement retry logic for database locks
- [ ] Add graceful degradation
- [ ] Comprehensive error messages

#### 14. Model Migration

- [ ] Implement lazy migration on retrieval
- [ ] Create `migrate_embeddings` batch tool
- [ ] Add model version compatibility checks
- [ ] Test migration scenarios

#### 15. Resources (Optional)

- [ ] Implement MCP resources for CORE/HIGH memories
- [ ] Add resource URIs (memory://core, etc.)
- [ ] Test resource browsing in Claude Code

#### 16. Testing & Documentation

- [ ] Write integration tests for all tools
- [ ] Add performance benchmarks
- [ ] Create user documentation (README, usage guide)
- [ ] Write developer documentation (architecture, extending)

#### 17. Claude Code Integration

- [ ] Create installation script
- [ ] Generate MCP configuration
- [ ] Write hooks for session start/end
- [ ] Test full integration with Claude Code

---

## Technology Stack

### Embeddings

**Primary**: **FastEmbed** (`fastembed` package)

- Lightweight, no PyTorch dependency
- Good quality for 384d embeddings
- Model: `BAAI/bge-small-en-v1.5` (default in FastEmbed)
- Falls back to sentence-transformers if needed

**Alternative**: `sentence-transformers` with `all-MiniLM-L6-v2`

- More mature, better documentation
- Slightly larger but more flexible
- Model: `sentence-transformers/all-MiniLM-L6-v2` (384d)

**Why 384 dimensions?**

- Good balance: Fast search, reasonable storage
- Adequate quality for memory retrieval
- Can upgrade to 768d later if needed
- Most open-source models support 384d

### Database

**sqlite-vec**

- Pure C extension, very fast
- Supports float vectors natively
- Works anywhere SQLite works

### MCP Framework

**FastMCP** (Python SDK)

- Simplifies MCP server creation
- Built-in tool/resource decorators
- Good error handling

---

## Success Metrics

1. **Performance**: Search latency < 100ms for 1000 memories
2. **Accuracy**: Top-5 search results relevant 80%+ of the time
3. **Usability**: LLM can store/retrieve memories without user intervention
4. **Reliability**: 99% uptime, graceful degradation on errors
5. **Storage**: < 10MB for 1000 memories (with 384d embeddings)

---

## Example Workflows

### Workflow 1: Session Start

1. User opens Claude Code in project directory
2. MCP server detects `.memory/` directory → project context
3. Automatically retrieves 5-8 relevant project memories
4. Memories injected into session context
5. LLM has immediate project awareness

### Workflow 2: Key Decision

1. User discusses architectural choice with LLM
2. System detects decision patterns in conversation
3. Prompts LLM: "Should this be stored as a memory?"
4. LLM extracts key decision, calls `store_memory`
5. Memory stored with priority suggestion (HIGH)
6. Available for future sessions

### Workflow 3: Error Resolution

1. User encounters error, pastes stack trace
2. LLM provides solution, user confirms it works
3. System detects error → solution pattern
4. Auto-stores: error signature + solution + context
5. Next time similar error occurs, memory is retrieved
6. LLM can reference previous solution

### Workflow 4: Session End

1. User ends Claude Code session
2. Session-end hook triggers
3. LLM reviews conversation, extracts key learnings
4. Calls `store_memory` for each learning
5. Memories tagged with source='session_end'
6. Available for next session

### Workflow 5: Semantic Search

1. LLM needs context on "authentication setup"
2. Calls `search_memory` with query
3. System generates embedding, searches both DBs
4. Multi-factor scoring ranks results
5. Returns top 10 memories with score breakdown
6. LLM uses context to answer user question

---

## Security & Privacy Considerations

1. **Local-only**: All embeddings generated locally, no cloud APIs
2. **Data isolation**: Project and global DBs are separate
3. **No telemetry**: No usage data sent externally
4. **Secure storage**: SQLite databases with appropriate file permissions
5. **Sensitive data**: User responsible for not storing secrets in memories

---

## Future Enhancements (Post-MVP)

### Phase 2: Natural Language Triggers (High Priority)
**Inspiration**: doobidoo's MCP Memory Service natural language trigger system

1. **Semantic trigger detection**: ML-based conversation analysis for automatic memory retrieval
   - Target: 85%+ accuracy for context-aware memory injection
   - Multi-tier performance: 50ms instant → 150ms fast → 500ms intensive
   - Adaptive learning from usage patterns

2. **Continuous conversation monitoring**: Real-time semantic analysis
   - Detect when user needs memory context without explicit commands
   - Smart memory injection at optimal conversation points
   - Git-aware context integration

3. **Enhanced pattern detection**: Beyond basic keyword matching
   - Understand intent and context from conversation flow
   - Proactive memory suggestions based on conversation direction
   - Zero-restart dynamic hook updates

**Note**: MVP uses rule-based pattern matching in hooks; Phase 2 enhances with ML-based semantic detection using the same hook architecture.

### Phase 3: Additional Features

1. **Multi-modal memories**: Support image/diagram embeddings
2. **Memory clustering**: Automatically group related memories
3. **Temporal awareness**: Track how memories evolve over time
4. **Cross-project insights**: Find patterns across multiple projects
5. **Memory recommendations**: Suggest memories to store based on conversation
6. **Export/import**: Backup and restore memory databases
7. **Memory visualization**: UI to browse and explore memory graph
8. **Collaborative memories**: Share memories across team (with encryption)
9. **Multi-CLI support**: Add Gemini CLI support once hook patterns are validated

---

## Questions & Decisions Log

### Q1: Embedding Model Choice

**Decision**: Start with FastEmbed (BAAI/bge-small-en-v1.5, 384d)
**Rationale**: Lightweight, no heavy dependencies, good quality, easy to swap later

### Q2: Resources vs Tools

**Decision**: Hybrid - CORE/HIGH as resources, rest as tools
**Rationale**: Resources for frequently accessed, static content; tools for dynamic search

### Q3: Embedding Dimensions

**Decision**: 384 dimensions
**Rationale**: Balance of performance, storage, and quality; can upgrade later if needed

### Q4: Lazy vs Eager Migration

**Decision**: Lazy migration (re-embed on retrieval)
**Rationale**: Minimizes upfront cost, spreads work over time, user controls timing

### Q5: Project Detection

**Decision**: Use `.memory/` directory marker (not Git)
**Rationale**: Explicit user intent, works in non-Git projects, simpler logic

---

## Getting Started (For Developers)

Once implementation begins:

```bash
# Clone repository
git clone <repo-url>
cd memory-server

# Install dependencies
uv pip install -e .

# Initialize database
memory-server init

# Run server (stdio mode)
memory-server

# Configure Claude Code
# Add to ~/.claude/config.json:
{
  "mcpServers": {
    "memory": {
      "command": "memory-server",
      "args": []
    }
  }
}
```

---

## Contact & Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Documentation**: `docs/` directory (to be created)

---

*Last Updated: 2025-11-06*
*Version: 1.0 (Initial Planning)*
