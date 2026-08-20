/**
 * Client-safe model availability logic with API key support.
 * This file contains NO Node.js imports (fs/path) and can be imported by client components.
 */

export type ApiProvider = "openrouter" | "openai" | "anthropic" | "google";

export interface ModelAvailability {
  isAvailable: boolean;
  isCoveredBySubscription: boolean;
  requiresOwnKey: boolean;
  reason: "subscription" | "api_key" | "locked" | "system";
}

const OPENROUTER_ONLY_MODEL_IDS = new Set([
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-nano",
]);

const OPENROUTER_ROUTED_PROVIDERS = new Set([
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
  "inclusionai",
  "poolside",
]);

/**
 * Extract provider from model ID
 * E.g., "openai/gpt-4" -> "openai", "anthropic/claude-3" -> "anthropic"
 */
export function getProviderFromModelId(modelId: string): ApiProvider | null {
  if (OPENROUTER_ONLY_MODEL_IDS.has(modelId)) {
    return "openrouter";
  }

  const parts = modelId.split("/");
  if (parts.length < 2) return null;

  // Variant suffixes such as :free and :thinking are OpenRouter routing
  // selectors, not direct provider model IDs.
  if (parts.slice(1).some((part) => part.includes(":"))) {
    return "openrouter";
  }
  
  const provider = parts[0].toLowerCase();
  
  if (provider === "openai") return "openai";
  if (provider === "anthropic") return "anthropic";
  if (provider === "google") return "google";
  if (OPENROUTER_ROUTED_PROVIDERS.has(provider)) {
    // These providers are accessed via OpenRouter
    return "openrouter";
  }
  
  return null;
}

/**
 * Core logic to determine if a model tier is available for a user tier.
 * This is the unified implementation used by both server and client.
 *
 * @param modelTier - The tier required by the model (undefined = no tier restriction)
 * @param userTier - Current user's subscription tier (null = not logged in, "free" = logged in no sub, "basic" = basic sub, "plus" = plus sub, "pro" = pro sub)
 * @returns true if the model is available, false otherwise
 */
function checkModelTierAvailability(
  modelTier: string | undefined,
  userTier: string | null
): boolean {
  // Until billing is enabled, tier metadata is descriptive only.
  if (!isSubscriptionTiersEnabled()) {
    return true;
  }

  // If model has no tier, make it available (fallback)
  if (!modelTier) {
    return true;
  }

  // Not logged in (null userTier): only free tier models
  if (userTier === null) {
    return modelTier === "free";
  }

  // Legacy/edge case: "free" tier in database (shouldn't happen for new users, but handle gracefully)
  if (userTier === "free") {
    return modelTier === "free";
  }

  // Basic tier: automatically awarded to all logged-in users - can access free and basic tier models
  if (userTier === "basic") {
    return modelTier === "free" || modelTier === "basic";
  }

  // Plus subscription: free, basic, and plus tier models
  if (userTier === "plus") {
    return modelTier === "free" || modelTier === "basic" || modelTier === "plus";
  }

  // Pro subscription: all models
  if (userTier === "pro") {
    return true;
  }

  // Fallback
  return modelTier === "free";
}

/**
 * Check if a model is available through user's API keys
 */
export function isModelAvailableViaApiKey(
  modelId: string,
  userApiKeys: ApiProvider[]
): boolean {
  const modelProvider = getProviderFromModelId(modelId);
  
  if (!modelProvider) return false;
  
  // OpenRouter key gives access to ALL models
  if (userApiKeys.includes("openrouter")) {
    return true;
  }
  
  // Provider-specific keys give access to their models
  if (modelProvider === "openai" && userApiKeys.includes("openai")) {
    return true;
  }
  
  if (modelProvider === "anthropic" && userApiKeys.includes("anthropic")) {
    return true;
  }
  
  if (modelProvider === "google" && userApiKeys.includes("google")) {
    return true;
  }
  
  return false;
}

/**
 * Determines full model availability including API keys
 * Returns detailed information about why a model is available or locked
 */
export function getModelAvailability(
  model: { 
    id?: string;
    subscriptionTier?: string;
    openrouterId?: string;
  },
  userTier: string | null = null,
  userApiKeys: ApiProvider[] = []
): ModelAvailability {
  const modelId = model.id || model.openrouterId || "";
  const modelTier = model.subscriptionTier;

  // In the pre-billing mode, the configured system key covers every active model.
  if (!isSubscriptionTiersEnabled()) {
    return {
      isAvailable: true,
      isCoveredBySubscription: false,
      requiresOwnKey: false,
      reason: "system",
    };
  }
  
  // Check subscription-based availability
  const isAvailableBySubscription = checkModelTierAvailability(modelTier, userTier);
  
  // Check API key-based availability
  const isAvailableByApiKey = modelId ? isModelAvailableViaApiKey(modelId, userApiKeys) : false;
  
  // Determine final availability
  const isAvailable = isAvailableBySubscription || isAvailableByApiKey;
  
  if (!isAvailable) {
    return {
      isAvailable: false,
      isCoveredBySubscription: false,
      requiresOwnKey: true,
      reason: "locked"
    };
  }
  
  if (isAvailableBySubscription) {
    return {
      isAvailable: true,
      isCoveredBySubscription: true,
      requiresOwnKey: false,
      reason: "subscription"
    };
  }
  
  // Available via API key (not covered by subscription)
  return {
    isAvailable: true,
    isCoveredBySubscription: false,
    requiresOwnKey: true,
    reason: "api_key"
  };
}

/**
 * Determines if a model is available for the current user based on subscription tier.
 * Client-safe version that accepts a model object.
 * Legacy function - use getModelAvailability for more details
 *
 * @param model - The model to check
 * @param userTier - Current user's subscription tier (null = not logged in, "free" = logged in no sub, "basic" = basic sub, "plus" = plus sub, "pro" = pro sub)
 * @returns true if the model is available, false otherwise
 */
export const isModelAvailable = (
  model: { subscriptionTier?: string },
  userTier: string | null = null
): boolean => {
  return checkModelTierAvailability(model.subscriptionTier, userTier);
};

/**
 * Client-safe version that accepts model tier as a string directly.
 * Used by ModelSelector for checking tier availability without full model object.
 * Legacy function - use getModelAvailability for more details
 *
 * @param modelTier - The tier required by the model
 * @param userTier - Current user's subscription tier (null = not logged in, "free" = logged in no sub, "basic" = basic sub, "plus" = plus sub, "pro" = pro sub)
 * @returns true if the model is available, false otherwise
 */
export const isModelAvailableByTier = (
  modelTier: string | undefined,
  userTier: string | null = "free"
): boolean => {
  return checkModelTierAvailability(modelTier, userTier);
};

export const TIER_ORDER = ["free", "basic", "plus", "pro"] as const;

export const getTierHierarchy = (tier: string): number => {
  const index = TIER_ORDER.indexOf(tier as any);
  return index === -1 ? 0 : index;
};

/**
 * Checks if subscription tiers feature is enabled via environment variable
 * Client-safe version - checks NEXT_PUBLIC_ env var
 */
export const isSubscriptionTiersEnabled = (): boolean => {
  if (typeof process !== "undefined" && process.env) {
    const value = process.env.NEXT_PUBLIC_ENABLE_SUBSCRIPTION_TIERS;
    return value === "true" || value === "1";
  }
  return false;
};
