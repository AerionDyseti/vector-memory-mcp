#!/usr/bin/env bun
/**
 * SessionStart hook for Claude Code
 *
 * Fetches config from the running vector-memory server's /health endpoint,
 * then retrieves and outputs the latest checkpoint.
 *
 * Requires the server to be running with HTTP enabled.
 *
 * Usage in ~/.claude/settings.json:
 * {
 *   "hooks": {
 *     "SessionStart": [{
 *       "hooks": [{
 *         "type": "command",
 *         "command": "bun /path/to/vector-memory-mcp/hooks/session-start.ts"
 *       }]
 *     }]
 *   }
 * }
 */

import { existsSync } from "fs";
import { connectToDatabase } from "../src/db/connection.js";
import { MemoryRepository } from "../src/db/memory.repository.js";
import { EmbeddingsService } from "../src/services/embeddings.service.js";
import { MemoryService } from "../src/services/memory.service.js";

const VECTOR_MEMORY_URL = process.env.VECTOR_MEMORY_URL ?? "http://127.0.0.1:3271";

interface HealthResponse {
  status: string;
  config: {
    dbPath: string;
    embeddingModel: string;
    embeddingDimension: number;
  };
}

async function main() {
  // Get config from running server
  let health: HealthResponse;
  try {
    const response = await fetch(`${VECTOR_MEMORY_URL}/health`);
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    health = await response.json();
  } catch (error) {
    if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
      console.log("Vector memory server not running. Starting fresh session.");
      return;
    }
    throw error;
  }

  const { dbPath, embeddingModel, embeddingDimension } = health.config;

  // Check if DB exists
  if (!existsSync(dbPath)) {
    console.log("Vector memory database not found. Starting fresh session.");
    return;
  }

  const db = await connectToDatabase(dbPath);
  const repository = new MemoryRepository(db);
  const embeddings = new EmbeddingsService(embeddingModel, embeddingDimension);
  const service = new MemoryService(repository, embeddings);

  const checkpoint = await service.getLatestCheckpoint();

  if (!checkpoint) {
    console.log("No checkpoint found. Starting fresh session.");
    return;
  }

  // Fetch referenced memories if any
  const memoryIds = (checkpoint.metadata.memory_ids as string[] | undefined) ?? [];
  let memoriesSection = "";

  if (memoryIds.length > 0) {
    const memories: string[] = [];
    for (const id of memoryIds) {
      const memory = await service.get(id);
      if (memory) {
        memories.push(`### Memory: ${id}\n${memory.content}`);
      }
    }
    if (memories.length > 0) {
      memoriesSection = `\n\n## Referenced Memories\n\n${memories.join("\n\n")}`;
    }
  }

  console.log(checkpoint.content + memoriesSection);
}

main().catch((err) => {
  console.error("Error loading checkpoint:", err.message);
  process.exit(1);
});
