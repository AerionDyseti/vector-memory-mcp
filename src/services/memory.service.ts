import { randomUUID } from "crypto";
import type { Memory } from "../types/memory.js";
import { isDeleted } from "../types/memory.js";
import type { MemoryRepository } from "../db/memory.repository.js";
import type { EmbeddingsService } from "./embeddings.service.js";

export class MemoryService {
  constructor(
    private repository: MemoryRepository,
    private embeddings: EmbeddingsService
  ) { }

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
      usefulness: 0,
      accessCount: 0,
      lastAccessed: null,
    };

    await this.repository.insert(memory);
    return memory;
  }

  async get(id: string): Promise<Memory | null> {
    const memory = await this.repository.findById(id);
    if (!memory) {
      return null;
    }

    // Track access
    const updatedMemory: Memory = {
      ...memory,
      accessCount: memory.accessCount + 1,
      lastAccessed: new Date(),
    };

    // We update asynchronously to avoid blocking read, but we should return the updated state.
    // Spec says "increment whenever a memory is returned as part of search memories tool",
    // and "last_accessed ... retrieval via search memories or get memories".
    // Awaiting here for consistency.
    await this.repository.upsert(updatedMemory);

    return updatedMemory;
  }

  async delete(id: string): Promise<boolean> {
    return await this.repository.markDeleted(id);
  }


  async update(
    id: string,
    updates: {
      content?: string;
      embeddingText?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<Memory | null> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return null;
    }

    const newContent = updates.content ?? existing.content;
    const newMetadata = updates.metadata ?? existing.metadata;

    // Regenerate embedding if content or embeddingText changed
    let newEmbedding = existing.embedding;
    if (updates.content !== undefined || updates.embeddingText !== undefined) {
      const textToEmbed = updates.embeddingText ?? newContent;
      newEmbedding = await this.embeddings.embed(textToEmbed);
    }

    const updatedMemory: Memory = {
      ...existing,
      content: newContent,
      embedding: newEmbedding,
      metadata: newMetadata,
      updatedAt: new Date(),
    };

    await this.repository.upsert(updatedMemory);
    return updatedMemory;
  }

  async vote(id: string, value: number): Promise<Memory | null> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      return null;
    }

    const updatedMemory: Memory = {
      ...existing,
      usefulness: existing.usefulness + value,
      updatedAt: new Date(),
    };

    await this.repository.upsert(updatedMemory);
    return updatedMemory;
  }

  async search(
    query: string,
    limit: number = 10,
    includeDeleted: boolean = false
  ): Promise<Memory[]> {
    const queryEmbedding = await this.embeddings.embed(query);
    const fetchLimit = limit * 3;

    const rows = await this.repository.findSimilar(queryEmbedding, fetchLimit);

    const results: Memory[] = [];

    const trackedResults: Memory[] = [];

    for (const row of rows) {
      const memory = await this.repository.findById(row.id);

      if (!memory) {
        continue;
      }

      if (!includeDeleted && isDeleted(memory)) {
        continue;
      }

      // Track access
      const updatedMemory: Memory = {
        ...memory,
        accessCount: memory.accessCount + 1,
        lastAccessed: new Date(),
      };
      await this.repository.upsert(updatedMemory);

      trackedResults.push(updatedMemory);
      if (trackedResults.length >= limit) {
        break;
      }
    }

    return trackedResults;
  }

  private static readonly UUID_ZERO =
    "00000000-0000-0000-0000-000000000000";

  async storeHandoff(args: {
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
      type: "handoff",
      project: args.project,
      date,
      branch: args.branch ?? "unknown",
      memory_ids: args.memory_ids ?? [],
    };

    const memory: Memory = {
      id: MemoryService.UUID_ZERO,
      content,
      embedding: new Array(this.embeddings.dimension).fill(0),
      metadata,
      createdAt: now,
      updatedAt: now,
      supersededBy: null,
      usefulness: 0,
      accessCount: 0,
      lastAccessed: null,
    };

    await this.repository.upsert(memory);
    return memory;
  }

  async getLatestHandoff(): Promise<Memory | null> {
    return await this.get(MemoryService.UUID_ZERO);
  }
}
