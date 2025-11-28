import { pipeline, type FeatureExtractionPipeline, AutoModel, AutoTokenizer } from "@huggingface/transformers";

export class EmbeddingsService {
  private modelName: string;
  private extractor: FeatureExtractionPipeline | null = null; // For pipeline models
  private tokenizer: AutoTokenizer | null = null; // For AutoModel
  private model: AutoModel | null = null; // For AutoModel
  private initPromise: Promise<void> | null = null;
  private _dimension: number;

  private embeddingGemmaPrefixes = {
    query: "task: search result | query: ",
    document: "title: none | text: ",
  };

  constructor(modelName: string, dimension: number) {
    this.modelName = modelName;
    this._dimension = dimension;
  }

  get dimension(): number {
    return this._dimension;
  }

  private async init(): Promise<void> {
    if (this.extractor || (this.tokenizer && this.model)) {
      return; // Already initialized
    }

    if (!this.initPromise) {
      this.initPromise = (async () => {
        if (this.modelName === "onnx-community/embeddinggemma-300m-ONNX") {
          this.tokenizer = await AutoTokenizer.from_pretrained(this.modelName);
          const modelOptions: { dtype?: string } = { dtype: "fp32" };
          this.model = await AutoModel.from_pretrained(this.modelName, modelOptions);
        } else {
          // Use pipeline for other models like Xenova/all-MiniLM-L6-v2
          this.extractor = await pipeline("feature-extraction", this.modelName, {
            quantized: true, // Use quantized model for performance
          }) as FeatureExtractionPipeline;
        }
      })();
    }
    await this.initPromise;
  }

  private normalize(embedding: Float32Array): Float32Array {
    let sumSq = 0;
    for (let i = 0; i < embedding.length; i++) {
      sumSq += embedding[i] * embedding[i];
    }
    const norm = Math.sqrt(sumSq);
    if (norm === 0) return embedding;

    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }
    return embedding;
  }

  async embed(text: string): Promise<number[]> {
    await this.init();

    if (this.modelName === "onnx-community/embeddinggemma-300m-ONNX") {
      if (!this.tokenizer || !this.model) {
        throw new Error("Tokenizer or Model not initialized for embeddinggemma.");
      }
      const processedText = this.embeddingGemmaPrefixes.document + text;
      const inputs = await this.tokenizer([processedText], { padding: true, truncation: true });
      // @ts-ignore
      const { last_hidden_state, pooler_output, sentence_embedding } = await this.model(inputs);

      let embeddingsTensor;
      if (sentence_embedding) {
        embeddingsTensor = sentence_embedding;
      }
      else if (pooler_output) {
        embeddingsTensor = pooler_output;
      }
      else if (last_hidden_state) {
        const inputMask = inputs.attention_mask;
        const maskedEmbeddings = last_hidden_state.mul(inputMask.unsqueeze(-1));
        const sumEmbeddings = maskedEmbeddings.sum(1);
        const sumMask = inputMask.sum(1).unsqueeze(-1);
        embeddingsTensor = sumEmbeddings.div(sumMask);
      } else {
        throw new Error("Could not extract embeddings from embeddinggemma model output.");
      }
      const embeddingArray = Array.from(embeddingsTensor.data as Float32Array);
      return Array.from(this.normalize(new Float32Array(embeddingArray)));

    } else {
      // For pipeline models
      if (!this.extractor) {
        throw new Error("Extractor not initialized for pipeline model.");
      }
      const output = await this.extractor(text, { pooling: "mean", normalize: true });
      return Array.from(output.data as Float32Array);
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.init();

    if (this.modelName === "onnx-community/embeddinggemma-300m-ONNX") {
      if (!this.tokenizer || !this.model) {
        throw new Error("Tokenizer or Model not initialized for embeddinggemma.");
      }
      const processedTexts = texts.map(text => this.embeddingGemmaPrefixes.document + text);
      const inputs = await this.tokenizer(processedTexts, { padding: true, truncation: true });
      // @ts-ignore
      const { last_hidden_state, pooler_output, sentence_embedding } = await this.model(inputs);

      let embeddingsTensor;
      if (sentence_embedding) {
        embeddingsTensor = sentence_embedding;
      }
      else if (pooler_output) {
        embeddingsTensor = pooler_output;
      }
      else if (last_hidden_state) {
        const inputMask = inputs.attention_mask;
        const maskedEmbeddings = last_hidden_state.mul(inputMask.unsqueeze(-1));
        const sumEmbeddings = maskedEmbeddings.sum(1);
        const sumMask = inputMask.sum(1).unsqueeze(-1);
        embeddingsTensor = sumEmbeddings.div(sumMask);
      } else {
        throw new Error("Could not extract embeddings from embeddinggemma model output.");
      }

      const result: number[][] = [];
      for (let i = 0; i < embeddingsTensor.dims[0]; i++) {
        const singleEmbedding = new Float32Array(embeddingsTensor.data.slice(i * embeddingsTensor.dims[1], (i + 1) * embeddingsTensor.dims[1]));
        result.push(Array.from(this.normalize(singleEmbedding)));
      }
      return result;

    } else {
      // For pipeline models
      if (!this.extractor) {
        throw new Error("Extractor not initialized for pipeline model.");
      }
      const results: number[][] = [];
      for (const text of texts) {
        const output = await this.extractor(text, { pooling: "mean", normalize: true });
        results.push(Array.from(output.data as Float32Array));
      }
      return results;
    }
  }
}
