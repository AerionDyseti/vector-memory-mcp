---
description: Load project context from checkpoint + git + vector memories (project)
---

Load context for current project using vector-memory-mcp.

## 1. Check Git

```bash
git log --oneline -10 2>/dev/null
git branch --show-current 2>/dev/null
```

## 2. Fetch Checkpoint

**Try MCP first:**
Call `mcp__vector-memory-project__get_checkpoint` to retrieve the latest checkpoint snapshot.

**Fallback (MCP unavailable only):**
If MCP tools fail (connection refused, timeout, tool not found):
1. Check if `checkpoint.md` exists in the repository root
2. If it exists, read its contents as the checkpoint
3. Warn: "Using fallback checkpoint file - MCP unavailable. Check your MCP configuration."

After reading checkpoint, check for staleness:
```bash
git log --oneline --since="[checkpoint date]" 2>/dev/null
```

**If commits exist after checkpoint:** Show them, ask user whether to use checkpoint or skip it.

**If no checkpoint exists:** Note it and continue to step 3.

## 3. Search Memories (MCP Only)

If MCP is available, call `mcp__vector-memory-project__search_memories` with:
- query: "[project name] architecture decisions patterns"
- limit: 10

## 4. Load Referenced Memories (MCP Only)

If MCP is available and the checkpoint includes memory IDs, call `mcp__vector-memory-project__get_memories` with those IDs to retrieve full context.

## 5. Present Context

```markdown
# Context: [Project]
**Dir:** [path] | **Branch:** [branch] | **Checkpoint:** [date or None]

## Git Activity
[recent commits]

## State
[from checkpoint summary, completed items, blockers]

## Next Steps
[from checkpoint next_steps]

## Relevant Memories
[key memories from search + referenced memories, or "N/A - MCP unavailable"]
```

## 6. Synthesize & Continue

Combine checkpoint document with retrieved memories to establish full context. Then:

1. Briefly acknowledge what was loaded (checkpoint date + number of memories retrieved)
2. Confirm current status and next steps from checkpoint
3. Ask: "Ready to continue with [next step], or is there a different direction?"

**No checkpoint / no memories:** Just note it and ask what we're working on.
