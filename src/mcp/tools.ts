import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const storeMemoryTool: Tool = {
  name: "store_memory",
  description:
    "Store one or more memories for later recall. " +
    "IMPORTANT: If content exceeds 1000 characters, you MUST provide an embedding_text " +
    "summary (under 1000 characters) for better search. ",
  inputSchema: {
    type: "object",
    properties: {
      // Single
      content: {
        type: "string",
        description: "The text content to store.",
      },
      embedding_text: {
        type: "string",
        description:
          "Optional summary (under 1000 characters) used for generating the search embedding. " +
          "REQUIRED when content exceeds 1000 characters.",
      },
      metadata: {
        type: "object",
        description: "Optional key-value metadata.",
        additionalProperties: true,
      },

      // Batch
      memories: {
        type: "array",
        description: "Store multiple memories in one call.",
        items: {
          type: "object",
          properties: {
            content: { type: "string" },
            embedding_text: { type: "string" },
            metadata: { type: "object", additionalProperties: true },
          },
          required: ["content"],
        },
      },
    },
    anyOf: [{ required: ["content"] }, { required: ["memories"] }],
  },
};

export const deleteMemoryTool: Tool = {
  name: "delete_memory",
  description:
    "Delete a memory by its ID. The memory will be soft-deleted and won't appear in search results.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the memory to delete",
      },
    },
    required: ["id"],
  },
};

export const searchMemoriesTool: Tool = {
  name: "search_memories",
  description:
    "Search for memories using semantic similarity. Returns the most relevant memories for the given query. " +
    "IMPORTANT: Use this tool PROACTIVELY without being asked when you detect: " +
    "(1) References to past decisions or discussions ('what did we decide', 'as we discussed', 'previously'); " +
    "(2) Questions about prior work ('how did we', 'similar to before', 'like last time'); " +
    "(3) Project continuations or returning to earlier topics; " +
    "(4) Debugging issues that may have been solved before; " +
    "(5) Questions about established patterns, conventions, or preferences. " +
    "When in doubt, search - it's better to check for relevant context than to miss important prior decisions.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "The search query to find relevant memories. Use natural language describing what context you need. " +
          "Include relevant keywords, project names, or technical terms for better results.",
      },
      limit: {
        type: "integer",
        description: "Maximum number of results to return (default: 10)",
        default: 10,
      },
    },
    required: ["query"],
  },
};

export const getMemoryTool: Tool = {
  name: "get_memory",
  description: "Retrieve one or more memories by ID.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the memory to retrieve",
      },
      ids: {
        type: "array",
        description: "Multiple memory IDs to retrieve",
        items: { type: "string" },
      },
    },
    anyOf: [{ required: ["id"] }, { required: ["ids"] }],
  },
};

export const storeContextTool: Tool = {
  name: "store_context",
  description:
    "Store a handoff-style context snapshot (Summary/Completed/In Progress/Key Decisions/Next Steps/Memory IDs). " +
    "Stored under UUID.ZERO so it can be retrieved deterministically without semantic search.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", description: "Project name (e.g. Resonance)." },
      branch: { type: "string", description: "Optional branch name." },
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
        description: "Optional additional metadata merged into the stored context memory.",
        additionalProperties: true,
      },
    },
    required: ["project", "summary"],
  },
};

export const getContextTool: Tool = {
  name: "get_context",
  description:
    "Retrieve the latest stored context snapshot (UUID.ZERO).",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export const tools: Tool[] = [
  storeMemoryTool,
  deleteMemoryTool,
  searchMemoriesTool,
  getMemoryTool,
  storeContextTool,
  getContextTool,
];
