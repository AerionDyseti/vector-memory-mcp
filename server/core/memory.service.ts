import { randomUUID, createHash } from "crypto";
import { basename } from "path";
import type { Memory, SearchIntent, IntentProfile, HybridRow } from "./memory";
import { isDeleted, computeConfidence } from "./memory";
import type { SearchResult, SearchOptions, HistoryFilters } from "./conversation";
import type { MemoryRepository } from "./memory.repository";
import type { EmbeddingsService } from "./embeddings.service";
import type { ConversationHistoryService } from "./conversation.service";
import { normalizeProject } from "./project";

// Jitter values halved from original (0.02/0.05/0.15) because RRF_K=10 produces
// ~6x more score spread than K=60, amplifying jitter's disruption effect.
const INTENT_PROFILES: Record<SearchIntent, IntentProfile> = {
  continuity: { weights: { relevance: 0.3, recency: 0.5, utility: 0.2 }, jitter: 0.01 },
  fact_check: { weights: { relevance: 0.6, recency: 0.1, utility: 0.3 }, jitter: 0.01 },
  frequent: { weights: { relevance: 0.2, recency: 0.2, utility: 0.6 }, jitter: 0.01 },
  associative: { weights: { relevance: 0.7, recency: 0.1, utility: 0.2 }, jitter: 0.025 },
  explore: { weights: { relevance: 0.4, recency: 0.3, utility: 0.3 }, jitter: 0.08 },
};

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

// Modest same-project ranking boost for scope:"all" searches — same-repo
// memories win ties without hiding cross-project results.
const CURRENT_PROJECT_BOOST = 1.15;

export class MemoryService {
  private conversationService: ConversationHistoryService | null = null;

  constructor(
    private repository: MemoryRepository,
    private embeddings: EmbeddingsService,
    private project: string | null = null
  ) {}

  getProject(): string | null {
    return this.project;
  }

  setConversationService(service: ConversationHistoryService): void {
    this.conversationService = service;
  }

  getConversationService(): ConversationHistoryService | null {
    return this.conversationService;
  }

  getRepository(): MemoryRepository {
    return this.repository;
  }

  getEmbeddings(): EmbeddingsService {
    return this.embeddings;
  }

  async store(
    content: string,
    metadata: Record<string, unknown> = {},
    embeddingText?: string,
    project?: string
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
      project: project !== undefined ? normalizeProject(project) : this.project,
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

  async getMultiple(ids: string[]): Promise<Memory[]> {
    if (ids.length === 0) return [];
    const memories = await this.repository.findByIds(ids);
    const now = new Date();
    const liveIds = memories.filter((m) => !isDeleted(m)).map((m) => m.id);
    this.repository.bulkUpdateAccess(liveIds, now);
    return memories.filter((m) => !isDeleted(m));
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

  private computeMemoryScore(
    candidate: HybridRow,
    profile: IntentProfile,
    now: Date
  ): number {
    const relevance = candidate.rrfScore;
    const lastAccessed = candidate.lastAccessed ?? candidate.createdAt;
    const hoursSinceAccess = Math.max(
      0,
      (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60)
    );
    const recency = Math.pow(0.995, hoursSinceAccess);
    const utility = sigmoid(
      (candidate.usefulness + Math.log(candidate.accessCount + 1)) / 5
    );
    const { weights, jitter } = profile;
    const score =
      weights.relevance * relevance +
      weights.recency * recency +
      weights.utility * utility;
    return score * (1 + (Math.random() * 2 - 1) * jitter);
  }

  async search(
    query: string,
    intent: SearchIntent,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    const limit = options?.limit ?? 10;
    const includeDeleted = options?.includeDeleted ?? false;
    const queryEmbedding = await this.embeddings.embed(query);
    const profile = INTENT_PROFILES[intent];
    const now = new Date();
    const offset = Math.min(options?.offset ?? 0, 500);

    const hasConversationService = this.conversationService !== null;
    const historyOnly = (options?.historyOnly ?? false) && hasConversationService;
    const includeHistory =
      (options?.includeHistory ?? true) && hasConversationService;
    const historyWeight =
      options?.historyWeight ??
      this.conversationService?.config.historyWeight ??
      0.75;

    // Widen the candidate pool to account for offset
    const effectiveLimit = offset + limit;

    // Resolve project scope: "all" = no filter (with same-project ranking
    // boost), "project" = current project, anything else = explicit path.
    const scope = options?.scope ?? "all";
    const projectFilter: string | undefined =
      scope === "all"
        ? undefined
        : scope === "project"
          ? (this.project ?? undefined)
          : normalizeProject(scope);

    const hasDateFilters = options?.after || options?.before;
    const memoryFilters =
      hasDateFilters || projectFilter !== undefined
        ? {
            after: options?.after,
            before: options?.before,
            project: projectFilter,
          }
        : undefined;

    // Merge top-level date filters into history filters so after/before
    // apply uniformly. Explicit history_after/history_before take precedence,
    // as does an explicit historyFilters.project.
    const historyFilters = options?.historyFilters;
    const effectiveHistoryFilters: HistoryFilters | undefined =
      hasDateFilters || projectFilter !== undefined || historyFilters
        ? {
            ...historyFilters,
            after: historyFilters?.after ?? options?.after,
            before: historyFilters?.before ?? options?.before,
            project: historyFilters?.project ?? projectFilter,
          }
        : historyFilters;

    // Same-project boost only applies to unscoped searches
    const boost = (resultProject: string | null): number =>
      scope === "all" && this.project && resultProject === this.project
        ? CURRENT_PROJECT_BOOST
        : 1;

    // Run memory + history queries in parallel
    const memoryPromise =
      !historyOnly
        ? this.repository
            .findHybrid(queryEmbedding, query, effectiveLimit * 5, memoryFilters)
            .then((candidates) =>
              candidates
                .filter((m) => includeDeleted || !isDeleted(m))
                .map((candidate) => ({
                  id: candidate.id,
                  content: candidate.content,
                  metadata: candidate.metadata,
                  createdAt: candidate.createdAt,
                  updatedAt: candidate.updatedAt,
                  source: "memory" as const,
                  score:
                    this.computeMemoryScore(candidate, profile, now) *
                    boost(candidate.project),
                  confidence: computeConfidence(candidate.signals),
                  project: candidate.project,
                  supersededBy: candidate.supersededBy,
                  usefulness: candidate.usefulness,
                  accessCount: candidate.accessCount,
                  lastAccessed: candidate.lastAccessed,
                }))
            )
        : Promise.resolve([] as SearchResult[]);

    const historyPromise =
      includeHistory || historyOnly
        ? this.conversationService!
            .searchHistory(
              query,
              queryEmbedding,
              historyOnly ? effectiveLimit * 5 : effectiveLimit * 3,
              effectiveHistoryFilters
            )
            .then((historyRows) =>
              historyRows.map((row) => {
                const rowProject = (row.metadata?.project as string) ?? null;
                return {
                  id: row.id,
                  content: row.content,
                  metadata: row.metadata,
                  createdAt: row.createdAt,
                  updatedAt: row.createdAt,
                  source: "conversation_history" as const,
                  score: row.rrfScore * historyWeight * boost(rowProject),
                  confidence: computeConfidence(row.signals),
                  project: rowProject,
                  supersededBy: null,
                  sessionId: (row.metadata?.session_id as string) ?? "",
                  role: (row.metadata?.role as string) ?? "unknown",
                  messageIndexStart: (row.metadata?.message_index_start as number) ?? 0,
                  messageIndexEnd: (row.metadata?.message_index_end as number) ?? 0,
                };
              })
            )
        : Promise.resolve([] as SearchResult[]);

    const [memoryResults, historyResults] = await Promise.all([
      memoryPromise,
      historyPromise,
    ]);

    // Merge and sort by score descending
    const merged = [...memoryResults, ...historyResults];
    merged.sort((a, b) => b.score - a.score);

    return merged.slice(offset, offset + limit);
  }

  async trackAccess(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.repository.bulkUpdateAccess(ids, new Date());
  }

  private static readonly UUID_ZERO =
    "00000000-0000-0000-0000-000000000000";

  private static waypointId(project?: string): string {
    if (!project?.length) return MemoryService.UUID_ZERO;
    const normalized = project.trim().toLowerCase();
    const hex = createHash("sha256").update(`waypoint:${normalized}`).digest("hex");
    return `wp:${hex.slice(0, 32)}`;
  }

  /** Legacy UUID-formatted waypoint ID for migration fallback reads. */
  private static legacyWaypointId(project?: string): string | null {
    if (!project?.length) return null; // UUID_ZERO is still current for no-project
    const normalized = project.trim().toLowerCase();
    const hex = createHash("sha256").update(`waypoint:${normalized}`).digest("hex");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join("-");
  }

  /**
   * Resolve a caller-supplied project (possibly a legacy display name or
   * relative value) or fall back to the server's configured project.
   */
  private resolveProject(project?: string): string | undefined {
    if (project && project.trim().length > 0) return normalizeProject(project);
    return this.project ?? undefined;
  }

  async setWaypoint(args: {
    project?: string;
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

    const project = this.resolveProject(args.project);
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toISOString().slice(11, 16);

    const list = (items: string[] | undefined) => {
      if (!items || items.length === 0) {
        return "- (none)";
      }
      return items.map((i) => `- ${i}`).join("\n");
    };

    const content = `# Waypoint - ${project ?? "unknown project"}
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
      type: "waypoint",
      project: project ?? null,
      date,
      branch: args.branch ?? "unknown",
      memory_ids: args.memory_ids ?? [],
    };

    const memory: Memory = {
      id: MemoryService.waypointId(project),
      content,
      embedding: new Array(this.embeddings.dimension).fill(0),
      metadata,
      createdAt: now,
      updatedAt: now,
      supersededBy: null,
      usefulness: 0,
      accessCount: 0,
      lastAccessed: now, // Initialize to now for consistency
      project: project ?? null,
    };

    // NOTE: deliberately no UUID_ZERO "global latest" copy — in a shared
    // database that becomes last-writer-wins across projects. Readers that
    // don't know their project resolve it from cwd instead.
    await this.repository.upsert(memory);

    return memory;
  }

  /**
   * Find the latest waypoint for a project, trying legacy ID schemes in
   * order and migrating hits to the canonical ID:
   *  1. canonical: waypointId(normalized absolute path)
   *  2. legacy skill-supplied display name: waypointId(basename)
   *  3. legacy UUID-formatted IDs for both of the above
   *  4. UUID_ZERO "global latest" — only when its metadata.project matches,
   *     so one project's pre-migration waypoint never leaks into another
   */
  async getLatestWaypoint(project?: string): Promise<Memory | null> {
    const resolved = this.resolveProject(project);
    const canonicalId = MemoryService.waypointId(resolved);

    const waypoint = await this.get(canonicalId);
    if (waypoint && !isDeleted(waypoint)) return waypoint;

    const candidateIds: string[] = [];
    if (resolved) {
      const display = basename(resolved);
      candidateIds.push(MemoryService.waypointId(display));
      const legacyPath = MemoryService.legacyWaypointId(resolved);
      if (legacyPath) candidateIds.push(legacyPath);
      const legacyDisplay = MemoryService.legacyWaypointId(display);
      if (legacyDisplay) candidateIds.push(legacyDisplay);
    } else {
      const legacyId = MemoryService.legacyWaypointId(resolved);
      if (legacyId) candidateIds.push(legacyId);
    }

    for (const id of candidateIds) {
      if (id === canonicalId) continue;
      const legacy = await this.repository.findById(id);
      if (!legacy || isDeleted(legacy)) continue;

      // Migrate: write under canonical ID, delete old
      await this.repository.upsert({
        ...legacy,
        id: canonicalId,
        project: resolved ?? legacy.project,
      });
      await this.repository.markDeleted(id);
      return { ...legacy, id: canonicalId, project: resolved ?? legacy.project };
    }

    // Last resort: the pre-migration UUID_ZERO copy, guarded by project match
    if (resolved && canonicalId !== MemoryService.UUID_ZERO) {
      const global = await this.repository.findById(MemoryService.UUID_ZERO);
      if (global && !isDeleted(global)) {
        const metaProject = (global.metadata.project as string | undefined) ?? "";
        const matches =
          metaProject.length > 0 &&
          (normalizeProject(metaProject) === resolved ||
            metaProject.trim().toLowerCase() ===
              basename(resolved).toLowerCase());
        if (matches) {
          await this.repository.upsert({
            ...global,
            id: canonicalId,
            project: resolved,
          });
          await this.repository.markDeleted(MemoryService.UUID_ZERO);
          return { ...global, id: canonicalId, project: resolved };
        }
      }
    }

    return null;
  }
}
