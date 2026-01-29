/**
 * Cache Manager
 *
 * Caches fetched samples locally to avoid re-fetching on every run.
 * Stores JSON files in .vector-memory/benchmark-cache/
 */

import { existsSync, mkdirSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import type { RawSample } from "./types";

const DEFAULT_CACHE_DIR = ".vector-memory/benchmark-cache";
const DEFAULT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Cache entry stored on disk.
 */
export interface CacheEntry {
  /** Source name */
  source: string;
  /** Timestamp when fetched */
  fetchedAt: number;
  /** Cached samples */
  samples: RawSample[];
  /** Version for cache invalidation */
  version: number;
}

const CACHE_VERSION = 1;

/**
 * Manages caching of fetched samples.
 */
export class CacheManager {
  private readonly cacheDir: string;
  private readonly expiryMs: number;

  constructor(cacheDir: string = DEFAULT_CACHE_DIR, expiryMs: number = DEFAULT_EXPIRY_MS) {
    this.cacheDir = cacheDir;
    this.expiryMs = expiryMs;
  }

  /**
   * Get cached samples for a source.
   * Returns null if not cached or expired.
   */
  async get(source: string, maxAgeMs?: number): Promise<RawSample[] | null> {
    const filePath = this.getCachePath(source);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const file = Bun.file(filePath);
      const entry: CacheEntry = await file.json();

      // Check version
      if (entry.version !== CACHE_VERSION) {
        return null;
      }

      // Check expiry
      const maxAge = maxAgeMs ?? this.expiryMs;
      const age = Date.now() - entry.fetchedAt;
      if (age > maxAge) {
        return null;
      }

      return entry.samples;
    } catch {
      // Invalid cache file
      return null;
    }
  }

  /**
   * Store samples in cache.
   */
  async set(source: string, samples: RawSample[]): Promise<void> {
    this.ensureCacheDir();

    const entry: CacheEntry = {
      source,
      fetchedAt: Date.now(),
      samples,
      version: CACHE_VERSION,
    };

    const filePath = this.getCachePath(source);
    await Bun.write(filePath, JSON.stringify(entry, null, 2));
  }

  /**
   * Clear cache for a source, or all sources if not specified.
   */
  async clear(source?: string): Promise<void> {
    if (source) {
      const filePath = this.getCachePath(source);
      if (existsSync(filePath)) {
        rmSync(filePath);
      }
    } else {
      if (existsSync(this.cacheDir)) {
        rmSync(this.cacheDir, { recursive: true });
      }
    }
  }

  /**
   * List all cached sources.
   */
  list(): string[] {
    if (!existsSync(this.cacheDir)) {
      return [];
    }

    return readdirSync(this.cacheDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""));
  }

  /**
   * Get cache info for a source.
   */
  async getInfo(
    source: string
  ): Promise<{ fetchedAt: Date; sampleCount: number; expired: boolean } | null> {
    const filePath = this.getCachePath(source);

    if (!existsSync(filePath)) {
      return null;
    }

    try {
      const file = Bun.file(filePath);
      const entry: CacheEntry = await file.json();

      return {
        fetchedAt: new Date(entry.fetchedAt),
        sampleCount: entry.samples.length,
        expired: Date.now() - entry.fetchedAt > this.expiryMs,
      };
    } catch {
      return null;
    }
  }

  private getCachePath(source: string): string {
    // Sanitize source name for filesystem
    const safeName = source.replace(/[^a-zA-Z0-9-_]/g, "-");
    return join(this.cacheDir, `${safeName}.json`);
  }

  private ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }
}
