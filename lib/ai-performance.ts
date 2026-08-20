import type { LanguageModelUsage } from "ai";

export type TimeoutController = {
  signal: AbortSignal;
  cancel: () => void;
};

/**
 * Performance tracking for generation times per model.
 * Stored in memory for the session, can be persisted to Convex for long-term analytics.
 */
type GenerationMetrics = {
  modelId: string;
  durationMs: number;
  documentSize: number;
  timestamp: number;
};

const generationMetrics: GenerationMetrics[] = [];
const MAX_METRICS_HISTORY = 50;

/**
 * Track generation performance for a model.
 */
export const trackGenerationPerformance = (
  modelId: string,
  durationMs: number,
  documentSize: number
): void => {
  generationMetrics.push({
    modelId,
    durationMs,
    documentSize,
    timestamp: Date.now()
  });

  // Keep only recent metrics
  if (generationMetrics.length > MAX_METRICS_HISTORY) {
    generationMetrics.shift();
  }

  // Log for debugging
  console.log(`[Performance] ${modelId}: ${Math.round(durationMs / 1000)}s for ${documentSize} chars`);
};

/**
 * Get average generation time for a model based on recent history.
 */
export const getAverageGenerationTime = (modelId: string): number | null => {
  const modelMetrics = generationMetrics
    .filter(m => m.modelId === modelId)
    .slice(-5); // Last 5 generations

  if (modelMetrics.length === 0) return null;

  const avg = modelMetrics.reduce((sum, m) => sum + m.durationMs, 0) / modelMetrics.length;
  return avg;
};

/**
 * Get estimated completion time based on model, document size, and output type.
 */
export const getEstimatedCompletionTime = (
  modelId: string,
  documentSize: number,
  outputKind?: "summary" | "flashcards" | "quiz"
): number => {
  // Base estimate from historical data
  const historicalAvg = getAverageGenerationTime(modelId);

  if (historicalAvg) {
    // Add 20% buffer to historical average
    let baseEstimate = historicalAvg * 1.2 / 1000;

    // Apply output-type multiplier if provided
    if (outputKind === "flashcards") {
      baseEstimate *= 1.3; // JSON parsing overhead
    } else if (outputKind === "quiz") {
      baseEstimate *= 1.2; // Similar to flashcards
    }

    return Math.ceil(baseEstimate);
  }

  // Fallback to model-specific base estimates (in seconds)
  const baseEstimates: Record<string, number> = {
    "openai/gpt-oss-120b": 90,
    "openai/gpt-oss-20b": 60,
    "anthropic/claude-opus-4.5": 75,
    "anthropic/claude-sonnet-4.5": 45,
    "openai/gpt-5.5": 42,
    "openai/gpt-5.4": 35,
    "openai/gpt-5.4-mini": 18,
    "openai/gpt-5.4-nano": 10,
    "openai/gpt-5.2": 30,
    "openai/gpt-5.1": 25,
    "openai/gpt-5-mini": 15,
    "mistralai/mistral-small-2603": 14,
    "minimax/minimax-m2.7": 20,
    "nvidia/nemotron-3-super-120b-a12b:free": 95,
    "deepseek/deepseek-v3.2": 20,
    "deepseek/deepseek-v4-pro": 28,
    "deepseek/deepseek-v4-flash": 16,
    "openai/gpt-5.6-sol": 45,
    "openai/gpt-5.6-terra": 35,
    "openai/gpt-5.6-luna": 25,
    "anthropic/claude-opus-5": 75,
    "anthropic/claude-sonnet-5": 45,
    "anthropic/claude-haiku-4.5": 25,
    "google/gemini-3.6-flash": 35,
    "google/gemini-3.5-flash": 35,
    "google/gemini-3.5-flash-lite": 20,
    "x-ai/grok-4.5": 30,
    "moonshotai/kimi-k3": 45,
    "z-ai/glm-5.2": 35,
    "minimax/minimax-m3": 25,
    "qwen/qwen3.7-flash": 25,
    "qwen/qwen3.7-plus": 30,
    "qwen/qwen3.7-max": 40,
    "mistralai/mistral-medium-3-5": 30,
    "stepfun/step-3.7-flash": 25,
  };

  const baseTime = baseEstimates[modelId] || 30;

  // Use logarithmic scaling for better accuracy with document size
  // Small docs (<10k): minimal scaling
  // Medium docs (10k-50k): moderate scaling
  // Large docs (>50k): more aggressive scaling
  let sizeFactor: number;
  if (documentSize < 10000) {
    sizeFactor = 1 + (documentSize / 100000); // Very small impact
  } else if (documentSize < 50000) {
    sizeFactor = 1.1 + Math.log10(documentSize / 10000) * 0.3; // Logarithmic scaling
  } else {
    sizeFactor = 1.5 + Math.log10(documentSize / 50000) * 0.4; // More aggressive for large docs
  }

  // Apply output-type multiplier
  if (outputKind === "flashcards") {
    sizeFactor *= 1.3; // JSON parsing overhead
  } else if (outputKind === "quiz") {
    sizeFactor *= 1.2; // Similar to flashcards
  }

  return Math.ceil(baseTime * sizeFactor);
};

/**
 * Format estimated time for display.
 */
export const formatEstimatedTime = (seconds: number): string => {
  if (seconds < 60) return `~${seconds}s`;
  const mins = Math.ceil(seconds / 60);
  return `~${mins} min`;
};

/**
 * Determines if a model needs extended timeout and token limits.
 * Uses adaptive timeouts based on historical performance data.
 */
export const getModelPerformanceConfig = (
  modelId: string,
  documentSize?: number
): {
  timeoutMs: number;
  maxTokensMultiplier: number;
  estimatedTimeSeconds: number;
} => {
  // Models that are known to be slower/larger/problemtic with JSON and need higher multipliers
  const slowModelPatterns = [
    "gpt-oss-120b",
    "gpt-oss-20b",
    "anthropic/claude-opus",
    "nemotron-3-super",
    "grok-4.1-fast", // Grok models can sometimes be verbose
    "gemini-3",      // Gemini preview models might need more buffer
    "grok-4.5",      // Grok models can sometimes be verbose
    "gemini-3.6",    // Gemini 3.6 can spend more tokens on reasoning
    "kimi-k3",       // Long-context reasoning model
  ];

  const isSlowModel = slowModelPatterns.some(pattern => modelId.includes(pattern));
  const isFreeModel = modelId.includes(":free");

  // Calculate estimated time for UI display (default to summary if not specified)
  const estimatedTimeSeconds = getEstimatedCompletionTime(modelId, documentSize || 10000, "summary");

  // Use historical data to adjust timeout if available
  const historicalAvg = getAverageGenerationTime(modelId);
  let timeoutMs: number;

  if (historicalAvg) {
    // Use 3x historical average as timeout (was 2.5x), with minimums
    timeoutMs = Math.max(historicalAvg * 3.0, isSlowModel ? 240_000 : 90_000);
  } else {
    // Increased base timeouts (was 180s/45s)
    timeoutMs = isSlowModel ? 240_000 : 90_000;
  }

  // Multiplier for maxTokens to prevent truncation
  let maxTokensMultiplier = 1.0;
  if (isSlowModel) maxTokensMultiplier = 1.8; // Increased from 1.5
  if (isFreeModel) maxTokensMultiplier = 1.5; // Free models often need more buffer or have lower quality

  return {
    timeoutMs,
    maxTokensMultiplier,
    estimatedTimeSeconds
  };
};

export const createTimeoutController = (timeoutMs: number): TimeoutController => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(0, timeoutMs));
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeoutId)
  };
};

export const isAbortError = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const record = err as Record<string, unknown>;
  return record.name === "AbortError";
};

export const sumUsage = (usages: Array<LanguageModelUsage | undefined>): LanguageModelUsage | undefined => {
  type UsageTotals = { promptTokens: number; completionTokens: number; totalTokens: number };
  const totals = usages.reduce<UsageTotals>(
    (acc, u) => {
      acc.promptTokens += u?.promptTokens ?? 0;
      acc.completionTokens += u?.completionTokens ?? 0;
      acc.totalTokens += u?.totalTokens ?? 0;
      return acc;
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );

  if (totals.promptTokens === 0 && totals.completionTokens === 0 && totals.totalTokens === 0) {
    return undefined;
  }

  return totals;
};

export const splitTextIntoChunks = (
  text: string,
  chunkChars: number,
  {
    overlapChars = 250,
    maxChunks = 8
  }: { overlapChars?: number; maxChunks?: number } = {}
): string[] => {
  const normalized = (text ?? "").trim();
  if (!normalized) return [];
  if (normalized.length <= chunkChars) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length && chunks.length < maxChunks) {
    let end = Math.min(normalized.length, start + chunkChars);

    const searchStart = Math.min(normalized.length, start + Math.floor(chunkChars * 0.6));
    const window = normalized.slice(searchStart, end);
    const breakAt = window.lastIndexOf("\n\n");
    if (breakAt > 0) {
      end = searchStart + breakAt;
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(0, end - overlapChars);
  }

  if (start < normalized.length && chunks.length > 0) {
    const tail = normalized.slice(start).trim();
    if (tail) {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n\n...\n\n${tail}`.trim();
    }
  }

  return chunks;
};

export const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);

  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
};
