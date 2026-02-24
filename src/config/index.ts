import arg from "arg";
import { isAbsolute, join } from "path";
import packageJson from "../../package.json" with { type: "json" };

export const VERSION = packageJson.version;

export type TransportMode = "stdio" | "http" | "both";

export interface Config {
  dbPath: string;
  embeddingModel: string;
  embeddingDimension: number;
  httpPort: number;
  httpHost: string;
  enableHttp: boolean;
  transportMode: TransportMode;
}

export interface ConfigOverrides {
  dbPath?: string;
  httpPort?: number;
  enableHttp?: boolean;
  transportMode?: TransportMode;
}

// Defaults - always use repo-local .vector-memory folder
const DEFAULT_DB_PATH = join(process.cwd(), ".vector-memory", "memories.db");
const DEFAULT_EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const DEFAULT_EMBEDDING_DIMENSION = 384;
const DEFAULT_HTTP_PORT = 3271;
const DEFAULT_HTTP_HOST = "127.0.0.1";

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : join(process.cwd(), path);
}

export function loadConfig(overrides: ConfigOverrides = {}): Config {
  const transportMode = overrides.transportMode ?? "stdio";
  // HTTP enabled by default (needed for hooks), can disable with --no-http
  const enableHttp = overrides.enableHttp ?? true;

  return {
    dbPath: resolvePath(
      overrides.dbPath
      ?? process.env.VECTOR_MEMORY_DB_PATH
      ?? DEFAULT_DB_PATH
    ),
    embeddingModel: DEFAULT_EMBEDDING_MODEL,
    embeddingDimension: DEFAULT_EMBEDDING_DIMENSION,
    httpPort:
      overrides.httpPort
      ?? (process.env.VECTOR_MEMORY_HTTP_PORT
        ? parseInt(process.env.VECTOR_MEMORY_HTTP_PORT, 10)
        : undefined)
      ?? DEFAULT_HTTP_PORT,
    httpHost: DEFAULT_HTTP_HOST,
    enableHttp,
    transportMode,
  };
}

/**
 * Parse CLI arguments into config overrides.
 */
export function parseCliArgs(argv: string[]): ConfigOverrides {
  const args = arg(
    {
      "--db-file": String,
      "--port": Number,
      "--no-http": Boolean,

      // Aliases
      "-d": "--db-file",
      "-p": "--port",
    },
    { argv, permissive: true }
  );

  return {
    dbPath: args["--db-file"],
    httpPort: args["--port"],
    enableHttp: args["--no-http"] ? false : undefined,
  };
}

// Default config for imports that don't use CLI args
export const config = loadConfig();
