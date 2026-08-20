import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { loadModels } from "@/lib/models";
import { getModelAvailability, isSubscriptionTiersEnabled, type ApiProvider } from "@/lib/model-availability";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex-server";


export const runtime = "nodejs";

const USER_MODEL_CONTEXT_CACHE_TTL_MS = 15_000;
const MAX_USER_MODEL_CONTEXT_CACHE_ENTRIES = 200;

type CurrentUserContext = {
  userTier: string | null;
  apiKeyProviders: ApiProvider[];
};

type CachedCurrentUserContext = {
  expiresAt: number;
  context: CurrentUserContext;
};

const userModelContextCache = new Map<string, CachedCurrentUserContext>();
const inFlightUserModelContext = new Map<string, Promise<CurrentUserContext>>();

const cloneCurrentUserContext = (context: CurrentUserContext): CurrentUserContext => ({
  userTier: context.userTier,
  apiKeyProviders: [...context.apiKeyProviders],
});

const pruneExpiredUserModelContextCache = () => {
  if (userModelContextCache.size < MAX_USER_MODEL_CONTEXT_CACHE_ENTRIES) {
    return;
  }

  const now = Date.now();
  for (const [cacheKey, entry] of userModelContextCache.entries()) {
    if (entry.expiresAt <= now) {
      userModelContextCache.delete(cacheKey);
    }
  }

  while (userModelContextCache.size >= MAX_USER_MODEL_CONTEXT_CACHE_ENTRIES) {
    const oldestKey = userModelContextCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    userModelContextCache.delete(oldestKey);
  }
};

/**
 * Gets the current user's subscription tier and API keys
 * 
 * @returns Object with user's subscription tier and API key providers
 */
const getCurrentUserContext = async (): Promise<CurrentUserContext> => {
  const { userId, getToken } = await auth();
  if (!userId) return { userTier: null, apiKeyProviders: [] }; // Not logged in

  const now = Date.now();
  const cached = userModelContextCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cloneCurrentUserContext(cached.context);
  }

  const inFlight = inFlightUserModelContext.get(userId);
  if (inFlight) {
    return cloneCurrentUserContext(await inFlight);
  }

  const contextPromise = (async (): Promise<CurrentUserContext> => {
    const convexToken = await getToken({ template: "convex" });
    if (!convexToken) return { userTier: null, apiKeyProviders: [] };

    const convex = getConvexClient();
    convex.setAuth(convexToken);

    const user = await convex.query(api.users.getCurrentUser, {});

    const activeProviders = await convex.query(api.apiKeys.getActiveProviders, {});
    const apiKeyProviders = activeProviders.map((p: { provider: ApiProvider }) => p.provider);

    return {
      userTier: user?.subscriptionTier || "free",
      apiKeyProviders,
    };
  })();

  inFlightUserModelContext.set(userId, contextPromise);

  try {
    const context = await contextPromise;

    pruneExpiredUserModelContextCache();
    userModelContextCache.set(userId, {
      expiresAt: Date.now() + USER_MODEL_CONTEXT_CACHE_TTL_MS,
      context: cloneCurrentUserContext(context),
    });

    return cloneCurrentUserContext(context);
  } finally {
    inFlightUserModelContext.delete(userId);
  }
};

/**
 * Return available model metadata and per-user availability flags.
 */
export async function GET() {
  const models = await loadModels();
  const tiersEnabled = isSubscriptionTiersEnabled();

  // No subscription filtering means user context cannot change model availability.
  // Avoid the Clerk + Convex roundtrip on the default path.
  const { userTier, apiKeyProviders } = tiersEnabled
    ? await getCurrentUserContext()
    : { userTier: null, apiKeyProviders: [] as ApiProvider[] };

  const mappedModels = models.map((model) => {
    // Check full model availability (subscription + API keys)
    const availability = getModelAvailability(
      { 
        id: model.openrouterId, 
        subscriptionTier: model.subscriptionTier 
      }, 
      userTier,
      apiKeyProviders
    );

    // Determine required tier for locked models
    const requiredTier = !availability.isAvailable && model.subscriptionTier
      ? model.subscriptionTier
      : undefined;

    return {
      id: model.openrouterId,
      name: model.name,
      provider: model.provider,
      displayName: model.displayName || `${model.provider}/${model.name}`,
      tokenizer: model.tokenizer,
      pricing: model.pricing,
      subscriptionTier: model.subscriptionTier,
      isAvailable: availability.isAvailable,
      isCoveredBySubscription: availability.isCoveredBySubscription,
      requiresOwnKey: availability.requiresOwnKey && availability.isAvailable,
      requiredTier
    };
  });

  const response = NextResponse.json({
    models: mappedModels
  });

  if (!tiersEnabled) {
    response.headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
  }

  return response;
}
