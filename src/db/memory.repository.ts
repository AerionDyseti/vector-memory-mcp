import * as lancedb from "@lancedb/lancedb";
import { Index, rerankers, type Table } from "@lancedb/lancedb";
import { TABLE_NAME, memorySchema } from "./schema.js";
import {
  type Memory,
  type HybridRow,
  DELETED_TOMBSTONE,
} from "../types/memory.js";

export class MemoryRepository {
  // Mutex for FTS index creation - ensures only one index creation runs at a time
  // Once set, this promise is never cleared (FTS index persists in the database)
  private ftsIndexPromise: Promise<void> | null = null;

  // Mutex for schema migration - runs once per instance to add missing columns
  private migrationPromise: Promise<void> | null = null;

  constructor(private db: lancedb.Connection) { }

  private async getTable() {
    const names = await this.db.tableNames();
    if (names.includes(TABLE_NAME)) {
      const table = await this.db.openTable(TABLE_NAME);
      await this.ensureMigration(table);
      return table;
    }
    // Create with empty data to initialize schema
    return await this.db.createTable(TABLE_NAME, [], { schema: memorySchema });
  }

  /**
   * Ensures schema migration has run. Uses a mutex pattern identical to ensureFtsIndex.
   * Adds columns introduced after the initial schema (usefulness, access_count, last_accessed).
   */
  private ensureMigration(table: Table): Promise<void> {
    if (this.migrationPromise) {
      return this.migrationPromise;
    }

    this.migrationPromise = this.migrateSchemaIfNeeded(table).catch((error) => {
      this.migrationPromise = null;
      throw error;
    });

    return this.migrationPromise;
  }

  /**
   * Inspects the existing table schema and adds any missing columns with safe defaults.
   * This handles databases created before the hybrid memory system was introduced.
   */
  private async migrateSchemaIfNeeded(table: Table): Promise<void> {
    const schema = await table.schema();
    const existingFields = new Set(schema.fields.map((f) => f.name));

    const migrations: { name: string; valueSql: string }[] = [];

    if (!existingFields.has("usefulness")) {
      migrations.push({ name: "usefulness", valueSql: "cast(0.0 as float)" });
    }
    if (!existingFields.has("access_count")) {
      migrations.push({ name: "access_count", valueSql: "cast(0 as int)" });
    }
    if (!existingFields.has("last_accessed")) {
      migrations.push({ name: "last_accessed", valueSql: "cast(NULL as timestamp)" });
    }

    if (migrations.length > 0) {
      await table.addColumns(migrations);
    }
  }

  /**
   * Ensures the FTS index exists on the content column.
   * Uses a mutex pattern to prevent concurrent index creation.
   * The key insight: we must capture the promise BEFORE any await.
   */
  private ensureFtsIndex(): Promise<void> {
    // If there's already a pending or completed index creation, return that promise
    if (this.ftsIndexPromise) {
      return this.ftsIndexPromise;
    }

    // Synchronously set the promise BEFORE any await
    // This is critical for proper mutex behavior in JS async code
    this.ftsIndexPromise = this.createFtsIndexIfNeeded().catch((error) => {
      // Reset on error so the next call can retry
      this.ftsIndexPromise = null;
      throw error;
    });

    return this.ftsIndexPromise;
  }

  /**
   * Creates the FTS index if it doesn't already exist.
   * Gets its own table reference to ensure consistent index state.
   */
  private async createFtsIndexIfNeeded(): Promise<void> {
    const table = await this.getTable();
    const indices = await table.listIndices();
    const hasFtsIndex = indices.some(
      (idx) => idx.columns.includes("content") && idx.indexType === "FTS"
    );

    if (!hasFtsIndex) {
      await table.createIndex("content", {
        config: Index.fts(),
      });
      // Wait for the index to be fully created and available
      await table.waitForIndex(["content_idx"], 30);
    }
  }

  /**
   * Converts a raw LanceDB row to a Memory object.
   */
  private rowToMemory(row: Record<string, unknown>): Memory {
    // Handle Arrow Vector type conversion
    // LanceDB returns an Arrow Vector object which is iterable but not an array
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

  async insert(memory: Memory): Promise<void> {
    const table = await this.getTable();
    await table.add([
      {
        id: memory.id,
        vector: memory.embedding,
        content: memory.content,
        metadata: JSON.stringify(memory.metadata),
        created_at: memory.createdAt.getTime(),
        updated_at: memory.updatedAt.getTime(),
        superseded_by: memory.supersededBy,
        usefulness: memory.usefulness,
        access_count: memory.accessCount,
        last_accessed: memory.lastAccessed?.getTime() ?? null,
      },
    ]);
  }

  async upsert(memory: Memory): Promise<void> {
    const table = await this.getTable();
    const existing = await table.query().where(`id = '${memory.id}'`).limit(1).toArray();

    if (existing.length === 0) {
      return await this.insert(memory);
    }

    await table.update({
      where: `id = '${memory.id}'`,
      values: {
        vector: memory.embedding,
        content: memory.content,
        metadata: JSON.stringify(memory.metadata),
        created_at: memory.createdAt.getTime(),
        updated_at: memory.updatedAt.getTime(),
        superseded_by: memory.supersededBy,
        usefulness: memory.usefulness,
        access_count: memory.accessCount,
        last_accessed: memory.lastAccessed?.getTime() ?? null,
      },
    });
  }

  async findById(id: string): Promise<Memory | null> {
    const table = await this.getTable();
    const results = await table.query().where(`id = '${id}'`).limit(1).toArray();

    if (results.length === 0) {
      return null;
    }

    return this.rowToMemory(results[0] as Record<string, unknown>);
  }

  async markDeleted(id: string): Promise<boolean> {
    const table = await this.getTable();

    // Verify existence first to match previous behavior (return false if not found)
    const existing = await table.query().where(`id = '${id}'`).limit(1).toArray();
    if (existing.length === 0) {
      return false;
    }

    const now = Date.now();
    await table.update({
      where: `id = '${id}'`,
      values: {
        superseded_by: DELETED_TOMBSTONE,
        updated_at: now,
      },
    });

    return true;
  }

  /**
   * Performs hybrid search combining vector similarity and full-text search.
   * Uses RRF (Reciprocal Rank Fusion) to combine rankings from both search methods.
   *
   * @param embedding - Query embedding vector
   * @param query - Text query for full-text search
   * @param limit - Maximum number of results to return
   * @returns Array of HybridRow containing full Memory data plus RRF score
   */
  async findHybrid(embedding: number[], query: string, limit: number): Promise<HybridRow[]> {
    // Ensure FTS index exists (with mutex to prevent concurrent creation)
    // This must happen BEFORE getTable to ensure proper mutex behavior
    await this.ensureFtsIndex();

    const table = await this.getTable();

    // Create RRF reranker with k=60 (standard parameter)
    const reranker = await rerankers.RRFReranker.create(60);

    // Perform hybrid search: combine vector search and full-text search
    const results = await table
      .query()
      .nearestTo(embedding)
      .fullTextSearch(query)
      .rerank(reranker)
      .limit(limit)
      .toArray();

    return results.map((row) => {
      const memory = this.rowToMemory(row as Record<string, unknown>);
      return {
        ...memory,
        rrfScore: (row._relevance_score as number) ?? 0,
      };
    });
  }
}
