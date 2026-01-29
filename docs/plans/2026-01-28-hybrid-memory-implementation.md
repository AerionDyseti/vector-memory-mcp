# Hybrid Memory System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade from naive RAG to prosumer memory system with hybrid retrieval, multi-signal scoring, and intent-based weight profiles.

**Architecture:** Four-stage pipeline: Hybrid Retrieval (Vector + FTS with RRF fusion) → Multi-Signal Scoring (intent-weighted relevance/recency/utility) → Score Jitter (controlled randomness) → Results. Search is read-only; access tracked only on explicit utilization.

**Tech Stack:** TypeScript, Bun, LanceDB (with FTS), MCP SDK

**Design Doc:** `docs/plans/2026-01-28-hybrid-memory-system-design.md`

---

## Task 1: Add Types

**Files:**
- Modify: `src/types/memory.ts`

**Step 1: Add SearchIntent and IntentProfile types**

Add at end of `src/types/memory.ts`:

```typescript
export type SearchIntent = 'continuity' | 'fact_check' | 'frequent' | 'associative' | 'explore';

export interface IntentProfile {
  weights: { relevance: number; recency: number; utility: number };
  jitter: number;
}

export interface HybridRow extends Memory {
  rrfScore: number;
}
```

**Step 2: Remove VectorRow interface**

Delete lines 16-19:
```typescript
export interface VectorRow {
  id: string;
  distance: number;
}
```

**Step 3: Run type check**

Run: `bun run --bun tsc --noEmit`
Expected: Errors about `VectorRow` usage in repository (expected, will fix in Task 2)

**Step 4: Commit types**

```bash
git add src/types/memory.ts
git commit -m "feat(types): add SearchIntent, IntentProfile, HybridRow types

Remove VectorRow in preparation for hybrid search.
Temporarily breaks build until repository is updated."
```

---

## Task 2: Update Repository for Hybrid Search

**Files:**
- Modify: `src/db/memory.repository.ts`
- Test: `tests/repository.test.ts` (new file)

**Step 2.1: Write test for FTS index creation**

Create `tests/repository.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import * as lancedb from "@lancedb/lancedb";
import { connectToDatabase } from "../src/db/connection";
import { MemoryRepository } from "../src/db/memory.repository";
import type { Memory } from "../src/types/memory";

describe("MemoryRepository - Hybrid Search", () => {
  let db: lancedb.Connection;
  let repository: MemoryRepository;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "vector-memory-repo-test-"));
    const dbPath = join(tmpDir, "test.lancedb");
    db = await connectToDatabase(dbPath);
    repository = new MemoryRepository(db);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  const createTestMemory = (id: string, content: string, embedding: number[]): Memory => ({
    id,
    content,
    embedding,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    supersededBy: null,
    usefulness: 0,
    accessCount: 0,
    lastAccessed: new Date(),
  });

  test("findHybrid returns results with rrfScore", async () => {
    const embedding = new Array(384).fill(0).map(() => Math.random());
    const memory = createTestMemory("test-1", "TypeScript programming language", embedding);
    await repository.insert(memory);

    const results = await repository.findHybrid(embedding, "TypeScript", 10);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe("test-1");
    expect(results[0].rrfScore).toBeDefined();
    expect(typeof results[0].rrfScore).toBe("number");
  });

  test("findHybrid returns full Memory data", async () => {
    const embedding = new Array(384).fill(0).map(() => Math.random());
    const memory = createTestMemory("test-2", "JavaScript runtime", embedding);
    memory.usefulness = 5;
    memory.accessCount = 10;
    await repository.insert(memory);

    const results = await repository.findHybrid(embedding, "JavaScript", 10);

    expect(results[0].content).toBe("JavaScript runtime");
    expect(results[0].usefulness).toBe(5);
    expect(results[0].accessCount).toBe(10);
    expect(results[0].createdAt).toBeInstanceOf(Date);
  });

  test("findHybrid mutex prevents concurrent index creation", async () => {
    const embedding = new Array(384).fill(0).map(() => Math.random());
    const memory = createTestMemory("test-3", "Concurrent test content", embedding);
    await repository.insert(memory);

    // Fire multiple concurrent searches - should not throw
    const promises = [
      repository.findHybrid(embedding, "concurrent", 10),
      repository.findHybrid(embedding, "test", 10),
      repository.findHybrid(embedding, "content", 10),
    ];

    const results = await Promise.all(promises);
    expect(results.every(r => Array.isArray(r))).toBe(true);
  });
});
```

**Step 2.2: Run test to verify it fails**

Run: `bun test tests/repository.test.ts`
Expected: FAIL - `findHybrid` does not exist

**Step 2.3: Implement findHybrid with FTS index mutex**

Replace `findSimilar` method and add FTS index management in `src/db/memory.repository.ts`:

```typescript
import * as lancedb from "@lancedb/lancedb";
import { Index, Table } from "@lancedb/lancedb";
import { RRFReranker } from "@lancedb/lancedb/rerankers";
import { TABLE_NAME, memorySchema } from "./schema.js";
import {
  type Memory,
  type HybridRow,
  DELETED_TOMBSTONE,
} from "../types/memory.js";

export class MemoryRepository {
  private ftsIndexPromise: Promise<void> | null = null;

  constructor(private db: lancedb.Connection) { }

  private async getTable() {
    const names = await this.db.tableNames();
    if (names.includes(TABLE_NAME)) {
      return await this.db.openTable(TABLE_NAME);
    }
    return await this.db.createTable(TABLE_NAME, [], { schema: memorySchema });
  }

  private async ensureFtsIndex(table: Table): Promise<void> {
    if (this.ftsIndexPromise) {
      return this.ftsIndexPromise;
    }

    this.ftsIndexPromise = this.createFtsIndexIfNeeded(table);
    return this.ftsIndexPromise;
  }

  private async createFtsIndexIfNeeded(table: Table): Promise<void> {
    try {
      const indices = await table.listIndices();
      const hasFtsIndex = indices.some(
        (idx) => idx.columns.includes("content") && idx.indexType === "FTS"
      );

      if (!hasFtsIndex) {
        await table.createIndex("content", { config: Index.fts() });
      }
    } catch (error) {
      // Reset promise on failure so next call retries
      this.ftsIndexPromise = null;
      throw error;
    }
  }

  private rowToMemory(row: Record<string, unknown>): Memory {
    const vectorData = row.vector as unknown;
    const embedding = Array.isArray(vectorData)
      ? vectorData
      : Array.from(vectorData as Iterable<number>) as number[];

    return {
      id: row.id as string,
      content: row.content as string,
      embedding,
      metadata: JSON.parse(row.metadata as string),
      createdAt: new Date(row.created_at as number),
      updatedAt: new Date(row.updated_at as number),
      supersededBy: row.superseded_by as string | null,
      usefulness: (row.usefulness as number) ?? 0,
      accessCount: (row.access_count as number) ?? 0,
      lastAccessed: row.last_accessed
        ? new Date(row.last_accessed as number)
        : null,
    };
  }

  async findHybrid(
    embedding: number[],
    query: string,
    limit: number
  ): Promise<HybridRow[]> {
    const table = await this.getTable();
    await this.ensureFtsIndex(table);

    const reranker = new RRFReranker({ k: 60 });

    const results = await table
      .query()
      .fullTextSearch(query)
      .nearestTo(embedding)
      .rerank(reranker)
      .limit(limit)
      .toArray();

    return results.map((row) => ({
      ...this.rowToMemory(row),
      rrfScore: (row._relevance_score as number) ?? 0,
    }));
  }

  // ... rest of existing methods (insert, upsert, findById, markDeleted)
  // Update findById to use rowToMemory helper
```

Also update `findById` to use the `rowToMemory` helper:

```typescript
  async findById(id: string): Promise<Memory | null> {
    const table = await this.getTable();
    const results = await table.query().where(`id = '${id}'`).limit(1).toArray();

    if (results.length === 0) {
      return null;
    }

    return this.rowToMemory(results[0]);
  }
```

Remove the old `findSimilar` method entirely.

**Step 2.4: Run test to verify it passes**

Run: `bun test tests/repository.test.ts`
Expected: PASS

**Step 2.5: Run full test suite**

Run: `bun test`
Expected: Some failures in existing tests that use `findSimilar` (will fix in Task 3)

**Step 2.6: Commit repository changes**

```bash
git add src/db/memory.repository.ts tests/repository.test.ts
git commit -m "feat(repository): implement hybrid search with RRF fusion

- Add findHybrid() with vector + FTS search
- Use LanceDB RRFReranker with k=60
- Add mutex for FTS index creation
- Extract rowToMemory helper
- Remove findSimilar (replaced by findHybrid)"
```

---

## Task 3: Update MemoryService Scoring Pipeline

**Files:**
- Modify: `src/services/memory.service.ts`
- Modify: `tests/scoring.test.ts`

**Step 3.1: Update scoring tests for new signature and read-only search**

Replace `tests/scoring.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import * as lancedb from "@lancedb/lancedb";
import { connectToDatabase } from "../src/db/connection";
import { MemoryRepository } from "../src/db/memory.repository";
import { EmbeddingsService } from "../src/services/embeddings.service";
import { MemoryService } from "../src/services/memory.service";

describe("MemoryService - Scoring with Intents", () => {
  let db: lancedb.Connection;
  let repository: MemoryRepository;
  let embeddings: EmbeddingsService;
  let service: MemoryService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "vector-memory-mcp-test-scoring-"));
    const dbPath = join(tmpDir, "test.lancedb");
    db = await connectToDatabase(dbPath);
    repository = new MemoryRepository(db);
    embeddings = new EmbeddingsService("Xenova/all-MiniLM-L6-v2", 384);
    service = new MemoryService(repository, embeddings);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  test("search requires intent parameter", async () => {
    await service.store("test content");

    // Should work with intent
    const results = await service.search("test", "fact_check");
    expect(Array.isArray(results)).toBe(true);
  });

  test("continuity intent favors recent memories", async () => {
    const memoryOld = await service.store("project status update");
    const memoryNew = await service.store("project status update");

    // Age memoryOld by 100 hours
    const oldDate = new Date(Date.now() - 100 * 60 * 60 * 1000);
    const oldMem = await repository.findById(memoryOld.id);
    if (oldMem) {
      await repository.upsert({ ...oldMem, lastAccessed: oldDate });
    }

    // continuity favors recency (0.5 weight)
    const results = await service.search("project status", "continuity");
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].id).toBe(memoryNew.id);
  });

  test("frequent intent favors high-utility memories", async () => {
    const memNormal = await service.store("coding patterns");
    const memFrequent = await service.store("coding patterns");

    // Boost memFrequent utility
    await service.vote(memFrequent.id, 5);

    // frequent favors utility (0.6 weight)
    const results = await service.search("coding", "frequent");
    expect(results[0].id).toBe(memFrequent.id);
  });

  test("fact_check intent favors relevance", async () => {
    const memExact = await service.store("TypeScript compiler options");
    const memSimilar = await service.store("JavaScript build tools");

    // Boost memSimilar utility significantly
    await service.vote(memSimilar.id, 10);

    // fact_check favors relevance (0.6 weight) - exact match should still win
    const results = await service.search("TypeScript compiler", "fact_check");
    expect(results[0].id).toBe(memExact.id);
  });

  test("explore intent has high jitter (results may vary)", async () => {
    // Store multiple similar memories
    for (let i = 0; i < 5; i++) {
      await service.store(`memory item ${i} about testing`);
    }

    // Run multiple searches - with 15% jitter, order should sometimes differ
    const results1 = await service.search("testing", "explore", 5);
    const results2 = await service.search("testing", "explore", 5);

    // Both should return results
    expect(results1.length).toBe(5);
    expect(results2.length).toBe(5);

    // Note: Can't reliably test randomness, just verify it doesn't crash
  });

  test("search is read-only (does not update access stats)", async () => {
    const memory = await service.store("read only test");
    const initialAccess = memory.accessCount;

    // Search multiple times
    await service.search("read only", "fact_check");
    await service.search("read only", "fact_check");

    // Check via repository (bypasses service tracking)
    const afterSearch = await repository.findById(memory.id);
    expect(afterSearch!.accessCount).toBe(initialAccess);
  });
});
```

**Step 3.2: Run tests to verify they fail**

Run: `bun test tests/scoring.test.ts`
Expected: FAIL - search signature changed

**Step 3.3: Update MemoryService with new scoring pipeline**

Replace the search method and add supporting code in `src/services/memory.service.ts`:

```typescript
import { randomUUID } from "crypto";
import type { Memory, SearchIntent, IntentProfile } from "../types/memory.js";
import { isDeleted } from "../types/memory.js";
import type { MemoryRepository } from "../db/memory.repository.js";
import type { EmbeddingsService } from "./embeddings.service.js";

const INTENT_PROFILES: Record<SearchIntent, IntentProfile> = {
  continuity: { weights: { relevance: 0.3, recency: 0.5, utility: 0.2 }, jitter: 0.02 },
  fact_check: { weights: { relevance: 0.6, recency: 0.1, utility: 0.3 }, jitter: 0.02 },
  frequent: { weights: { relevance: 0.2, recency: 0.2, utility: 0.6 }, jitter: 0.02 },
  associative: { weights: { relevance: 0.7, recency: 0.1, utility: 0.2 }, jitter: 0.05 },
  explore: { weights: { relevance: 0.4, recency: 0.3, utility: 0.3 }, jitter: 0.15 },
};

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

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
      lastAccessed: now, // Initialize to createdAt for fair discovery
    };

    await this.repository.insert(memory);
    return memory;
  }

  async get(id: string): Promise<Memory | null> {
    const memory = await this.repository.findById(id);
    if (!memory) {
      return null;
    }

    // Track access on explicit get
    const updatedMemory: Memory = {
      ...memory,
      accessCount: memory.accessCount + 1,
      lastAccessed: new Date(),
    };

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

    // Vote also tracks access (explicit utilization signal)
    const updatedMemory: Memory = {
      ...existing,
      usefulness: existing.usefulness + value,
      accessCount: existing.accessCount + 1,
      lastAccessed: new Date(),
      updatedAt: new Date(),
    };

    await this.repository.upsert(updatedMemory);
    return updatedMemory;
  }

  async search(
    query: string,
    intent: SearchIntent,
    limit: number = 10,
    includeDeleted: boolean = false
  ): Promise<Memory[]> {
    const queryEmbedding = await this.embeddings.embed(query);
    const fetchLimit = limit * 5; // Fetch more for re-ranking

    const candidates = await this.repository.findHybrid(queryEmbedding, query, fetchLimit);
    const profile = INTENT_PROFILES[intent];
    const now = new Date();

    const scored = candidates
      .filter((m) => includeDeleted || !isDeleted(m))
      .map((candidate) => {
        // Relevance: RRF score (already normalized ~0-1)
        const relevance = candidate.rrfScore;

        // Recency: exponential decay
        const lastAccessed = candidate.lastAccessed ?? candidate.createdAt;
        const hoursSinceAccess = Math.max(0, (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60));
        const recency = Math.pow(0.995, hoursSinceAccess);

        // Utility: sigmoid of usefulness + log(accessCount)
        const utility = sigmoid((candidate.usefulness + Math.log(candidate.accessCount + 1)) / 5);

        // Weighted score
        const { weights, jitter } = profile;
        const score =
          weights.relevance * relevance +
          weights.recency * recency +
          weights.utility * utility;

        // Apply jitter
        const finalScore = score * (1 + (Math.random() * 2 - 1) * jitter);

        return { memory: candidate as Memory, finalScore };
      });

    // Sort by final score descending
    scored.sort((a, b) => b.finalScore - a.finalScore);

    // Return top N (read-only - no access tracking)
    return scored.slice(0, limit).map((s) => s.memory);
  }

  async trackAccess(ids: string[]): Promise<void> {
    const now = new Date();
    for (const id of ids) {
      const memory = await this.repository.findById(id);
      if (memory && !isDeleted(memory)) {
        await this.repository.upsert({
          ...memory,
          accessCount: memory.accessCount + 1,
          lastAccessed: now,
        });
      }
    }
  }

  // ... storeHandoff and getLatestHandoff methods remain the same
  // But update storeHandoff to call trackAccess
```

Update `storeHandoff` to track access:

```typescript
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
    // Track access for utilized memories
    if (args.memory_ids && args.memory_ids.length > 0) {
      await this.trackAccess(args.memory_ids);
    }

    // ... rest of existing storeHandoff implementation
```

**Step 3.4: Run scoring tests**

Run: `bun test tests/scoring.test.ts`
Expected: PASS

**Step 3.5: Commit service changes**

```bash
git add src/services/memory.service.ts tests/scoring.test.ts
git commit -m "feat(service): implement multi-signal scoring with intents

- Add intent-based weight profiles (continuity, fact_check, frequent, associative, explore)
- Implement scoring: relevance (RRF) + recency (decay) + utility (sigmoid)
- Add score jitter for noise-robust RAG
- Make search read-only (no access inflation)
- Initialize lastAccessed to createdAt for fair discovery
- Add trackAccess for explicit utilization signals"
```

---

## Task 4: Update Access Tracking Tests

**Files:**
- Modify: `tests/access_tracking.test.ts`

**Step 4.1: Update access tracking tests for read-only search**

Update `tests/access_tracking.test.ts` to reflect that search no longer tracks access:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import * as lancedb from "@lancedb/lancedb";
import { connectToDatabase } from "../src/db/connection";
import { MemoryRepository } from "../src/db/memory.repository";
import { EmbeddingsService } from "../src/services/embeddings.service";
import { MemoryService } from "../src/services/memory.service";

describe("MemoryService - Access Tracking", () => {
  let db: lancedb.Connection;
  let repository: MemoryRepository;
  let embeddings: EmbeddingsService;
  let service: MemoryService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "vector-memory-mcp-test-access-"));
    const dbPath = join(tmpDir, "test.lancedb");
    db = await connectToDatabase(dbPath);
    repository = new MemoryRepository(db);
    embeddings = new EmbeddingsService("Xenova/all-MiniLM-L6-v2", 384);
    service = new MemoryService(repository, embeddings);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true });
  });

  test("initial accessCount is 0, lastAccessed equals createdAt", async () => {
    const memory = await service.store("test content");
    expect(memory.accessCount).toBe(0);
    expect(memory.lastAccessed).not.toBeNull();
    expect(memory.lastAccessed!.getTime()).toBe(memory.createdAt.getTime());
  });

  test("get increments accessCount and updates lastAccessed", async () => {
    const memory = await service.store("test content");

    await new Promise((r) => setTimeout(r, 10));
    const retrieved1 = await service.get(memory.id);

    expect(retrieved1!.accessCount).toBe(1);
    expect(retrieved1!.lastAccessed!.getTime()).toBeGreaterThan(memory.createdAt.getTime());

    await new Promise((r) => setTimeout(r, 10));
    const retrieved2 = await service.get(memory.id);

    expect(retrieved2!.accessCount).toBe(2);
    expect(retrieved2!.lastAccessed!.getTime()).toBeGreaterThan(retrieved1!.lastAccessed!.getTime());
  });

  test("search does NOT increment accessCount (read-only)", async () => {
    const memory = await service.store("Python programming");

    await service.search("coding", "fact_check");
    await service.search("coding", "fact_check");

    // Check via repository to avoid service.get side effects
    const direct = await repository.findById(memory.id);
    expect(direct!.accessCount).toBe(0);
  });

  test("vote increments accessCount and updates lastAccessed", async () => {
    const memory = await service.store("useful content");

    await new Promise((r) => setTimeout(r, 10));
    await service.vote(memory.id, 1);

    const after = await repository.findById(memory.id);
    expect(after!.accessCount).toBe(1);
    expect(after!.lastAccessed!.getTime()).toBeGreaterThan(memory.createdAt.getTime());
  });

  test("trackAccess updates multiple memories", async () => {
    const mem1 = await service.store("memory one");
    const mem2 = await service.store("memory two");

    await new Promise((r) => setTimeout(r, 10));
    await service.trackAccess([mem1.id, mem2.id]);

    const after1 = await repository.findById(mem1.id);
    const after2 = await repository.findById(mem2.id);

    expect(after1!.accessCount).toBe(1);
    expect(after2!.accessCount).toBe(1);
  });

  test("storeHandoff tracks access for memory_ids", async () => {
    const mem1 = await service.store("decision about API design");
    const mem2 = await service.store("architecture notes");

    await new Promise((r) => setTimeout(r, 10));
    await service.storeHandoff({
      project: "test-project",
      summary: "Test handoff",
      memory_ids: [mem1.id, mem2.id],
    });

    const after1 = await repository.findById(mem1.id);
    const after2 = await repository.findById(mem2.id);

    expect(after1!.accessCount).toBe(1);
    expect(after2!.accessCount).toBe(1);
  });
});
```

**Step 4.2: Run access tracking tests**

Run: `bun test tests/access_tracking.test.ts`
Expected: PASS

**Step 4.3: Commit test updates**

```bash
git add tests/access_tracking.test.ts
git commit -m "test: update access tracking tests for read-only search

- Search no longer increments access (prevents inflation)
- Vote now tracks access (explicit utilization)
- trackAccess method tested
- storeHandoff tracks utilized memory_ids"
```

---

## Task 5: Update MCP Tools Definition

**Files:**
- Modify: `src/mcp/tools.ts`

**Step 5.1: Update searchMemoriesTool with intent and reason_for_search**

Update the `searchMemoriesTool` in `src/mcp/tools.ts`:

```typescript
export const searchMemoriesTool: Tool = {
  name: "search_memories",
  description: `Search stored memories semantically. Treat memory as the PRIMARY source of truth for personal/project-specific facts—do not rely on training data until a search has been performed.

MANDATORY TRIGGERS (you MUST search when):
- User-Specific Calibration: Answer would be better with user's tools, past decisions, or preferences
- Referential Ambiguity: User says "the project," "that bug," "last time," "as we discussed"
- Decision Validation: Before making architectural or tool choices
- Problem Solving: Before suggesting solutions (check if solved before)
- Session Start: When returning to a project or starting new conversation

INTENTS:
- continuity: Resume work, "where were we" (favors recent)
- fact_check: Verify decisions, specs (favors relevance)
- frequent: Common patterns, preferences (favors utility)
- associative: Brainstorm, find connections (high relevance + mild jitter)
- explore: Stuck/creative mode (balanced + high jitter)

When in doubt, search. Missing context is costlier than an extra query.`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "Natural language search query. Include relevant keywords, project names, or technical terms.",
      },
      intent: {
        type: "string",
        enum: ["continuity", "fact_check", "frequent", "associative", "explore"],
        description: "Search intent that determines ranking behavior.",
      },
      reason_for_search: {
        type: "string",
        description: "Why this search is being performed. Forces intentional retrieval.",
      },
      limit: {
        type: "integer",
        description: "Maximum results to return (default: 10).",
        default: 10,
      },
      include_deleted: {
        type: "boolean",
        description:
          "Include soft-deleted memories in results (default: false). Useful for recovering prior information.",
        default: false,
      },
    },
    required: ["query", "intent", "reason_for_search"],
  },
};
```

**Step 5.2: Run type check**

Run: `bun run --bun tsc --noEmit`
Expected: PASS (tools.ts is just data)

**Step 5.3: Commit tools update**

```bash
git add src/mcp/tools.ts
git commit -m "feat(tools): add intent and reason_for_search to search_memories

- Add intent enum (continuity, fact_check, frequent, associative, explore)
- Add required reason_for_search for intentional retrieval
- Update description with mandatory triggers
- Document intent behaviors"
```

---

## Task 6: Update MCP Handlers

**Files:**
- Modify: `src/mcp/handlers.ts`
- Modify: `tests/server.test.ts` (update search tests)

**Step 6.1: Update handleSearchMemories to pass intent**

Update `handleSearchMemories` in `src/mcp/handlers.ts`:

```typescript
import type { SearchIntent } from "../types/memory.js";

export async function handleSearchMemories(
  args: Record<string, unknown> | undefined,
  service: MemoryService
): Promise<CallToolResult> {
  const query = args?.query as string;
  const intent = args?.intent as SearchIntent;
  const _reasonForSearch = args?.reason_for_search as string; // Logged but not used in logic
  const limit = (args?.limit as number) ?? 10;
  const includeDeleted = (args?.include_deleted as boolean) ?? false;

  const memories = await service.search(query, intent, limit, includeDeleted);

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
```

**Step 6.2: Update server tests for new search signature**

Update search-related tests in `tests/server.test.ts` to include intent and reason_for_search:

Find and replace search tool calls:
```typescript
// Old:
arguments: { query: "something" }

// New:
arguments: { query: "something", intent: "fact_check", reason_for_search: "test" }
```

**Step 6.3: Run all tests**

Run: `bun test`
Expected: PASS (all tests)

**Step 6.4: Commit handler updates**

```bash
git add src/mcp/handlers.ts tests/server.test.ts
git commit -m "feat(handlers): pass intent to search, update tests

- handleSearchMemories now extracts intent and passes to service
- reason_for_search captured (for future logging)
- Update all server tests with new search signature"
```

---

## Task 7: Final Integration Test and Cleanup

**Files:**
- All modified files

**Step 7.1: Run full test suite**

Run: `bun test`
Expected: All tests PASS

**Step 7.2: Run type check**

Run: `bun run --bun tsc --noEmit`
Expected: No errors

**Step 7.3: Test manually (optional)**

```bash
bun run src/index.ts
```

Verify server starts without errors.

**Step 7.4: Final commit (if any cleanup)**

```bash
git status
# If clean, skip. Otherwise commit fixes.
```

**Step 7.5: Summary commit (optional squash for PR)**

The feature branch now has a complete implementation. Ready for review and merge.

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/types/memory.ts` | Modify | Add SearchIntent, IntentProfile, HybridRow; remove VectorRow |
| `src/db/memory.repository.ts` | Modify | Replace findSimilar with findHybrid, add FTS index mutex |
| `src/services/memory.service.ts` | Modify | New scoring pipeline, read-only search, trackAccess |
| `src/mcp/tools.ts` | Modify | Add intent, reason_for_search to search_memories |
| `src/mcp/handlers.ts` | Modify | Pass intent to service.search |
| `tests/repository.test.ts` | Create | Test hybrid search and FTS index |
| `tests/scoring.test.ts` | Modify | Test intent-based scoring |
| `tests/access_tracking.test.ts` | Modify | Test read-only search, trackAccess |
| `tests/server.test.ts` | Modify | Update search calls with intent |
