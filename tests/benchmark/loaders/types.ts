/**
 * Data Loader Types
 *
 * Interfaces for fetching and converting external datasets
 * into the benchmark format.
 */

import type { BenchmarkDataset, QueryCategory } from "../types";

/**
 * Category of content for a data source.
 */
export type SourceCategory = "lore" | "design" | "factual" | "context";

/**
 * Options for fetching data from a source.
 */
export interface FetchOptions {
  /** Maximum number of samples to fetch */
  limit: number;
  /** Random seed for reproducible sampling */
  seed?: number;
  /** Force refresh, ignoring cache */
  forceRefresh?: boolean;
}

/**
 * A query associated with a raw sample.
 */
export interface RawQuery {
  /** The query text */
  query: string;
  /** Optional answer text (for Q&A datasets) */
  answer?: string;
  /** Relevance level of this query to the sample */
  relevance?: "high" | "medium" | "low";
  /** Query category for benchmark */
  category?: QueryCategory;
}

/**
 * A raw sample from a data source before conversion.
 */
export interface RawSample {
  /** Unique ID within source */
  id: string;
  /** Main content (passage, memory, etc.) */
  content: string;
  /** Source-specific metadata */
  metadata: Record<string, unknown>;
  /** Pre-defined queries (if source has Q&A pairs) */
  queries?: RawQuery[];
  /** Related sample IDs (for multi-hop datasets) */
  relatedIds?: string[];
}

/**
 * Options for converting samples to benchmark format.
 */
export interface ConvertOptions {
  /** Generate queries for samples without pre-defined queries */
  generateQueries?: boolean;
  /** Prefix for memory IDs */
  idPrefix?: string;
}

/**
 * A data source that can fetch and convert samples.
 */
export interface DataSource {
  /** Unique source identifier */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Primary category for this source */
  readonly category: SourceCategory;
  /** License/attribution info */
  readonly license: string;

  /**
   * Fetch raw samples from the source.
   */
  fetch(options: FetchOptions): Promise<RawSample[]>;

  /**
   * Convert raw samples to benchmark dataset format.
   */
  toDataset(samples: RawSample[], options?: ConvertOptions): BenchmarkDataset;
}

/**
 * Options for loading datasets from multiple sources.
 */
export interface LoadOptions {
  /** Number of samples per source (default: 50) */
  samplesPerSource?: number;
  /** Random seed for reproducible sampling (default: 42) */
  seed?: number;
  /** Use cache if available (default: true) */
  cache?: boolean;
  /** Force refresh all sources */
  forceRefresh?: boolean;
  /** Cache directory path */
  cacheDir?: string;
  /** Cache expiry in milliseconds (default: 7 days) */
  cacheExpiryMs?: number;
}

/**
 * Result of loading datasets.
 */
export interface LoadResult {
  /** Loaded datasets */
  datasets: BenchmarkDataset[];
  /** Sources that failed to load */
  errors: Array<{ source: string; error: Error }>;
  /** Sources loaded from cache */
  cached: string[];
  /** Sources fetched fresh */
  fetched: string[];
}
