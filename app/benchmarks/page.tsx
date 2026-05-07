"use client";

import { useEffect } from "react";
import { useBenchmarkData } from "./hooks/useBenchmarkData";
import { useBenchmarkFilters } from "./hooks/useBenchmarkFilters";
import { useBenchmarkMetrics } from "./hooks/useBenchmarkMetrics";
import { BenchmarkControls } from "./components/BenchmarkControls";
import { LeaderboardTable } from "./components/LeaderboardTable";
import { TaskPerformanceSection } from "./components/TaskPerformanceSection";
import { TopicPerformanceSection } from "./components/TopicPerformanceSection";
import { ModelExplorer } from "./components/ModelExplorer";
import { DetailedMetricsSection } from "./components/DetailedMetricsSection";
import { RankingsSection } from "./components/RankingsSection";
import { formatTopicName } from "./utils";

export default function BenchmarksPage() {
  const { data, loading, error, modelDisplayNames } = useBenchmarkData();
  const {
    filters,
    setFilters,
    view,
    setView,
    selection,
    setSelection,
    collapsedTaskSections,
    setCollapsedTaskSections,
  } = useBenchmarkFilters();

  // Initialize selection when data loads
  useEffect(() => {
    if (data && !selection.modelId) {
      const modelIds = Object.keys(data.metrics || {});
      if (modelIds.length > 0) {
        setSelection((prev) => ({ ...prev, modelId: modelIds[0] }));
      }
    }
  }, [data, selection.modelId, setSelection]);

  const {
    metrics,
    metricsComprehensive,
    rankings,
    rankingDetails,
    modelStatus,
    modelIds,
    topicsList,
    leaderboardRows,
    limitedLeaderboardRows,
    availableFormatsForSelectedModel,
    selectedTest,
    selectedModelMetrics,
  } = useBenchmarkMetrics({
    data,
    filters,
    view,
    selection,
    modelDisplayNames,
  });

  const toggleTaskSection = (modelId: string, task: string) => {
    const key = `${modelId}::${task}`;
    setCollapsedTaskSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Early returns after all hooks
  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center" }}>
        <p>Loading benchmark data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "red" }}>
        <p>Error loading benchmark data: {error}</p>
      </div>
    );
  }

  if (!data || !data.hasResults) {
    return (
      <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
        <h1>Model Benchmarks</h1>
        <p>No benchmark results found. Run the benchmark first:</p>
        <pre style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "4px", overflow: "auto" }}>
          {`cd benchmark
python run_benchmark.py --models "deepseek/deepseek-v4-pro,deepseek/deepseek-v4-flash" --tasks summary,quiz --test-cases benchmark/results/test_cases.release-deepseek.json`}
        </pre>
      </div>
    );
  }

  return (
    <div className="benchmark-container">
      <div className="benchmark-header">
        <h1>Model Benchmarks</h1>
        <p className="benchmark-subtitle">Compare model performance across tasks. Scores use a 1-100 scale.</p>
      </div>

      <BenchmarkControls
        filters={filters}
        view={view}
        topicsList={topicsList}
        setFilters={setFilters}
        setView={setView}
      />

      {/* Overall Rankings */}
      <section className="benchmark-section">
        <div className="benchmark-section-header">
          <h2>Leaderboard</h2>
          <div className="benchmark-stats-text">
            Showing {limitedLeaderboardRows.length} of {leaderboardRows.length} models
            {filters.task !== "all" ? ` | Task: ${filters.task}` : ""}
            {filters.topic !== "all" ? ` | Topic: ${formatTopicName(filters.topic)}` : ""}
          </div>
        </div>
        <LeaderboardTable
          rows={limitedLeaderboardRows}
          selection={selection}
          filters={filters}
          onSelect={(modelId) => setSelection({ modelId, testKey: "" })}
          modelDisplayNames={modelDisplayNames}
          modelStatus={modelStatus}
          metricsComprehensive={metricsComprehensive}
        />
      </section>

      {/* Task-Specific Breakdown */}
      {metricsComprehensive && Object.keys(metricsComprehensive).length > 0 && (
        <TaskPerformanceSection
          metricsComprehensive={metricsComprehensive}
          collapsedTaskSections={collapsedTaskSections}
          onToggleTaskSection={toggleTaskSection}
          modelDisplayNames={modelDisplayNames}
        />
      )}

      {/* Topic-Specific Breakdown */}
      {metricsComprehensive && Object.keys(metricsComprehensive).length > 0 && (
        <TopicPerformanceSection
          topicsList={topicsList}
          metricsComprehensive={metricsComprehensive}
          modelDisplayNames={modelDisplayNames}
        />
      )}

      {/* Per-test breakdown for selected model */}
      <ModelExplorer
        selection={selection}
        filters={filters}
        data={data}
        selectedModelMetrics={selectedModelMetrics}
        availableFormats={availableFormatsForSelectedModel}
        selectedTest={selectedTest}
        modelIds={modelIds}
        modelDisplayNames={modelDisplayNames}
        onSelectModel={(modelId) => setSelection({ modelId, testKey: "" })}
        onSelectTest={(testKey) => setSelection((prev) => ({ ...prev, testKey }))}
        onSetFilters={setFilters}
      />

      {/* Detailed Model Metrics */}
      <DetailedMetricsSection
        metrics={metrics}
        metricsComprehensive={metricsComprehensive}
        modelDisplayNames={modelDisplayNames}
      />

      {/* Rankings by Category */}
      <RankingsSection
        rankings={rankings}
        rankingDetails={rankingDetails}
        metrics={metrics}
        modelStatus={modelStatus}
        modelDisplayNames={modelDisplayNames}
      />
    </div>
  );
}
