import { Hono } from "hono";
import { cors } from "hono/cors";
import type { MemoryService } from "../services/memory.service.js";
import type { Config } from "../config/index.js";
import { isDeleted } from "../types/memory.js";
import { createMcpRoutes } from "./mcp-transport.js";

export interface HttpServerOptions {
  memoryService: MemoryService;
  config: Config;
}

export function createHttpApp(memoryService: MemoryService): Hono {
  const app = new Hono();

  // Enable CORS for local development
  app.use("/*", cors());

  // Mount MCP routes for StreamableHTTP transport
  // This enables Claude Desktop and other HTTP-based MCP clients
  const mcpApp = createMcpRoutes(memoryService);
  app.route("/", mcpApp);

  // Health check endpoint
  app.get("/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Context endpoint for Claude Code hooks
  // Returns relevant memories formatted for injection into conversation
  app.post("/context", async (c) => {
    try {
      const body = await c.req.json();
      const query = body.query;

      if (!query || typeof query !== "string") {
        return c.json({ error: "Missing or invalid 'query' field" }, 400);
      }

      const memories = await memoryService.search(query, 5);

      if (memories.length === 0) {
        return c.json({ context: null });
      }

      // Format memories for context injection
      const contextLines = memories.map((m, i) => {
        const metadata = m.metadata as Record<string, unknown>;
        const type = metadata.type ? `[${metadata.type}]` : "";
        const date = m.createdAt.toISOString().split("T")[0];
        return `${i + 1}. ${type} (${date}): ${m.content}`;
      });

      const context = `<relevant-memories>\n${contextLines.join("\n")}\n</relevant-memories>`;

      return c.json({ context, count: memories.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ error: message }, 500);
    }
  });

  // Search endpoint (more detailed than /context)
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
  const app = createHttpApp(memoryService);

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
