# Vector Memory MCP Server - Project Overview

## Purpose
A zero-configuration RAG (Retrieval-Augmented Generation) memory server for MCP (Model Context Protocol) clients. It provides semantic memory storage for AI assistants like Claude Code, allowing them to store and retrieve contextually relevant information using local embeddings and vector search.

## Key Features
- **Local-first & Private**: All embeddings generated locally, data stored in local LanceDB
- **Semantic Search**: Vector similarity search with 384-dimensional embeddings
- **MCP Integration**: Works with Claude Code and other MCP-compatible clients
- **Zero Configuration**: Works out of the box with sensible defaults

## Tech Stack
- **Runtime**: Bun 1.0+
- **Language**: TypeScript 5.0+ (strict mode)
- **Module System**: ES Modules (NodeNext)
- **Database**: LanceDB (local vector database)
- **Embeddings**: @huggingface/transformers (Xenova/all-MiniLM-L6-v2, 384 dimensions)
- **MCP SDK**: @modelcontextprotocol/sdk
- **Testing**: Bun test

## MCP Tools Provided
1. `store_memory` - Save information for later recall
2. `search_memories` - Find relevant memories semantically
3. `get_memory` - Retrieve a specific memory by ID
4. `delete_memory` - Soft-delete a memory (marks as superseded)

## Data Storage
- Default path: `~/.local/share/vector-memory-mcp/memories.db`
- Configurable via `VECTOR_MEMORY_DB_PATH` environment variable
- Soft deletion via `superseded_by` field (never hard deletes)

## Repository
- GitHub: https://github.com/AerionDyseti/vector-memory-mcp
- License: MIT
