---
description: Save session to vector memory + project handoff file
---

Create focused vector memories and a handoff report in `[project]/.claude/handoffs/`.

## 1. Extract Memories

Review session. For each significant item, create a memory (<1000 chars, self-contained).

**Memory Rules:** 1 concept per memory, 1-3 sentences (20-75 words ideal, 100 max). Natural language, self-contained with context. Specify subjects explicitly. Include temporal info. Be concrete, not vague.

**Extract:** People/roles, technical preferences, decisions/rationale, problems/solutions, domain knowledge, architectural patterns.

**Skip:** Pleasantries, ephemeral states, likely duplicates, unattributed opinions.

| Type | Content |
|------|---------|
| `decision` | What was decided + why + alternatives rejected |
| `implementation` | What was built + key files + patterns used |
| `insight` | Learning + why it matters |
| `blocker` | What failed + resolution (or still blocked) |
| `next-step` | Concrete TODO + approach |
| `context` | Project background + constraints |

**Examples:**
- ✓ "Aerion chose Bun over Node for claude-settings CLI because of built-in TypeScript support and faster startup times."
- ✓ "As of Nov 2024, the ccfg CLI uses 3-way merge for detecting local changes vs repo changes."
- ✗ "He added features" (no subject)
- ✗ "Uses TS and SQLite" (telegraphic, multiple facts)

## 2. Store Each Memory

```
mcp__vector-memory__store_memory
  content: [<1000 chars, specific, includes "why"]
  metadata: {"type": "...", "project": "[name]", "date": "YYYY-MM-DD", "topics": "keyword1, keyword2"}
```

One concept per memory. Use exact names/paths. Skip vague content.

## 3. Write Handoff

Create `[project]/.claude/handoffs/YYYY-MM-DD-HHmm.md`:

```markdown
# Handoff - [Project]
**Date:** YYYY-MM-DD HH:mm | **Branch:** [branch]

## Summary
[2-3 sentences: primary goal, current status]

## Completed
- [items with file paths where relevant]

## In Progress
- [items with current state]

## Key Decisions
- [architectural/design decisions made and why]

## Insights & Patterns
- [technical discoveries, patterns identified, gotchas found]

## Blocked
- [items with blockers noted]

## Next Steps
- [concrete actions to take]

## Working Context
- Key files: [paths]
- Conventions: [naming, patterns]
- Commands: [useful commands for this project]

## Memory IDs
[list IDs from store calls]
```

## 4. Report

Tell user: memories stored (count by type), handoff path.

Instruct: "Run `/clear`, then `/startup` to resume."

Wait for user review before finalizing.
