import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const storeMemoriesTool: Tool = {
  name: "store_memories",
  description: `Store memories that persist across conversations. Use after making decisions or learning something worth remembering.

RULES:
- 1 concept per memory, 1-3 sentences (20-75 words)
- Self-contained with explicit subjects (no "it", "this", "the project")
- Include dates/versions when relevant
- Be concrete, not vague

MEMORY TYPES (use as metadata.type):
- decision: what was chosen + why ("Chose libSQL over PostgreSQL for vector support and simpler deployment")
- implementation: what was built + where + patterns used
- insight: learning + why it matters
- blocker: problem encountered + resolution
- next-step: TODO item + suggested approach
- context: background info + constraints

DON'T STORE: machine-specific paths, local env details, ephemeral states, pleasantries

GOOD: "Aerion chose libSQL over PostgreSQL for Resonance (Dec 2024) because of native vector support and simpler deployment."
BAD: "Uses SQLite" (no context, no subject, no reasoning)

For long content (>1000 chars), provide embedding_text with a searchable summary.`,
  inputSchema: {
    type: "object",
    properties: {
      memories: {
        type: "array",
        description: "Memories to store.",
        items: {
          type: "object",
          properties: {
            content: {
              type: "string",
              description: "The content to store.",
            },
            embedding_text: {
              type: "string",
              description:
                "Summary for search embedding (required if content >1000 chars).",
            },
            metadata: {
              type: "object",
              description: "Optional key-value metadata.",
              additionalProperties: true,
            },
          },
          required: ["content"],
        },
      },
    },
    required: ["memories"],
  },
};;

export const deleteMemoriesTool: Tool = {
  name: "delete_memories",
  description:
    "Remove memories that are no longer needed—outdated info, superseded decisions, or incorrect content. " +
    "Deleted memories can be recovered via search_memories with include_deleted: true.",
  inputSchema: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        description: "IDs of memories to delete.",
        items: {
          type: "string",
        },
      },
    },
    required: ["ids"],
  },
};;


const updateMemoriesTool: Tool = {
  name: "update_memories",
  description: `Update existing memories in place. Prefer over delete+create when updating the same conceptual item.

BEHAVIOR:
- Fields omitted/null: left untouched
- Fields provided: completely overwrite existing value (no merge)

Use to correct content, refine embedding text, or replace metadata without changing the memory ID.`,
  inputSchema: {
    type: "object",
    properties: {
      updates: {
        type: "array",
        description: "Updates to apply. Each must include id and at least one field to change.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "ID of memory to update.",
            },
            content: {
              type: "string",
              description: "New content (triggers embedding regeneration).",
            },
            embedding_text: {
              type: "string",
              description: "New embedding summary (triggers embedding regeneration).",
            },
            metadata: {
              type: "object",
              description: "New metadata (replaces existing entirely).",
              additionalProperties: true,
            },
          },
          required: ["id"],
        },
      },
    },
    required: ["updates"],
  },
};

export const searchMemoriesTool: Tool = {
  name: "search_memories",
  description: `Search stored memories semantically. Use PROACTIVELY—don't wait to be asked.

WHEN TO SEARCH:
- At conversation start / returning to a project
- Before making decisions (check for prior decisions on same topic)
- When user references past work ("what did we decide", "as discussed", "remember when")
- Before suggesting solutions (check if problem was solved before)
- When debugging (check for prior blockers/resolutions)
- When uncertain about patterns or preferences

When in doubt, search. Missing relevant context is costlier than an extra query.

QUERY TIPS:
- Include project name, technical terms, or domain keywords
- Search for concepts, not exact phrases
- Try multiple queries if first doesn't return useful results`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Natural language search query. Include relevant keywords, project names, or technical terms.",
      },
      limit: {
        type: "integer",
        description: "Maximum results to return (default: 10).",
        default: 10,
      },
      include_deleted: {
        type: "boolean",
        description: "Include soft-deleted memories in results (default: false). Useful for recovering prior information.",
        default: false,
      },
    },
    required: ["query"],
  },
};

export const getMemoriesTool: Tool = {
  name: "get_memories",
  description:
    "Retrieve full memory details by ID. Use when you have specific IDs from search results or prior references—otherwise use search_memories.",
  inputSchema: {
    type: "object",
    properties: {
      ids: {
        type: "array",
        description: "Memory IDs to retrieve.",
        items: { type: "string" },
      },
    },
    required: ["ids"],
  },
};;

export const reportMemoryUsefulnessTool: Tool = {
  name: "report_memory_usefulness",
  description: "Report whether a memory was useful or not. This helps the system learn which memories are valuable.",
  inputSchema: {
    type: "object",
    properties: {
      memory_id: {
        type: "string",
        description: "ID of the memory to report on.",
      },
      useful: {
        type: "boolean",
        description: "True if the memory was useful, false otherwise.",
      },
    },
    required: ["memory_id", "useful"],
  },
};

export const storeHandoffTool: Tool = {
  name: "store_handoff",
  description: `Save session state for seamless resumption later. Use at end of work sessions or before context switches.

Creates a structured snapshot with:
- summary: 2-3 sentences on goal and current status
- completed: what got done (include file paths)
- in_progress_blocked: work in flight or stuck
- key_decisions: choices made and WHY (crucial for future context)
- next_steps: concrete, actionable items
- memory_ids: link to related memories stored this session

Retrievable via get_handoff. Only one handoff per project—new handoffs overwrite previous.`,
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", description: "Project name." },
      branch: { type: "string", description: "Branch name (optional)." },
      summary: { type: "string", description: "2-3 sentences: primary goal, current status." },
      completed: {
        type: "array",
        items: { type: "string" },
        description: "Completed items (include file paths where relevant).",
      },
      in_progress_blocked: {
        type: "array",
        items: { type: "string" },
        description: "In progress or blocked items.",
      },
      key_decisions: {
        type: "array",
        items: { type: "string" },
        description: "Decisions made and why.",
      },
      next_steps: {
        type: "array",
        items: { type: "string" },
        description: "Concrete next steps.",
      },
      memory_ids: {
        type: "array",
        items: { type: "string" },
        description: "Memory IDs referenced by this handoff.",
      },
      metadata: {
        type: "object",
        description: "Additional metadata.",
        additionalProperties: true,
      },
    },
    required: ["project", "summary"],
  },
};

export const getHandoffTool: Tool = {
  name: "get_handoff",
  description:
    "Load the current project handoff snapshot. Call at conversation start or when resuming a project.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export const tools: Tool[] = [
  storeMemoriesTool,
  updateMemoriesTool,
  deleteMemoriesTool,
  searchMemoriesTool,
  getMemoriesTool,
  reportMemoryUsefulnessTool,
  storeHandoffTool,
  getHandoffTool,
];
