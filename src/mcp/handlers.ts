import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { MemoryService } from "../services/memory.service.js";

export async function handleStoreMemories(
  args: Record<string, unknown> | undefined,
  service: MemoryService
): Promise<CallToolResult> {
  const memories = args?.memories as Array<{
    content: string;
    embedding_text?: string;
    metadata?: Record<string, unknown>;
  }>;

  const ids: string[] = [];
  for (const item of memories) {
    const memory = await service.store(
      item.content,
      item.metadata ?? {},
      item.embedding_text
    );
    ids.push(memory.id);
  }

  return {
    content: [
      {
        type: "text",
        text:
          ids.length === 1
            ? `Memory stored with ID: ${ids[0]}`
            : `Stored ${ids.length} memories:\n${ids.map((id) => `- ${id}`).join("\n")}`,
      },
    ],
  };
}

export async function handleDeleteMemories(
  args: Record<string, unknown> | undefined,
  service: MemoryService
): Promise<CallToolResult> {
  const ids = args?.ids as string[];
  const results: string[] = [];

  for (const id of ids) {
    const success = await service.delete(id);
    results.push(
      success ? `Memory ${id} deleted successfully` : `Memory ${id} not found`
    );
  }

  return {
    content: [
      {
        type: "text",
        text: results.join("\n"),
      },
    ],
  };
}


export async function handleUpdateMemories(
  args: Record<string, unknown> | undefined,
  service: MemoryService
): Promise<CallToolResult> {
  const updates = args?.updates as Array<{
    id: string;
    content?: string;
    embedding_text?: string;
    metadata?: Record<string, unknown>;
  }>;

  const results: string[] = [];

  for (const update of updates) {
    const memory = await service.update(update.id, {
      content: update.content,
      embeddingText: update.embedding_text,
      metadata: update.metadata,
    });

    if (memory) {
      results.push(`Memory ${update.id} updated successfully`);
    } else {
      results.push(`Memory ${update.id} not found`);
    }
  }

  return {
    content: [
      {
        type: "text",
        text: results.join("\n"),
      },
    ],
  };
}

export async function handleSearchMemories(
  args: Record<string, unknown> | undefined,
  service: MemoryService
): Promise<CallToolResult> {
  const query = args?.query as string;
  const limit = (args?.limit as number) ?? 10;
  const includeDeleted = (args?.include_deleted as boolean) ?? false;
  const memories = await service.search(query, limit, includeDeleted);

  if (memories.length === 0) {
    return {
      content: [{ type: "text", text: "No memories found matching your query." }],
    };
  }

  const results = memories.map((mem) => {
    let result = `ID: ${mem.id}\nContent: ${mem.content}`;
    if (Object.keys(mem.metadata).length > 0) {
      result += `\nMetadata: ${JSON.stringify(mem.metadata)}`;
    }
    if (includeDeleted && mem.supersededBy) {
      result += `\n[DELETED]`;
    }
    return result;
  });

  return {
    content: [{ type: "text", text: results.join("\n\n---\n\n") }],
  };
}

export async function handleGetMemories(
  args: Record<string, unknown> | undefined,
  service: MemoryService
): Promise<CallToolResult> {
  const ids = args?.ids as string[];

  const format = (
    memoryId: string,
    memory: Awaited<ReturnType<MemoryService["get"]>>
  ) => {
    if (!memory) {
      return `Memory ${memoryId} not found`;
    }

    let result = `ID: ${memory.id}\nContent: ${memory.content}`;
    if (Object.keys(memory.metadata).length > 0) {
      result += `\nMetadata: ${JSON.stringify(memory.metadata)}`;
    }
    result += `\nCreated: ${memory.createdAt.toISOString()}`;
    result += `\nUpdated: ${memory.updatedAt.toISOString()}`;
    if (memory.supersededBy) {
      result += `\nSuperseded by: ${memory.supersededBy}`;
    }
    return result;
  };

  const blocks: string[] = [];
  for (const id of ids) {
    const memory = await service.get(id);
    blocks.push(format(id, memory));
  }

  return {
    content: [{ type: "text", text: blocks.join("\n\n---\n\n") }],
  };
}

export async function handleReportMemoryUsefulness(
  args: Record<string, unknown> | undefined,
  service: MemoryService
): Promise<CallToolResult> {
  const memoryId = args?.memory_id as string;
  const useful = args?.useful as boolean;

  const memory = await service.vote(memoryId, useful ? 1 : -1);

  if (!memory) {
    return {
      content: [{ type: "text", text: `Memory ${memoryId} not found` }],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `Memory ${memoryId} marked as ${useful ? "useful" : "not useful"}. New usefulness score: ${memory.usefulness}`,
      },
    ],
  };
}

export async function handleStoreHandoff(
  args: Record<string, unknown> | undefined,
  service: MemoryService
): Promise<CallToolResult> {
  const memory = await service.storeHandoff({
    project: args?.project as string,
    branch: args?.branch as string | undefined,
    summary: args?.summary as string,
    completed: (args?.completed as string[] | undefined) ?? [],
    in_progress_blocked: (args?.in_progress_blocked as string[] | undefined) ?? [],
    key_decisions: (args?.key_decisions as string[] | undefined) ?? [],
    next_steps: (args?.next_steps as string[] | undefined) ?? [],
    memory_ids: (args?.memory_ids as string[] | undefined) ?? [],
    metadata: (args?.metadata as Record<string, unknown>) ?? {},
  });

  return {
    content: [{ type: "text", text: `Handoff stored with memory ID: ${memory.id}` }],
  };
}

export async function handleGetHandoff(
  _args: Record<string, unknown> | undefined,
  service: MemoryService
): Promise<CallToolResult> {
  const handoff = await service.getLatestHandoff();

  if (!handoff) {
    return {
      content: [{ type: "text", text: "No stored handoff found." }],
    };
  }

  // Fetch referenced memories if any
  const memoryIds = (handoff.metadata.memory_ids as string[] | undefined) ?? [];
  let memoriesSection = "";

  if (memoryIds.length > 0) {
    const memories: string[] = [];
    for (const id of memoryIds) {
      const memory = await service.get(id);
      if (memory) {
        memories.push(`### Memory: ${id}\n${memory.content}`);
      }
    }
    if (memories.length > 0) {
      memoriesSection = `\n\n## Referenced Memories\n\n${memories.join("\n\n")}`;
    }
  }

  return {
    content: [{ type: "text", text: handoff.content + memoriesSection }],
  };
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown> | undefined,
  service: MemoryService
): Promise<CallToolResult> {
  switch (name) {
    case "store_memories":
      return handleStoreMemories(args, service);
    case "update_memories":
      return handleUpdateMemories(args, service);
    case "delete_memories":
      return handleDeleteMemories(args, service);
    case "search_memories":
      return handleSearchMemories(args, service);
    case "get_memories":
      return handleGetMemories(args, service);
    case "report_memory_usefulness":
      return handleReportMemoryUsefulness(args, service);
    case "store_handoff":
      return handleStoreHandoff(args, service);
    case "get_handoff":
      return handleGetHandoff(args, service);
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}
