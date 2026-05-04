export type ApiProvider = "openrouter" | "openai" | "anthropic" | "google";

export const MODEL_IDS = {
  GPT_5_4: "openai/gpt-5.4",
  GPT_5_4_MINI: "openai/gpt-5.4-mini",
  GPT_5_4_NANO: "openai/gpt-5.4-nano",
  GPT_5_2_CHAT: "openai/gpt-5.2-chat",
  GPT_5_2: "openai/gpt-5.2",
  GPT_5_1: "openai/gpt-5.1",
  GPT_5_MINI: "openai/gpt-5-mini",
  GPT_5_NANO: "openai/gpt-5-nano",
  GPT_OSS_120B_FREE: "openai/gpt-oss-120b:free",
  GPT_OSS_120B: "openai/gpt-oss-120b",
  GPT_OSS_20B_FREE: "openai/gpt-oss-20b:free",
  GPT_OSS_20B: "openai/gpt-oss-20b",
  CLAUDE_SONNET_4_5: "anthropic/claude-sonnet-4.5",
  CLAUDE_OPUS_4_5: "anthropic/claude-opus-4.5",
  GEMINI_3_FLASH_PREVIEW: "google/gemini-3-flash-preview",
  GEMINI_3_PRO_PREVIEW: "google/gemini-3-pro-preview",
  MISTRAL_SMALL_2603: "mistralai/mistral-small-2603",
  GROK_4_1_FAST: "x-ai/grok-4.1-fast",
  NEMOTRON_3_SUPER_120B_FREE: "nvidia/nemotron-3-super-120b-a12b:free",
  KIMI_K2_THINKING: "moonshotai/kimi-k2-thinking",
  KIMI_K2_5: "moonshotai/kimi-k2.5",
  DEEPSEEK_V3_2: "deepseek/deepseek-v3.2",
  MINIMAX_M2_7: "minimax/minimax-m2.7",
  GLM_4_7: "z-ai/glm-4.7",
  GLM_5: "z-ai/glm-5",
  GLM_4_7_FLASH: "z-ai/glm-4.7-flash",
  TRINITY_LARGE_PREVIEW_FREE: "arcee-ai/trinity-large-preview:free",
} as const;

export const PREFERRED_DEFAULT_MODEL_ID = MODEL_IDS.GPT_OSS_120B_FREE;

export const OPENROUTER_ONLY_MODEL_IDS = [
  MODEL_IDS.GPT_5_4_MINI,
  MODEL_IDS.GPT_5_4_NANO,
  MODEL_IDS.GPT_OSS_120B_FREE,
  MODEL_IDS.GPT_OSS_120B,
  MODEL_IDS.GPT_OSS_20B_FREE,
  MODEL_IDS.GPT_OSS_20B,
] as const;

export const OPENROUTER_ROUTED_PROVIDERS = [
  "openrouter",
  "x-ai",
  "mistral",
  "mistralai",
  "meta",
  "nvidia",
  "microsoft",
  "amazon",
  "cohere",
  "moonshotai",
  "deepseek",
  "minimax",
  "qwen",
  "z-ai",
  "stepfun",
  "arcee-ai",
  "inception",
  "bytedance-seed",
] as const;

const openRouterOnlyModelIds = new Set<string>(OPENROUTER_ONLY_MODEL_IDS);
const openRouterRoutedProviders = new Set<string>(OPENROUTER_ROUTED_PROVIDERS);

const DIRECT_PROVIDER_MODEL_ALIASES: Record<ApiProvider, Record<string, string>> = {
  anthropic: {
    "claude-sonnet-4.5": "claude-sonnet-4-5",
    "claude-opus-4.5": "claude-opus-4-5",
  },
  openai: {
    "gpt-5.4": "gpt-5.4-2026-03-05",
    "gpt-5.2-chat": "gpt-5.2-chat-latest",
    "gpt-5.2": "gpt-5.2-2025-12-11",
    "gpt-5.1": "gpt-5.1-2025-11-13",
    "gpt-5-mini": "gpt-5-mini-2025-08-07",
    "gpt-oss-120b:free": "gpt-oss-120b",
    "gpt-oss-120b": "gpt-oss-120b",
    "gpt-oss-20b:free": "gpt-oss-20b",
  },
  google: {
    "gemini-3-flash-preview": "gemini-3-flash-preview",
    "gemini-3-pro-preview": "gemini-3-pro-preview",
  },
  openrouter: {},
};

export const MODEL_DESCRIPTIONS: Record<string, string> = {
  [MODEL_IDS.GPT_5_4]: "Newest flagship GPT model with the strongest reasoning and highest-quality output",
  [MODEL_IDS.GPT_5_4_MINI]: "A faster lower-cost GPT-5.4 variant suited to high-throughput study generations",
  [MODEL_IDS.GPT_5_4_NANO]: "An ultra-fast GPT-5.4 family fallback for extraction, ranking, and lightweight tasks",
  [MODEL_IDS.GPT_5_2_CHAT]: "Fast responses with GPT-5.2 capabilities for rapid prototyping",
  [MODEL_IDS.GPT_5_2]: "Previous flagship GPT model kept for compatibility",
  [MODEL_IDS.GPT_5_1]: "Balanced performance and cost for most generation tasks",
  [MODEL_IDS.GPT_5_MINI]: "Efficient and cost-effective model for quick generations",
  [MODEL_IDS.GPT_5_NANO]: "Ultra-lightweight model optimized for speed and minimal cost",
  [MODEL_IDS.GPT_OSS_120B_FREE]: "Open-source 120B parameter model available at no cost",
  [MODEL_IDS.GPT_OSS_120B]: "Powerful open-source model with advanced reasoning capabilities",
  [MODEL_IDS.GEMINI_3_FLASH_PREVIEW]: "Fast and efficient multimodal model from Google",
  [MODEL_IDS.GEMINI_3_PRO_PREVIEW]: "Advanced reasoning with superior comprehension and output quality",
  [MODEL_IDS.CLAUDE_SONNET_4_5]: "Claude's balanced model for thoughtful analysis",
  [MODEL_IDS.CLAUDE_OPUS_4_5]: "Claude's most capable model for complex reasoning",
  [MODEL_IDS.MISTRAL_SMALL_2603]: "A compact Mistral model with a strong price-performance profile for study workloads",
  [MODEL_IDS.GROK_4_1_FAST]: "High-speed model with real-time information capabilities",
  [MODEL_IDS.NEMOTRON_3_SUPER_120B_FREE]: "A free experimental large model for broad comparisons and fallback testing",
  [MODEL_IDS.KIMI_K2_THINKING]: "Specialized model with extended context understanding",
  [MODEL_IDS.KIMI_K2_5]: "Enhanced reasoning and longer context window",
  [MODEL_IDS.DEEPSEEK_V3_2]: "Cost-efficient model with strong coding capabilities",
  [MODEL_IDS.MINIMAX_M2_7]: "A newer Minimax release positioned as a stronger general-purpose budget model",
  [MODEL_IDS.GLM_4_7]: "Versatile model with strong multilingual support",
  [MODEL_IDS.GLM_5]: "Next-generation GLM model with improved quality and reasoning",
  [MODEL_IDS.GLM_4_7_FLASH]: "Rapid response model optimized for quick answers",
  [MODEL_IDS.TRINITY_LARGE_PREVIEW_FREE]: "Community model available at no cost",
};

export function getModelNameFromId(fullModelId: string): string {
  const parts = fullModelId.split("/");
  return parts.length > 1 ? parts[1] : fullModelId;
}

export function getProviderFromModelId(modelId: string): ApiProvider | null {
  if (openRouterOnlyModelIds.has(modelId)) {
    return "openrouter";
  }

  const provider = modelId.split("/")[0]?.toLowerCase();
  if (!provider || provider === modelId) {
    return null;
  }

  if (provider === "openai") return "openai";
  if (provider === "anthropic") return "anthropic";
  if (provider === "google") return "google";
  if (openRouterRoutedProviders.has(provider)) return "openrouter";

  return null;
}

export function mapModelNameForProvider(modelId: string, provider: ApiProvider): string {
  const modelName = getModelNameFromId(modelId);
  return DIRECT_PROVIDER_MODEL_ALIASES[provider][modelName] ?? modelName;
}
