export const DELETED_TOMBSTONE = "DELETED";

export interface Memory {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  supersededBy: string | null;
  usefulness: number;
  accessCount: number;
  lastAccessed: Date | null;
}

export function isDeleted(memory: Memory): boolean {
  return memory.supersededBy === DELETED_TOMBSTONE;
}

export function memoryToDict(memory: Memory): Record<string, unknown> {
  return {
    id: memory.id,
    content: memory.content,
    metadata: memory.metadata,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
    supersededBy: memory.supersededBy,
    usefulness: memory.usefulness,
    accessCount: memory.accessCount,
    lastAccessed: memory.lastAccessed?.toISOString() ?? null,
  };
}

export type SearchIntent = 'continuity' | 'fact_check' | 'frequent' | 'associative' | 'explore';

export interface IntentProfile {
  weights: { relevance: number; recency: number; utility: number };
  jitter: number;
}

export interface HybridRow extends Memory {
  rrfScore: number;
}
