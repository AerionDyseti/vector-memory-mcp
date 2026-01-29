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
    let dbPath: string;

    beforeEach(async () => {
        tmpDir = mkdtempSync(join(tmpdir(), "vector-memory-mcp-test-access-"));
        dbPath = join(tmpDir, "test.lancedb");
        db = await connectToDatabase(dbPath);
        repository = new MemoryRepository(db);
        embeddings = new EmbeddingsService("Xenova/all-MiniLM-L6-v2", 384);
        service = new MemoryService(repository, embeddings);
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true });
    });

    test("initial accessCount is 0, lastAccessed is null", async () => {
        const memory = await service.store("test content");
        expect(memory.accessCount).toBe(0);
        expect(memory.lastAccessed).toBeNull();
    });

    test("get increments accessCount and updates lastAccessed", async () => {
        const memory = await service.store("test content");

        // First access
        await new Promise(r => setTimeout(r, 10)); // Ensure time passes
        const retrieved1 = await service.get(memory.id);

        expect(retrieved1!.accessCount).toBe(1);
        expect(retrieved1!.lastAccessed).not.toBeNull();
        expect(retrieved1!.lastAccessed!.getTime()).toBeGreaterThan(memory.createdAt.getTime());

        // Second access
        await new Promise(r => setTimeout(r, 10)); // Ensure time passes
        const retrieved2 = await service.get(memory.id);

        expect(retrieved2!.accessCount).toBe(2);
        expect(retrieved2!.lastAccessed!.getTime()).toBeGreaterThan(retrieved1!.lastAccessed!.getTime());
    });

    test("search increments accessCount for returned items", async () => {
        const memory = await service.store("Python programming");

        // Search matching item
        const results = await service.search("coding");
        const found = results.find(m => m.id === memory.id);

        expect(found).not.toBeUndefined();
        expect(found!.accessCount).toBe(1);
        expect(found!.lastAccessed).not.toBeNull();

        // Verify it was persisted by getting it directly
        const direct = await service.get(memory.id);
        // Note: 'get' also increments, so it should be 2 now
        expect(direct!.accessCount).toBe(2);
    });

    test("search does not increment for items not returned (filtered)", async () => {
        // This test relies on similarity/limit behavior
        // If we have 2 items, only 1 requested, access should ideally track only the returned one.
        // However, our code iterates over results FROM vector search (which are potential candidates).
        // Our implementation updates inside the loop over `rows` before pushing to `trackedResults`.
        // It breaks when `trackedResults.length >= limit`.

        const mem1 = await service.store("Memory One");
        const mem2 = await service.store("Memory Two");

        // Search with limit 1
        const results = await service.search("Memory", 1);
        expect(results.length).toBe(1);

        // One should be accessed, one should not (or at least one accessed more than other if both match)
        // Wait, vector search returns them in order. 
        // We update whoever we process.

        const idAccessed = results[0].id;
        // Check direct
        // Accessing directly increments it again, so check if it is > 0
        // Actually, we can check via repository directly to avoid副作用 of service.get? No repository returns Dict/Memory. 
        // But repository.findById does NOT side-effect.

        const r1 = await repository.findById(mem1.id);
        const r2 = await repository.findById(mem2.id);

        // One should have accessCount 1, other 0
        // (Assuming similarity search returned one first)
        const accesses = (r1!.accessCount || 0) + (r2!.accessCount || 0);
        expect(accesses).toBe(1);
    });
});
