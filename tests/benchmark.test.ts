/**
 * Search Quality Benchmark Tests
 *
 * Measures retrieval quality using standard IR metrics against
 * a ground truth dataset.
 */

import { describe, expect, beforeAll, afterAll } from "bun:test";
import { BenchmarkRunner } from "./benchmark/runner";
import {
  formatReport,
  formatCompactSummary,
  defaultThresholds,
} from "./benchmark/reporter";
import { generalDataset } from "./benchmark/datasets";
import { isModelAvailable, testWithModel } from "./utils/model-loader";

describe("Search Quality Benchmark", () => {
  let runner: BenchmarkRunner;

  beforeAll(async () => {
    if (!isModelAvailable()) return;
    runner = new BenchmarkRunner();
    await runner.setup();
    await runner.loadDataset(generalDataset);
  });

  afterAll(async () => {
    if (runner) {
      await runner.teardown();
    }
  });

  testWithModel("meets minimum quality thresholds", async () => {
    const results = await runner.runBenchmark(generalDataset);
    const { report, passed, warnings } = formatReport(results, defaultThresholds);

    // Print the full report
    console.log(report);

    // Print compact summary
    console.log(formatCompactSummary(results));

    // Print warnings
    for (const warning of warnings) {
      console.warn(`Warning: ${warning}`);
    }

    expect(passed).toBe(true);
  });

  // Threshold adjusted for hybrid search with intent-based scoring and jitter
  // Lowered to 0.65 to account for cross-platform embedding variance
  testWithModel("exact match queries achieve MRR >= 0.65", async () => {
    const results = await runner.runBenchmark(generalDataset);
    const exactMatch = results.byCategory.get("exact_match");

    expect(exactMatch).toBeDefined();
    expect(exactMatch!.meanReciprocalRank).toBeGreaterThanOrEqual(0.65);
  });

  testWithModel("semantic queries achieve MRR >= 0.5", async () => {
    const results = await runner.runBenchmark(generalDataset);
    const semantic = results.byCategory.get("semantic");

    expect(semantic).toBeDefined();
    expect(semantic!.meanReciprocalRank).toBeGreaterThanOrEqual(0.5);
  });

  testWithModel("related concept queries achieve Recall@5 >= 0.4", async () => {
    const results = await runner.runBenchmark(generalDataset);
    const related = results.byCategory.get("related_concept");

    expect(related).toBeDefined();
    expect(related!.meanRecallAt5).toBeGreaterThanOrEqual(0.4);
  });

  testWithModel("edge case queries achieve MRR >= 0.33", async () => {
    const results = await runner.runBenchmark(generalDataset);
    const edge = results.byCategory.get("edge_case");

    expect(edge).toBeDefined();
    expect(edge!.meanReciprocalRank).toBeGreaterThanOrEqual(0.33);
  });

  testWithModel("reports per-query results for debugging", async () => {
    const results = await runner.runBenchmark(generalDataset);

    // Verify we have results for all queries
    expect(results.queryResults.length).toBe(generalDataset.queries.length);

    // Verify each result has required fields
    for (const result of results.queryResults) {
      expect(result.queryId).toBeDefined();
      expect(result.query).toBeDefined();
      expect(result.category).toBeDefined();
      expect(typeof result.precision1).toBe("number");
      expect(typeof result.reciprocalRank).toBe("number");
      expect(typeof result.passed).toBe("boolean");
    }
  });
});
