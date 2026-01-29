/**
 * Seeded Random Sampler
 *
 * Provides reproducible random sampling for consistent benchmark results.
 * Uses a simple mulberry32 PRNG for deterministic sequences.
 */

/**
 * Seeded pseudo-random number generator using mulberry32 algorithm.
 */
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Seeded random sampler for reproducible dataset selection.
 */
export class Sampler {
  private random: () => number;

  /**
   * Create a sampler with the given seed.
   * @param seed - Random seed (default: 42)
   */
  constructor(seed: number = 42) {
    this.random = mulberry32(seed);
  }

  /**
   * Get the next random number in [0, 1).
   */
  next(): number {
    return this.random();
  }

  /**
   * Get a random integer in [0, max).
   */
  nextInt(max: number): number {
    return Math.floor(this.random() * max);
  }

  /**
   * Shuffle an array in place using Fisher-Yates algorithm.
   * Returns the same array reference.
   */
  shuffleInPlace<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Shuffle an array, returning a new array.
   */
  shuffle<T>(array: T[]): T[] {
    return this.shuffleInPlace([...array]);
  }

  /**
   * Pick N random items from an array.
   * Returns a new array with at most N items.
   */
  sample<T>(array: T[], n: number): T[] {
    if (n >= array.length) {
      return this.shuffle(array);
    }

    // For small samples, use reservoir sampling
    if (n <= array.length / 2) {
      return this.reservoirSample(array, n);
    }

    // For large samples, shuffle and take first n
    return this.shuffle(array).slice(0, n);
  }

  /**
   * Reservoir sampling for selecting n items from a stream.
   * More efficient when n is small relative to array size.
   */
  private reservoirSample<T>(array: T[], n: number): T[] {
    const result: T[] = array.slice(0, n);

    for (let i = n; i < array.length; i++) {
      const j = this.nextInt(i + 1);
      if (j < n) {
        result[j] = array[i];
      }
    }

    return result;
  }

  /**
   * Stratified sampling - select items evenly across categories.
   *
   * @param items - Items to sample from
   * @param getCategory - Function to extract category from an item
   * @param perCategory - Number of items per category
   * @returns Sampled items, balanced across categories
   */
  stratifiedSample<T>(
    items: T[],
    getCategory: (item: T) => string,
    perCategory: number
  ): T[] {
    // Group by category
    const groups = new Map<string, T[]>();
    for (const item of items) {
      const category = getCategory(item);
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(item);
    }

    // Sample from each category
    const result: T[] = [];
    for (const [, categoryItems] of groups) {
      result.push(...this.sample(categoryItems, perCategory));
    }

    // Shuffle the combined result
    return this.shuffleInPlace(result);
  }

  /**
   * Pick a random item from an array.
   * Returns undefined if array is empty.
   */
  pick<T>(array: T[]): T | undefined {
    if (array.length === 0) return undefined;
    return array[this.nextInt(array.length)];
  }

  /**
   * Weighted random selection.
   *
   * @param items - Items to select from
   * @param getWeight - Function to get weight for each item (higher = more likely)
   * @returns Selected item
   */
  weightedPick<T>(items: T[], getWeight: (item: T) => number): T | undefined {
    if (items.length === 0) return undefined;

    const totalWeight = items.reduce((sum, item) => sum + getWeight(item), 0);
    if (totalWeight <= 0) return this.pick(items);

    let random = this.random() * totalWeight;
    for (const item of items) {
      random -= getWeight(item);
      if (random <= 0) return item;
    }

    return items[items.length - 1];
  }
}
