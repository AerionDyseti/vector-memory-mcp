import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const storeMemoriesTool: Tool = {
  name: "store_memories",
  description:
    "Build persistent memory across conversations. Store decisions, solutions, user preferences, " +
    "patterns, or anything worth remembering. Batch related items in one call. " +
    "For long content (>1000 chars), provide embedding_text with a searchable summary.",
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
  description:
    "Update existing memories in place. Use to correct content, refine embedding text, or replace metadata " +
    "without changing the memory ID. Prefer over delete+create when updating the same conceptual item.",
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
  description:
    "Search stored memories semantically. Use PROACTIVELY—don't wait to be asked. " +
    "Triggers: references to past decisions ('what did we decide', 'as discussed'), " +
    "questions about prior work, returning to a project, debugging something potentially solved before, " +
    "or questions about established patterns/preferences. " +
    "When uncertain, search—missing relevant memories is costlier than an extra query.",
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

export const storeHandoffTool: Tool = {
  name: "store_handoff",
  description:
    "Capture structured project state for handoff: summary, completed work, blockers, key decisions, next steps. " +
    "Retrievable via get_handoff.",
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
  storeHandoffTool,
  getHandoffTool,
];
