import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { isModelAvailable } from "@/lib/models";
import { getModelAvailability, getProviderFromModelId, isModelAvailableViaApiKey } from "@/lib/model-availability";

describe("isModelAvailable", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_SUBSCRIPTION_TIERS", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("Model without tier", () => {
    it("should be available to all users", () => {
      expect(isModelAvailable({}, null)).toBe(true);
      expect(isModelAvailable({}, "free")).toBe(true);
      expect(isModelAvailable({}, "basic")).toBe(true);
      expect(isModelAvailable({}, "plus")).toBe(true);
      expect(isModelAvailable({}, "pro")).toBe(true);
    });
  });

  describe("Free tier models", () => {
    const freeModel = { subscriptionTier: "free" };

    it("should be available to all users", () => {
      expect(isModelAvailable(freeModel, null)).toBe(true);
      expect(isModelAvailable(freeModel, "free")).toBe(true);
      expect(isModelAvailable(freeModel, "basic")).toBe(true);
      expect(isModelAvailable(freeModel, "plus")).toBe(true);
      expect(isModelAvailable(freeModel, "pro")).toBe(true);
    });
  });

  describe("Basic tier models", () => {
    const basicModel = { subscriptionTier: "basic" };

    it("should not be available to non-logged-in users", () => {
      expect(isModelAvailable(basicModel, null)).toBe(false);
    });

    it("should not be available to free tier users", () => {
      expect(isModelAvailable(basicModel, "free")).toBe(false);
    });

    it("should be available to basic tier and above", () => {
      expect(isModelAvailable(basicModel, "basic")).toBe(true);
      expect(isModelAvailable(basicModel, "plus")).toBe(true);
      expect(isModelAvailable(basicModel, "pro")).toBe(true);
    });
  });

  describe("Plus tier models", () => {
    const plusModel = { subscriptionTier: "plus" };

    it("should not be available to non-logged-in, free, or basic users", () => {
      expect(isModelAvailable(plusModel, null)).toBe(false);
      expect(isModelAvailable(plusModel, "free")).toBe(false);
      expect(isModelAvailable(plusModel, "basic")).toBe(false);
    });

    it("should be available to plus tier and above", () => {
      expect(isModelAvailable(plusModel, "plus")).toBe(true);
      expect(isModelAvailable(plusModel, "pro")).toBe(true);
    });
  });

  describe("Pro tier models", () => {
    const proModel = { subscriptionTier: "pro" };

    it("should only be available to pro tier users", () => {
      expect(isModelAvailable(proModel, null)).toBe(false);
      expect(isModelAvailable(proModel, "free")).toBe(false);
      expect(isModelAvailable(proModel, "basic")).toBe(false);
      expect(isModelAvailable(proModel, "plus")).toBe(false);
      expect(isModelAvailable(proModel, "pro")).toBe(true);
    });
  });

  describe("Tier hierarchy", () => {
    it("should respect tier hierarchy - higher tiers include lower tiers", () => {
      const freeModel = { subscriptionTier: "free" };
      const basicModel = { subscriptionTier: "basic" };
      const plusModel = { subscriptionTier: "plus" };
      const proModel = { subscriptionTier: "pro" };

      // Pro tier should have access to all models
      expect(isModelAvailable(freeModel, "pro")).toBe(true);
      expect(isModelAvailable(basicModel, "pro")).toBe(true);
      expect(isModelAvailable(plusModel, "pro")).toBe(true);
      expect(isModelAvailable(proModel, "pro")).toBe(true);

      // Plus tier should have access to free, basic, plus
      expect(isModelAvailable(freeModel, "plus")).toBe(true);
      expect(isModelAvailable(basicModel, "plus")).toBe(true);
      expect(isModelAvailable(plusModel, "plus")).toBe(true);
      expect(isModelAvailable(proModel, "plus")).toBe(false);

      // Basic tier should have access to free, basic
      expect(isModelAvailable(freeModel, "basic")).toBe(true);
      expect(isModelAvailable(basicModel, "basic")).toBe(true);
      expect(isModelAvailable(plusModel, "basic")).toBe(false);
      expect(isModelAvailable(proModel, "basic")).toBe(false);
    });
  });

  describe("when subscription tiers are disabled", () => {
    it("makes tier metadata descriptive instead of restrictive", () => {
      vi.stubEnv("NEXT_PUBLIC_ENABLE_SUBSCRIPTION_TIERS", "false");

      for (const userTier of [null, "free", "basic", "plus", "pro"] as const) {
        expect(isModelAvailable({ subscriptionTier: "pro" }, userTier)).toBe(true);
      }

      expect(getModelAvailability({ id: "openai/example", subscriptionTier: "pro" }, null)).toEqual({
        isAvailable: true,
        isCoveredBySubscription: false,
        requiresOwnKey: false,
        reason: "system",
      });
    });
  });
});

describe("current OpenRouter model families", () => {
  it("routes current non-native families through OpenRouter", () => {
    const openRouterFamilies = [
      "deepseek/deepseek-v4-flash",
      "moonshotai/kimi-k3",
      "z-ai/glm-5.2",
      "minimax/minimax-m3",
      "qwen/qwen3.7-flash",
      "mistralai/mistral-medium-3-5",
      "stepfun/step-3.7-flash",
      "inclusionai/ling-3.0-flash:free",
    ];

    for (const modelId of openRouterFamilies) {
      expect(getProviderFromModelId(modelId), modelId).toBe("openrouter");
      expect(isModelAvailableViaApiKey(modelId, ["openrouter"]), modelId).toBe(true);
    }

    expect(getProviderFromModelId("google/gemma-4-31b-it:free")).toBe("openrouter");
  });

  it("keeps native provider detection for GPT, Claude, and Gemini", () => {
    expect(getProviderFromModelId("openai/gpt-5.6-sol")).toBe("openai");
    expect(getProviderFromModelId("anthropic/claude-opus-5")).toBe("anthropic");
    expect(getProviderFromModelId("google/gemini-3.6-flash")).toBe("google");
  });

});
