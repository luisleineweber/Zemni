"use client";

import { useAppState } from "@/hooks";
import { ModelSelector, ProviderIcon } from "@/components/ui";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useMemo } from "react";

/**
 * Return a short human-readable description for a model id.
 */
function getModelDescription(modelId: string): string {
  const descriptions: Record<string, string> = {
    "openai/gpt-5.5":
      "OpenAI frontier model for complex professional reasoning, coding, and multimodal workloads",
    "openai/gpt-5.4":
      "Newest flagship GPT model with the strongest reasoning and highest-quality output",
    "openai/gpt-5.4-mini":
      "A faster lower-cost GPT-5.4 variant suited to high-throughput study generations",
    "openai/gpt-5.4-nano":
      "An ultra-fast GPT-5.4 family fallback for extraction, ranking, and lightweight tasks",
    "openai/gpt-5.2-chat":
      "Fast responses with GPT-5.2 capabilities for rapid prototyping",
    "openai/gpt-5.2": "Previous flagship GPT model kept for compatibility",
    "openai/gpt-5.1": "Balanced performance and cost for most generation tasks",
    "openai/gpt-5-mini":
      "Efficient and cost-effective model for quick generations",
    "openai/gpt-5-nano":
      "Ultra-lightweight model optimized for speed and minimal cost",
    "openai/gpt-oss-120b:free":
      "Open-source 120B parameter model available at no cost",
    "openai/gpt-oss-120b":
      "Powerful open-source model with advanced reasoning capabilities",
    "google/gemini-3-flash-preview":
      "Fast and efficient multimodal model from Google",
    "google/gemini-3-pro-preview":
      "Advanced reasoning with superior comprehension and output quality",
    "anthropic/claude-sonnet-4.5":
      "Claude's balanced model for thoughtful analysis",
    "anthropic/claude-opus-4.5":
      "Claude's most capable model for complex reasoning",
    "mistralai/mistral-small-2603":
      "A compact Mistral model with a strong price-performance profile for study workloads",
    "x-ai/grok-4.1-fast":
      "High-speed model with real-time information capabilities",
    "nvidia/nemotron-3-super-120b-a12b:free":
      "A free experimental large model for broad comparisons and fallback testing",
    "moonshotai/kimi-k2-thinking":
      "Specialized model with extended context understanding",
    "moonshotai/kimi-k2.5": "Enhanced reasoning and longer context window",
    "deepseek/deepseek-v3.2":
      "Cost-efficient model with strong coding capabilities",
    "deepseek/deepseek-v4-pro":
      "DeepSeek's higher-capability release for stronger reasoning and study output quality",
    "deepseek/deepseek-v4-flash":
      "DeepSeek's faster release tuned for lower-latency generation and lighter workloads",
    "minimax/minimax-m2.7":
      "A newer Minimax release positioned as a stronger general-purpose budget model",
    "z-ai/glm-4.7": "Versatile model with strong multilingual support",
    "z-ai/glm-5":
      "Next-generation GLM model with improved quality and reasoning",
    "z-ai/glm-4.7-flash": "Rapid response model optimized for quick answers",
    "arcee-ai/trinity-large-preview:free":
      "Community model available at no cost",
  };

  return (
    descriptions[modelId] ||
    "General-purpose language model for content generation"
  );
}

/**
 * Settings tab for selecting and browsing models.
 */
export function ModelsTab() {
  const {
    models,
    selectedModel,
    setSelectedModel,
    defaultModel,
    setDefaultModel,
  } = useAppState();
  const currentUser = useQuery(api.users.getCurrentUser);
  const [searchQuery, setSearchQuery] = useState("");

  const subscriptionTier = currentUser?.subscriptionTier || "free";

  const availableModels = useMemo(
    () => models.filter((model) => model.isAvailable !== false),
    [models],
  );
  const selectedAvailableModel =
    availableModels.find(
      (model) => model.id === (defaultModel || selectedModel),
    )?.id ||
    availableModels[0]?.id ||
    "";

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return availableModels;

    const query = searchQuery.toLowerCase();
    return availableModels.filter((model) => {
      const nameMatch = model.displayName.toLowerCase().includes(query);
      const providerMatch = model.provider.toLowerCase().includes(query);
      const descMatch = getModelDescription(model.id)
        .toLowerCase()
        .includes(query);
      const tierMatch = (model.subscriptionTier || "")
        .toLowerCase()
        .includes(query);
      return nameMatch || providerMatch || descMatch || tierMatch;
    });
  }, [availableModels, searchQuery]);

  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <h2>Models</h2>
      </div>

      <div className="settings-card">
        <div className="field">
          <label className="field-label" htmlFor="settings-default-model">
            Default Model
          </label>
          <ModelSelector
            id="settings-default-model"
            models={availableModels}
            userTier={subscriptionTier}
            selectedModel={selectedAvailableModel}
            onModelChange={(modelId) => {
              setDefaultModel(modelId);
              setSelectedModel(modelId);
            }}
          />
          <p className="field-hint">
            This becomes the default selection on the main screen.
          </p>
        </div>

        <div className="settings-divider" />

        <div className="field">
          <label className="field-label">Available Models</label>

          {/* Search Input */}
          <div className="settings-models-search">
            <div className="settings-search-icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search models by name, provider, or tier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="settings-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="settings-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="settings-models-list">
            {filteredModels.length === 0 ? (
              <div className="settings-models-empty">
                No models found matching "{searchQuery}"
              </div>
            ) : (
              filteredModels.map((model) => {
                const description =
                  model.description || getModelDescription(model.id);

                return (
                  <div key={model.id} className="settings-model-item">
                    <div className="settings-model-info">
                      <div className="settings-model-header">
                        <ProviderIcon provider={model.provider} size="md" />
                        <div className="settings-model-name">
                          {model.displayName}
                        </div>
                        {model.subscriptionTier && (
                          <span
                            className="settings-model-tier"
                            data-tier={model.subscriptionTier}
                          >
                            {model.subscriptionTier}
                          </span>
                        )}
                      </div>
                      <div className="settings-model-description">
                        {description}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
