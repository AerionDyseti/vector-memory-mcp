# Claude Code Integration

Optional commands and hooks for [Claude Code](https://claude.ai/code).

**These are not required for vector-memory-mcp to work** - they enhance the Claude Code experience with handoff and memory workflows.

## Installation

Copy the contents to your `.claude/` directory:

```bash
# From your project root
cp -r node_modules/@aeriondyseti/vector-memory-mcp/integrations/claude-code/* .claude/
```

Or manually copy specific commands you want.

## Commands

### `/handoff:get`
Load project context at the start of a session. Retrieves:
- Latest handoff snapshot
- Recent git activity
- Related memories

### `/handoff:store`
Save session context before ending. Stores:
- Session summary and progress
- Key decisions and rationale
- Memories for long-term retrieval

## Hooks

*Coming soon*

## Other Integrations

See the `integrations/` directory for other tool integrations (Copilot, Gemini CLI, etc.).
