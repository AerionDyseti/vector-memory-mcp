import { randomUUID } from "crypto";
import type { Memory } from "../types/memory.js";
import { DELETED_TOMBSTONE, isSuperseded } from "../types/memory.js";
import type { MemoryRepository } from "../db/memory.repository.js";
import type { EmbeddingsService } from "./embeddings.service.js";

export class MemoryService {
  constructor(
    private repository: MemoryRepository,
    private embeddings: EmbeddingsService
  ) {}

  async store(
    content: string,
    metadata: Record<string, unknown> = {},
    embeddingText?: string
  ): Promise<Memory> {
    const id = randomUUID();
    const now = new Date();
    const textToEmbed = embeddingText ?? content;
    const embedding = await this.embeddings.embed(textToEmbed);

    const memory: Memory = {
      id,
      content,
      embedding,
      metadata,
      createdAt: now,
      updatedAt: now,
      supersededBy: null,
    };

    await this.repository.insert(memory);
    return memory;
  }

  async get(id: string): Promise<Memory | null> {
    return await this.repository.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    return await this.repository.markDeleted(id);
  }

  async search(query: string, limit: number = 10): Promise<Memory[]> {
    const queryEmbedding = await this.embeddings.embed(query);
    const fetchLimit = limit * 3;

    const rows = await this.repository.findSimilar(queryEmbedding, fetchLimit);

    const results: Memory[] = [];
    const seenIds = new Set<string>();

    for (const row of rows) {
      let memory = await this.repository.findById(row.id);

      if (!memory) {
        continue;
      }

      if (isSuperseded(memory)) {
        memory = await this.followSupersessionChain(row.id);
        if (!memory) {
          continue;
        }
      }

      if (seenIds.has(memory.id)) {
        continue;
      }
      seenIds.add(memory.id);

      results.push(memory);
      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }

  private static readonly UUID_ZERO =
    "00000000-0000-0000-0000-000000000000";

  async storeContext(args: {
    project: string;
    branch?: string;
    summary: string;
    completed?: string[];
    in_progress_blocked?: string[];
    key_decisions?: string[];
    next_steps?: string[];
    memory_ids?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<Memory> {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toISOString().slice(11, 16);

    const list = (items: string[] | undefined) => {
      if (!items || items.length === 0) {
        return "- (none)";
      }
      return items.map((i) => `- ${i}`).join("\n");
    };

    const content = `# Handoff - ${args.project}
**Date:** ${date} ${time} | **Branch:** ${args.branch ?? "unknown"}

## Summary
${args.summary}

## Completed
${list(args.completed)}

## In Progress / Blocked
${list(args.in_progress_blocked)}

## Key Decisions
${list(args.key_decisions)}

## Next Steps
${list(args.next_steps)}

## Memory IDs
${list(args.memory_ids)}`;

    const metadata: Record<string, unknown> = {
      ...(args.metadata ?? {}),
      type: "context",
      project: args.project,
      date,
      branch: args.branch ?? "unknown",
    };

    const memory: Memory = {
      id: MemoryService.UUID_ZERO,
      content,
      embedding: new Array(this.embeddings.dimension).fill(0),
      metadata,
      createdAt: now,
      updatedAt: now,
      supersededBy: null,
    };

    await this.repository.upsert(memory);
    return memory;
  }

  async getLatestContext(): Promise<Memory | null> {
    return await this.get(MemoryService.UUID_ZERO);
  }

  private async followSupersessionChain(memoryId: string): Promise<Memory | null> {
    const visited = new Set<string>();
    let currentId: string | null = memoryId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const memory = await this.repository.findById(currentId);

      if (!memory) {
        return null;
      }

      if (memory.supersededBy === null) {
        return memory;
      }

      if (memory.supersededBy === DELETED_TOMBSTONE) {
        return null;
      }

      currentId = memory.supersededBy;
    }

    return null;
  }
}
