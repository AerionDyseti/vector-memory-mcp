# Codebase Architecture

## Directory Structure
```
vector-memory-mcp/
├── src/
│   ├── index.ts              # Entry point - creates and starts MCP server
│   ├── config/
│   │   └── index.ts          # Configuration (env vars, defaults)
│   ├── db/
│   │   ├── connection.ts     # LanceDB connection management
│   │   ├── schema.ts         # Apache Arrow schema for LanceDB table
│   │   └── memory.repository.ts  # Database operations (CRUD)
│   ├── services/
│   │   ├── embeddings.service.ts  # Embedding generation via transformers
│   │   └── memory.service.ts      # Business logic (store, search, delete)
│   ├── mcp/
│   │   ├── server.ts         # MCP server setup and lifecycle
│   │   ├── tools.ts          # MCP tool definitions (schemas)
│   │   └── handlers.ts       # Tool request handlers
│   └── types/
│       └── memory.ts         # Memory type definition and helpers
├── tests/
│   ├── embeddings.test.ts    # Embedding service tests
│   ├── memory.test.ts        # Memory service tests
│   ├── server.test.ts        # MCP server integration tests
│   └── store.test.ts         # Store operation tests
└── docs/                     # Documentation

## Key Layers

### 1. MCP Layer (`src/mcp/`)
- `server.ts`: Creates MCP server, registers tools, handles lifecycle
- `tools.ts`: Defines tool schemas (name, description, input schema)
- `handlers.ts`: Processes tool calls, delegates to services

### 2. Service Layer (`src/services/`)
- `memory.service.ts`: Core business logic
  - `store()`: Generate embedding, create memory, insert to DB
  - `search()`: Embed query, vector search, follow supersession chains
  - `get()`: Retrieve by ID
  - `delete()`: Mark as deleted (soft delete)
- `embeddings.service.ts`: Lazy-loads transformer model, generates embeddings

### 3. Data Layer (`src/db/`)
- `memory.repository.ts`: Database operations
  - `insert()`: Add memory to LanceDB
  - `findById()`: Get single memory
  - `findSimilar()`: Vector search
  - `markDeleted()`: Set superseded_by to tombstone
- `connection.ts`: LanceDB connection singleton
- `schema.ts`: Apache Arrow schema (vector field is 384-dim Float32)

### 4. Types (`src/types/`)
- `memory.ts`: Memory interface and helper functions

## Data Flow

### Store Memory
```
MCP Tool Call → handlers.handleStoreMemory()
  → MemoryService.store()
    → EmbeddingsService.embed(content)
    → MemoryRepository.insert(memory)
```

### Search Memories
```
MCP Tool Call → handlers.handleSearchMemories()
  → MemoryService.search()
    → EmbeddingsService.embed(query)
    → MemoryRepository.findSimilar()
    → Follow supersession chains
    → Return unique results
```

## Key Design Decisions
1. **Soft deletion**: Memories marked with `superseded_by` field, never hard deleted
2. **Supersession chains**: Old versions can point to new versions
3. **Lazy loading**: Embedding model loaded on first use
4. **Over-fetching**: Search fetches 3x limit to account for deleted items
