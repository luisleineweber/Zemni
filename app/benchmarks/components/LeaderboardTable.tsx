import type { ModelMetrics, ModelRankingStatus, TaskFilter } from "../types";
import { clamp0to100, costPer100QualityPoints, formatMoney, formatMs, getDisplayName, scoreFor } from "../utils";

interface LeaderboardTableProps {
  rows: Array<{ modelId: string; model: ModelMetrics | null }>;
  selection: { modelId: string; testKey: string };
  filters: { task: TaskFilter; topic: string };
  onSelect: (modelId: string) => void;
  modelDisplayNames: Record<string, string>;
  modelStatus?: Record<string, ModelRankingStatus>;
  metricsComprehensive?: Record<string, any>;
}

export function LeaderboardTable({
  rows,
  selection,
  filters,
  onSelect,
  modelDisplayNames,
  modelStatus,
  metricsComprehensive,
}: LeaderboardTableProps) {
  // Check if task data is present
  const hasTaskData =
    filters.task !== "all" &&
    metricsComprehensive &&
    Object.keys(metricsComprehensive).length > 0 &&
    Object.values(metricsComprehensive).some((comp) => {
      const taskMetrics = comp.by_task?.[filters.task];
      return taskMetrics && taskMetrics.test_count && taskMetrics.test_count > 0;
    });
  const isTested =
    filters.task !== "all" &&
    metricsComprehensive &&
    Object.values(metricsComprehensive).some((comp) => comp.summary_stats?.tasks_tested?.includes(filters.task));

  if (filters.task !== "all" && !hasTaskData && !isTested && filters.task !== "summary") {
    return (
      <div className="benchmark-empty-state" role="status">
        <div className="benchmark-empty-title">
          {filters.task.charAt(0).toUpperCase() + filters.task.slice(1)} data will be available later
        </div>
        <div className="benchmark-empty-subtitle">
          This release pass currently covers summary and quiz for the new DeepSeek models. Run flashcards separately if needed.
        </div>
      </div>
    );
  }

  if (filters.task !== "all" && !hasTaskData && !isTested && filters.task !== "summary") {
    return null;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="benchmark-table" aria-label="Model leaderboard">
        <thead>
          <tr>
            <th style={{ width: "72px" }}>Rank</th>
            <th>Model</th>
            <th className="benchmark-th-right">Score</th>
            <th className="benchmark-th-right">Reliability</th>
            <th className="benchmark-th-right">Quality</th>
            <th className="benchmark-th-right">Cost per 100 pts</th>
            <th className="benchmark-th-right">Total cost</th>
            <th className="benchmark-th-right">Latency</th>
            <th className="benchmark-th-right">Tests</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ modelId, model }, idx) => {
            if (!model) return null;
            const status = modelStatus?.[modelId];
            const rank = idx + 1;
            const badgeClass =
              rank === 1
                ? "benchmark-rank-badge-gold"
                : rank === 2
                  ? "benchmark-rank-badge-silver"
                  : rank === 3
                    ? "benchmark-rank-badge-bronze"
                    : "benchmark-rank-badge-default";

            const score = scoreFor(model);
            const scoreClass =
              score >= 80 ? "benchmark-score-high" : score >= 60 ? "benchmark-score-medium" : "benchmark-score-low";
            const isSelected = selection.modelId === modelId;

            return (
              <tr
                key={modelId}
                className={isSelected ? "benchmark-row-selected" : undefined}
                onClick={() => onSelect(modelId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    onSelect(modelId);
                  }
                }}
                aria-label={`Select ${getDisplayName(modelId, modelDisplayNames)}`}
              >
                <td>
                  <span className={`benchmark-rank-badge ${badgeClass}`}>{rank}</span>
                </td>
                <td style={{ fontWeight: "600" }}>
                  <span className="benchmark-model-id">{getDisplayName(modelId, modelDisplayNames)}</span>
                  {status?.is_partial && (
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        color: "#8a5a00",
                        background: "#fff4d6",
                        border: "1px solid #f0d48a",
                        borderRadius: "999px",
                        padding: "0.1rem 0.45rem",
                      }}
                      title={
                        status.missing_requirements?.length
                          ? `Missing overall coverage: ${status.missing_requirements.join(", ")}`
                          : "Incomplete task coverage"
                      }
                    >
                      partial
                    </span>
                  )}
                </td>
                <td className="benchmark-td-right">
                  <div className="benchmark-scorecell">
                    <span className={scoreClass}>{score.toFixed(1)}</span>
                    <div className="benchmark-bar" aria-hidden="true">
                      <div className="benchmark-bar-fill" style={{ width: `${clamp0to100(score)}%` }} />
                    </div>
                  </div>
                </td>
                <td className="benchmark-td-right">
                  {model.reliability?.mean != null ? (
                    <span
                      title={model.reliability?.std_dev != null ? `std dev: ${model.reliability.std_dev.toFixed(2)}` : undefined}
                    >
                      {model.reliability.mean.toFixed(1)}
                    </span>
                  ) : (
                    "N/A"
                  )}
                </td>
                <td className="benchmark-td-right">
                  {model.content_quality?.mean != null ? (
                    <span
                      title={
                        model.content_quality?.std_dev != null
                          ? `std dev: ${model.content_quality.std_dev.toFixed(2)}`
                          : undefined
                      }
                    >
                      {model.content_quality.mean.toFixed(1)}
                    </span>
                  ) : (
                    "N/A"
                  )}
                </td>
                <td className="benchmark-td-right">
                  {costPer100QualityPoints(model) !== Infinity
                    ? formatMoney(costPer100QualityPoints(model))
                    : "N/A"}
                </td>
                <td className="benchmark-td-right">
                  {model.cost?.total != null ? formatMoney(model.cost.total) : "N/A"}
                </td>
                <td className="benchmark-td-right">
                  {model.latency?.mean != null ? formatMs(model.latency.mean) : "N/A"}
                </td>
                <td className="benchmark-td-right">{model.test_count ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
