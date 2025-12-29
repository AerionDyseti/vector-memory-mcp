import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const storeMemoryTool: Tool = {
  name: "store_memory",
  description:
    "Store a new memory for later recall. " +
    "PROACTIVELY store memories when: " +
    "(1) Important decisions are made (technical choices, architecture decisions, tradeoffs); " +
    "(2) Problems are solved (bugs fixed, errors resolved - include the solution); " +
    "(3) User preferences or conventions are established; " +
    "(4) Project-specific patterns or configurations are discussed; " +
    "(5) Key information would be valuable in future sessions. " +
    "IMPORTANT: If the content exceeds 1000 characters, you MUST provide an embedding_text " +
    "parameter with a concise summary (under 1000 characters) that captures the key semantic " +
    "meaning for search purposes. The full content will still be stored and returned in search results.",
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description:
          "The text content to store. Write in a way that will be useful when retrieved later - " +
          "include context, reasoning, and outcomes, not just bare facts.",
      },
      embedding_text: {
        type: "string",
        description:
          "A concise summary (under 1000 characters) used for generating the search embedding. " +
          "REQUIRED when content exceeds 1000 characters. Should capture the key topics and terms " +
          "someone might search for to find this memory.",
      },
      metadata: {
        type: "object",
        description:
          "Optional key-value metadata. Recommended keys: 'project' (project name), 'type' (decision/solution/preference/pattern), 'tags' (array of keywords).",
        additionalProperties: true,
      },
    },
    required: ["content"],
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
  description: "Retrieve a specific memory by its ID.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The ID of the memory to retrieve",
      },
    },
    required: ["id"],
  },
};

export const tools: Tool[] = [
  storeMemoryTool,
  deleteMemoryTool,
  searchMemoriesTool,
  getMemoryTool,
];
