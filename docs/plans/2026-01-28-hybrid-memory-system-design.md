# High-Fidelity Agentic Memory System Design

**Date:** 2026-01-28
**Status:** Approved
**Scope:** Upgrade from Naive RAG to Prosumer Memory System

## Overview

Transform the vector-memory-mcp from pure vector search to a hybrid retrieval system with multi-signal scoring, intent-based weight profiles, and controlled randomness for improved LLM robustness.

## Architecture

```
Query → [Stage 1: Hybrid Retrieval] → [Stage 2: Multi-Signal Scoring] → [Stage 3: Score Jitter] → [Stage 4: Access Tracking] → Results
             ↓                              ↓                               ↓
        Vector + FTS                  Intent-weighted                 Soft shuffle
        with RRF fusion               re-ranking                      (±2% default)
```

### Stage 1: Hybrid Retrieval (Repository Layer)

- Vector search (dense) + Full-Text Search (sparse)
- Fused using LanceDB's built-in RRF reranker with k=60
- FTS index on `content` column with English stemming

### Stage 2: Multi-Signal Scoring (Service Layer)

Three normalized signals combined with intent-based weights:
- **Relevance:** RRF score from hybrid search
- **Recency:** Exponential decay `0.995^hours` on `lastAccessed`
- **Utility:** `sigmoid((usefulness + log(accessCount + 1)) / 5)`

### Stage 3: Score Jitter

Controlled perturbation prevents retrieval from becoming too deterministic:
```
FinalScore = Score × (1 + random(-jitter, +jitter))
```

### Stage 4: Access Tracking

Access stats updated only on explicit/implicit utilization signals, not on search.

## Intent Profiles

| Intent | Use Case | Weights (Rel/Rec/Util) | Jitter |
|--------|----------|------------------------|--------|
| `continuity` | Resume work, "where were we" | 0.3 / 0.5 / 0.2 | ±2% |
| `fact_check` | Verify decisions, specs | 0.6 / 0.1 / 0.3 | ±2% |
| `frequent` | Common patterns, preferences | 0.2 / 0.2 / 0.6 | ±2% |
| `associative` | Brainstorm, find connections | 0.7 / 0.1 / 0.2 | ±5% |
| `explore` | Stuck/creative mode | 0.4 / 0.3 / 0.3 | ±15% |

## File Changes

### `src/types/memory.ts`

Remove `VectorRow`, add:

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

### `src/db/memory.repository.ts`

Replace `findSimilar()` with `findHybrid()`:

```typescript
private ftsIndexPromise: Promise<void> | null = null;

private async ensureFtsIndex(table: Table): Promise<void> {
  if (this.ftsIndexPromise) return this.ftsIndexPromise;
  this.ftsIndexPromise = this.createFtsIndexIfNeeded(table);
  return this.ftsIndexPromise;
}

async findHybrid(
  embedding: number[],
  query: string,
  limit: number
): Promise<HybridRow[]> {
  const table = await this.getTable();
  await this.ensureFtsIndex(table);

  const results = await table.query()
    .fullTextSearch(query)
    .nearestTo(embedding)
    .rerank(new RRFReranker({ k: 60 }))
    .limit(limit)
    .toArray();

  // Map results to HybridRow with full Memory data + rrfScore
  return results.map(row => ({
    ...this.rowToMemory(row),
    rrfScore: row._relevance_score as number,
  }));
}
```

### `src/services/memory.service.ts`

**Intent profiles:**

```typescript
const INTENT_PROFILES: Record<SearchIntent, IntentProfile> = {
  continuity:   { weights: { relevance: 0.3, recency: 0.5, utility: 0.2 }, jitter: 0.02 },
  fact_check:   { weights: { relevance: 0.6, recency: 0.1, utility: 0.3 }, jitter: 0.02 },
  frequent:     { weights: { relevance: 0.2, recency: 0.2, utility: 0.6 }, jitter: 0.02 },
  associative:  { weights: { relevance: 0.7, recency: 0.1, utility: 0.2 }, jitter: 0.05 },
  explore:      { weights: { relevance: 0.4, recency: 0.3, utility: 0.3 }, jitter: 0.15 },
};

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
```

**Revised `store()` — initialize lastAccessed:**

```typescript
const memory: Memory = {
  // ...
  lastAccessed: now,  // Not null — gives new memories fair discovery window
  accessCount: 0,
};
```

**Revised `search()` — read-only:**

```typescript
async search(
  query: string,
  intent: SearchIntent,
  limit: number = 10,
  includeDeleted: boolean = false
): Promise<Memory[]> {
  const queryEmbedding = await this.embeddings.embed(query);
  const fetchLimit = limit * 5;

  const candidates = await this.repository.findHybrid(queryEmbedding, query, fetchLimit);
  const profile = INTENT_PROFILES[intent];
  const now = new Date();

  const scored = candidates
    .filter(m => includeDeleted || !isDeleted(m))
    .map(candidate => {
      const relevance = candidate.rrfScore;
      const hoursSinceAccess = (now.getTime() - candidate.lastAccessed.getTime()) / (1000 * 60 * 60);
      const recency = Math.pow(0.995, hoursSinceAccess);
      const utility = sigmoid((candidate.usefulness + Math.log(candidate.accessCount + 1)) / 5);

      const { weights, jitter } = profile;
      const score = (weights.relevance * relevance) + (weights.recency * recency) + (weights.utility * utility);
      const finalScore = score * (1 + (Math.random() * 2 - 1) * jitter);

      return { memory: candidate, finalScore };
    });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  return scored.slice(0, limit).map(s => s.memory);
}
```

**Access tracking:**

```typescript
private async trackAccess(ids: string[]): Promise<void> {
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
```

Update `storeHandoff()` to call `trackAccess(args.memory_ids)` when memory_ids provided.

| Trigger | What Updates |
|---------|--------------|
| `vote()` | `lastAccessed`, `accessCount++`, `usefulness ± 1` |
| `storeHandoff(memory_ids)` | `lastAccessed`, `accessCount++` for each ID |
| `get()` | `lastAccessed`, `accessCount++` |

### `src/mcp/tools.ts`

**Updated `searchMemoriesTool`:**

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
        description: "Natural language search query. Include relevant keywords, project names, or technical terms.",
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
        description: "Include soft-deleted memories in results (default: false).",
        default: false,
      },
    },
    required: ["query", "intent", "reason_for_search"],
  },
};
```

### `src/mcp/handlers.ts`

Update search handler to:
1. Extract `intent` and `reason_for_search` from arguments
2. Pass `intent` to `memoryService.search()`
3. `reason_for_search` is for LLM self-discipline, not runtime logic

## Implementation Notes

1. **FTS Index Mutex:** Use a promise-based lock to prevent race conditions when multiple searches hit cold start simultaneously.

2. **English Stemming Trade-off:** Stemming may affect exact matches for technical terms (e.g., "coding" → "code"), but vector search compensates.

3. **Sigmoid Scale:** Using scale of 5 keeps utility signal sensitive — a few votes or dozen accesses make visible difference.

4. **No Access Inflation:** Search is read-only. Access tracked only on explicit utilization signals to prevent feedback loops.

5. **New Memory Discovery:** `lastAccessed` initialized to `createdAt` gives new memories high recency for initial discovery window.
