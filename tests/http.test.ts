import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { connectToDatabase } from "../src/db/connection";
import { MemoryRepository } from "../src/db/memory.repository";
import { EmbeddingsService } from "../src/services/embeddings.service";
import { MemoryService } from "../src/services/memory.service";
import { createHttpApp } from "../src/http/server";

describe("HTTP API", () => {
  let memoryService: MemoryService;
  let app: ReturnType<typeof createHttpApp>;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "vector-memory-http-test-"));
    const dbPath = join(tmpDir, "test.lancedb");
    const db = await connectToDatabase(dbPath);
    const repository = new MemoryRepository(db);
    const embeddings = new EmbeddingsService("Xenova/all-MiniLM-L6-v2", 384);
    memoryService = new MemoryService(repository, embeddings);
    app = createHttpApp(memoryService);
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("GET /health", () => {
    test("returns ok status", async () => {
      const res = await app.request("/health");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
    });
  });

  describe("POST /store", () => {
    test("stores a memory and returns id", async () => {
      const res = await app.request("/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Test memory for HTTP API",
          metadata: { type: "test", project: "http-tests" },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.createdAt).toBeDefined();
    });

    test("stores with embeddingText", async () => {
      const res = await app.request("/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Very long content that would be truncated for embedding purposes...",
          embeddingText: "long content summary",
          metadata: { type: "test" },
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBeDefined();
    });

    test("returns 400 for missing content", async () => {
      const res = await app.request("/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: {} }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("content");
    });
  });

  describe("POST /search", () => {
    test("finds stored memories", async () => {
      // Store a memory first
      await app.request("/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Authentication uses JWT tokens with refresh capability",
          metadata: { type: "decision", project: "search-test" },
        }),
      });

      // Search for it
      const res = await app.request("/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "JWT authentication", limit: 5 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.memories).toBeInstanceOf(Array);
      expect(body.count).toBeGreaterThan(0);

      const found = body.memories.some((m: { content: string }) =>
        m.content.includes("JWT")
      );
      expect(found).toBe(true);
    });

    test("returns 400 for missing query", async () => {
      const res = await app.request("/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 5 }),
      });

      expect(res.status).toBe(400);
    });
  });


  describe("GET /memories/:id", () => {
    test("retrieves a specific memory", async () => {
      // Store a memory
      const storeRes = await app.request("/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Specific memory to retrieve by ID",
          metadata: { type: "test" },
        }),
      });
      const { id } = await storeRes.json();

      // Retrieve it
      const res = await app.request(`/memories/${id}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(id);
      expect(body.content).toBe("Specific memory to retrieve by ID");
      expect(body.metadata.type).toBe("test");
    });

    test("returns 404 for non-existent memory", async () => {
      const res = await app.request("/memories/non-existent-id-12345");
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /memories/:id", () => {
    test("deletes a memory", async () => {
      // Store a memory
      const storeRes = await app.request("/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: "Memory to delete",
          metadata: { type: "test" },
        }),
      });
      const { id } = await storeRes.json();

      // Delete it
      const deleteRes = await app.request(`/memories/${id}`, {
        method: "DELETE",
      });
      expect(deleteRes.status).toBe(200);
      const deleteBody = await deleteRes.json();
      expect(deleteBody.deleted).toBe(true);

      // Verify it's gone
      const getRes = await app.request(`/memories/${id}`);
      expect(getRes.status).toBe(404);
    });

    test("returns 404 for non-existent memory", async () => {
      const res = await app.request("/memories/non-existent-id-67890", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });
  });
});

describe("HTTP API Integration", () => {
  let memoryService: MemoryService;
  let app: ReturnType<typeof createHttpApp>;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "vector-memory-http-integration-"));
    const dbPath = join(tmpDir, "test.lancedb");
    const db = await connectToDatabase(dbPath);
    const repository = new MemoryRepository(db);
    const embeddings = new EmbeddingsService("Xenova/all-MiniLM-L6-v2", 384);
    memoryService = new MemoryService(repository, embeddings);
    app = createHttpApp(memoryService);
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("end-to-end: store, search, delete workflow", async () => {
    // 1. Store multiple memories
    const memories = [
      { content: "API uses REST with JSON payloads", metadata: { type: "decision" } },
      { content: "Authentication handled via OAuth 2.0", metadata: { type: "decision" } },
      { content: "Database is PostgreSQL with Prisma ORM", metadata: { type: "pattern" } },
    ];

    const ids: string[] = [];
    for (const mem of memories) {
      const res = await app.request("/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mem),
      });
      const { id } = await res.json();
      ids.push(id);
    }

    expect(ids).toHaveLength(3);

    // 2. Search for authentication-related memories
    const searchRes = await app.request("/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "authentication OAuth", limit: 10 }),
    });
    const searchBody = await searchRes.json();
    expect(searchBody.memories.length).toBeGreaterThan(0);

    // 3. Delete one memory
    const deleteRes = await app.request(`/memories/${ids[0]}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    // 5. Verify deletion
    const getRes = await app.request(`/memories/${ids[0]}`);
    expect(getRes.status).toBe(404);

    // 6. Remaining memories still searchable
    const finalSearch = await app.request("/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "database PostgreSQL", limit: 10 }),
    });
    const finalBody = await finalSearch.json();
    expect(finalBody.memories.length).toBeGreaterThan(0);
  });
});
