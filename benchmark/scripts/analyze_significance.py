#!/usr/bin/env python3
"""
Benchmark Significance Analyzer

Computes statistical significance for model comparisons, including:
- Confidence intervals for all metrics
- Paired difference tests between models
- Effect sizes (Cohen's d)
- Significance flags for rankings

Usage:
    python scripts/analyze_significance.py \
        --results results/benchmark_results.json \
        --metrics results/benchmark_metrics.json \
        --output results/significance_report.json

Or via npm:
    npm run bench:analyze
"""

import argparse
import json
import math
import statistics
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
from collections import defaultdict
from dataclasses import dataclass


@dataclass
class ConfidenceInterval:
    """Represents a confidence interval with bounds and interpretation."""
    lower: float
    upper: float
    level: float = 0.95
    
    def contains(self, value: float) -> bool:
        """Check if value falls within CI."""
        return self.lower <= value <= self.upper
    
    def overlaps(self, other: 'ConfidenceInterval') -> bool:
        """Check if two CIs overlap."""
        return not (self.upper < other.lower or other.upper < self.lower)
    
    def to_dict(self) -> Dict[str, float]:
        return {
            f"ci_{int(self.level*100)}_lower": round(self.lower, 3),
            f"ci_{int(self.level*100)}_upper": round(self.upper, 3),
            "margin_of_error": round((self.upper - self.lower) / 2, 3)
        }


@dataclass
class MetricWithCI:
    """A metric with its confidence interval."""
    mean: float
    std_dev: float
    n: int
    ci: ConfidenceInterval
    stderr: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "mean": round(self.mean, 3),
            "std_dev": round(self.std_dev, 3),
            "n": self.n,
            "stderr": round(self.stderr, 3),
            **self.ci.to_dict()
        }


@dataclass
class PairedComparison:
    """Result of paired comparison between two models."""
    model_a: str
    model_b: str
    metric: str
    mean_diff: float
    ci: ConfidenceInterval
    cohens_d: float
    p_value_approx: float  # Approximate based on CI
    is_significant: bool
    common_n: int
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "model_a": self.model_a,
            "model_b": self.model_b,
            "metric": self.metric,
            "mean_diff": round(self.mean_diff, 3),
            "cohens_d": round(self.cohens_d, 3),
            "is_significant": self.is_significant,
            "common_n": self.common_n,
            **self.ci.to_dict()
        }


def t_critical(confidence: float, df: int) -> float:
    """
    Approximate t-critical value using normal approximation for df > 30.
    For smaller samples, uses conservative z-score.
    
    In production, consider using scipy.stats.t.ppf for exact values.
    """
    if df > 30:
        # Normal approximation
        # z for 95% = 1.96, 99% = 2.576
        if confidence == 0.95:
            return 1.96
        elif confidence == 0.99:
            return 2.576
        else:
            # Rough interpolation
            return 1.96 + (confidence - 0.95) * 4
    else:
        # Conservative: use higher z for small samples
        # df=10: t=2.228, df=20: t=2.086
        if df <= 10:
            return 2.3
        elif df <= 20:
            return 2.1
        else:
            return 2.0


def compute_ci(values: List[float], confidence: float = 0.95) -> MetricWithCI:
    """Compute mean with confidence interval for a list of values."""
    if not values:
        return MetricWithCI(
            mean=0.0, std_dev=0.0, n=0,
            ci=ConfidenceInterval(0.0, 0.0, confidence),
            stderr=0.0
        )
    
    n = len(values)
    mean = statistics.mean(values)
    
    if n == 1:
        std_dev = 0.0
    else:
        std_dev = statistics.stdev(values)
    
    stderr = std_dev / math.sqrt(n)
    t_crit = t_critical(confidence, n - 1)
    margin = t_crit * stderr
    
    return MetricWithCI(
        mean=mean,
        std_dev=std_dev,
        n=n,
        ci=ConfidenceInterval(
            lower=mean - margin,
            upper=mean + margin,
            level=confidence
        ),
        stderr=stderr
    )


def cohens_d(values_a: List[float], values_b: List[float]) -> float:
    """Compute Cohen's d effect size between two paired samples."""
    if len(values_a) != len(values_b) or len(values_a) == 0:
        return 0.0
    
    diffs = [a - b for a, b in zip(values_a, values_b)]
    mean_diff = statistics.mean(diffs)
    
    if len(diffs) == 1:
        return 0.0
    
    std_diff = statistics.stdev(diffs)
    if std_diff == 0:
        return float('inf') if mean_diff != 0 else 0.0
    
    return mean_diff / std_diff


def paired_comparison(
    model_a: str,
    model_b: str,
    metric: str,
    values_a: List[float],
    values_b: List[float],
    confidence: float = 0.95
) -> PairedComparison:
    """Compute paired comparison statistics."""
    if len(values_a) != len(values_b) or len(values_a) == 0:
        return PairedComparison(
            model_a=model_a, model_b=model_b, metric=metric,
            mean_diff=0.0,
            ci=ConfidenceInterval(0.0, 0.0, confidence),
            cohens_d=0.0, p_value_approx=1.0,
            is_significant=False, common_n=0
        )
    
    diffs = [a - b for a, b in zip(values_a, values_b)]
    mean_diff = statistics.mean(diffs)
    
    n = len(diffs)
    if n == 1:
        std_diff = 0.0
    else:
        std_diff = statistics.stdev(diffs)
    
    stderr = std_diff / math.sqrt(n)
    t_crit = t_critical(confidence, n - 1)
    margin = t_crit * stderr
    
    d = cohens_d(values_a, values_b)
    
    # Approximate p-value based on CI
    # If CI excludes 0, p < (1 - confidence)
    ci_lower = mean_diff - margin
    ci_upper = mean_diff + margin
    excludes_zero = (ci_lower > 0) or (ci_upper < 0)
    
    # Also require medium effect size for "significance"
    is_significant = excludes_zero and abs(d) >= 0.2
    
    return PairedComparison(
        model_a=model_a,
        model_b=model_b,
        metric=metric,
        mean_diff=mean_diff,
        ci=ConfidenceInterval(ci_lower, ci_upper, confidence),
        cohens_d=d,
        p_value_approx=(1 - confidence) if excludes_zero else 0.5,
        is_significant=is_significant,
        common_n=n
    )


def load_benchmark_data(results_path: Path, metrics_path: Path) -> Tuple[List[Dict], Dict]:
    """Load benchmark results and metrics."""
    with open(results_path, 'r', encoding='utf-8') as f:
        results = json.load(f)
    
    with open(metrics_path, 'r', encoding='utf-8') as f:
        metrics = json.load(f)
    
    return results, metrics


def compute_model_metrics_with_ci(
    results: List[Dict],
    model_id: str,
    task: Optional[str] = None
) -> Dict[str, MetricWithCI]:
    """Compute metrics with CI for a specific model."""
    filtered = [
        r for r in results
        if r.get('model_id') == model_id 
        and not r.get('error')
        and (task is None or r.get('task') == task)
    ]
    
    if not filtered:
        return {}
    
    # Extract scores
    reliability_scores = [r.get('reliability_score', 0) for r in filtered]
    quality_scores = [r.get('content_quality_score', 0) for r in filtered]
    
    # Judge evaluations
    factual_scores = []
    completeness_scores = []
    for r in filtered:
        judge = r.get('judge_evaluation', {})
        agg = judge.get('aggregated_scores', {})
        if 'factual_accuracy' in agg:
            factual_scores.append(agg['factual_accuracy'].get('mean', 0))
        if 'completeness' in agg:
            completeness_scores.append(agg['completeness'].get('mean', 0))
    
    return {
        'reliability': compute_ci(reliability_scores),
        'content_quality': compute_ci(quality_scores),
        'factual_accuracy': compute_ci(factual_scores) if factual_scores else compute_ci([]),
        'completeness': compute_ci(completeness_scores) if completeness_scores else compute_ci([])
    }


def compare_all_models(
    results: List[Dict],
    models: List[str],
    metric: str = 'content_quality_score'
) -> List[PairedComparison]:
    """Compare all model pairs on a specific metric."""
    comparisons = []
    
    # Group results by (model, test_case_id)
    by_model_case = defaultdict(dict)
    for r in results:
        if r.get('error'):
            continue
        model = r.get('model_id')
        case_id = r.get('test_case_id')
        task = r.get('task')
        key = f"{case_id}:{task}"
        by_model_case[model][key] = r.get(metric, 0)
    
    # Compare each pair
    for i, model_a in enumerate(models):
        for model_b in models[i+1:]:
            # Find common test cases
            common_cases = set(by_model_case[model_a].keys()) & set(by_model_case[model_b].keys())
            
            if len(common_cases) < 2:
                continue
            
            values_a = [by_model_case[model_a][c] for c in common_cases]
            values_b = [by_model_case[model_b][c] for c in common_cases]
            
            comp = paired_comparison(model_a, model_b, metric, values_a, values_b)
            comparisons.append(comp)
    
    return comparisons


def generate_ranking_with_significance(
    model_metrics: Dict[str, Dict[str, MetricWithCI]],
    comparisons: List[PairedComparison],
    metric: str = 'content_quality'
) -> List[Dict[str, Any]]:
    """Generate rankings with significance annotations."""
    # Sort by mean
    sorted_models = sorted(
        model_metrics.items(),
        key=lambda x: x[1].get(metric, compute_ci([])).mean,
        reverse=True
    )
    
    rankings = []
    for i, (model_id, metrics) in enumerate(sorted_models):
        m = metrics.get(metric, compute_ci([]))
        
        # Check if indistinguishable from next model
        is_tie_with_next = False
        if i < len(sorted_models) - 1:
            next_model = sorted_models[i + 1][0]
            # Find comparison
            for comp in comparisons:
                if (comp.model_a == model_id and comp.model_b == next_model) or \
                   (comp.model_a == next_model and comp.model_b == model_id):
                    if not comp.is_significant:
                        is_tie_with_next = True
                    break
        
        # Check if indistinguishable from previous model
        is_tie_with_prev = False
        if i > 0:
            prev_model = sorted_models[i - 1][0]
            for comp in comparisons:
                if (comp.model_a == model_id and comp.model_b == prev_model) or \
                   (comp.model_a == prev_model and comp.model_b == model_id):
                    if not comp.is_significant:
                        is_tie_with_prev = True
                    break
        
        rank = i + 1
        # Adjust rank for ties
        if is_tie_with_prev:
            rank = rankings[-1]['rank'] if rankings else rank
        
        rankings.append({
            'rank': rank,
            'model_id': model_id,
            'score': m.to_dict(),
            'is_tie': is_tie_with_next or is_tie_with_prev,
            'display_rank': f"{rank}{'=' if is_tie_with_next else ''}"
        })
    
    return rankings


def analyze_judge_robustness(results: List[Dict]) -> Dict[str, Any]:
    """Analyze judge consensus quality."""
    variances = []
    judge_counts = []
    low_consensus_count = 0
    
    for r in results:
        if r.get('error'):
            continue
        
        judge = r.get('judge_evaluation', {})
        consensus = judge.get('consensus_metrics', {})
        
        # Judge count
        count = judge.get('judge_count', 0)
        judge_counts.append(count)
        
        # Variance
        for key, value in consensus.items():
            if key.endswith('_variance'):
                variances.append(value)
                if value > 100:
                    low_consensus_count += 1
    
    return {
        'total_evaluations': len(judge_counts),
        'judge_count_distribution': {
            'mean': round(statistics.mean(judge_counts), 2) if judge_counts else 0,
            'min': min(judge_counts) if judge_counts else 0,
            'max': max(judge_counts) if judge_counts else 0
        },
        'variance_statistics': {
            'mean': round(statistics.mean(variances), 2) if variances else 0,
            'median': round(statistics.median(variances), 2) if variances else 0,
            'high_variance_count': low_consensus_count,
            'high_variance_pct': round(100 * low_consensus_count / len(variances), 1) if variances else 0
        },
        'low_consensus_threshold': 100,
        'recommendation': 'Investigate evaluations with variance > 100' if low_consensus_count > 0 else 'Consensus quality acceptable'
    }


def main():
    parser = argparse.ArgumentParser(
        description='Analyze benchmark significance and compute confidence intervals'
    )
    parser.add_argument(
        '--results',
        type=Path,
        default=Path(__file__).parent.parent / 'results' / 'benchmark_results.json',
        help='Path to benchmark_results.json'
    )
    parser.add_argument(
        '--metrics',
        type=Path,
        default=Path(__file__).parent.parent / 'results' / 'benchmark_metrics.json',
        help='Path to benchmark_metrics.json'
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=Path(__file__).parent.parent / 'results' / 'significance_report.json',
        help='Output path for significance report'
    )
    parser.add_argument(
        '--confidence',
        type=float,
        default=0.95,
        help='Confidence level (default: 0.95)'
    )
    
    args = parser.parse_args()
    
    print("Loading benchmark data...")
    results, metrics_data = load_benchmark_data(args.results, args.metrics)
    
    # Get all models
    models = sorted(set(r.get('model_id') for r in results if not r.get('error') and r.get('model_id')))
    print(f"Found {len(models)} models: {', '.join(models)}")
    
    # Compute metrics with CI for each model
    print("\nComputing metrics with confidence intervals...")
    model_metrics_with_ci = {}
    for model in models:
        model_metrics_with_ci[model] = compute_model_metrics_with_ci(results, model)
        m = model_metrics_with_ci[model].get('content_quality')
        if m:
            print(f"  {model}: {m.mean:.2f} ± {m.ci.upper - m.mean:.2f} (n={m.n})")
    
    # Compare all model pairs
    print("\nComputing pairwise comparisons...")
    comparisons_quality = compare_all_models(results, models, 'content_quality_score')
    comparisons_reliability = compare_all_models(results, models, 'reliability_score')
    
    all_comparisons = comparisons_quality + comparisons_reliability
    
    # Generate rankings
    print("\nGenerating rankings with significance...")
    rankings = generate_ranking_with_significance(
        model_metrics_with_ci, comparisons_quality, 'content_quality'
    )
    
    # Analyze judge robustness
    print("\nAnalyzing judge consensus...")
    judge_analysis = analyze_judge_robustness(results)
    print(f"  Mean judges per eval: {judge_analysis['judge_count_distribution']['mean']}")
    print(f"  High variance results: {judge_analysis['variance_statistics']['high_variance_count']}")
    
    # Build report
    report = {
        'metadata': {
            'confidence_level': args.confidence,
            'total_models': len(models),
            'total_results': len(results),
            'analysis_date': str(Path(__file__).stat().st_mtime)
        },
        'model_metrics_with_ci': {
            model: {k: v.to_dict() for k, v in metrics.items()}
            for model, metrics in model_metrics_with_ci.items()
        },
        'pairwise_comparisons': [c.to_dict() for c in all_comparisons],
        'rankings': {
            'by_content_quality': rankings
        },
        'judge_robustness': judge_analysis,
        'interpretation_guide': {
            'significance_threshold': 'CI excludes 0 AND |Cohen\'s d| >= 0.2',
            'tie_indicator': 'Models marked with = have overlapping CIs',
            'ci_overlap_rule': 'Overlapping CIs suggest no statistically clear winner',
            'effect_size_interpretation': {
                'small': 0.2,
                'medium': 0.5,
                'large': 0.8
            }
        }
    }
    
    # Write report
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    print(f"\n[OK] Significance report written to: {args.output}")
    
    # Print key findings
    print("\n" + "="*60)
    print("KEY FINDINGS")
    print("="*60)
    
    # Top models
    print("\nTop Models (by content quality):")
    for r in rankings[:5]:
        tie_marker = " [TIE]" if r['is_tie'] else ""
        ci = r['score']
        print(f"  {r['display_rank']:>3}. {r['model_id']:<40} {ci['mean']:>6.2f} ± {ci['ci_95_upper']-ci['mean']:.2f}{tie_marker}")
    
    # Significant comparisons
    sig_comps = [c for c in comparisons_quality if c.is_significant]
    if sig_comps:
        print("\nSignificant Improvements (p < 0.05, |d| >= 0.2):")
        for c in sig_comps[:5]:
            direction = ">" if c.mean_diff > 0 else "<"
            print(f"  {c.model_a} {direction} {c.model_b}: diff={c.mean_diff:+.2f}, d={c.cohens_d:.2f}")
    else:
        print("\nNo statistically significant differences detected between models.")
    
    # Sample size warning
    min_n = min(m.get('content_quality', compute_ci([])).n for m in model_metrics_with_ci.values())
    if min_n < 30:
        print(f"\n[!] WARNING: Small sample size detected (min n={min_n}).")
        print("    Recommend n ≥ 50 for reliable significance testing.")
    elif min_n < 50:
        print(f"\n[i] Note: Sample size adequate (min n={min_n}), but n >= 50 recommended for high power.")


if __name__ == '__main__':
    main()
