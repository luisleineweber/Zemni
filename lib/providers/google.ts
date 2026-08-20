import { generateText, streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModelUsage } from "ai";
import type { ProviderResult } from "./openai";


export function createGoogleProvider(apiKey: string) {
  const google = createGoogleGenerativeAI({ apiKey });

  function getModelId(fullModelId: string): string {
    // Extract model name from google/gemini-1.5-pro format
    const parts = fullModelId.split("/");
    return parts.length > 1 ? parts[1] : fullModelId;
  }

  // Gemini 3.5/3.6 deprecate sampling controls such as temperature.
  // Keep legacy Gemini models compatible while omitting the deprecated field
  // for the current stable models.
  function supportsSamplingParameters(modelId: string): boolean {
    return !/^gemini-3\.(5|6)-/.test(getModelId(modelId));
  }


  return {
    async generateText(
      modelId: string,
      messages: Array<{ role: string; content: string }>,
      options: { maxTokens?: number; temperature?: number; maxRetries?: number; signal?: AbortSignal } = {}
    ): Promise<ProviderResult> {
      const model = google(getModelId(modelId));
      const samplingOptions = supportsSamplingParameters(modelId)
        ? { temperature: options.temperature }
        : {};

      const result = await generateText({
        model: model as any,
        messages: messages as any,
        maxTokens: options.maxTokens,
        ...samplingOptions,
        maxRetries: options.maxRetries,
        abortSignal: options.signal,
      });

      return {
        text: result.text,
        usage: result.usage,
        costInUsd: 0,
      };
    },

    async streamText(
      modelId: string,
      messages: Array<{ role: string; content: string }>,
      options: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {}
    ): Promise<{ textStream: AsyncIterable<string>; getUsage: () => Promise<ProviderResult> }> {
      const model = google(getModelId(modelId));
      const samplingOptions = supportsSamplingParameters(modelId)
        ? { temperature: options.temperature }
        : {};

      const stream = await streamText({
        model: model as any,
        messages: messages as any,
        maxTokens: options.maxTokens,
        ...samplingOptions,
        abortSignal: options.signal,
      });

      return {
        textStream: stream.textStream,
        getUsage: async () => {
          const chunks: string[] = [];
          for await (const chunk of stream.textStream) {
            chunks.push(chunk);
          }

          const fullText = chunks.join("");
          const estimatedCompletionTokens = Math.ceil(fullText.length / 4);
          const estimatedPromptTokens = messages.reduce((acc, m) => acc + Math.ceil(m.content.length / 4), 0);

          const usage: LanguageModelUsage = {
            promptTokens: estimatedPromptTokens,
            completionTokens: estimatedCompletionTokens,
            totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
          };

          return {
            text: fullText,
            usage,
            costInUsd: 0,
          };
        },
      };
    },
  };
}

export type GoogleProvider = ReturnType<typeof createGoogleProvider>;
