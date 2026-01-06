---
description: Load project context from handoff + git + vector memories (project)
---

Load context for current project using vector-memory-mcp.

## 1. Check Git

```bash
git log --oneline -10 2>/dev/null
git branch --show-current 2>/dev/null
```

## 2. Fetch Handoff

**Try MCP first:**
Call `mcp__vector-memory-project__get_handoff` to retrieve the latest handoff snapshot.

**Fallback (MCP unavailable only):**
If MCP tools fail (connection refused, timeout, tool not found):
1. Check if `handoff.md` exists in the repository root
2. If it exists, read its contents as the handoff
3. Warn: "Using fallback handoff file - MCP unavailable. Check your MCP configuration."

After reading handoff, check for staleness:
```bash
git log --oneline --since="[handoff date]" 2>/dev/null
```

**If commits exist after handoff:** Show them, ask user whether to use handoff or skip it.

**If no handoff exists:** Note it and continue to step 3.

## 3. Search Memories (MCP Only)

If MCP is available, call `mcp__vector-memory-project__search_memories` with:
- query: "[project name] architecture decisions patterns"
- limit: 10

## 4. Load Referenced Memories (MCP Only)

If MCP is available and the handoff includes memory IDs, call `mcp__vector-memory-project__get_memories` with those IDs to retrieve full context.

## 5. Present Context

```markdown
# Context: [Project]
**Dir:** [path] | **Branch:** [branch] | **Handoff:** [date or None]

## Git Activity
[recent commits]

## State
[from handoff summary, completed items, blockers]

## Next Steps
[from handoff next_steps]

## Relevant Memories
[key memories from search + referenced memories, or "N/A - MCP unavailable"]
```

## 6. Synthesize & Continue

Combine handoff document with retrieved memories to establish full context. Then:

1. Briefly acknowledge what was loaded (handoff date + number of memories retrieved)
2. Confirm current status and next steps from handoff
3. Ask: "Ready to continue with [next step], or is there a different direction?"

**No handoff / no memories:** Just note it and ask what we're working on.
