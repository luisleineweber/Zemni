"""Main benchmark runner with async support and caching."""
import argparse
import asyncio
import hashlib
import json
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Dict, Any, List, Optional
import json as json_lib
from tqdm import tqdm

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from models.client import ModelClient
from prompts import build_summary_prompts, build_quiz_prompts, build_flashcards_prompts
from evaluators.format_checker import evaluate_reliability
from evaluators.llm_judge import evaluate_with_consensus
from evaluators.metrics import (
    aggregate_model_metrics,
    calculate_comparative_metrics,
    calculate_comprehensive_model_metrics
)
from utils.logger import BenchmarkLogger


CONFIG_PATH = Path(__file__).parent / "config" / "benchmark_config.json"
CACHE_DIR = Path(__file__).parent / "results" / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

MIN_VALID_TEST_CASES_FOR_SIGNIFICANCE = 50
MIN_TOPIC_COUNT = 6
MIN_FORMAT_COUNT = 12
MIN_CELL_COUNT = 3
DEFAULT_FIXED_INPUT_CHARS = 1500
DEFAULT_SUMMARY_MAX_TOKENS = 1800
DEFAULT_QUIZ_MAX_TOKENS = 1400
DEFAULT_FLASHCARDS_MAX_TOKENS = 1400
DEFAULT_QUIZ_QUESTIONS_COUNT = 4
DEFAULT_FLASHCARDS_PER_SECTION = 4


def atomic_write_json(path: Path, payload: Any) -> None:
    """Write JSON to disk atomically (Windows-safe) to avoid partial writes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    try:
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        temp_path.replace(path)
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


def recompute_and_save_metrics(
    *,
    results: List[Dict[str, Any]],
    config: Dict[str, Any],
    metrics_path: Path,
    judge_quality_filter: str,
    logger: Optional[BenchmarkLogger] = None
) -> None:
    """Recompute benchmark_metrics.json from a benchmark_results.json list."""
    sample_counts = Counter(
        (result.get("model_id"), result.get("task"))
        for result in results
        if result.get("model_id") and result.get("task") and not result.get("error")
    )
    underpowered_pairs = [
        {"model_id": model_id, "task": task, "count": count}
        for (model_id, task), count in sample_counts.items()
        if count < MIN_VALID_TEST_CASES_FOR_SIGNIFICANCE
    ]

    all_model_ids = set(r.get("model_id") for r in results if r.get("model_id"))

    model_metrics_overall: Dict[str, Any] = {}
    for model_id in all_model_ids:
        model_results = [r for r in results if r.get("model_id") == model_id and not r.get("error")]
        if model_results:
            model_metrics_overall[model_id] = aggregate_model_metrics(model_results, config)

    model_metrics_comprehensive: Dict[str, Any] = {}
    for model_id in all_model_ids:
        model_results = [r for r in results if r.get("model_id") == model_id]
        if model_results:
            model_metrics_comprehensive[model_id] = calculate_comprehensive_model_metrics(model_results, config)

    comparative = calculate_comparative_metrics(
        model_metrics_overall,
        model_metrics_comprehensive=model_metrics_comprehensive
    )

    input_length_distribution = {
        model_id: metrics.get("input_length", {})
        for model_id, metrics in model_metrics_overall.items()
    }
    low_input_length_models = [
        model_id for model_id, distribution in input_length_distribution.items()
        if distribution.get("below_1000_warning")
    ]

    atomic_write_json(metrics_path, {
        "model_metrics": model_metrics_overall,  # For backward compatibility
        "model_metrics_comprehensive": model_metrics_comprehensive,  # New comprehensive breakdowns
        "comparative_metrics": comparative,
        "input_length_distribution": input_length_distribution,
        "hardening_metadata": {
            "minimum_tests_for_significance": MIN_VALID_TEST_CASES_FOR_SIGNIFICANCE,
            "judge_quality_filter": judge_quality_filter,
            "input_standardization": get_input_standardization(config),
            "underpowered_model_tasks": underpowered_pairs,
            "low_input_length_models": low_input_length_models
        }
    })

    if logger:
        logger.info(
            f"Saved metrics to: {metrics_path}",
            metrics_file=str(metrics_path),
            models_evaluated=len(model_metrics_overall)
        )


def purge_model_results(
    *,
    model_id: str,
    results_dir: Path,
    config: Dict[str, Any],
    judge_quality_filter: str,
    logger: Optional[BenchmarkLogger] = None
) -> Dict[str, int]:
    """
    Purge a single model's benchmark artifacts from a results directory.

    Removes:
    - results_dir/benchmark_results.json entries for model_id
    - results_dir/cache/*.json entries for model_id
    Then recomputes results_dir/benchmark_metrics.json from remaining results.
    """
    normalized_model_id = (model_id or "").strip()
    if not normalized_model_id:
        raise ValueError("model_id must be a non-empty string")

    results_path = results_dir / "benchmark_results.json"
    metrics_path = results_dir / "benchmark_metrics.json"
    cache_dir = results_dir / "cache"

    removed_cache_files = 0
    if cache_dir.exists():
        for cache_file in cache_dir.glob("*.json"):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached = json.load(f)
            except (json.JSONDecodeError, OSError):
                continue
            if isinstance(cached, dict) and cached.get("model_id") == normalized_model_id:
                try:
                    cache_file.unlink()
                    removed_cache_files += 1
                except OSError:
                    pass

    removed_results = 0
    remaining_results: List[Dict[str, Any]] = []
    if results_path.exists():
        with open(results_path, "r", encoding="utf-8") as f:
            all_results = json.load(f)
        if not isinstance(all_results, list):
            raise ValueError(f"{results_path} must contain a JSON list")
        remaining_results = [r for r in all_results if r.get("model_id") != normalized_model_id]
        removed_results = len(all_results) - len(remaining_results)
        atomic_write_json(results_path, remaining_results)

    recompute_and_save_metrics(
        results=remaining_results,
        config=config,
        metrics_path=metrics_path,
        judge_quality_filter=judge_quality_filter,
        logger=logger
    )

    return {
        "removed_results": removed_results,
        "removed_cache_files": removed_cache_files
    }


def validate_config(config: Dict[str, Any]) -> None:
    """
    Validate benchmark configuration.
    
    Raises:
        ValueError: If required keys are missing or invalid
    """
    required_keys = [
        "judge_models",
        "concurrency_limit",
        "reliability_weight",
        "quality_weight",
        "adaptive_input_sizing",
        "token_limit_multipliers"
    ]
    
    missing_keys = [key for key in required_keys if key not in config]
    if missing_keys:
        raise ValueError(f"Missing required config keys: {missing_keys}")
    
    # Validate judge_models
    if not isinstance(config["judge_models"], list) or len(config["judge_models"]) == 0:
        raise ValueError("judge_models must be a non-empty list")
    
    # Validate concurrency_limit
    if not isinstance(config["concurrency_limit"], int) or config["concurrency_limit"] < 1:
        raise ValueError("concurrency_limit must be a positive integer")
    
    # Validate weights
    if not isinstance(config["reliability_weight"], (int, float)) or not (0 <= config["reliability_weight"] <= 1):
        raise ValueError("reliability_weight must be a number between 0 and 1")
    if not isinstance(config["quality_weight"], (int, float)) or not (0 <= config["quality_weight"] <= 1):
        raise ValueError("quality_weight must be a number between 0 and 1")
    
    # Validate adaptive_input_sizing
    if not isinstance(config["adaptive_input_sizing"], dict):
        raise ValueError("adaptive_input_sizing must be a dictionary")
    required_tiers = ["free", "budget", "mid_tier", "premium"]
    missing_tiers = [tier for tier in required_tiers if tier not in config["adaptive_input_sizing"]]
    if missing_tiers:
        raise ValueError(f"adaptive_input_sizing missing tiers: {missing_tiers}")
    
    # Validate token_limit_multipliers
    if not isinstance(config["token_limit_multipliers"], dict):
        raise ValueError("token_limit_multipliers must be a dictionary")
    missing_multiplier_tiers = [tier for tier in required_tiers if tier not in config["token_limit_multipliers"]]
    if missing_multiplier_tiers:
        raise ValueError(f"token_limit_multipliers missing tiers: {missing_multiplier_tiers}")

    # Optional input standardization block (hardening).
    if "input_standardization" in config:
        standardization = config["input_standardization"]
        if not isinstance(standardization, dict):
            raise ValueError("input_standardization must be a dictionary when present")
        mode = standardization.get("mode", "fixed")
        if mode not in {"fixed", "tier_adjusted", "adaptive"}:
            raise ValueError("input_standardization.mode must be one of: fixed, tier_adjusted, adaptive")

    # Optional output budget block.
    if "output_budget" in config and not isinstance(config["output_budget"], dict):
        raise ValueError("output_budget must be a dictionary when present")


def load_config() -> Dict[str, Any]:
    """Load and validate benchmark configuration."""
    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)
    
    validate_config(config)
    return config


def load_models_config() -> List[Dict[str, Any]]:
    """Load models from config file."""
    models_file = Path(__file__).parent.parent / "config" / "openrouter-models.example.json"
    if not models_file.exists():
        # Try local config
        models_file = Path(__file__).parent.parent / "config" / "openrouter-models.json"
    
    if models_file.exists():
        with open(models_file, encoding="utf-8") as f:
            return json.load(f)
    return []


def normalize_text_for_cache(text: str) -> str:
    """
    Normalize text for better cache hits by removing excessive whitespace.
    
    Args:
        text: Text to normalize
    
    Returns:
        Normalized text with single spaces and trimmed
    """
    import re
    # Replace multiple whitespace with single space
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def get_cache_key(model_id: str, task: str, test_case: Dict[str, Any]) -> str:
    """Generate cache key for a test case."""
    # Normalize text for better cache hits (same content = same hash)
    text = normalize_text_for_cache(test_case.get('text', ''))
    
    if len(text) > 10000:
        # Hash very long texts to avoid extremely long cache keys
        text = hashlib.sha256(text.encode()).hexdigest()
    content = f"{model_id}:{task}:{test_case.get('id', '')}:{text}"
    return hashlib.sha256(content.encode()).hexdigest()


def load_cached_result(cache_key: str, max_age_days: int = 30) -> Optional[Dict[str, Any]]:
    """Load cached result if available and not expired."""
    cache_file = CACHE_DIR / f"{cache_key}.json"
    if cache_file.exists():
        try:
            # Check cache age
            file_age = time.time() - cache_file.stat().st_mtime
            if file_age > max_age_days * 86400:  # 86400 seconds in a day
                print(f"[CACHE] Expired entry removed: {cache_key[:8]}...")
                cache_file.unlink()
                return None
            return json.loads(cache_file.read_text())
        except Exception:
            # Silently return None on cache errors
            return None
    return None


def save_cached_result(cache_key: str, result: Dict[str, Any]):
    """Save result to cache."""
    cache_file = CACHE_DIR / f"{cache_key}.json"
    cache_file.write_text(json.dumps(result, indent=2))


def get_pricing_tier(pricing: Dict[str, Any]) -> str:
    """Determine pricing tier for adaptive limits."""
    input_price = pricing.get("input_per_1m", 0) or 0
    
    if input_price == 0:
        return "free"
    elif input_price < 1:
        return "budget"
    elif input_price < 5:
        return "mid_tier"
    else:
        return "premium"


def get_subscription_tier(model_config: Dict[str, Any]) -> str:
    """Get subscription tier from model config (free, basic, plus, pro)."""
    return model_config.get("subscription_tier", "free")  # Default to free if not specified


def get_adaptive_limits(config: Dict[str, Any], pricing_tier: str, default_max_tokens: int) -> tuple[int, int]:
    """Get adaptive token limits and input size based on pricing tier."""
    multipliers = config["token_limit_multipliers"]
    input_sizing = config["adaptive_input_sizing"]
    
    multiplier = multipliers.get(pricing_tier, 1.0)
    max_tokens = int(default_max_tokens * multiplier)
    
    max_input_chars = input_sizing.get(pricing_tier, 2000)
    
    return max_tokens, max_input_chars


def get_input_standardization(config: Dict[str, Any]) -> Dict[str, Any]:
    """Get input standardization settings with safe defaults."""
    standardization = config.get("input_standardization", {})
    mode = standardization.get("mode", "fixed")
    if mode not in {"fixed", "tier_adjusted", "adaptive"}:
        mode = "fixed"

    return {
        "mode": mode,
        "fixed_chars": int(standardization.get("fixed_chars", DEFAULT_FIXED_INPUT_CHARS)),
        "reference_chars": int(standardization.get("reference_chars", DEFAULT_FIXED_INPUT_CHARS)),
        "length_penalty_exponent": float(standardization.get("length_penalty_exponent", 0.1)),
    }


def get_output_budget(config: Dict[str, Any]) -> Dict[str, int]:
    """Get output-token and object-count budget settings with defaults."""
    budget = config.get("output_budget", {})
    return {
        "summary_max_tokens": int(budget.get("summary_max_tokens", DEFAULT_SUMMARY_MAX_TOKENS)),
        "quiz_max_tokens": int(budget.get("quiz_max_tokens", DEFAULT_QUIZ_MAX_TOKENS)),
        "flashcards_max_tokens": int(budget.get("flashcards_max_tokens", DEFAULT_FLASHCARDS_MAX_TOKENS)),
        "quiz_questions_count": int(budget.get("quiz_questions_count", DEFAULT_QUIZ_QUESTIONS_COUNT)),
        "flashcards_per_section": int(budget.get("flashcards_per_section", DEFAULT_FLASHCARDS_PER_SECTION)),
    }


def get_effective_input_limit(config: Dict[str, Any], pricing_tier: str) -> tuple[int, str]:
    """Resolve per-request input limit based on configured standardization mode."""
    standardization = get_input_standardization(config)
    mode = standardization["mode"]
    if mode == "adaptive":
        _, adaptive_chars = get_adaptive_limits(config, pricing_tier, 2000)
        return adaptive_chars, mode
    if mode == "tier_adjusted":
        _, adaptive_chars = get_adaptive_limits(config, pricing_tier, 2000)
        return adaptive_chars, mode
    return standardization["fixed_chars"], mode


def get_length_penalty_factor(config: Dict[str, Any], input_length_chars: int) -> float:
    """Length-based correction factor for tier-adjusted scoring mode."""
    standardization = get_input_standardization(config)
    if standardization["mode"] != "tier_adjusted":
        return 1.0

    reference_chars = max(1, standardization["reference_chars"])
    exponent = standardization["length_penalty_exponent"]
    ratio = max(0.0, input_length_chars / reference_chars)
    return ratio ** exponent if ratio > 0 else 0.0


def should_exclude_judge_quality(judge_result: Dict[str, Any], judge_quality_filter: str) -> tuple[bool, str]:
    """Decide whether a sample should be excluded from quality aggregation."""
    mode = (judge_quality_filter or "strict").lower()
    if mode in {"off", "none", "disabled"}:
        return False, ""

    consensus_flag = judge_result.get("consensus_flag", "")
    judge_count = int(judge_result.get("judge_count") or 0)
    low_confidence = bool(judge_result.get("low_confidence"))

    if mode == "variance_only":
        if consensus_flag == "high_variance":
            return True, "high_variance"
        return False, ""

    # strict mode
    if judge_count and judge_count < 3:
        return True, "low_judge_count"
    if consensus_flag in {"high_variance", "low_agreement", "low_judge_count"}:
        return True, consensus_flag
    if low_confidence:
        return True, "low_confidence"
    return False, ""


def validate_test_case_balance(
    test_cases: List[Dict[str, Any]],
    topics: List[str],
    formats: List[str]
) -> Dict[str, Any]:
    """Validate topic/format/cell coverage for benchmark test case quality."""
    topic_counts = Counter(tc.get("topic_category") for tc in test_cases)
    format_counts = Counter(tc.get("format_type") for tc in test_cases)
    cell_counts = Counter((tc.get("topic_category"), tc.get("format_type")) for tc in test_cases)

    topic_violations = {topic: topic_counts.get(topic, 0) for topic in topics if topic_counts.get(topic, 0) < MIN_TOPIC_COUNT}
    format_violations = {fmt: format_counts.get(fmt, 0) for fmt in formats if format_counts.get(fmt, 0) < MIN_FORMAT_COUNT}
    cell_violations = {
        f"{topic}::{fmt}": cell_counts.get((topic, fmt), 0)
        for topic in topics
        for fmt in formats
        if cell_counts.get((topic, fmt), 0) < MIN_CELL_COUNT
    }

    return {
        "topic_counts": dict(topic_counts),
        "format_counts": dict(format_counts),
        "topic_violations": topic_violations,
        "format_violations": format_violations,
        "cell_violations": cell_violations,
        "is_balanced": not topic_violations and not format_violations and not cell_violations
    }


async def run_single_benchmark(
    client: ModelClient,
    model_id: str,
    model_config: Dict[str, Any],
    task: str,
    test_case: Dict[str, Any],
    config: Dict[str, Any],
    judge_models: List[str],
    semaphore: asyncio.Semaphore,
    models_dict: Dict[str, Dict[str, Any]],
    use_cache: bool = True,
    judge_quality_filter: str = "strict"
) -> Dict[str, Any]:
    """Run benchmark for a single model+task+test_case combination."""
    async with semaphore:
        cache_key = get_cache_key(model_id, task, test_case)
        
        # Check cache
        if use_cache:
            cached = load_cached_result(cache_key)
            if cached:
                return cached
        
        # Prepare input
        source_text = test_case.get("text", "")
        original_input_length_chars = len(source_text)
        pricing = model_config.get("pricing", {})
        pricing_tier = get_pricing_tier(pricing)
        output_budget = get_output_budget(config)

        # Input standardization for cross-model comparability.
        max_input_chars, input_standardization_mode = get_effective_input_limit(config, pricing_tier)
        if len(source_text) > max_input_chars:
            source_text = source_text[:max_input_chars] + "..."
        input_length_chars = len(source_text)
        
        # Build prompts
        if task == "summary":
            prompts = build_summary_prompts(source_text)
            default_max_tokens = output_budget["summary_max_tokens"]
        elif task == "quiz":
            section = {
                "id": test_case.get("id", "test"),
                "title": test_case.get("title", "Test"),
                "text": source_text
            }
            prompts = build_quiz_prompts(
                section,
                questions_count=output_budget["quiz_questions_count"],
                avoid_questions=[]
            )
            default_max_tokens = output_budget["quiz_max_tokens"]
        elif task == "flashcards":
            sections = [{
                "id": test_case.get("id", "test"),
                "title": test_case.get("title", "Test"),
                "text": source_text
            }]
            prompts = build_flashcards_prompts(
                sections,
                cards_per_section=output_budget["flashcards_per_section"]
            )
            default_max_tokens = output_budget["flashcards_max_tokens"]
        else:
            return {"error": f"Unknown task: {task}"}
        
        # Adaptive token limits
        max_tokens, _ = get_adaptive_limits(config, pricing_tier, default_max_tokens)
        
        # Generate output
        result = await client.generate(
            model_id=model_id,
            system_prompt=prompts["systemPrompt"],
            user_prompt=prompts["userPrompt"],
            max_tokens=max_tokens,
            temperature=0.2,
            pricing=pricing
        )
        
        if result.get("error"):
            return {
                "model_id": model_id,
                "task": task,
                "test_case_id": test_case.get("id"),
                "error": result["error"],
                "cost": 0,
                "latency_ms": result.get("latency_ms", 0)
            }
        
        output_text = result["text"]
        
        # Parse JSON for quiz/flashcards
        output_json = None
        if task in ["quiz", "flashcards"]:
            try:
                # Try to extract JSON from response
                output_text_for_json = output_text.strip()
                if "```json" in output_text_for_json:
                    output_text_for_json = output_text_for_json.split("```json")[1].split("```")[0].strip()
                elif "```" in output_text_for_json:
                    output_text_for_json = output_text_for_json.split("```")[1].split("```")[0].strip()

                output_json = json_lib.loads(output_text_for_json)
            except Exception:
                output_json = None
        
        # Evaluate reliability
        reliability_result = evaluate_reliability(task, output_text, output_json)
        
        # Evaluate content quality with judge
        # Exclude the current model from judge_models if it's also a judge
        # This prevents a model from evaluating its own outputs
        judge_models_for_this = [j for j in judge_models if j != model_id]
        
        judge_result = await evaluate_with_consensus(
            judge_models=judge_models_for_this,
            task_type=task,
            source_text=source_text,
            output_text=output_text,
            output_json=output_json,
            client=client,
            use_cache=True,
            models_dict=models_dict
        )

        # Calculate content quality score (mean of aggregated scores)
        raw_content_quality_score = 1.0  # Minimum is 1, not 0
        if judge_result.get("aggregated_scores"):
            scores = []
            for key, value in judge_result["aggregated_scores"].items():
                if key != "reasoning" and isinstance(value, dict):
                    mean_score = value.get("mean", 1.0)
                    scores.append(max(1.0, mean_score))  # Ensure minimum is 1
            if scores:
                raw_content_quality_score = sum(scores) / len(scores)
        elif judge_result.get("error") == "Empty output":
            raw_content_quality_score = 1.0  # Empty output gets minimum score

        length_penalty_factor = get_length_penalty_factor(config, input_length_chars=input_length_chars)
        content_quality_score = max(1.0, min(100.0, raw_content_quality_score * length_penalty_factor))

        judge_quality_excluded, judge_quality_exclusion_reason = should_exclude_judge_quality(
            judge_result,
            judge_quality_filter
        )
        
        # Calculate total cost (generation + judge evaluation)
        generation_cost = result.get("cost", 0)
        judge_cost = judge_result.get("total_judge_cost", 0.0)
        total_cost = generation_cost + judge_cost
        
        benchmark_result = {
            "model_id": model_id,
            "task": task,
            "test_case_id": test_case.get("id"),
            "test_case_topic": test_case.get("topic_category"),
            "test_case_format": test_case.get("format_type"),
            "output_text": output_text[:1000],  # Truncate for storage
            "reliability_score": reliability_result["reliability_score"],
            "reliability_issues": reliability_result["issues"],
            "content_quality_score": content_quality_score,
            "raw_content_quality_score": raw_content_quality_score,
            "judge_evaluation": judge_result,
            "judge_quality_excluded": judge_quality_excluded,
            "judge_quality_exclusion_reason": judge_quality_exclusion_reason,
            "cost": total_cost,
            "generation_cost": generation_cost,
            "judge_cost": judge_cost,
            "latency_ms": result.get("latency_ms", 0),
            "usage": result.get("usage", {}),
            "input_length_chars": input_length_chars,
            "input_length_original_chars": original_input_length_chars,
            "input_standardization_mode": input_standardization_mode,
            "length_penalty_factor": length_penalty_factor,
            "pricing_tier": pricing_tier,
            "subscription_tier": model_config.get("subscription_tier", "free"),
            "model_available": model_config.get("available", True)
        }
        
        # Cache result
        if use_cache:
            save_cached_result(cache_key, benchmark_result)
        
        return benchmark_result


async def run_benchmark(
    models: List[str],
    tasks: List[str],
    test_cases_path: Path,
    config: Dict[str, Any],
    use_cache: bool = True,
    force: bool = False,
    logger: Optional[BenchmarkLogger] = None,
    judge_quality_filter: str = "strict"
):
    """Run benchmark for all model+task+test_case combinations."""
    start_time = time.time()
    
    # Initialize logger if not provided
    if logger is None:
        logger = BenchmarkLogger(console=True)
    config = {**config, "judge_quality_filter": judge_quality_filter}
    
    # Load test cases
    if not test_cases_path.exists():
        logger.error(f"Test cases file not found: {test_cases_path}")
        return
    
    with open(test_cases_path, encoding="utf-8") as f:
        test_cases = json.load(f)
    
    # Validate and filter test cases
    original_count = len(test_cases)
    test_cases = [
        tc for tc in test_cases 
        if tc.get("text") and len(tc.get("text", "")) >= 100
    ]
    filtered_count = original_count - len(test_cases)
    
    if filtered_count > 0:
        logger.warning(
            f"Filtered {filtered_count} invalid test cases (empty or too short)",
            original_count=original_count,
            valid_count=len(test_cases)
        )
    
    if not test_cases:
        logger.error("No valid test cases remaining after filtering")
        return
    
    logger.info(f"Loaded {len(test_cases)} valid test cases", test_cases_file=str(test_cases_path))
    if len(test_cases) < MIN_VALID_TEST_CASES_FOR_SIGNIFICANCE:
        logger.warning(
            "Low sample size after filtering; significance claims are underpowered",
            valid_test_cases=len(test_cases),
            recommended_min=MIN_VALID_TEST_CASES_FOR_SIGNIFICANCE
        )

    balance_report = validate_test_case_balance(
        test_cases,
        topics=config.get("topics", []),
        formats=config.get("test_case_formats", [])
    )
    if not balance_report["is_balanced"]:
        logger.warning(
            "Test set is imbalanced and may bias rankings",
            topic_violations=balance_report["topic_violations"],
            format_violations=balance_report["format_violations"],
            cell_violations=balance_report["cell_violations"]
        )
    
    # Load models config
    models_config_list = load_models_config()
    models_dict = {m.get("id"): m for m in models_config_list}
    requested_models_set: Optional[set[str]] = None
    
    # Filter to requested models
    if models:
        requested_models_set = set(models)
        available_in_config = [m for m in models if m in models_dict]
        missing_from_config = [m for m in models if m not in models_dict]
        
        if missing_from_config:
            logger.warning(
                "Some requested models not found in config",
                missing_models=missing_from_config,
                available_models=available_in_config
            )
        
        models_dict = {k: v for k, v in models_dict.items() if k in requested_models_set}
    
    if not models_dict:
        logger.error(
            "No models found in config",
            requested_models=models if models else "all",
            available_in_config=list({m.get("id") for m in models_config_list})
        )
        return
    
    judge_models = config["judge_models"]
    concurrency = config["concurrency_limit"]
    
    # Add judge models to models_dict if they're not already there (for pricing info)
    for judge_model_id in judge_models:
        if judge_model_id not in models_dict:
            # Try to find judge model in config
            judge_model_config = next((m for m in models_config_list if m.get("id") == judge_model_id), None)
            if judge_model_config:
                models_dict[judge_model_id] = judge_model_config
    
    # Check model availability
    async with ModelClient() as client:
        logger.info("Checking model availability...")
        all_models = list(models_dict.keys()) + judge_models
        availability = await client.check_models_availability(all_models)
        
        # Log availability results for debugging
        logger.debug(
            "Model availability check results",
            requested_models=models if models else "all",
            availability_results={k: v for k, v in availability.items() if k in models_dict.keys()}
        )
        
        # Determine which models should be used for *generation*
        # - If the user explicitly passed --models: ONLY use those (no extra judge models)
        # - If no --models were passed: use all non-judge models by default
        if requested_models_set is not None:
            generation_candidates = requested_models_set
        else:
            generation_candidates = {m for m in models_dict.keys() if m not in judge_models}

        available_models = [m for m in generation_candidates if availability.get(m, False)]
        available_judges = [m for m in judge_models if availability.get(m, False)]
        
        if not available_models:
            logger.error(
                "No generation models available!",
                requested_models=models if models else "all",
                models_in_config=list(models_dict.keys()),
                availability_results={k: v for k, v in availability.items() if k in models_dict.keys()}
            )
            return
        
        if not available_judges:
            logger.warning("No judge models available! Evaluation will be limited.")
        elif len(available_judges) < 3:
            logger.warning(
                "Fewer than 3 judge models available; results will be low confidence",
                available_judge_models=available_judges
            )
        
        logger.info(
            "Model availability check complete",
            available_generation_models=len(available_models),
            total_generation_models=len(models_dict),
            available_judge_models=len(available_judges),
            total_judge_models=len(judge_models)
        )
        
        # Create tasks
        semaphore = asyncio.Semaphore(concurrency)
        benchmark_tasks = []
        
        for model_id in available_models:
            model_config = models_dict[model_id]
            for task in tasks:
                for test_case in test_cases:
                    if test_case.get("error"):
                        continue
                    
                    benchmark_tasks.append(
                        run_single_benchmark(
                            client,
                            model_id,
                            model_config,
                            task,
                            test_case,
                            config,
                            available_judges,
                            semaphore,
                            models_dict,
                            use_cache=use_cache and not force,
                            judge_quality_filter=judge_quality_filter
                        )
                    )
        
        logger.benchmark_start(
            total_tasks=len(benchmark_tasks),
            models=available_models,
            tasks=tasks
        )
        
        # Run all tasks with progress bar
        results = []
        total_cost = 0.0
        
        # Use tqdm for progress bar (async-compatible)
        pbar = tqdm(total=len(benchmark_tasks), desc="Running benchmarks", unit="task")

        try:
            for coro in asyncio.as_completed(benchmark_tasks):
                try:
                    result = await coro
                    results.append(result)

                    # Track costs
                    if result.get("cost"):
                        total_cost += result.get("cost", 0)

                    # Log individual result
                    logger.model_result(
                        model_id=result.get("model_id", "unknown"),
                        task=result.get("task", "unknown"),
                        test_case_id=result.get("test_case_id", "unknown"),
                        reliability=result.get("reliability_score", 0),
                        quality=result.get("content_quality_score", 0),
                        cost=result.get("cost", 0),
                        latency_ms=result.get("latency_ms", 0)
                    )
                except Exception as e:
                    logger.error(f"Task failed with exception: {e}")
                    results.append({
                        "error": str(e),
                        "model_id": "unknown",
                        "task": "unknown",
                        "test_case_id": "unknown",
                        "cost": 0,
                        "latency_ms": 0
                    })

                # Update progress bar
                pbar.update(1)
                pbar.set_postfix({
                    "completed": len(results),
                    "cost": f"${total_cost:.4f}"
                })
        finally:
            pbar.close()
        
        duration = time.time() - start_time
        
        logger.benchmark_complete(
            total=len(results),
            duration_seconds=duration,
            total_cost=total_cost
        )
        
        # Save results
        results_path = Path(__file__).parent / "results" / "benchmark_results.json"
        results_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Load existing results and merge (with retry for race conditions)
        existing_results = []
        max_retries = 5
        for attempt in range(max_retries):
            try:
                if results_path.exists():
                    with open(results_path, "r", encoding="utf-8") as f:
                        existing_results = json.load(f)
                    break
            except (json.JSONDecodeError, IOError) as e:
                if attempt < max_retries - 1:
                    time.sleep(0.1 * (attempt + 1))  # Exponential backoff
                else:
                    print(f"WARNING: Failed to load existing results after {max_retries} attempts: {e}")
        
        # Merge results (keep existing, update with new)
        results_dict = {f"{r.get('model_id')}:{r.get('task')}:{r.get('test_case_id')}": r for r in existing_results}
        for r in results:
            key = f"{r.get('model_id')}:{r.get('task')}:{r.get('test_case_id')}"
            results_dict[key] = r
        
        merged_results = list(results_dict.values())
        
        # Atomic write: write to temp file, then rename (prevents race conditions)
        temp_path = results_path.with_suffix('.json.tmp')
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                json.dump(merged_results, f, indent=2, ensure_ascii=False)
            # Atomic rename (works on Unix and Windows)
            temp_path.replace(results_path)
        except Exception:
            # Clean up temp file on error
            if temp_path.exists():
                temp_path.unlink()
            raise
        
        logger.info(f"Saved results to: {results_path}", results_file=str(results_path), results_count=len(merged_results))

        # Hardening warning: per-model per-task sample size.
        sample_counts = Counter(
            (result.get("model_id"), result.get("task"))
            for result in merged_results
            if result.get("model_id") and result.get("task") and not result.get("error")
        )
        underpowered_pairs = [
            {"model_id": model_id, "task": task, "count": count}
            for (model_id, task), count in sample_counts.items()
            if count < MIN_VALID_TEST_CASES_FOR_SIGNIFICANCE
        ]
        if underpowered_pairs:
            logger.warning(
                "Some model/task combinations are underpowered for significance claims",
                underpowered=underpowered_pairs,
                recommended_min=MIN_VALID_TEST_CASES_FOR_SIGNIFICANCE
            )

        # Calculate and save metrics
        # Get all unique model IDs from merged_results (not just available_models)
        # This ensures metrics are calculated for all models with data, even if they weren't available in this run
        all_model_ids = set(r.get("model_id") for r in merged_results if r.get("model_id"))
        
        # Overall metrics (for backward compatibility and comparative rankings)
        model_metrics_overall = {}
        for model_id in all_model_ids:
            model_results = [r for r in merged_results if r.get("model_id") == model_id and not r.get("error")]
            if model_results:
                model_metrics_overall[model_id] = aggregate_model_metrics(model_results, config)
        
        # Comprehensive metrics (with task/topic/format breakdowns)
        model_metrics_comprehensive = {}
        for model_id in all_model_ids:
            model_results = [r for r in merged_results if r.get("model_id") == model_id]
            if model_results:
                model_metrics_comprehensive[model_id] = calculate_comprehensive_model_metrics(model_results, config)

        comparative = calculate_comparative_metrics(
            model_metrics_overall,
            model_metrics_comprehensive=model_metrics_comprehensive
        )

        input_length_distribution = {
            model_id: metrics.get("input_length", {})
            for model_id, metrics in model_metrics_overall.items()
        }
        low_input_length_models = [
            model_id for model_id, distribution in input_length_distribution.items()
            if distribution.get("below_1000_warning")
        ]
        if low_input_length_models:
            logger.warning(
                "Some models received short average input context (<1000 chars)",
                low_input_length_models=low_input_length_models
            )
        
        metrics_path = Path(__file__).parent / "results" / "benchmark_metrics.json"
        with open(metrics_path, "w", encoding="utf-8") as f:
            json.dump({
                "model_metrics": model_metrics_overall,  # For backward compatibility
                "model_metrics_comprehensive": model_metrics_comprehensive,  # New comprehensive breakdowns
                "comparative_metrics": comparative,
                "input_length_distribution": input_length_distribution,
                "hardening_metadata": {
                    "minimum_tests_for_significance": MIN_VALID_TEST_CASES_FOR_SIGNIFICANCE,
                    "judge_quality_filter": judge_quality_filter,
                    "input_standardization": get_input_standardization(config),
                    "underpowered_model_tasks": underpowered_pairs,
                    "low_input_length_models": low_input_length_models
                }
            }, f, indent=2, ensure_ascii=False)
        
        logger.info(
            f"Saved metrics to: {metrics_path}",
            metrics_file=str(metrics_path),
            models_evaluated=len(model_metrics_overall)
        )
        logger.info("View results at: http://localhost:3420/benchmarks", _event="benchmark_view_url")


def main():
    parser = argparse.ArgumentParser(description="Run model benchmarks")
    parser.add_argument(
        "--models",
        type=str,
        help="Comma-separated list of model IDs to test (default: all in config)"
    )
    parser.add_argument(
        "--tasks",
        type=str,
        default="summary,quiz,flashcards",
        help="Comma-separated list of tasks (default: summary,quiz,flashcards)"
    )
    parser.add_argument(
        "--test-cases",
        type=str,
        default=None,
        help="Path to test cases JSON file (default: benchmark/results/test_cases.json)"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ignore cache and force re-run"
    )
    parser.add_argument(
        "--skip-cached",
        action="store_true",
        help="Skip cached results (opposite of --force)"
    )
    parser.add_argument(
        "--purge-model",
        type=str,
        default=None,
        help="Purge one model from benchmark/results (results + cache) and recompute metrics, then exit"
    )
    parser.add_argument(
        "--check-availability-only",
        action="store_true",
        help="Only check and print model availability, do not run benchmarks or write results"
    )
    parser.add_argument(
        "--judge-quality-filter",
        type=str,
        default="strict",
        choices=["strict", "variance_only", "off"],
        help="Quality aggregation filter mode for judge consensus flags"
    )
    
    args = parser.parse_args()
    
    models = None
    if args.models:
        models = [m.strip() for m in args.models.split(",")]
    
    tasks = [t.strip() for t in args.tasks.split(",")]

    # Resolve test-cases path robustly from both repo root and benchmark/ directory
    if args.test_cases:
        test_cases_path = Path(args.test_cases)
        if not test_cases_path.exists() and not test_cases_path.is_absolute():
            alt_path = Path(__file__).parent.parent / args.test_cases
            if alt_path.exists():
                test_cases_path = alt_path
    else:
        test_cases_path = Path(__file__).parent / "results" / "test_cases.json"
    
    config = load_config()
    
    use_cache = not args.force
    if args.skip_cached:
        use_cache = False
    
    # Initialize logger
    logger = BenchmarkLogger(console=True)

    if args.purge_model:
        results_dir = Path(__file__).parent / "results"
        summary = purge_model_results(
            model_id=args.purge_model,
            results_dir=results_dir,
            config=config,
            judge_quality_filter=args.judge_quality_filter,
            logger=logger
        )
        print(
            f"Purged model '{args.purge_model}' from {results_dir}: "
            f"removed_results={summary['removed_results']}, "
            f"removed_cache_files={summary['removed_cache_files']}"
        )
        return

    # Fast path: only check availability and exit
    if args.check_availability_only:
        async def _check_only():
            models_config_list = load_models_config()
            models_dict = {m.get("id"): m for m in models_config_list}

            # Apply same model filtering logic as in run_benchmark
            requested_models_set = None
            if models:
                requested_models_set = set(models)
                available_in_config = [m for m in models if m in models_dict]
                missing_from_config = [m for m in models if m not in models_dict]
                if missing_from_config:
                    logger.warning(
                        "Some requested models not found in config",
                        missing_models=missing_from_config,
                        available_models=available_in_config
                    )
                models_dict = {k: v for k, v in models_dict.items() if k in requested_models_set}

            if not models_dict:
                logger.error(
                    "No models found in config",
                    requested_models=models if models else "all",
                    available_in_config=list({m.get("id") for m in models_config_list})
                )
                return

            judge_models = config["judge_models"]

            # Add judge models to models_dict for pricing info
            for judge_model_id in judge_models:
                if judge_model_id not in models_dict:
                    judge_model_config = next((m for m in models_config_list if m.get("id") == judge_model_id), None)
                    if judge_model_config:
                        models_dict[judge_model_id] = judge_model_config

            async with ModelClient() as client:
                logger.info("Checking model availability (availability-only mode)...")
                all_models = list(models_dict.keys()) + judge_models
                availability = await client.check_models_availability(all_models)

                # Same generation selection logic as in run_benchmark
                if requested_models_set is not None:
                    generation_candidates = requested_models_set
                else:
                    generation_candidates = {m for m in models_dict.keys() if m not in judge_models}

                available_generation = [m for m in generation_candidates if availability.get(m, False)]
                unavailable_generation = [m for m in generation_candidates if not availability.get(m, False)]
                available_judges = [m for m in judge_models if availability.get(m, False)]
                unavailable_judges = [m for m in judge_models if not availability.get(m, False)]

                logger.info(
                    "Availability summary",
                    available_generation_models=available_generation,
                    unavailable_generation_models=unavailable_generation,
                    available_judge_models=available_judges,
                    unavailable_judge_models=unavailable_judges,
                )

                print("\n=== Model Availability ===")
                print("Generation models:")
                for m in sorted(generation_candidates):
                    status = "available" if availability.get(m, False) else "unavailable"
                    print(f"  - {m}: {status}")
                print("\nJudge models:")
                for m in sorted(set(judge_models)):
                    status = "available" if availability.get(m, False) else "unavailable"
                    print(f"  - {m}: {status}")
                print("==========================\n")

        asyncio.run(_check_only())
        return

    asyncio.run(run_benchmark(
        models,
        tasks,
        test_cases_path,
        config,
        use_cache=use_cache,
        force=args.force,
        logger=logger,
        judge_quality_filter=args.judge_quality_filter
    ))


if __name__ == "__main__":
    main()
