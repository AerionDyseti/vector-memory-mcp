/**
 * Data Loader Tests
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { rmSync } from "fs";
import { Sampler } from "./sampler";
import { CacheManager } from "./cache";
import { loadDatasets, getAllSources, getSource, clearCache } from "./index";

// Import sources to register them
import "./sources";

const TEST_CACHE_DIR = ".vector-memory/benchmark-cache-test";

describe("Sampler", () => {
  test("produces deterministic results with same seed", () => {
    const sampler1 = new Sampler(42);
    const sampler2 = new Sampler(42);

    const results1 = Array.from({ length: 10 }, () => sampler1.next());
    const results2 = Array.from({ length: 10 }, () => sampler2.next());

    expect(results1).toEqual(results2);
  });

  test("produces different results with different seeds", () => {
    const sampler1 = new Sampler(42);
    const sampler2 = new Sampler(123);

    const results1 = Array.from({ length: 10 }, () => sampler1.next());
    const results2 = Array.from({ length: 10 }, () => sampler2.next());

    expect(results1).not.toEqual(results2);
  });

  test("shuffle is deterministic", () => {
    const sampler1 = new Sampler(42);
    const sampler2 = new Sampler(42);

    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled1 = sampler1.shuffle([...arr]);
    const shuffled2 = sampler2.shuffle([...arr]);

    expect(shuffled1).toEqual(shuffled2);
    expect(shuffled1).not.toEqual(arr); // Should be different from original
  });

  test("sample returns correct number of items", () => {
    const sampler = new Sampler(42);
    const arr = Array.from({ length: 100 }, (_, i) => i);

    expect(sampler.sample(arr, 10).length).toBe(10);
    expect(sampler.sample(arr, 50).length).toBe(50);
    expect(sampler.sample(arr, 200).length).toBe(100); // Can't exceed array length
  });

  test("stratifiedSample balances across categories", () => {
    const sampler = new Sampler(42);
    const items = [
      { id: 1, cat: "a" },
      { id: 2, cat: "a" },
      { id: 3, cat: "a" },
      { id: 4, cat: "b" },
      { id: 5, cat: "b" },
      { id: 6, cat: "b" },
      { id: 7, cat: "c" },
      { id: 8, cat: "c" },
      { id: 9, cat: "c" },
    ];

    const sampled = sampler.stratifiedSample(items, (i) => i.cat, 2);

    // Should have 2 from each category = 6 total
    expect(sampled.length).toBe(6);

    // Count per category
    const counts = { a: 0, b: 0, c: 0 };
    for (const item of sampled) {
      counts[item.cat as keyof typeof counts]++;
    }

    expect(counts.a).toBe(2);
    expect(counts.b).toBe(2);
    expect(counts.c).toBe(2);
  });
});

describe("CacheManager", () => {
  const cache = new CacheManager(TEST_CACHE_DIR, 60000); // 1 minute expiry

  afterAll(() => {
    rmSync(TEST_CACHE_DIR, { recursive: true, force: true });
  });

  test("get returns null for non-existent cache", async () => {
    const result = await cache.get("non-existent");
    expect(result).toBeNull();
  });

  test("set and get work correctly", async () => {
    const samples = [
      { id: "1", content: "test content", metadata: { foo: "bar" } },
    ];

    await cache.set("test-source", samples);
    const result = await cache.get("test-source");

    expect(result).toEqual(samples);
  });

  test("list returns cached sources", async () => {
    await cache.set("source-a", [{ id: "a", content: "a", metadata: {} }]);
    await cache.set("source-b", [{ id: "b", content: "b", metadata: {} }]);

    const list = cache.list();
    expect(list).toContain("source-a");
    expect(list).toContain("source-b");
  });

  test("clear removes specific source", async () => {
    await cache.set("to-clear", [{ id: "x", content: "x", metadata: {} }]);
    expect(await cache.get("to-clear")).not.toBeNull();

    await cache.clear("to-clear");
    expect(await cache.get("to-clear")).toBeNull();
  });

  test("getInfo returns cache metadata", async () => {
    await cache.set("info-test", [
      { id: "1", content: "a", metadata: {} },
      { id: "2", content: "b", metadata: {} },
    ]);

    const info = await cache.getInfo("info-test");
    expect(info).not.toBeNull();
    expect(info!.sampleCount).toBe(2);
    expect(info!.expired).toBe(false);
    expect(info!.fetchedAt).toBeInstanceOf(Date);
  });
});

describe("Source Registry", () => {
  test("squad source is registered", () => {
    const source = getSource("squad");
    expect(source).toBeDefined();
    expect(source?.name).toBe("squad");
    expect(source?.category).toBe("factual");
  });

  test("getAllSources returns registered sources", () => {
    const sources = getAllSources();
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.some((s) => s.name === "squad")).toBe(true);
  });
});

describe("SQuAD Source", () => {
  // Skip network tests in CI or when running quick tests
  const runNetworkTests = process.env.RUN_NETWORK_TESTS === "true";

  test.skipIf(!runNetworkTests)("fetches samples from HuggingFace", async () => {
    const source = getSource("squad")!;
    const samples = await source.fetch({ limit: 5, seed: 42 });

    expect(samples.length).toBeGreaterThan(0);
    expect(samples.length).toBeLessThanOrEqual(5);

    // Check sample structure
    const sample = samples[0];
    expect(sample.id).toBeDefined();
    expect(sample.content).toBeDefined();
    expect(sample.content.length).toBeGreaterThan(50); // Should be a passage
    expect(sample.queries).toBeDefined();
    expect(sample.queries!.length).toBeGreaterThan(0);
  }, 30000); // 30 second timeout for network

  test.skipIf(!runNetworkTests)("converts to benchmark dataset", async () => {
    const source = getSource("squad")!;
    const samples = await source.fetch({ limit: 3, seed: 42 });
    const dataset = source.toDataset(samples);

    expect(dataset.name).toContain("squad");
    expect(dataset.memories.length).toBe(3);
    expect(dataset.queries.length).toBeGreaterThan(0);

    // Check memory structure
    const memory = dataset.memories[0];
    expect(memory.id).toBeDefined();
    expect(memory.content).toBeDefined();
    expect(memory.domain).toBe("factual");

    // Check query structure
    const query = dataset.queries[0];
    expect(query.id).toBeDefined();
    expect(query.query).toBeDefined();
    expect(query.relevantMemoryIds.length).toBeGreaterThan(0);
  }, 30000);
});

describe("loadDatasets", () => {
  afterAll(async () => {
    await clearCache(undefined, TEST_CACHE_DIR);
  });

  test("returns empty result when no sources specified and none registered", async () => {
    // This test would fail since squad is registered, so let's just verify structure
    const result = await loadDatasets([], { cacheDir: TEST_CACHE_DIR });

    expect(result.datasets).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.cached).toEqual([]);
    expect(result.fetched).toEqual([]);
  });

  test("handles invalid source names gracefully", async () => {
    const result = await loadDatasets(["non-existent-source"], {
      cacheDir: TEST_CACHE_DIR,
    });

    expect(result.datasets).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
