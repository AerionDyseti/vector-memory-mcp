---
description: Load project context from handoff + git + vector memories
---

Load context for current project. Handoffs are in `[project]/.claude/handoffs/`.

## 1. Check Git

```bash
git log --oneline -10 2>/dev/null
git branch --show-current 2>/dev/null
```

## 2. Find and Read Latest Handoff

List handoffs sorted by modification time (newest first):
```bash
ls -lt .claude/handoffs/*.md 2>/dev/null
```

**IMPORTANT:** Always use the file with the most recent modification timestamp. Do NOT use older handoffs.

Once identified, **read the full contents** of the most recent handoff file using the Read tool.

After reading, check for staleness:
```bash
git log --oneline --since="[handoff date]" 2>/dev/null
```

**If commits exist after handoff:** Show them, ask user whether to use handoff or skip it.

## 3. Search Memories

```
mcp__vector-memory__search_memories
  query: "[project name]"
  limit: 10
```

## 4. Present Context

```markdown
# Context: [Project]
**Dir:** [path] | **Branch:** [branch] | **Handoff:** [date or None]

## Git Activity
[recent commits]

## State
[from handoff or git]

## Next Steps
[from handoff + memories]

## Relevant Memories
[key memories by type]
```

## 5. Synthesize & Continue

Combine handoff document with retrieved memories to establish full context. Then:

1. Briefly acknowledge what was loaded (handoff date + number of memories retrieved)
2. Confirm current status and next steps from handoff
3. Ask: "Ready to continue with [next step], or is there a different direction?"

**Empty directory / no git / no handoff / no memories:** Just note it and ask what we're building.
