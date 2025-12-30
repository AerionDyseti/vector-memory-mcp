#!/usr/bin/env node

import { config } from "./config/index.js";
import { connectToDatabase } from "./db/connection.js";
import { MemoryRepository } from "./db/memory.repository.js";
import { EmbeddingsService } from "./services/embeddings.service.js";
import { MemoryService } from "./services/memory.service.js";
import { startServer } from "./mcp/server.js";
import { startHttpServer } from "./http/server.js";

async function main(): Promise<void> {
  // Check for warmup command
  const args = process.argv.slice(2);
  if (args[0] === "warmup") {
    const { warmup } = await import("../scripts/warmup.js");
    await warmup();
    return;
  }

  // Initialize database
  const db = await connectToDatabase(config.dbPath);

  // Initialize layers
  const repository = new MemoryRepository(db);
  const embeddings = new EmbeddingsService(config.embeddingModel, config.embeddingDimension);
  const memoryService = new MemoryService(repository, embeddings);

  // Start HTTP server if transport mode includes it
  if (config.enableHttp) {
    await startHttpServer(memoryService, config);
    console.error(
      `[vector-memory-mcp] MCP available at http://${config.httpHost}:${config.httpPort}/mcp`
    );
  }

  // Start stdio transport unless in HTTP-only mode
  if (config.transportMode !== "http") {
    await startServer(memoryService);
  } else {
    // In HTTP-only mode, keep the process running
    console.error("[vector-memory-mcp] Running in HTTP-only mode (no stdio)");
    // Keep process alive - the HTTP server runs indefinitely
    await new Promise(() => {});
  }
}

main().catch(console.error);
