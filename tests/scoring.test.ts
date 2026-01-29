import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import * as lancedb from "@lancedb/lancedb";
import { connectToDatabase } from "../src/db/connection";
import { MemoryRepository } from "../src/db/memory.repository";
import { EmbeddingsService } from "../src/services/embeddings.service";
import { MemoryService } from "../src/services/memory.service";

describe("MemoryService - Scoring", () => {
    let db: lancedb.Connection;
    let repository: MemoryRepository;
    let embeddings: EmbeddingsService;
    let service: MemoryService;
    let tmpDir: string;
    let dbPath: string;

    beforeEach(async () => {
        tmpDir = mkdtempSync(join(tmpdir(), "vector-memory-mcp-test-scoring-"));
        dbPath = join(tmpDir, "test.lancedb");
        db = await connectToDatabase(dbPath);
        repository = new MemoryRepository(db);
        embeddings = new EmbeddingsService("Xenova/all-MiniLM-L6-v2", 384);
        service = new MemoryService(repository, embeddings);
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true });
    });

    test("recency influences score", async () => {
        const memoryOld = await service.store("test content");
        const memoryNew = await service.store("test content");

        // Manually age memoryOld by updating createdAt/lastAccessed in DB?
        // Hard to mock time without proper injection or Date mocking.
        // Instead, I will manually update the rows in DB to verify logic.

        // Set memoryOld to be 100 hours old
        const oldDate = new Date(Date.now() - 100 * 60 * 60 * 1000);

        // We need to bypass service to update timestamps directly or use repository
        // Repository insert/update takes Memory object.

        const oldMem = await service.get(memoryOld.id);
        if (oldMem) {
            // We'll update created_at via repository upsert, but we need to trick it
            // The repository takes a Memory object and blindly saves it.
            // But MemoryService.get updates lastAccessed to NOW.
            // So we need to call store, then manually overwrite using repository
            const updatedOld = { ...oldMem, createdAt: oldDate, lastAccessed: oldDate };
            await repository.upsert(updatedOld);
        }

        // Initial fetch to get them in search
        // Since vectors are identical, cosine distance is 0. Similarity = 1.
        // Importance = 0.
        // Score = 1 (sim) + 0.995^hours (recency) + 0 (imp)

        // memoryNew is fresh (0 hours). Recency = 1. Score ~ 2.
        // memoryOld is 100 hours. Recency = 0.995^100 ~ 0.6. Score ~ 1.6.

        const results = await service.search("test content");
        expect(results.length).toBeGreaterThanOrEqual(2);
        expect(results[0].id).toBe(memoryNew.id);
        expect(results[1].id).toBe(memoryOld.id);
    });

    test("importance influences score", async () => {
        const memNormal = await service.store("unique content A");
        const memImportant = await service.store("unique content A"); // Same content for collision

        // Vote up memImportant
        await service.vote(memImportant.id, 5); // +5 useful

        // memNormal usefulness = 0.

        // Search
        const results = await service.search("unique content A");
        expect(results[0].id).toBe(memImportant.id);
        expect(results[1].id).toBe(memNormal.id);
    });

    test("importance can override moderate similarity gap", async () => {
        // "brown fox" vs "red fox". Semantic gap is small.
        // memMatch: "The quick brown fox"
        // memSemi: "The quick red fox"

        // We expect similarity(memMatch) > similarity(memSemi).
        // But if we boost memSemi importance, it should win.

        const memMatch = await service.store("The quick brown fox");
        const memSemi = await service.store("The quick red fox");

        // Boost memSemi
        await service.vote(memSemi.id, 10); // tanh(10) ~ 1

        // Query
        const results = await service.search("brown fox");

        // memSemi should win due to importance
        expect(results[0].id).toBe(memSemi.id);
        expect(results[1].id).toBe(memMatch.id);
    });
});
