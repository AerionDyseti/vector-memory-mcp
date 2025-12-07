# Vector Memory Usage Guidelines

You have access to TWO memory systems with different scopes:

## User-Level Memory: `memory-global`

**Tools:** `mcp__memory-global__*`

**Use for user-level, machine-specific information:**
- Machine-specific configurations and paths
- Local environment details (installed tools, versions, system paths)
- Personal workflow preferences that vary by machine
- Machine-specific development environment setup
- Information that should persist across ALL projects on this machine
- User preferences and patterns

**Examples:**
- "work-laptop has Node 20.x installed, uses pnpm by default"
- "User prefers functional programming patterns"
- "Local PostgreSQL runs on port 5433 instead of 5432"
- "This machine's Claude Code uses deliberate output style"
- "User's preferred testing framework is vitest"

## Project-Level Memory: `vector-memory-project`

**Tools:** `mcp__memory-project__*` (when available in project context)

**Use for project-specific information:**
- Project architecture decisions and design patterns
- Code organization and module structure
- API design choices and conventions
- Team coding standards for this project
- Project-specific build/deployment workflows
- Information that should be available to anyone working on this project

**Examples:**
- "API uses repository pattern with services layer"
- "Authentication implemented using JWT with refresh tokens"
- "Tests organized by feature, not file structure"
- "Project uses Zod for runtime validation"
- "Database migrations managed with Drizzle"

## Decision Framework

```
Is this information specific to THIS machine/user?
    ↓ YES → Use memory-global (user-level)
    ↓ NO → Is it about THIS project's code/architecture?
          ↓ YES → Use memory-project (project-level)
          ↓ NO → Consider if memory is appropriate at all
```

## Important Notes

- **User-level memory** persists across all projects on this machine
- **Project-level memory** is isolated per project (when configured)
- Don't duplicate information between levels
- Project decisions should NEVER go in user-level memory
- Machine/user preferences should NEVER go in project-level memory
