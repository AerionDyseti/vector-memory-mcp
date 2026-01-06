# MCP Tool Verification Workflow

Run this systematic procedure to verify all vector-memory-mcp tools are working correctly.

## Steps

### 1. Store a test memory
```
store_memories({ memories: [{ content: "Test memory for verification", metadata: { test: true } }] })
```
Note the returned ID for subsequent steps.

### 2. Search for the memory
```
search_memories({ query: "test memory verification", limit: 5 })
```
Verify the memory appears in results.

### 3. Update the memory
```
update_memories({ updates: [{ id: "<ID>", metadata: { test: true, updated: true } }] })
```
Should return success message.

### 4. Get the updated memory
```
get_memories({ ids: ["<ID>"] })
```
Verify metadata changed and `Updated` timestamp is newer than `Created`.

### 5. Delete the memory
```
delete_memories({ ids: ["<ID>"] })
```
Should return success message.

### 6. Search (should NOT find it)
```
search_memories({ query: "test memory verification", limit: 5 })
```
Deleted memory should NOT appear.

### 7. Search with include_deleted
```
search_memories({ query: "test memory verification", limit: 5, include_deleted: true })
```
Deleted memory SHOULD appear with `[DELETED]` tag.

## Summary

| Step | Tool | Validates |
|------|------|-----------|
| 1 | `store_memories` | Array API, memory creation |
| 2 | `search_memories` | Semantic search |
| 3 | `update_memories` | In-place updates |
| 4 | `get_memories` | ID-based retrieval |
| 5 | `delete_memories` | Soft deletion |
| 6 | `search_memories` | Deleted exclusion |
| 7 | `search_memories` | `include_deleted` param |

Execute each step in order, using the ID from step 1 throughout.
