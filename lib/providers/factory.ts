import { generateText, streamText } from "ai";
import { createOpenAIProvider } from "./openai";
import { createAnthropicProvider } from "./anthropic";
import { createGoogleProvider } from "./google";
import { createOpenRouterClient, createOpenRouterNativeClient } from "../openrouter";
import type { LanguageModelUsage } from "ai";
import type { ProviderResult } from "./openai";

export type ApiProvider = "openrouter" | "openai" | "anthropic" | "google";

export interface ProviderInfo {
  provider: ApiProvider;
  key: string;
  isOwnKey: boolean;
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
]);


/**
 * Extract provider from model ID
 */
export function getProviderFromModelId(modelId: string): ApiProvider | null {
  if (OPENROUTER_ONLY_MODEL_IDS.has(modelId)) {
    return "openrouter";
  }

  const parts = modelId.split("/");
  if (parts.length < 2) return null;

  const provider = parts[0].toLowerCase() as any;

  if (provider === "openai") return "openai";
  if (provider === "anthropic") return "anthropic";
  if (provider === "google") return "google";
  if (OPENROUTER_ROUTED_PROVIDERS.has(provider)) {
    return "openrouter";
  }

  return null;
}

/**
 * Determines which provider to use based on model ID and available API keys
 */
export function getProviderForModel(modelId: string, apiKeys: ProviderInfo[]): ProviderInfo | null {
  const modelProvider = getProviderFromModelId(modelId);

  // If OpenRouter key exists, it can access all models
  const openRouterKey = apiKeys.find(k => k.provider === "openrouter" && k.isOwnKey);
  if (openRouterKey) {
    return openRouterKey;
  }

  // Check for provider-specific keys
  if (modelProvider && modelProvider !== "openrouter") {
    const providerKey = apiKeys.find(k => k.provider === modelProvider && k.isOwnKey);
    if (providerKey) {
      return providerKey;
    }
  }

  return null;
}

function getModelId(fullModelId: string): string {
  const parts = fullModelId.split("/");
  return parts.length > 1 ? parts[1] : fullModelId;
}

/**
 * Map OpenRouter model names to provider-specific API model names
 * Some providers use different naming conventions than OpenRouter
 */
function mapModelName(modelId: string, provider: ApiProvider): string {
  const model = getModelId(modelId);

  // Provider-specific model name mappings
  const modelMaps: Record<ApiProvider, Record<string, string>> = {
    anthropic: {
      "claude-sonnet-4.5": "claude-sonnet-4-5",
      "claude-opus-4.5": "claude-opus-4-5",
    },
    openai: {
      "gpt-5.5": "gpt-5.5",
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
    openrouter: {
      // OpenRouter uses the same names as OpenRouter (no mapping needed)
    },
  };

  const modelMap = modelMaps[provider];
  if (modelMap && modelMap[model]) {
    return modelMap[model];
  }

  // Return original name if no mapping exists
  return model;
}

function getEffectiveModelId(modelId: string): string {
  return getModelId(modelId);
}


export function createProvider(providerInfo: ProviderInfo) {
  switch (providerInfo.provider) {
    case "openai": {
      const provider = createOpenAIProvider(providerInfo.key);
      return {
        generateText: (modelId: string, messages: any[], options: any) =>
          provider.generateText(mapModelName(modelId, "openai"), messages, options),
        streamText: (modelId: string, messages: any[], options: any) =>
          provider.streamText(mapModelName(modelId, "openai"), messages, options),
      };
    }

    case "anthropic": {
      const provider = createAnthropicProvider(providerInfo.key);
      return {
        generateText: (modelId: string, messages: any[], options: any) =>
          provider.generateText(mapModelName(modelId, "anthropic"), messages, options),
        streamText: (modelId: string, messages: any[], options: any) =>
          provider.streamText(mapModelName(modelId, "anthropic"), messages, options),
      };
    }

    case "google": {
      const provider = createGoogleProvider(providerInfo.key);
      return {
        generateText: (modelId: string, messages: any[], options: any) =>
          provider.generateText(mapModelName(modelId, "google"), messages, options),
        streamText: (modelId: string, messages: any[], options: any) =>
          provider.streamText(mapModelName(modelId, "google"), messages, options),
      };
    }
    case "openrouter":
    default:
      // For OpenRouter, use the existing client
      return {
        generateText: async (
          modelId: string,
          messages: Array<{ role: string; content: string }>,
          options: { maxTokens?: number; temperature?: number; maxRetries?: number; signal?: AbortSignal } = {}
        ): Promise<ProviderResult> => {
          const client = createOpenRouterClient(providerInfo.key);
          const result = await generateText({
            model: client(modelId) as any,
            messages: messages as any,
            maxTokens: options.maxTokens,
            temperature: options.temperature,
            maxRetries: options.maxRetries,
            abortSignal: options.signal,
          });
          return {
            text: result.text,
            usage: result.usage,
            costInUsd: 0, // Will be calculated separately based on model pricing
          };
        },
        streamText: async (
          modelId: string,
          messages: Array<{ role: string; content: string }>,
          options: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {}
        ) => {
          const client = createOpenRouterClient(providerInfo.key);
          const stream = await streamText({
            model: client(modelId) as any,
            messages: messages as any,
            maxTokens: options.maxTokens,
            temperature: options.temperature,
            abortSignal: options.signal,
          });

          return {
            textStream: stream.textStream,
            getUsage: async () => {
              const res = await stream.text;
              return {
                text: res,
                usage: stream.usage as any,
                costInUsd: 0,
              };
            }
          };
        }
      };
  }
}

export async function generateWithProvider(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  apiKeys: ProviderInfo[],
  options: { maxTokens?: number; temperature?: number; maxRetries?: number; signal?: AbortSignal } = {}
): Promise<ProviderResult> {
  const providerInfo = getProviderForModel(modelId, apiKeys);

  if (!providerInfo) {
    throw new Error(`No API key available for model ${modelId}`);
  }

  const provider = createProvider(providerInfo);
  return provider.generateText(modelId, messages, options);
}

export async function streamWithProvider(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  apiKeys: ProviderInfo[],
  options: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {}
): Promise<{ textStream: AsyncIterable<string>; getUsage: () => Promise<ProviderResult> }> {
  const providerInfo = getProviderForModel(modelId, apiKeys);

  if (!providerInfo) {
    throw new Error(`No API key available for model ${modelId}`);
  }

  const provider = createProvider(providerInfo);
  return provider.streamText(modelId, messages, options as any);
}
