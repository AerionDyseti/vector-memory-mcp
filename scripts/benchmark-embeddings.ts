import { EmbeddingsService } from "../src/services/embeddings.service";

async function benchmarkEmbeddings() {
  const models = [
    { name: "Xenova/all-MiniLM-L6-v2", dimension: 384 },
    { name: "onnx-community/embeddinggemma-300m-ONNX", dimension: 768 },
  ];

  const sampleTexts = [
    "This is a test sentence for benchmarking embedding models.",
    "The quick brown fox jumps over the lazy dog.",
    "Artificial intelligence is a rapidly evolving field.",
    "Benchmarking helps us understand performance trade-offs.",
    "Hello world, this is a longer sentence for testing purposes and should provide a good measure of performance.",
    "The sun always shines brightest after the rain.",
    "Innovation is the key to progress and future development in technology.",
    "Comparing different models allows us to make informed decisions about their suitability for specific tasks.",
    "How fast can these models embed a given piece of text?",
    "We need to ensure that the chosen model meets our latency and accuracy requirements.",
  ];

  console.log("Starting embedding benchmarks...");
  console.log(`Sample texts count: ${sampleTexts.length}`);
  console.log("----------------------------------------");

  for (const modelConfig of models) {
    console.log(`Benchmarking model: ${modelConfig.name}`);
    console.log(`Dimension: ${modelConfig.dimension}`);

    const service = new EmbeddingsService(
      modelConfig.name,
      modelConfig.dimension
    );

    // Run a warm-up/initial load pass
    console.log("Warming up model (first inference will download/load)...");
    let startTime = performance.now();
    await service.embed(sampleTexts[0]);
    let endTime = performance.now();
    console.log(`Warm-up/Load time: ${(endTime - startTime).toFixed(2)} ms`);

    const iterations = 10;
    const batchSize = sampleTexts.length;
    let totalEmbeddingTime = 0;

    for (let i = 0; i < iterations; i++) {
      startTime = performance.now();
      await service.embed(sampleTexts); // Embed all sample texts in one batch
      endTime = performance.now();
      totalEmbeddingTime += endTime - startTime;
    }

    const averageEmbeddingTime = totalEmbeddingTime / iterations;
    console.log(
      `Average embedding time for ${batchSize} texts (${iterations} iterations): ${averageEmbeddingTime.toFixed(2)} ms`
    );
    console.log("----------------------------------------");
  }

  console.log("Benchmarking complete.");
}

benchmarkEmbeddings().catch(console.error);
