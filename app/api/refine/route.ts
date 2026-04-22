import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { StreamData, streamText } from "ai";
import { buildRefineSystemPrompt, buildRefineUserPrompt } from "@/lib/prompts";
import { loadModels } from "@/lib/models";
import { getUserContext, checkModelAvailability, getApiKeyToUse, getApiKeyForModel } from "@/lib/api-helpers";
import { createOpenRouterClient } from "@/lib/openrouter";
import { buildUsageStats } from "@/lib/usage";
import { validateTextSize } from "@/lib/request-validation";
import { validateSummaryText, validateMessagesArray, validateModelId } from "@/lib/utils/validation";
import { enforceGenerationRateLimit } from "@/lib/generation-rate-limit";

export const runtime = "nodejs";

/**
 * Stream a refined summary from the provided summary and messages.
 */
export async function POST(request: Request) {
  const { userId: clerkUserId, getToken } = await auth();
  const rateLimitResponse = await enforceGenerationRateLimit(
    request,
    { userId: clerkUserId, getToken },
    "refine"
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const userContext = await getUserContext();

  const apiKey = getApiKeyToUse(userContext);

  if (!apiKey) {
    return NextResponse.json({ error: "Missing OpenRouter key" }, { status: 400 });
  }

  const body = await request.json();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const summary = String(body.summary ?? "");
  const modelId = String(body.modelId ?? "");

  if (!summary || !modelId) {
    return NextResponse.json({ error: "Missing summary or model" }, { status: 400 });
  }

  // Validate summary text size (byte size)
  const summarySizeValidation = validateTextSize(summary);
  if (!summarySizeValidation.valid) {
    return NextResponse.json({ error: summarySizeValidation.error }, { status: 413 });
  }

  // Validate summary text length (character count)
  const summaryValidation = validateSummaryText(summary);
  if (!summaryValidation.valid) {
    return NextResponse.json({ error: summaryValidation.error }, { status: 400 });
  }

  // Validate messages array
  const messagesValidation = validateMessagesArray(messages);
  if (!messagesValidation.valid) {
    return NextResponse.json({ error: messagesValidation.error }, { status: 400 });
  }

  // Validate model ID
  const modelValidation = await validateModelId(modelId);
  if (!modelValidation.valid) {
    return NextResponse.json({ error: modelValidation.error }, { status: 400 });
  }

  const models = await loadModels();
  const model = models.find((item) => item.openrouterId === modelId) ?? null;

  if (!model) {
    return NextResponse.json({ error: "Model not found" }, { status: 400 });
  }

  // Check if user has access to this model (subscription OR API key)
  const hasModelAccess = checkModelAvailability(
    { id: model.openrouterId, subscriptionTier: model.subscriptionTier },
    userContext
  );

  if (!hasModelAccess) {
    return NextResponse.json(
      { error: "This model is not available for your subscription tier. Add an API key in settings to use higher tier models." },
      { status: 403 }
    );
  }

  // Determine which API key to use (system key for subscription models, user key for own-cost models)
  const modelApiKeyInfo = getApiKeyForModel(modelId, userContext, model);
  const isOwnKey = !!modelApiKeyInfo?.isOwnKey;
  const isOpenRouterProvider = modelApiKeyInfo?.provider === "openrouter";
  const systemOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const openrouterKey = isOpenRouterProvider ? modelApiKeyInfo?.key : (systemOpenRouterKey ?? apiKey);
  
  // Debug logging (only when using own key)
  if (isOwnKey) {
    if (isOpenRouterProvider) {
      console.log(`[refine] Using own ${modelApiKeyInfo?.provider || "openrouter"} key for ${modelId}`);
    } else {
      console.log(`[refine] Own ${modelApiKeyInfo?.provider} key available for ${modelId}; streaming uses OpenRouter fallback`);
    }
  }

  if (modelApiKeyInfo && !isOpenRouterProvider) {
    console.warn(
      `[refine] Non-OpenRouter key for ${modelId} (${modelApiKeyInfo.provider}); using system OpenRouter key for streaming.`
    );
    if (!systemOpenRouterKey) {
      console.warn("[refine] System OpenRouter key missing; falling back to OpenRouter key from request context.");
    }
  }

  // Get user preferences for language and custom guidelines
  const userLanguage = userContext?.preferredLanguage || "en";
  const customGuidelines = userContext?.customGuidelines;
  const summaryStyleFlags = userContext?.summaryStyleFlags;
  const summaryStyleFlagsVersion = userContext?.summaryStyleFlagsVersion;

  // For streaming, we use OpenRouter client (works for both system and user OpenRouter keys)
  // If user has own key with OpenRouter provider, use that; otherwise use system key
  const openrouterClient = createOpenRouterClient(openrouterKey);
  const systemPrompt = await buildRefineSystemPrompt(
    userLanguage,
    customGuidelines,
    summaryStyleFlags,
    summaryStyleFlagsVersion
  );
  const summaryPrompt = buildRefineUserPrompt(summary, userLanguage);
  const data = new StreamData();
  const start = Date.now();
  const result = await streamText({
    model: openrouterClient(modelId) as any,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: summaryPrompt },
      ...messages,
    ],
    onFinish: (event) => {
      const usage = buildUsageStats(event.usage, Date.now() - start, model, "refine");
      if (usage) {
        data.append({ type: "usage", payload: usage });
      }
      void data.close();
    }
  });

  return result.toDataStreamResponse({ data });
}
