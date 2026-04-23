"""Tests for metrics calculation."""
from evaluators.metrics import (
    calculate_percentiles,
    aggregate_model_metrics,
    calculate_comparative_metrics,
    calculate_comprehensive_model_metrics,
    calculate_model_metrics_by_dimension
)


class TestCalculatePercentiles:
    """Tests for percentile calculation."""
    
    def test_percentiles_empty_list(self):
        """Empty list should return empty dict."""
        result = calculate_percentiles([])
        assert result == {}
    
    def test_percentiles_single_value(self):
        """Single value should return same for all percentiles."""
        result = calculate_percentiles([50.0])
        assert result["p0"] == 50.0
        assert result["p50"] == 50.0
        assert result["p100"] == 50.0
    
    def test_percentiles_multiple_values(self):
        """Multiple values should calculate correct percentiles."""
        values = [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]
        result = calculate_percentiles(values)
        assert result["p0"] == 10.0
        assert result["p50"] == 55.0  # Median
        assert result["p100"] == 100.0
        assert result["p25"] < result["p50"] < result["p75"]
    
    def test_percentiles_all_percentiles_present(self):
        """All expected percentiles should be present."""
        values = list(range(1, 101))
        result = calculate_percentiles(values)
        expected_keys = ["p0", "p25", "p50", "p75", "p95", "p99", "p100"]
        for key in expected_keys:
            assert key in result


class TestAggregateModelMetrics:
    """Tests for model metrics aggregation."""
    
    def test_aggregate_empty_results(self):
        """Empty results should return empty dict."""
        result = aggregate_model_metrics([])
        assert result == {}
    
    def test_aggregate_basic_metrics(self):
        """Basic aggregation should calculate mean, std_dev, etc."""
        results = [
            {
                "reliability_score": 80.0,
                "content_quality_score": 75.0,
                "cost": 0.01,
                "latency_ms": 1000,
                "judge_evaluation": {
                    "aggregated_scores": {
                        "factual_accuracy": {"mean": 80.0},
                        "completeness": {"mean": 70.0},
                        "quality": {"mean": 75.0}
                    }
                }
            },
            {
                "reliability_score": 90.0,
                "content_quality_score": 85.0,
                "cost": 0.02,
                "latency_ms": 1200,
                "judge_evaluation": {
                    "aggregated_scores": {
                        "factual_accuracy": {"mean": 85.0},
                        "completeness": {"mean": 80.0},
                        "quality": {"mean": 85.0}
                    }
                }
            }
        ]
        
        metrics = aggregate_model_metrics(results)
        
        assert "reliability" in metrics
        assert metrics["reliability"]["mean"] == 85.0
        assert metrics["reliability"]["std_dev"] >= 0
        
        assert "content_quality" in metrics
        assert metrics["content_quality"]["mean"] == 80.0
        
        assert "cost" in metrics
        assert metrics["cost"]["total"] == 0.03
        
        assert "latency" in metrics
        assert metrics["latency"]["mean"] == 1100.0
        
        assert "test_count" in metrics
        assert metrics["test_count"] == 2

    def test_aggregate_quality_falls_back_to_content_quality_score(self):
        """If judge aggregated_scores has no overall quality key, use content_quality_score."""
        results = [
            {
                "reliability_score": 80.0,
                "content_quality_score": 70.0,
                "judge_evaluation": {"aggregated_scores": {"factual_accuracy": {"mean": 70.0}}},
            },
            {
                "reliability_score": 90.0,
                "content_quality_score": 80.0,
                "judge_evaluation": {"aggregated_scores": {"factual_accuracy": {"mean": 80.0}}},
            },
        ]

        metrics = aggregate_model_metrics(results)
        assert metrics["content_quality"]["mean"] == 75.0
    
    def test_aggregate_with_config_weights(self):
        """Aggregation should use config weights if provided."""
        results = [
            {
                "reliability_score": 80.0,
                "content_quality_score": 75.0,
                "judge_evaluation": {
                    "aggregated_scores": {
                        "quality": {"mean": 75.0}
                    }
                }
            }
        ]
        
        config = {"reliability_weight": 0.4, "quality_weight": 0.6}
        metrics = aggregate_model_metrics(results, config)
        
        # Combined score should use custom weights
        expected_combined = 80.0 * 0.4 + 75.0 * 0.6
        assert abs(metrics["combined_score"] - expected_combined) < 0.01
    
    def test_aggregate_overall_score_range(self):
        """Overall score should be in 1-100 range."""
        results = [
            {
                "reliability_score": 50.0,
                "content_quality_score": 50.0,
                "judge_evaluation": {
                    "aggregated_scores": {
                        "factual_accuracy": {"mean": 50.0},
                        "quality": {"mean": 50.0}
                    }
                }
            }
        ]
        
        metrics = aggregate_model_metrics(results)
        assert 1.0 <= metrics["overall_score"] <= 100.0
    
    def test_aggregate_cost_per_quality_point(self):
        """Should calculate cost per quality point."""
        results = [
            {
                "reliability_score": 80.0,
                "content_quality_score": 75.0,
                "cost": 0.1,
                "judge_evaluation": {
                    "aggregated_scores": {
                        "quality": {"mean": 75.0}
                    }
                }
            }
        ]
        
        metrics = aggregate_model_metrics(results)
        assert "cost_per_quality_point" in metrics
        assert metrics["cost_per_quality_point"] > 0

    def test_aggregate_excludes_low_consensus_quality_in_strict_mode(self):
        """Strict judge filter should exclude low-consensus samples from quality means."""
        results = [
            {
                "reliability_score": 80.0,
                "content_quality_score": 95.0,
                "judge_evaluation": {
                    "judge_count": 2,
                    "consensus_flag": "low_judge_count",
                    "low_confidence": True,
                    "aggregated_scores": {"factual_accuracy": {"mean": 95.0}},
                },
            },
            {
                "reliability_score": 90.0,
                "content_quality_score": 70.0,
                "judge_evaluation": {
                    "judge_count": 3,
                    "consensus_flag": "ok",
                    "low_confidence": False,
                    "aggregated_scores": {"factual_accuracy": {"mean": 70.0}},
                },
            },
        ]

        metrics = aggregate_model_metrics(results, {"judge_quality_filter": "strict"})
        assert metrics["content_quality"]["mean"] == 70.0
        assert metrics["quality_sample_count"] == 1
        assert metrics["quality_excluded_count"] == 1


class TestCalculateComparativeMetrics:
    """Tests for comparative metrics calculation."""
    
    def test_comparative_empty_metrics(self):
        """Empty metrics should return empty dict."""
        result = calculate_comparative_metrics({})
        assert result == {}
    
    def test_comparative_rankings(self):
        """Should create rankings by different criteria."""
        all_metrics = {
            "model_a": {
                "reliability": {"mean": 90.0},
                "content_quality": {"mean": 85.0},
                "overall_score": 88.0,
                "combined_score": 87.0,
                "cost_per_quality_point": 0.001
            },
            "model_b": {
                "reliability": {"mean": 80.0},
                "content_quality": {"mean": 90.0},
                "overall_score": 85.0,
                "combined_score": 86.0,
                "cost_per_quality_point": 0.002
            }
        }
        
        comparative = calculate_comparative_metrics(all_metrics)
        
        assert "rankings" in comparative
        rankings = comparative["rankings"]
        
        assert "by_reliability" in rankings
        assert rankings["by_reliability"][0] == "model_a"  # Higher reliability
        
        assert "by_content_quality" in rankings
        assert rankings["by_content_quality"][0] == "model_b"  # Higher quality
        
        assert "by_overall_score" in rankings
        assert rankings["by_overall_score"][0] == "model_a"  # Higher overall
        
        assert "by_cost_effectiveness" in rankings
        assert rankings["by_cost_effectiveness"][0] == "model_a"  # Lower cost per quality

    def test_comparative_excludes_partial_models_from_overall_rankings(self):
        """Overall rankings should only include models with complete task coverage."""
        all_metrics = {
            "model_full": {
                "reliability": {"mean": 90.0, "ci_95_lower": 88.0, "ci_95_upper": 92.0},
                "content_quality": {"mean": 88.0, "ci_95_lower": 86.0, "ci_95_upper": 90.0},
                "overall_score": 89.0,
                "combined_score": 88.6,
                "cost_per_quality_point": 0.002
            },
            "model_partial": {
                "reliability": {"mean": 99.0, "ci_95_lower": 97.0, "ci_95_upper": 100.0},
                "content_quality": {"mean": 99.0, "ci_95_lower": 97.0, "ci_95_upper": 100.0},
                "overall_score": 99.0,
                "combined_score": 99.0,
                "cost_per_quality_point": 0.001
            }
        }
        comprehensive = {
            "model_full": {
                "summary_stats": {"test_count_by_task": {"summary": 30, "quiz": 10, "flashcards": 10}},
                "by_task": {}
            },
            "model_partial": {
                "summary_stats": {"test_count_by_task": {"summary": 30, "quiz": 0, "flashcards": 0}},
                "by_task": {}
            }
        }

        comparative = calculate_comparative_metrics(all_metrics, model_metrics_comprehensive=comprehensive)
        assert comparative["rankings"]["by_overall_score"] == ["model_full"]
        assert comparative["model_status"]["model_partial"]["is_partial"] is True
        assert comparative["model_status"]["model_partial"]["eligible_for_overall"] is False
        assert "quiz" in comparative["model_status"]["model_partial"]["missing_requirements"]

    def test_comparative_marks_ci_overlap_as_statistical_tie(self):
        """Ranking details should flag ties when confidence intervals overlap."""
        all_metrics = {
            "model_a": {
                "reliability": {"mean": 85.0, "ci_95_lower": 83.0, "ci_95_upper": 87.0},
                "content_quality": {"mean": 95.5, "ci_95_lower": 94.3, "ci_95_upper": 96.7},
                "overall_score": 90.0,
                "combined_score": 90.3,
                "cost_per_quality_point": 0.002
            },
            "model_b": {
                "reliability": {"mean": 84.0, "ci_95_lower": 82.0, "ci_95_upper": 86.0},
                "content_quality": {"mean": 94.8, "ci_95_lower": 93.3, "ci_95_upper": 96.3},
                "overall_score": 89.0,
                "combined_score": 89.4,
                "cost_per_quality_point": 0.003
            }
        }

        comparative = calculate_comparative_metrics(all_metrics)
        detail_rows = comparative["ranking_details"]["by_content_quality"]
        assert detail_rows[0]["model_id"] == "model_a"
        assert detail_rows[0]["is_statistical_tie"] is True
        assert detail_rows[0]["significance_marker"] == "*"


class TestCalculateComprehensiveMetrics:
    """Tests for comprehensive metrics calculation."""
    
    def test_comprehensive_empty_results(self):
        """Empty results should return empty dict."""
        result = calculate_comprehensive_model_metrics([])
        assert result == {}
    
    def test_comprehensive_breakdowns(self):
        """Should create breakdowns by task, topic, format."""
        results = [
            {
                "task": "summary",
                "test_case_topic": "physics",
                "test_case_format": "academic",
                "reliability_score": 80.0,
                "content_quality_score": 75.0,
                "judge_evaluation": {
                    "aggregated_scores": {
                        "quality": {"mean": 75.0}
                    }
                }
            },
            {
                "task": "quiz",
                "test_case_topic": "physics",
                "test_case_format": "academic",
                "reliability_score": 85.0,
                "content_quality_score": 80.0,
                "judge_evaluation": {
                    "aggregated_scores": {
                        "quality": {"mean": 80.0}
                    }
                }
            }
        ]
        
        comprehensive = calculate_comprehensive_model_metrics(results)
        
        assert "overall" in comprehensive
        assert "by_task" in comprehensive
        assert "summary" in comprehensive["by_task"]
        assert "quiz" in comprehensive["by_task"]
        
        assert "by_topic" in comprehensive
        assert "physics" in comprehensive["by_topic"]
        
        assert "by_format" in comprehensive
        assert "academic" in comprehensive["by_format"]
        
        assert "summary_stats" in comprehensive
        assert comprehensive["summary_stats"]["total_tests"] == 2
        assert "summary" in comprehensive["summary_stats"]["tasks_tested"]
        assert "quiz" in comprehensive["summary_stats"]["tasks_tested"]


class TestCalculateModelMetricsByDimension:
    """Tests for dimension-based metrics calculation."""
    
    def test_dimension_by_task(self):
        """Should group metrics by task dimension."""
        results = [
            {"task": "summary", "reliability_score": 80.0, "content_quality_score": 75.0, "judge_evaluation": {"aggregated_scores": {"quality": {"mean": 75.0}}}},
            {"task": "summary", "reliability_score": 85.0, "content_quality_score": 80.0, "judge_evaluation": {"aggregated_scores": {"quality": {"mean": 80.0}}}},
            {"task": "quiz", "reliability_score": 90.0, "content_quality_score": 85.0, "judge_evaluation": {"aggregated_scores": {"quality": {"mean": 85.0}}}}
        ]
        
        metrics = calculate_model_metrics_by_dimension(results, "task")
        
        assert "summary" in metrics
        assert "quiz" in metrics
        assert metrics["summary"]["test_count"] == 2
        assert metrics["quiz"]["test_count"] == 1
