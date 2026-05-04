import { generateText, streamText } from "ai";
import { createOpenAIProvider } from "./openai";
import { createAnthropicProvider } from "./anthropic";
import { createGoogleProvider } from "./google";
import { createOpenRouterClient } from "../openrouter";
import { getProviderFromModelId, mapModelNameForProvider, type ApiProvider } from "../model-routing";
import type { ProviderResult } from "./openai";

export type { ApiProvider } from "../model-routing";

export interface ProviderInfo {
  provider: ApiProvider;
  key: string;
  isOwnKey: boolean;
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

export function createProvider(providerInfo: ProviderInfo) {
  switch (providerInfo.provider) {
    case "openai": {
      const provider = createOpenAIProvider(providerInfo.key);
      return {
        generateText: (modelId: string, messages: any[], options: any) =>
          provider.generateText(mapModelNameForProvider(modelId, "openai"), messages, options),
        streamText: (modelId: string, messages: any[], options: any) =>
          provider.streamText(mapModelNameForProvider(modelId, "openai"), messages, options),
      };
    }

    case "anthropic": {
      const provider = createAnthropicProvider(providerInfo.key);
      return {
        generateText: (modelId: string, messages: any[], options: any) =>
          provider.generateText(mapModelNameForProvider(modelId, "anthropic"), messages, options),
        streamText: (modelId: string, messages: any[], options: any) =>
          provider.streamText(mapModelNameForProvider(modelId, "anthropic"), messages, options),
      };
    }

    case "google": {
      const provider = createGoogleProvider(providerInfo.key);
      return {
        generateText: (modelId: string, messages: any[], options: any) =>
          provider.generateText(mapModelNameForProvider(modelId, "google"), messages, options),
        streamText: (modelId: string, messages: any[], options: any) =>
          provider.streamText(mapModelNameForProvider(modelId, "google"), messages, options),
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
