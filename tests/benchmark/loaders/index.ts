/**
 * Benchmark Dataset Loaders
 *
 * Load and cache datasets from external sources for benchmarking.
 */

import type { BenchmarkDataset } from "../types";
import { CacheManager } from "./cache";
import { Sampler } from "./sampler";
import type { DataSource, LoadOptions, LoadResult, RawSample } from "./types";

// Re-export types
export * from "./types";
export { CacheManager } from "./cache";
export { Sampler } from "./sampler";

// Source registry
const sources: Map<string, DataSource> = new Map();

/**
 * Register a data source.
 */
export function registerSource(source: DataSource): void {
  sources.set(source.name, source);
}

/**
 * Get a registered data source by name.
 */
export function getSource(name: string): DataSource | undefined {
  return sources.get(name);
}

/**
 * Get all registered data sources.
 */
export function getAllSources(): DataSource[] {
  return Array.from(sources.values());
}

/**
 * Get registered source names.
 */
export function getSourceNames(): string[] {
  return Array.from(sources.keys());
}

/**
 * Load datasets from multiple sources.
 *
 * @param sourcesToLoad - Sources to load (or all registered if not specified)
 * @param options - Load options
 * @returns Load result with datasets and any errors
 */
export async function loadDatasets(
  sourcesToLoad?: DataSource[] | string[],
  options: LoadOptions = {}
): Promise<LoadResult> {
  const {
    samplesPerSource = 50,
    seed = 42,
    cache: useCache = true,
    forceRefresh = false,
    cacheDir = ".vector-memory/benchmark-cache",
    cacheExpiryMs,
  } = options;

  const cacheManager = new CacheManager(cacheDir, cacheExpiryMs);
  const sampler = new Sampler(seed);

  // Resolve sources
  let resolvedSources: DataSource[];
  if (!sourcesToLoad) {
    resolvedSources = getAllSources();
  } else if (typeof sourcesToLoad[0] === "string") {
    resolvedSources = (sourcesToLoad as string[])
      .map((name) => getSource(name))
      .filter((s): s is DataSource => s !== undefined);
  } else {
    resolvedSources = sourcesToLoad as DataSource[];
  }

  const result: LoadResult = {
    datasets: [],
    errors: [],
    cached: [],
    fetched: [],
  };

  for (const source of resolvedSources) {
    try {
      let samples: RawSample[] | null = null;

      // Try cache first (unless force refresh)
      if (useCache && !forceRefresh) {
        samples = await cacheManager.get(source.name, cacheExpiryMs);
        if (samples) {
          result.cached.push(source.name);
        }
      }

      // Fetch if not cached
      if (!samples) {
        samples = await source.fetch({
          limit: samplesPerSource,
          seed,
          forceRefresh,
        });

        // Cache the fetched samples
        if (useCache) {
          await cacheManager.set(source.name, samples);
        }

        result.fetched.push(source.name);
      }

      // Convert to dataset
      const dataset = source.toDataset(samples, {
        idPrefix: source.name,
      });

      result.datasets.push(dataset);
    } catch (error) {
      result.errors.push({
        source: source.name,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  return result;
}

/**
 * Load all registered sources and merge into a single dataset.
 */
export async function loadMergedDataset(
  options: LoadOptions = {}
): Promise<BenchmarkDataset> {
  const result = await loadDatasets(undefined, options);

  // Merge all datasets
  const merged: BenchmarkDataset = {
    name: "merged",
    description: `Merged dataset from ${result.datasets.length} sources`,
    memories: [],
    queries: [],
  };

  for (const dataset of result.datasets) {
    merged.memories.push(...dataset.memories);
    merged.queries.push(...dataset.queries);
  }

  return merged;
}

/**
 * Clear the loader cache.
 */
export async function clearCache(
  source?: string,
  cacheDir: string = ".vector-memory/benchmark-cache"
): Promise<void> {
  const cacheManager = new CacheManager(cacheDir);
  await cacheManager.clear(source);
}

/**
 * Get cache status for all sources.
 */
export async function getCacheStatus(
  cacheDir: string = ".vector-memory/benchmark-cache"
): Promise<
  Map<string, { fetchedAt: Date; sampleCount: number; expired: boolean }>
> {
  const cacheManager = new CacheManager(cacheDir);
  const status = new Map<
    string,
    { fetchedAt: Date; sampleCount: number; expired: boolean }
  >();

  for (const source of cacheManager.list()) {
    const info = await cacheManager.getInfo(source);
    if (info) {
      status.set(source, info);
    }
  }

  return status;
}
