#!/usr/bin/env node

import { config } from "./config/index.js";
import { createDatabase } from "./db/connection.js";
import { MemoryRepository } from "./db/memory.repository.js";
import { EmbeddingsService } from "./services/embeddings.service.js";
import { MemoryService } from "./services/memory.service.js";
import { startServer } from "./mcp/server.js";

async function main(): Promise<void> {
  // Initialize database
  const { db, sqlite } = createDatabase(config.dbPath);

  // Initialize layers
  const repository = new MemoryRepository(db, sqlite);
  const embeddings = new EmbeddingsService(config.embeddingModel, config.embeddingDimension);
  const memoryService = new MemoryService(repository, embeddings);

  // Start MCP server
  await startServer(memoryService);
}

main().catch(console.error);
