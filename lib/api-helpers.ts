import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";
import { decryptKey } from "./encryption";
import { isModelAvailable } from "./models";
import { isModelAvailableViaApiKey } from "./model-availability";
import { getProviderFromModelId, type ApiProvider } from "./model-routing";
import { getConvexClient } from "./convex-server";

export type { ApiProvider } from "./model-routing";

export interface ApiKeyInfo {
  provider: ApiProvider;
  useOwnKey: boolean;
  key?: string;
}

export interface UserContext {
  userId: string;
  userTier: "free" | "basic" | "plus" | "pro";
  useOwnKey: boolean;
  apiKey?: string;
  apiKeys: ApiKeyInfo[];
  preferredLanguage?: string;
  customGuidelines?: string;
  summaryStyleFlags?: number;
  summaryStyleFlagsVersion?: number;
}

const USER_CONTEXT_CACHE_TTL_MS = 15_000;
const MAX_USER_CONTEXT_CACHE_ENTRIES = 200;

type UserContextCacheEntry = {
  expiresAt: number;
  context: UserContext;
};

const userContextCache = new Map<string, UserContextCacheEntry>();
const inFlightUserContext = new Map<string, Promise<UserContext | null>>();

const cloneUserContext = (context: UserContext): UserContext => ({
  ...context,
  apiKeys: context.apiKeys.map((key) => ({ ...key })),
});

const pruneExpiredUserContextCache = () => {
  if (userContextCache.size < MAX_USER_CONTEXT_CACHE_ENTRIES) {
    return;
  }

  const now = Date.now();
  for (const [cacheKey, entry] of userContextCache.entries()) {
    if (entry.expiresAt <= now) {
      userContextCache.delete(cacheKey);
    }
  }

  while (userContextCache.size >= MAX_USER_CONTEXT_CACHE_ENTRIES) {
    const oldestKey = userContextCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    userContextCache.delete(oldestKey);
  }
};

export function invalidateUserContextCache(clerkUserId?: string): void {
  if (clerkUserId) {
    userContextCache.delete(clerkUserId);
    inFlightUserContext.delete(clerkUserId);
    return;
  }

  userContextCache.clear();
  inFlightUserContext.clear();
}

export async function getUserContext(): Promise<UserContext | null> {
  const { userId, getToken } = await auth();

  if (!userId) {
    return null;
  }

  const now = Date.now();
  const cached = userContextCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cloneUserContext(cached.context);
  }

  const inFlight = inFlightUserContext.get(userId);
  if (inFlight) {
    const sharedResult = await inFlight;
    return sharedResult ? cloneUserContext(sharedResult) : null;
  }

  const contextPromise = (async (): Promise<UserContext | null> => {
    const convexToken = await getToken({ template: "convex" });
    if (!convexToken) {
      return null;
    }

    const convex: ConvexHttpClient = getConvexClient();
    convex.setAuth(convexToken);

    const user = await convex.query(api.users.getCurrentUser, {});

    if (!user) {
      return null;
    }

    const activeProviders = await convex.query(api.apiKeys.getActiveProviders, {});

    const apiKeys: ApiKeyInfo[] = [];
    let apiKey: string | undefined;

    const decryptedKeys: string[] = [];
    try {
      for (const providerInfo of activeProviders) {
        const userKey = await convex.query(api.apiKeys.getKeyForProvider, {
          provider: providerInfo.provider,
        });

        if (userKey && userKey.keyHash) {
          try {
            const decryptedKey = decryptKey(userKey.keyHash);
            decryptedKeys.push(decryptedKey);

            apiKeys.push({
              provider: providerInfo.provider,
              useOwnKey: providerInfo.useOwnKey,
              key: decryptedKey,
            });

            if (providerInfo.provider === "openrouter" && providerInfo.useOwnKey) {
              apiKey = decryptedKey;
            }
          } catch (decryptError) {
            console.error(
              `[getUserContext] Failed to decrypt ${providerInfo.provider} key:`,
              decryptError instanceof Error ? decryptError.message : String(decryptError)
            );
          }
        }
      }
    } finally {
      for (let i = 0; i < decryptedKeys.length; i++) {
        decryptedKeys[i] = "";
      }
    }

    const useOwnKeyPreference = apiKeys.some((k) => k.useOwnKey);

    return {
      userId: user._id,
      userTier: user.subscriptionTier,
      useOwnKey: useOwnKeyPreference,
      apiKey,
      apiKeys,
      preferredLanguage: user.preferredLanguage,
      customGuidelines: user.customGuidelines,
      summaryStyleFlags: user.summaryStyleFlags,
      summaryStyleFlagsVersion: user.summaryStyleFlagsVersion,
    };
  })();

  inFlightUserContext.set(userId, contextPromise);

  try {
    const resolved = await contextPromise;

    if (!resolved) {
      return null;
    }

    pruneExpiredUserContextCache();
    userContextCache.set(userId, {
      expiresAt: Date.now() + USER_CONTEXT_CACHE_TTL_MS,
      context: cloneUserContext(resolved),
    });

    return cloneUserContext(resolved);
  } finally {
    inFlightUserContext.delete(userId);
  }
}

/**
 * Get the appropriate API key for a specific model
 * Returns the key and provider info for making the API call
 * 
 * Logic:
 * - If model is available via subscription AND useOwnKey is not enabled: return null (use system key)
 * - If model is NOT available via subscription OR useOwnKey is enabled: use direct provider key if available
 * - Fallback to OpenRouter key if no provider-specific key exists
 */
export function getApiKeyForModel(
  modelId: string,
  userContext: UserContext | null,
  model: { subscriptionTier?: string } | null = null
): { key: string; provider: ApiProvider; isOwnKey: boolean } | null {
  if (!userContext?.apiKeys?.length) {
    return null;
  }

  const modelProvider = getProviderFromModelId(modelId);
  
  // Check if model is available via subscription
  const isAvailableBySubscription = model 
    ? isModelAvailable(model, userContext.userTier)
    : false;
  
  // If model is available via subscription AND user doesn't want to use own keys,
  // return null to use system OpenRouter key
  if (isAvailableBySubscription && !userContext.useOwnKey) {
    return null;
  }

  // Case 3: Model is NOT available via subscription AND user doesn't want to use own keys
  // → Block generation (user must enable useOwnKey or upgrade tier)
  if (!isAvailableBySubscription && !userContext.useOwnKey) {
    return null;
  }

  // Model is NOT available via subscription OR user wants to use own keys
  // Try to find provider-specific key first (direct API access)
  if (modelProvider) {
    const providerKey = userContext.apiKeys.find(k => 
      k.provider === modelProvider && 
      k.key
    );
    if (providerKey) {
      return { key: providerKey.key!, provider: modelProvider, isOwnKey: providerKey.useOwnKey };
    }
  }

  // Fallback to OpenRouter key if no provider-specific key exists
  const openRouterKey = userContext.apiKeys.find(k => 
    k.provider === "openrouter" && 
    k.key
  );
  if (openRouterKey) {
    return { key: openRouterKey.key!, provider: "openrouter", isOwnKey: openRouterKey.useOwnKey };
  }

  return null;
}

/**
 * Check if a model is available for the user
 * Considers both subscription tier AND API keys
 * 
 * Priority: API keys are checked FIRST, then subscription tier
 * This allows users with API keys to access higher tier models
 */
export function checkModelAvailability(
  model: { 
    id?: string;
    openrouterId?: string;
    subscriptionTier?: string 
  },
  userContext: UserContext | null
): boolean {
  const modelId = model.id || model.openrouterId;
  
  // FIRST: Check if user has API key for this model (regardless of useOwnKey preference)
  // Having an API key grants access to the model, even if it's a higher tier
  // Note: We check ALL keys that exist, not just those with useOwnKey=true, because
  // having an API key means the user can access higher tier models (they'll be charged for usage)
  if (userContext && modelId && userContext.apiKeys?.length > 0) {
    // Extract providers from user's API keys (only keys that actually exist)
    // We don't filter by useOwnKey here - having a key grants tier access rights
    const userApiKeyProviders: ApiProvider[] = userContext.apiKeys
      .filter(k => k.key && k.key.trim().length > 0) // Only include keys that exist and are non-empty
      .map(k => k.provider);
    
    // Check if any of the user's API keys grant access to this model
    if (isModelAvailableViaApiKey(modelId, userApiKeyProviders)) {
      console.log(`[checkModelAvailability] Model ${modelId} available via API key (providers: ${userApiKeyProviders.join(", ")})`);
      return true;
    }
  }
  
  // SECOND: Check subscription-based availability
  const availableBySubscription = isModelAvailable(model, userContext?.userTier || "free");
  
  if (!availableBySubscription && userContext && modelId) {
    console.log(`[checkModelAvailability] Model ${modelId} not available - tier: ${model.subscriptionTier}, user tier: ${userContext.userTier}, has API keys: ${userContext.apiKeys?.length > 0}`);
  }
  
  return availableBySubscription;
}

/**
 * Get API key to use (user's key if preferred, otherwise system key)
 * This is a simplified version of getApiKeyForModel for cases where we don't have a specific model.
 * 
 * Note: For model-specific key selection, use getApiKeyForModel() instead.
 */
export function getApiKeyToUse(userContext: UserContext | null): string | undefined {
  // Use getApiKeyForModel with null model to leverage the same logic
  // This ensures consistency between the two functions
  if (userContext?.useOwnKey && userContext.apiKey) {
    return userContext.apiKey;
  }
  return process.env.OPENROUTER_API_KEY;
}
