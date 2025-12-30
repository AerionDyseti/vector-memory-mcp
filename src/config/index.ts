import { join } from "path";
import { homedir } from "os";

export type TransportMode = "stdio" | "http" | "both";

export interface Config {
  dbPath: string;
  embeddingModel: string;
  embeddingDimension: number;
  httpPort: number;
  httpHost: string;
  enableHttp: boolean;
  /** Transport mode: 'stdio' (default), 'http' (SSE only), or 'both' */
  transportMode: TransportMode;
}

const DEFAULT_DB_PATH = join(
  homedir(),
  ".local",
  "share",
  "vector-memory-mcp",
  "memories.db"
);

const DEFAULT_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const DEFAULT_EMBEDDING_DIMENSION = 384;
const DEFAULT_HTTP_PORT = 3271;
const DEFAULT_HTTP_HOST = "127.0.0.1";

function parseTransportMode(value: string | undefined): TransportMode {
  if (value === "http" || value === "sse") return "http";
  if (value === "both") return "both";
  return "stdio";
}

export function loadConfig(): Config {
  const transportMode = parseTransportMode(process.env.VECTOR_MEMORY_TRANSPORT);

  // HTTP is enabled if transport mode includes it, or if explicitly enabled
  const enableHttp =
    transportMode === "http" ||
    transportMode === "both" ||
    process.env.VECTOR_MEMORY_ENABLE_HTTP === "true";

  return {
    dbPath: process.env.VECTOR_MEMORY_DB_PATH ?? DEFAULT_DB_PATH,
    embeddingModel: process.env.VECTOR_MEMORY_MODEL ?? DEFAULT_EMBEDDING_MODEL,
    embeddingDimension: DEFAULT_EMBEDDING_DIMENSION,
    httpPort: parseInt(process.env.VECTOR_MEMORY_HTTP_PORT ?? String(DEFAULT_HTTP_PORT), 10),
    httpHost: process.env.VECTOR_MEMORY_HTTP_HOST ?? DEFAULT_HTTP_HOST,
    enableHttp,
    transportMode,
  };
}

export const config = loadConfig();
