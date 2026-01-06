import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MemoryService } from "../services/memory.service.js";
import type { Config } from "../config/index.js";
import { isDeleted } from "../types/memory.js";
import { createMcpRoutes } from "./mcp-transport.js";
import type { Memory } from "../types/memory.js";

export interface HttpServerOptions {
  memoryService: MemoryService;
  config: Config;
}

// Track server start time for uptime calculation
const startedAt = Date.now();

export function createHttpApp(memoryService: MemoryService, config: Config): Hono {
  const app = new Hono();

  // Enable CORS for local development
  app.use("/*", cors());

  // Mount MCP routes for StreamableHTTP transport
  const mcpApp = createMcpRoutes(memoryService);
  app.route("/", mcpApp);

  // Health check endpoint with config info
  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      config: {
        dbPath: config.dbPath,
        embeddingModel: config.embeddingModel,
        embeddingDimension: config.embeddingDimension,
      },
    });
  });

  // Search endpoint
  app.post("/search", async (c) => {
    try {
      const body = await c.req.json();
      const query = body.query;
      const limit = body.limit ?? 10;

      if (!query || typeof query !== "string") {
        return c.json({ error: "Missing or invalid 'query' field" }, 400);
      }

      const memories = await memoryService.search(query, limit);

      return c.json({
        memories: memories.map((m) => ({
          id: m.id,
          content: m.content,
          metadata: m.metadata,
          createdAt: m.createdAt.toISOString(),
        })),
        count: memories.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  });

  // Store endpoint
  app.post("/store", async (c) => {
    try {
      const body = await c.req.json();
      const { content, metadata, embeddingText } = body;

      if (!content || typeof content !== "string") {
        return c.json({ error: "Missing or invalid 'content' field" }, 400);
      }

      const memory = await memoryService.store(
        content,
        metadata ?? {},
        embeddingText
      );

      return c.json({
        id: memory.id,
        createdAt: memory.createdAt.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  });

  // Delete endpoint
  app.delete("/memories/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const deleted = await memoryService.delete(id);

      if (!deleted) {
        return c.json({ error: "Memory not found" }, 404);
      }

      return c.json({ deleted: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  });

  // Get latest handoff
  app.get("/handoff", async (c) => {
    try {
      const handoff = await memoryService.getLatestHandoff();

      if (!handoff) {
        return c.json({ error: "No handoff found" }, 404);
      }

      // Fetch referenced memories if any
      const memoryIds = (handoff.metadata.memory_ids as string[] | undefined) ?? [];
      const referencedMemories: Array<{ id: string; content: string }> = [];

      for (const id of memoryIds) {
        const memory = await memoryService.get(id);
        if (memory && !isDeleted(memory)) {
          referencedMemories.push({ id: memory.id, content: memory.content });
        }
      }

      return c.json({
        content: handoff.content,
        metadata: handoff.metadata,
        referencedMemories,
        updatedAt: handoff.updatedAt.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  });

  // Get single memory
  app.get("/memories/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const memory = await memoryService.get(id);

      if (!memory || isDeleted(memory)) {
        return c.json({ error: "Memory not found" }, 404);
      }

      return c.json({
        id: memory.id,
        content: memory.content,
        metadata: memory.metadata,
        createdAt: memory.createdAt.toISOString(),
        updatedAt: memory.updatedAt.toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  });

  return app;
}

export async function startHttpServer(
  memoryService: MemoryService,
  config: Config
): Promise<{ stop: () => void }> {
  const app = createHttpApp(memoryService, config);

  const server = Bun.serve({
    port: config.httpPort,
    hostname: config.httpHost,
    fetch: app.fetch,
  });

  console.error(
    `[vector-memory-mcp] HTTP server listening on http://${config.httpHost}:${config.httpPort}`
  );

  return {
    stop: () => server.stop(),
  };
}
