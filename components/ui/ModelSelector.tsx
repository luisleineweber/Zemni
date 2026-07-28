"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import type { Model } from "@/types";
import { IconChevron, IconLock } from "./Icons";
import { isModelAvailable } from "@/lib/model-utils";
import Link from "next/link";

interface ModelSelectorProps {
  models: Model[];
  selectedModel: string;
  onModelChange: (value: string) => void;
  userTier?: string | null;
  id?: string;
  className?: string;
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  basic: "Basic",
  plus: "Plus",
  pro: "Pro"
};

const TIER_ORDER = ["free", "basic", "plus", "pro"];

export function ModelSelector({
  models,
  selectedModel,
  onModelChange,
  userTier = "free",
  id,
  className = ""
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const isBillingEnabled = process.env.NEXT_PUBLIC_ENABLE_BILLING === "true";

  // Ensure portal only renders on client (for Next.js SSR)
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate dropdown position when opening
  useEffect(() => {
    if (!isOpen || !mounted || !buttonRef.current) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, mounted]);

  // Group models by their planned subscription tier.
  const groupedModels = useMemo(() => {
    const groups: Record<string, Model[]> = {};

    models.forEach(model => {
      const tier = model.subscriptionTier || "other";
      if (!groups[tier]) {
        groups[tier] = [];
      }
      groups[tier].push(model);
    });

    // Sort tiers according to order, then alphabetically within each tier.
    const sortedGroups: Record<string, Model[]> = {};
    TIER_ORDER.forEach(tier => {
      if (groups[tier]) {
        sortedGroups[tier] = [...groups[tier]].sort((a, b) =>
          a.displayName.localeCompare(b.displayName)
        );
      }
    });

    // Add any remaining tiers not in the order
    Object.keys(groups).forEach(tier => {
      if (!TIER_ORDER.includes(tier)) {
        sortedGroups[tier] = [...groups[tier]].sort((a, b) =>
          a.displayName.localeCompare(b.displayName)
        );
      }
    });

    return sortedGroups;
  }, [models]);

  const selectedModelData = models.find(m => m.id === selectedModel);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      // Check if click is outside both the container and the dropdown (which is portaled)
      const isOutsideContainer = containerRef.current && !containerRef.current.contains(target);
      const isOutsideDropdown = listRef.current && !listRef.current.contains(target);
      
      if (isOutsideContainer && isOutsideDropdown) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen || !listRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const items = listRef.current?.querySelectorAll<HTMLElement>(".model-option");
      if (!items || items.length === 0) return;

      const currentIndex = Array.from(items).findIndex(item =>
        item.getAttribute("aria-selected") === "true"
      );

      let newIndex = currentIndex;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          newIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
          break;
        case "ArrowUp":
          e.preventDefault();
          newIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
          break;
        case "Home":
          e.preventDefault();
          newIndex = 0;
          break;
        case "End":
          e.preventDefault();
          newIndex = items.length - 1;
          break;
        case "Enter":
        case " ":
          if (currentIndex >= 0) {
            e.preventDefault();
            const modelId = items[currentIndex].getAttribute("data-model-id");
            if (modelId) {
              onModelChange(modelId);
              setIsOpen(false);
            }
          }
          return;
      }

      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < items.length) {
        items[newIndex].focus();
        items[newIndex].scrollIntoView({ block: "nearest" });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onModelChange]);

  const handleSelect = (modelId: string, isAvailable: boolean, e: React.MouseEvent) => {
    if (!isAvailable) return;
    e.stopPropagation(); // Prevent backdrop from closing dropdown before selection
    onModelChange(modelId);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  // Check if user has any API keys (to show appropriate messaging)
  const hasApiKeys = models.some(m => m.isAvailable && m.requiresOwnKey);

  return (
    <div className={`model-selector${className ? ` ${className}` : ""}`} ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        className="model-selector-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select model"
      >
        <span className="model-selector-button-text">
          {selectedModelData?.displayName || "Select a model"}
        </span>
        {selectedModelData?.subscriptionTier && (
          <span className={`tier-badge tier-badge-${selectedModelData.subscriptionTier}`}>
            {TIER_LABELS[selectedModelData.subscriptionTier] || selectedModelData.subscriptionTier}
          </span>
        )}
        {selectedModelData?.requiresOwnKey && (
          <span className="own-key-badge" title="Uses your own API key">
            Own Key
          </span>
        )}
        <IconChevron />
      </button>

      {isOpen && mounted && (
        <>
          {createPortal(
            <div className="model-selector-backdrop" onClick={() => setIsOpen(false)} />,
            document.body
          )}
            {createPortal(
            <div 
              className="model-selector-dropdown custom-scrollbar" 
              role="listbox" 
              ref={listRef}
              style={dropdownStyle}
              onClick={(e) => e.stopPropagation()}
            >
            {Object.entries(groupedModels).map(([tier, tierModels]) => {
              const isTierAvailable = isModelAvailable(tier, userTier);
              // Check if any model in this tier is available via API key
              const hasApiKeyAccess = tierModels.some(m => m.isAvailable && m.requiresOwnKey);
              return (
                <div key={tier} className={`model-selector-group${!isTierAvailable && !hasApiKeyAccess ? " tier-locked" : ""}`}>
                  <div className="model-selector-group-header">
                    <span className="model-selector-group-label">
                      {!isTierAvailable && !hasApiKeyAccess && <IconLock />}
                      {TIER_LABELS[tier] || tier.charAt(0).toUpperCase() + tier.slice(1)}
                      {!isTierAvailable && !hasApiKeyAccess && (
                        <span className="unlock-label">
                          {isBillingEnabled ? "Unlock" : "Key required"}
                        </span>
                      )}
                      {hasApiKeyAccess && !isTierAvailable && (
                        <span className="api-key-indicator" title="Available via your API key">
                          Key
                        </span>
                      )}
                    </span>
                  </div>
                  {tierModels.map((model) => {
                    const isSelected = model.id === selectedModel;
                    // Use isAvailable from model data (set by API route based on subscription + API keys)
                    const isAvailable = model.isAvailable ?? isModelAvailable(model.subscriptionTier, userTier);
                    const isOwnKey = model.requiresOwnKey && isAvailable;

                    return (
                      <button
                        key={model.id}
                        type="button"
                        className={`model-option${isSelected ? " selected" : ""}${!isAvailable ? " locked" : ""}${isOwnKey ? " own-key" : ""}`}
                        data-model-id={model.id}
                        onClick={(e) => handleSelect(model.id, isAvailable, e)}
                        aria-selected={isSelected}
                        aria-disabled={!isAvailable}
                        role="option"
                      >
                        <div className="model-option-main">
                          <span className="model-option-name">{model.displayName}</span>
                          {!isAvailable && (model.subscriptionTier === "pro" || model.subscriptionTier === "plus") && (
                            <span className="premium-sparkle" title="Premium Performance">✨</span>
                          )}
                          {isOwnKey && (
                            <span className="own-key-indicator" title="Uses your API key - charges apply to your account">
                              Key
                            </span>
                          )}
                        </div>
                        <div className="model-option-meta">
                          {!isAvailable ? (
                            <span className="upgrade-tag">{TIER_LABELS[model.subscriptionTier || "pro"]}</span>
                          ) : (
                            <>
                              {model.subscriptionTier && model.subscriptionTier !== "free" && model.isCoveredBySubscription && (
                                <span className={`tier-badge tier-badge-${model.subscriptionTier}`}>
                                  {TIER_LABELS[model.subscriptionTier] || model.subscriptionTier}
                                </span>
                              )}
                              {isOwnKey && (
                                <span className="own-cost-badge" title="Charges apply to your API account">
                                  Own Cost
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {userTier !== "pro" && isBillingEnabled && (
              <div className="model-selector-upgrade-cta">
                <Link 
                  href="/settings?tab=models" 
                  onClick={() => {
                    setIsOpen(false);
                    // Set flag to indicate we're navigating to settings
                    // This allows session restoration when coming back
                    if (typeof window !== "undefined") {
                      window.sessionStorage.setItem("zemni_came_from_settings", "true");
                    }
                  }}
                >
                  Unlock premium models →
                </Link>
              </div>
            )}
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}
