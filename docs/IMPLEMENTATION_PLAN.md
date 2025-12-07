# AI Memory System - Implementation Plan

## Project Overview

An MCP (Model Context Protocol) server that provides semantic memory storage using LanceDB, replacing traditional markdown files with RAG-powered, searchable memories. Designed for integration with Claude Code and other LLM CLI tools.

### Core Concept

Two-tier semantic memory storage system with project-level (`.memory/db`) and global (`~/.local/share/vector-memory-mcp/memories.db`) databases, using local embeddings for privacy and performance. Memories are small, narrowly-focused pieces of information that can be semantically searched and automatically retrieved.

---

## Key Design Decisions

### Embedding Strategy

- **Model**: Open-source local embeddings (no cloud APIs)
- **Recommended**: @huggingface/transformers with `Xenova/all-MiniLM-L6-v2`
- **Rationale**: 384d provides good balance of performance, storage, and quality

### Storage Architecture

- **Dual-level**: Project (`.memory/db`) + Global (`~/.local/share/vector-memory-mcp/memories.db`)
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

- [ ] Two LanceDB databases: `~/.local/share/vector-memory-mcp/memories.db` (global) and `.memory/db` (project-level)
- [ ] Project detection via `.memory/` directory marker (not Git root)
- [ ] Project-level memories override global memories in search results
- [ ] Both databases share identical schema but are queried with different context
- [ ] Database created automatically if not present

### 2. Embedding System

- [ ] Use open-source local embedding model (@huggingface/transformers)
- [ ] Use 384 dimensions (good balance of performance/storage)
- [ ] Support model versioning in metadata (track which model generated each embedding)
- [ ] Implement lazy migration: re-embed memories when retrieved if model version differs
- [ ] Provide manual `migrate_embeddings` tool to batch re-embed all memories

### 3. Memory Schema (LanceDB)

```typescript
interface Memory {
  id: string;
  content: string;
  embedding: number[]; // 384 dimensions
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  superseded_by: string | null;
}
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

Remove memory by ID.

- **Parameters**: memory_id
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

See Phase 7 for comprehensive deduplication with content hashing. Basic similarity-based deduplication is implemented in Phase 3.

### 9. Search Retrieval Strategy

Query both databases (project + global) in parallel.

**Multi-factor scoring**:

```javascript
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

1. Vector search fails → Fall back to text search (see Phase 11 for full implementation)
2. Embedding generation fails → Store without embedding, flag for retry
3. Database locked → Retry with exponential backoff (3 attempts)

**Graceful degradation**: Return partial results with warning (see Phase 14 for comprehensive patterns)

**Detailed errors to LLM**: Include error type, suggestion for resolution

**Logging**: All errors logged to `~/.local/share/vector-memory-mcp/logs/` for debugging

### 11. Configuration

Config file: `~/.local/share/vector-memory-mcp/config.json`

```json
{
  "embedding": {
    "model": "Xenova/all-MiniLM-L6-v2",
    "dimension": 384
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
- [ ] MCP server implementation
- [ ] Entry point: `bunx vector-memory-mcp`
- [ ] Configuration for Claude Code:

```json
{
  "mcpServers": {
    "memory": {
      "command": "bunx",
      "args": ["vector-memory-mcp"]
    }
  }
}
```

---

## Implementation Order

### Phase 1: Foundation - Global Memory Only (Week 1)

**Goal**: Establish working memory system with single global database

#### 1. Project Setup

- [ ] Initialize project structure
- [ ] Install dependencies: `@modelcontextprotocol/sdk`, `@lancedb/lancedb`, `@huggingface/transformers`
- [ ] Create basic configuration system
- [ ] Set up logging infrastructure

#### 2. Database Layer (Global Only)

- [ ] Implement LanceDB schema
- [ ] Create database manager for **global storage only**
- [ ] Write database initialization utilities
- [ ] Add indexes for performance

#### 3. Embedding Service

- [ ] Implement embedding generation with chosen local model
- [ ] Add model version tracking
- [ ] Create embedding cache (avoid re-embedding same content)
- [ ] Test embedding performance and dimensions

#### 4. Basic MCP Server

- [ ] Set up MCP server with stdio transport
- [ ] Implement server lifecycle management
- [ ] Add configuration loading
- [ ] Basic error handling

#### 5. Core Tools (Minimal Set)

- [ ] Implement `store_memory` tool
- [ ] Implement `search_memory` tool with basic vector search
- [ ] Implement `list_memories` tool
- [ ] Implement `delete_memory` tool
- [ ] Test end-to-end: store → embed → search → retrieve

**Phase 1 Deliverable**: Working MCP server with global memory storage, basic CRUD operations, and semantic search

---

### Phase 2: Dual-Source Storage (Week 2)

**Goal**: Add project-level memory storage and precedence logic

#### 6. Project Detection & Context

- [ ] Implement `.memory/` directory detection
- [ ] Add project context detection logic
- [ ] Create project-level database initialization (.memory/db)
- [ ] Add project_id tracking in memory metadata

#### 7. Dual-Database Query System

- [ ] Query both databases in parallel (global + project)
- [ ] Implement project precedence logic (project memories override global)
- [ ] Add project boost to scoring (+0.1 for project-level memories)
- [ ] Test dual-source retrieval and ranking

#### 8. Context-Aware Tool Behavior

- [ ] Update `store_memory` to auto-detect storage location (project vs global)
- [ ] Update `search_memory` to query both databases
- [ ] Update `list_memories` to support filtering by location
- [ ] Add location indicators in tool responses

**Phase 2 Deliverable**: Dual-level storage system with automatic context detection and precedence logic

---

### Phase 3: Advanced Features (Week 3)

#### 9. Multi-Factor Scoring

- [ ] Implement scoring algorithm (similarity + recency + priority + usage)
- [ ] Add priority boost logic
- [ ] Test and tune scoring weights
- [ ] Add score breakdown in results

#### 10. Update & Deduplication

- [ ] Implement `update_memory` tool with re-embedding
- [ ] Implement `deduplicate_memories` tool
- [ ] Add duplicate detection on storage
- [ ] Create merge strategies

#### 11. Usage Tracking

- [ ] Add access count increment on retrieval
- [ ] Track last_accessed_at timestamps
- [ ] Add usage metrics to scoring

**Note**: Extended analytics (query patterns, analytics dashboard) covered in Phase 12.

**Phase 3 Deliverable**: Enhanced search quality with multi-factor scoring, deduplication, and usage-based ranking

---

### Phase 4: Automation & Intelligence (Week 4)

#### 12. Automatic Triggers

- [ ] Implement session-end memory generation
- [ ] Add key decision detection patterns
- [ ] Add error resolution detection
- [ ] Create LLM prompts for extraction

#### 13. Priority System

- [ ] Implement smart priority suggestions
- [ ] Add pattern-based priority hints
- [ ] Create priority override mechanism
- [ ] Test with various memory types

#### 14. Markdown Import

- [ ] Implement file scanner for .md files
- [ ] Create parser for common structures
- [ ] Build preview/confirmation UI (via tool responses)
- [ ] Implement import with metadata tagging

**Phase 4 Deliverable**: Intelligent memory creation with automatic triggers and smart suggestions

---

### Phase 5: Polish & Integration (Week 5)

#### 15. Error Handling & Fallbacks

- [ ] Implement retry logic with exponential backoff
- [ ] Add graceful degradation (partial results with warnings)
- [ ] Comprehensive error messages for LLM consumption
- [ ] Basic text search fallback (full implementation in Phase 11)

#### 16. Model Migration

- [ ] Implement lazy migration on retrieval
- [ ] Create `migrate_embeddings` batch tool
- [ ] Add model version compatibility checks
- [ ] Test migration scenarios

#### 17. Resources (Optional)

- [ ] Implement MCP resources for CORE/HIGH memories
- [ ] Add resource URIs (memory://core, etc.)
- [ ] Test resource browsing in Claude Code

#### 18. Testing & Documentation

- [ ] Write integration tests for all tools
- [ ] Add performance benchmarks
- [ ] Create user documentation (README, usage guide)
- [ ] Write developer documentation (architecture, extending)

**Note**: Comprehensive test suite and documentation standards covered in Phase 14.

#### 19. Claude Code Integration

- [ ] Create installation script
- [ ] Generate MCP configuration
- [ ] Write hooks for session start/end
- [ ] Test full integration with Claude Code

**Phase 5 Deliverable**: Production-ready MCP server with comprehensive testing, documentation, and seamless Claude Code integration

---

## Technology Stack

### Embeddings

**Primary**: **@huggingface/transformers**

- Lightweight, no Python dependency
- Good quality for 384d embeddings
- Model: `Xenova/all-MiniLM-L6-v2` (default)

**Why 384 dimensions?**

- Good balance: Fast search, reasonable storage
- Adequate quality for memory retrieval
- Can upgrade to 768d later if needed
- Most open-source models support 384d

### Database

**LanceDB**

- Fast vector search
- Local storage
- TypeScript native

### MCP Framework

**@modelcontextprotocol/sdk**

- Official TypeScript SDK
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
4. **Secure storage**: Databases with appropriate file permissions
5. **Sensitive data**: User responsible for not storing secrets in memories

---

## Future Enhancements (Post-MVP)

### Phase 6: Natural Language Triggers (High Priority)
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

**Note**: MVP uses rule-based pattern matching in hooks; Phase 6 enhances with ML-based semantic detection using the same hook architecture.

### Phase 7: Memory Organization & Management

**Inspiration**: kdub-memory-service's comprehensive memory management capabilities

This phase enhances the basic storage from Phases 1-5 with organization primitives that make memories more useful at scale.

#### 7.1 Memory Types with Retention Policies
Implement categorized memory types with automatic lifecycle management:

| Type | Retention | Use Case |
|------|-----------|----------|
| Critical | 365 days | Important decisions, architecture, security |
| Reference | 180 days | Documentation, guides, stable patterns |
| Standard | 30 days | Normal memories, daily learnings |
| Temporary | 7 days | Session-specific, quick notes |

**Why**: Prevents unbounded database growth, automatically cleans stale memories, prioritizes important information.

- [ ] Add `memory_type` field to schema (enum: critical, reference, standard, temporary)
- [ ] Implement retention policy engine that runs on server startup
- [ ] Add automatic expiration based on memory type and last access
- [ ] Allow manual override to extend/shorten retention
- [ ] Display retention info in search results

#### 7.2 First-Class Tag System
Dedicated tagging system (enhances the tags[] parameter from Phase 1):

**Why**: Tags provide intuitive organization, enable filtering without semantic search, support hierarchical categorization.

- [ ] Promote `tags[]` to dedicated schema field (not just metadata)
- [ ] Implement tag-based filtering in `search_memories` and `list_memories`
- [ ] Add `list_tags` tool to browse all tags with memory counts
- [ ] Support tag hierarchies (e.g., `project/frontend`, `project/backend`)
- [ ] Auto-suggest tags based on content analysis

#### 7.3 Time-Range Queries
Enable temporal filtering for memory retrieval:

**Why**: Users often need "memories from last week" or "what did I learn yesterday" - pure semantic search cannot answer these.

- [ ] Add `start_date` and `end_date` parameters to `search_memories`
- [ ] Add `get_recent_memories` tool for quick time-based retrieval
- [ ] Support natural language time parsing ("last week", "yesterday", "past month")
- [ ] Add chronological sorting option (newest/oldest first)

#### 7.4 Content Deduplication with Hashing
SHA-256 content hashing for duplicate prevention (extends Phase 3 similarity-based deduplication):

**Why**: Prevents storing the same information multiple times, saves storage, improves search quality.

- [ ] Add `content_hash` field (SHA-256 of normalized content)
- [ ] Check hash before storing new memories (exact duplicate prevention)
- [ ] On duplicate detection: warn user, offer to update existing or skip
- [ ] Add `find_duplicates` tool for batch analysis
- [ ] Distinguish exact duplicates (hash match) from near-duplicates (>0.95 similarity)

#### 7.5 Backup & Export System
Scheduled backups and data portability:

**Why**: Database loss means total memory loss - critical data needs protection.

- [ ] Implement JSON export of all memories with embeddings
- [ ] Implement JSON import with conflict resolution
- [ ] Add `backup_memories` and `restore_memories` MCP tools
- [ ] Support selective export (by tags, types, date ranges)
- [ ] Add backup scheduling via configuration
- [ ] Implement incremental backup (only changed memories)

---

### Phase 8: Full-Text Search & Hybrid Retrieval

**Inspiration**: kdub-memory-service's SQLite FTS5 integration

This phase adds keyword search as a complement to semantic search, enabling hybrid retrieval and providing a fallback when embeddings fail.

#### 8.1 Keyword Search Implementation
**Why**: Semantic search excels at meaning but can miss exact keywords - hybrid search provides best of both.

- [ ] Implement keyword-based search alongside vector search
- [ ] Support exact phrase matching with quotes
- [ ] Boolean operators (AND, OR, NOT)
- [ ] Fuzzy matching for typos
- [ ] Index content for fast keyword lookup

#### 8.2 Hybrid Search Modes
- [ ] `semantic` - Vector similarity only (current behavior)
- [ ] `keyword` - Full-text search only
- [ ] `hybrid` - Combined scoring (default)
- [ ] Configurable weight distribution: `final = 0.7 * semantic + 0.3 * keyword`
- [ ] Auto-fallback to keyword search if embedding generation fails

**Phase 8 Deliverable**: Robust search with multiple strategies and graceful fallback

---

### Phase 9: Document Ingestion Pipeline

**Inspiration**: kdub-memory-service's multi-format document processing

#### 9.1 Supported Formats
- [ ] **PDF files** - Extract text with page-aware chunking
- [ ] **Markdown files** - Parse structure (headings, lists, code blocks)
- [ ] **Text files** - Plain text with sentence-aware splitting
- [ ] **JSON documents** - Extract key-value pairs as memories
- [ ] **CSV files** - Row-based memory creation
- [ ] **Code files** - Extract functions, classes, comments as memories

**Why**: Users have existing knowledge in documents - manual copy-paste is tedious and error-prone.

#### 9.2 Processing Features
- [ ] Automatic chunking with configurable size and overlap
- [ ] Boundary preservation (sentences, paragraphs, code blocks)
- [ ] Metadata extraction (file name, path, page numbers)
- [ ] Preview before import with edit capability
- [ ] Progress tracking for large documents

#### 9.3 MCP Tools
- [ ] `ingest_document` - Process single file with options
- [ ] `ingest_directory` - Batch process directory with filters
- [ ] `preview_ingestion` - Show what would be created without storing

**Phase 9 Deliverable**: Automated knowledge capture from existing documents

---

### Phase 10: Memory Consolidation System

**Inspiration**: kdub-memory-service's "dream-inspired" consolidation architecture

This is the most ambitious enhancement - an autonomous memory management system that proactively maintains memory quality. Requires Phase 7 (retention policies) and Phase 8 (hybrid search) as prerequisites.

#### 10.1 Consolidation Engine Architecture
Multiple specialized engines working together:

```
┌─────────────────────────────────────────────────┐
│              Consolidation Scheduler            │
│         (APScheduler-style job runner)          │
└─────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  Decay Engine │ │ Cluster Engine│ │ Forget Engine │
│               │ │               │ │               │
│ - Relevance   │ │ - DBSCAN      │ │ - Access      │
│   decay over  │ │ - Group       │ │   patterns    │
│   time        │ │   similar     │ │ - Controlled  │
│               │ │   memories    │ │   removal     │
└───────────────┘ └───────────────┘ └───────────────┘
        │               │               │
        ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Association   │ │ Compression   │ │ Health        │
│ Engine        │ │ Engine        │ │ Monitor       │
│               │ │               │ │               │
│ - Find        │ │ - Summarize   │ │ - Track       │
│   creative    │ │   old         │ │   consolidation│
│   connections │ │   memories    │ │   health      │
└───────────────┘ └───────────────┘ └───────────────┘
```

**Why**: Memories need active management like human memory - without consolidation, systems become cluttered with outdated, redundant, or low-value memories.

#### 10.2 Decay Engine
- [ ] Implement exponential decay calculation based on age and access patterns
- [ ] Add `relevance_score` field that decreases over time
- [ ] Use decay score as factor in search ranking
- [ ] Configurable decay curves per memory type

#### 10.3 Association Engine
- [ ] Find creative connections between seemingly unrelated memories
- [ ] Build memory graph of relationships
- [ ] Surface associated memories during search
- [ ] Enable "memory walks" - exploring connected memories

#### 10.4 Clustering Engine
- [ ] Implement DBSCAN clustering for memory grouping
- [ ] Auto-identify memory clusters by topic
- [ ] Suggest cluster labels based on content
- [ ] Enable cluster-based browsing and filtering

#### 10.5 Compression Engine
- [ ] Identify old memories that can be summarized
- [ ] Use LLM to create compressed versions
- [ ] Archive original, use summary for search
- [ ] Configurable compression thresholds

#### 10.6 Forgetting Engine
- [ ] Implement controlled memory removal
- [ ] Base decisions on access patterns, age, relevance
- [ ] Move to "archive" before permanent deletion
- [ ] Allow recovery within grace period

#### 10.7 Health Monitor
- [ ] Track consolidation statistics
- [ ] Monitor memory database health
- [ ] Alert on anomalies (rapid growth, low-quality memories)
- [ ] Provide consolidation reports

#### 10.8 Consolidation Scheduler
- [ ] Background job scheduling for consolidation tasks
- [ ] Configurable consolidation intervals
- [ ] Run during idle periods to minimize impact
- [ ] Manual trigger via `consolidate_memories` tool

**Phase 10 Deliverable**: Autonomous memory lifecycle management

---

### Phase 11: HTTP REST API & Web Dashboard

**Inspiration**: kdub-memory-service's FastAPI implementation

#### 11.1 REST API Endpoints
```
GET    /api/v1/memories           - List memories with pagination
POST   /api/v1/memories           - Store new memory
GET    /api/v1/memories/:id       - Get memory by ID
PUT    /api/v1/memories/:id       - Update memory
DELETE /api/v1/memories/:id       - Delete memory
POST   /api/v1/search             - Semantic search
GET    /api/v1/tags               - List all tags
GET    /api/v1/analytics          - Usage statistics
POST   /api/v1/consolidation      - Trigger consolidation
GET    /api/v1/health             - Health check
```

**Why**: HTTP API enables web dashboards, external tool integration, and debugging without MCP client.

- [ ] Implement HTTP server (use Hono or similar for Bun)
- [ ] Add authentication (API key or JWT)
- [ ] CORS configuration for web clients
- [ ] OpenAPI/Swagger documentation

#### 11.2 Web Dashboard
- [ ] Memory browser with search and filters
- [ ] Tag management interface
- [ ] Analytics visualization
- [ ] Consolidation controls
- [ ] Import/export interface

**Phase 11 Deliverable**: Web-based memory management interface

---

### Phase 12: Advanced Features

#### 12.1 Memory Connections & Relationships
- [ ] Track when memories reference each other
- [ ] Store explicit relationships (related_to, supersedes, derived_from)
- [ ] Build relationship graph for navigation
- [ ] Surface connections in search results

#### 12.2 Extended Analytics
Builds on basic usage tracking from Phase 3:

**Why**: Understanding how memories are used enables better ranking and cleanup.

- [ ] Log query patterns that retrieve each memory
- [ ] Track which queries lead to which memories
- [ ] Provide analytics dashboard with visualizations
- [ ] Memory usage reports and trends

#### 12.3 Pagination Support
- [ ] Add `offset` parameter to list/search operations
- [ ] Return total count with results
- [ ] Support cursor-based pagination for large datasets

**Phase 12 Deliverable**: Rich memory relationships and usage insights

---

### Phase 13: Production Deployment

**Inspiration**: kdub-memory-service's Docker and deployment infrastructure

#### 13.1 Docker Support
- [ ] Multi-stage Dockerfile (development, production)
- [ ] Docker Compose configuration
- [ ] Volume mounts for data persistence
- [ ] Environment variable configuration
- [ ] Health check endpoints

#### 13.2 CLI Commands
Administrative commands beyond MCP:

```bash
vector-memory-mcp serve        # Start MCP server (default)
vector-memory-mcp http         # Start HTTP API server
vector-memory-mcp backup       # Create backup
vector-memory-mcp restore      # Restore from backup
vector-memory-mcp export       # Export to JSON
vector-memory-mcp import       # Import from JSON
vector-memory-mcp consolidate  # Run consolidation
vector-memory-mcp stats        # Show database statistics
```

#### 13.3 Multi-Client Support & Client-Aware Logging
- [ ] Detect client type from environment/transport (Claude Code, Cursor, LM Studio, etc.)
- [ ] Claude Code: strict JSON mode, minimal logging
- [ ] Other clients: verbose logging with configurable levels
- [ ] Client-specific response formatting
- [ ] Document integration with major AI tools

**Phase 13 Deliverable**: Deployable, multi-client memory service

---

### Phase 14: Code Quality & Best Practices

**Inspiration**: kdub-memory-service's mature codebase patterns

These practices should be applied incrementally throughout development, but this phase ensures comprehensive coverage.

#### 14.1 Graceful Degradation
Builds on Phase 5 error handling and Phase 8 hybrid search:

- [ ] Continue operation without optional features
- [ ] ONNX fallback for embeddings (lighter weight)
- [ ] Offline mode for HuggingFace models
- [ ] Partial results with warnings when appropriate

#### 14.2 Custom Exception Hierarchy
```typescript
class MemoryError extends Error { }
class StorageError extends MemoryError { }
class EmbeddingError extends MemoryError { }
class ConsolidationError extends MemoryError { }
class ValidationError extends MemoryError { }
```

#### 14.3 Configuration Validation
- [ ] Validate all config values on load
- [ ] Min/max bounds checking
- [ ] Type validation with runtime checks
- [ ] Sensible defaults for all options
- [ ] Environment variable overrides

#### 14.4 Async Concurrent Operations
- [ ] Parallel embedding generation for batch stores
- [ ] Concurrent database queries (project + global)
- [ ] Non-blocking consolidation
- [ ] Use Promise.all for independent operations

#### 14.5 Cache Performance Optimization
- [ ] Track cache hit/miss statistics
- [ ] Log initialization times
- [ ] Implement cache warming on startup
- [ ] Monitor memory usage

#### 14.6 Comprehensive Documentation
Extends Phase 5 documentation:

- [ ] Architecture documentation with diagrams
- [ ] Development guide
- [ ] Testing guide
- [ ] Integration guides per client (Claude Code, Cursor, etc.)
- [ ] Security documentation

#### 14.7 Comprehensive Test Suite
Extends Phase 5 testing:

- [ ] Unit tests for all modules
- [ ] Integration tests for full workflows
- [ ] Performance tests with benchmarks
- [ ] Concurrent client tests
- [ ] Data serialization consistency tests

#### 14.8 Semantic Versioning & Changelog
- [ ] Implement semantic-release or similar
- [ ] Maintain detailed changelog
- [ ] Version bump automation
- [ ] Release notes generation

**Phase 14 Deliverable**: Production-grade code quality and maintainability

---

### Phase 15: Future Enhancements

Long-term features to consider after core functionality is stable:

1. **Multi-modal memories**: Support image/diagram embeddings (CLIP or similar)
2. **Temporal awareness**: Track how memories evolve over time, show memory history
3. **Cross-project insights**: Find patterns across multiple projects' memories
4. **Memory recommendations**: Proactively suggest memories to store based on conversation
5. **Memory visualization**: Interactive UI to browse and explore memory graph
6. **Collaborative memories**: Share memories across team (with encryption)
7. **mDNS Service Discovery**: Zero-configuration local network discovery
8. **Server-Sent Events**: Real-time memory update notifications for dashboards
9. **Multiple Storage Backends**: Remote storage, cloud sync, hybrid deployment
10. **Internationalization**: Multi-language support for UI and messages

**Note**: Multi-CLI support (Cursor, Windsurf, Gemini CLI) is covered in Phase 13. Alternative embedding models (ONNX) are covered in Phase 14.

---

## Questions & Decisions Log

### Q1: Embedding Model Choice

**Decision**: Start with @huggingface/transformers (Xenova/all-MiniLM-L6-v2, 384d)
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
cd vector-memory-mcp

# Install dependencies
bun install

# Run server
bun run src/index.ts

# Configure Claude Code
# Add to ~/.claude/config.json:
{
  "mcpServers": {
    "memory": {
      "command": "bunx",
      "args": ["vector-memory-mcp"]
    }
  }
}
```

---

## Contact & Support

- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Documentation**: `docs/` directory

---

*Last Updated: 2025-12-05*
*Version: 3.0 (Added kdub-memory-service feature parity roadmap)*