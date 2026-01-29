/**
 * SQuAD Data Source
 *
 * Stanford Question Answering Dataset - Wikipedia passages with Q&A pairs.
 * Fetches from HuggingFace Datasets API.
 *
 * @see https://huggingface.co/datasets/rajpurkar/squad
 * @license CC BY-SA 4.0
 */

import type { BenchmarkDataset, GroundTruthMemory, GroundTruthQuery } from "../../types";
import { Sampler } from "../sampler";
import type { DataSource, FetchOptions, RawSample, ConvertOptions } from "../types";
import { registerSource } from "../index";

const HUGGINGFACE_API = "https://datasets-server.huggingface.co";
const DATASET_NAME = "rajpurkar/squad";
const CONFIG = "plain_text";

/**
 * SQuAD row structure from HuggingFace API.
 */
interface SquadRow {
  row_idx: number;
  row: {
    id: string;
    title: string;
    context: string;
    question: string;
    answers: {
      text: string[];
      answer_start: number[];
    };
  };
}

/**
 * SQuAD API response structure.
 */
interface SquadApiResponse {
  features: Array<{ feature_idx: number; name: string; type: { dtype: string } }>;
  rows: SquadRow[];
  num_rows_total: number;
  num_rows_per_page: number;
}

/**
 * SQuAD data source implementation.
 */
export class SquadSource implements DataSource {
  readonly name = "squad";
  readonly description = "Stanford Question Answering Dataset - Wikipedia passages with Q&A";
  readonly category = "factual" as const;
  readonly license = "CC BY-SA 4.0";

  /**
   * Fetch samples from SQuAD dataset.
   */
  async fetch(options: FetchOptions): Promise<RawSample[]> {
    const { limit, seed = 42 } = options;
    const sampler = new Sampler(seed);

    // Fetch more rows than needed to allow for sampling
    // SQuAD has ~87k training examples, we'll fetch from random offsets
    const fetchLimit = Math.min(limit * 3, 500);

    // Generate random offsets to sample from different parts of the dataset
    const totalRows = 87599; // SQuAD training set size
    const offsets = Array.from({ length: 5 }, () => sampler.nextInt(totalRows - fetchLimit));

    const allRows: SquadRow[] = [];

    for (const offset of offsets) {
      try {
        const url = `${HUGGINGFACE_API}/rows?dataset=${DATASET_NAME}&config=${CONFIG}&split=train&offset=${offset}&length=${Math.ceil(fetchLimit / 5)}`;
        const response = await fetch(url);

        if (!response.ok) {
          console.warn(`SQuAD fetch failed at offset ${offset}: ${response.status}`);
          continue;
        }

        const data: SquadApiResponse = await response.json();
        allRows.push(...data.rows);
      } catch (error) {
        console.warn(`SQuAD fetch error at offset ${offset}:`, error);
      }
    }

    if (allRows.length === 0) {
      throw new Error("Failed to fetch any rows from SQuAD dataset");
    }

    // Group by context to avoid duplicate passages
    const contextMap = new Map<string, SquadRow[]>();
    for (const row of allRows) {
      const context = row.row.context;
      if (!contextMap.has(context)) {
        contextMap.set(context, []);
      }
      contextMap.get(context)!.push(row);
    }

    // Sample unique contexts
    const uniqueContexts = Array.from(contextMap.entries());
    const sampledContexts = sampler.sample(uniqueContexts, limit);

    // Convert to RawSample format
    return sampledContexts.map(([context, rows]) => {
      const firstRow = rows[0].row;
      return {
        id: `squad-${firstRow.id}`,
        content: context,
        metadata: {
          title: firstRow.title,
          source: "squad",
        },
        queries: rows.map((r) => ({
          query: r.row.question,
          answer: r.row.answers.text[0],
          relevance: "high" as const,
        })),
      };
    });
  }

  /**
   * Convert raw samples to benchmark dataset format.
   */
  toDataset(samples: RawSample[], options: ConvertOptions = {}): BenchmarkDataset {
    const { idPrefix = "squad" } = options;

    const memories: GroundTruthMemory[] = [];
    const queries: GroundTruthQuery[] = [];

    for (const sample of samples) {
      const memoryId = `${idPrefix}-${sample.id}`;

      // Create memory from context
      memories.push({
        id: memoryId,
        content: sample.content,
        metadata: sample.metadata,
        domain: "factual",
      });

      // Create queries from Q&A pairs
      if (sample.queries) {
        for (let i = 0; i < sample.queries.length; i++) {
          const q = sample.queries[i];
          queries.push({
            id: `${memoryId}-q${i}`,
            query: q.query,
            relevantMemoryIds: [memoryId],
            partiallyRelevantIds: [],
            category: "exact_match", // SQuAD questions are designed to be answerable
          });
        }
      }
    }

    return {
      name: `${idPrefix}-dataset`,
      description: `SQuAD dataset samples (${memories.length} passages, ${queries.length} questions)`,
      memories,
      queries,
    };
  }
}

// Create and register the source
export const squadSource = new SquadSource();
registerSource(squadSource);
