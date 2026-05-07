"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "@/hooks";
import { IconCheck } from "@/components/ui/Icons";
import { useToastContext } from "./ToastProvider";

type TierKey = "free" | "basic" | "plus" | "pro";

const TIER_ORDER: TierKey[] = ["free", "basic", "plus", "pro"];

const TIER_LABELS: Record<TierKey, string> = {
  free: "Free",
  basic: "Basic",
  plus: "Plus",
  pro: "Pro",
};

const TIER_META: Record<
  TierKey,
  {
    eyebrow: string;
    price: string;
    quota: string;
    summary: string;
    badge?: string;
  }
> = {
  free: {
    eyebrow: "Starter access",
    price: "$0",
    quota: "5 generations / month",
    summary:
      "A lightweight plan for testing workflows and short study sessions.",
  },
  basic: {
    eyebrow: "Wider model bench",
    price: "Coming soon",
    quota: "20 generations / month",
    summary:
      "Adds the current mid-tier catalog for more regular coursework and revision.",
  },
  plus: {
    eyebrow: "Stronger reasoning",
    price: "$8 / month",
    quota: "100 generations / month",
    summary:
      "Unlocks higher-end reasoning models while keeping the lower-tier catalog included.",
    badge: "Most Popular",
  },
  pro: {
    eyebrow: "Full catalog",
    price: "$14 / month",
    quota: "200 generations / month",
    summary:
      "Gives access to every active model currently configured in Zemni.",
    badge: "All Models",
  },
};

function normalizeTier(value: string | undefined): TierKey {
  if (value === "basic" || value === "plus" || value === "pro") {
    return value;
  }
  return "free";
}

/**
 * Display subscription status and management options.
 */
export function SubscriptionTab() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const { models } = useAppState();
  const [loading, setLoading] = useState(false);
  const [tierChangeNotification, setTierChangeNotification] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const previousTierRef = useRef<string | undefined>(undefined);
  const toast = useToastContext();
  const isBillingEnabled = process.env.NEXT_PUBLIC_ENABLE_BILLING === "true";

  const subscriptionTier = normalizeTier(currentUser?.subscriptionTier);

  useEffect(() => {
    if (
      previousTierRef.current !== undefined &&
      previousTierRef.current !== subscriptionTier
    ) {
      const message = `Subscription updated to ${TIER_LABELS[subscriptionTier]} plan`;
      setTierChangeNotification(message);
      toast.success(message);
      setTimeout(() => setTierChangeNotification(null), 5000);
    }
    previousTierRef.current = subscriptionTier;
  }, [subscriptionTier, toast]);

  const tierDetails = useMemo(() => {
    const byTier: Record<TierKey, typeof models> = {
      free: [],
      basic: [],
      plus: [],
      pro: [],
    };

    for (const model of models) {
      byTier[normalizeTier(model.subscriptionTier)].push(model);
    }

    return TIER_ORDER.map((tier) => {
      const tierIndex = TIER_ORDER.indexOf(tier);
      const exactModels = byTier[tier];
      const accessibleModels = TIER_ORDER.slice(0, tierIndex + 1).flatMap(
        (includedTier) => byTier[includedTier],
      );
      const lowerTierCount = accessibleModels.length - exactModels.length;

      return {
        tier,
        exactModels,
        accessibleModels,
        lowerTierCount,
      };
    });
  }, [models]);

  const handleManageSubscription = async () => {
    setLoading(true);
    setError(null);
    toast.info("Opening subscription management...", 3000);
    try {
      const response = await fetch("/api/polar/portal", {
        method: "POST",
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (data.url) {
        setTimeout(() => {
          window.location.href = data.url as string;
        }, 100);
      } else if (data.error) {
        const errorMessage = data.error.includes("No active subscription")
          ? "You don't have an active subscription to manage."
          : data.error.includes("Unauthorized")
            ? "Please sign in to manage your subscription."
            : "Unable to open subscription management. Please try again or contact support.";
        setError(errorMessage);
        toast.error(errorMessage);
      }
    } catch (caughtError) {
      console.error("Failed to create portal session:", caughtError);
      const errorMessage =
        "Network error. Please check your connection and try again.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <h2>Subscription</h2>
      </div>

      {tierChangeNotification && (
        <div
          className="settings-notice success"
          style={{ marginBottom: "16px" }}
        >
          {tierChangeNotification}
        </div>
      )}

      {error && (
        <div className="settings-notice error" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {!isBillingEnabled && (
        <div
          className="settings-notice warning settings-subscription-notice"
          style={{ marginBottom: "16px" }}
        >
          <strong>Subscriptions are not available yet.</strong>
          <span>
            Purchases are disabled for now. To unlock more models, add your own
            API keys in Settings / API Keys.
          </span>
        </div>
      )}

      <div className="settings-card">
        <div className="field subscription-current-plan-field">
          <label className="field-label">Current Plan</label>
          <div className="settings-subscription-overview">
            <div className="settings-subscription-overview-main">
              <div className="settings-subscription-overview-copy">
                <span
                  className="settings-tier-badge-large"
                  data-tier={subscriptionTier}
                >
                  {TIER_LABELS[subscriptionTier]}
                </span>
                <div className="settings-subscription-overview-text">
                  <p className="settings-subscription-overview-title">
                    {TIER_META[subscriptionTier].summary}
                  </p>
                  <p className="settings-subscription-overview-subtitle">
                    {TIER_META[subscriptionTier].quota}
                  </p>
                </div>
              </div>
              {(subscriptionTier === "plus" || subscriptionTier === "pro") && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleManageSubscription}
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Manage Subscription"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="settings-divider" />

        <div className="field">
          <label className="field-label">Subscription Tiers</label>
          <div className="settings-tiers-comparison">
            {tierDetails.map(({ tier, exactModels, accessibleModels }) => {
              const isCurrent = subscriptionTier === tier;
              const meta = TIER_META[tier];
              const lowerTierIndex = TIER_ORDER.indexOf(tier) - 1;
              const lowerTierLabel =
                lowerTierIndex >= 0
                  ? TIER_LABELS[TIER_ORDER[lowerTierIndex]]
                  : null;

              return (
                <article
                  key={tier}
                  className={`settings-tier-card-flip${isCurrent ? " active" : ""}`}
                  data-tier={tier}
                >
                  <div className="settings-tier-card-inner">
                    {/* ── FRONT ── */}
                    <div className="settings-tier-card-face settings-tier-card-front">
                      <div>
                        <div className="settings-tier-card-header">
                          <div>
                            <p className="settings-tier-eyebrow">
                              {meta.eyebrow}
                            </p>
                            <h3>{TIER_LABELS[tier]}</h3>
                          </div>
                          <div className="settings-tier-card-badges">
                            {meta.badge && !isCurrent && (
                              <span className="settings-tier-badge-featured">
                                {meta.badge}
                              </span>
                            )}
                            {isCurrent && (
                              <span className="settings-tier-badge-current">
                                Current
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="settings-tier-price-row">
                          <span className="settings-tier-price">
                            {meta.price}
                          </span>
                          <span className="settings-tier-quota">
                            {meta.quota}
                          </span>
                        </div>
                      </div>

                      <div className="settings-tier-front-stats">
                        <div className="settings-tier-front-stat">
                          <span className="settings-tier-front-stat-value">
                            {accessibleModels.length}
                          </span>
                          <span className="settings-tier-front-stat-label">
                            active models
                          </span>
                        </div>
                      </div>

                      <span className="settings-tier-flip-hint">
                        Hover to explore &rarr;
                      </span>
                    </div>

                    {/* ── BACK ── */}
                    <div className="settings-tier-card-face settings-tier-card-back">
                      <p className="settings-tier-back-summary">
                        {meta.summary}
                      </p>

                      {exactModels.length > 0 && (
                        <div className="settings-tier-back-model-showcase">
                          {exactModels.slice(0, 4).map((model) => (
                            <span
                              key={model.id}
                              className="settings-tier-model-chip-sm"
                            >
                              {model.displayName}
                            </span>
                          ))}
                          {exactModels.length > 4 && (
                            <span className="settings-tier-model-chip-more">
                              +{exactModels.length - 4} more
                            </span>
                          )}
                        </div>
                      )}

                      <ul className="settings-tier-back-features">
                        <li>
                          <IconCheck />
                          <span>{meta.quota}</span>
                        </li>
                        <li>
                          <IconCheck />
                          <span>
                            {accessibleModels.length} active models currently
                            mapped
                          </span>
                        </li>
                        <li>
                          <IconCheck />
                          <span>
                            {lowerTierLabel
                              ? `Includes everything in ${lowerTierLabel}`
                              : "Starter model set"}
                          </span>
                        </li>
                      </ul>

                      <button
                        type="button"
                        className="btn btn-secondary settings-tier-action"
                        disabled
                      >
                        {isCurrent ? "Current Plan" : "Coming Soon"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
