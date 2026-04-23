"""Generate synthetic test cases using free OpenRouter models."""
import argparse
import asyncio
import json
import random
from collections import Counter
from pathlib import Path
from typing import List, Dict, Any
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from benchmark.models.client import ModelClient


CONFIG_PATH = Path(__file__).parent / "config" / "benchmark_config.json"
TEMPLATES_PATH = Path(__file__).parent / "config" / "test_case_templates.json"
DEFAULT_COUNT = 24
DEFAULT_MIN_PER_CELL = 0


def load_config() -> Dict[str, Any]:
    """Load benchmark configuration."""
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_templates() -> Dict[str, Any]:
    """Load test case templates."""
    with open(TEMPLATES_PATH, encoding="utf-8") as f:
        return json.load(f)


def build_balanced_generation_plan(
    count: int,
    topics: List[str],
    formats: List[str],
    min_per_cell: int = DEFAULT_MIN_PER_CELL
) -> List[tuple[str, str]]:
    """
    Build a balanced generation plan across topic x format cells.

    Enforces at least `min_per_cell` samples per cell, then distributes
    remaining samples evenly across all cells.
    """
    if min_per_cell < 0:
        raise ValueError("min_per_cell must be >= 0")
    if not topics or not formats:
        raise ValueError("topics and formats must not be empty")

    cells = [(topic, fmt) for topic in topics for fmt in formats]
    minimum_required = len(cells) * min_per_cell
    if count < minimum_required:
        raise ValueError(
            f"count={count} is too small for balanced coverage. "
            f"Need at least {minimum_required} for {len(topics)} topics x "
            f"{len(formats)} formats x min_per_cell={min_per_cell}."
        )

    cell_targets = {cell: min_per_cell for cell in cells}
    remaining = count - minimum_required

    # Distribute extras as evenly as possible.
    while remaining > 0:
        for cell in random.sample(cells, len(cells)):
            if remaining == 0:
                break
            cell_targets[cell] += 1
            remaining -= 1

    generation_plan: List[tuple[str, str]] = []
    for cell, target in cell_targets.items():
        generation_plan.extend([cell] * target)

    random.shuffle(generation_plan)
    return generation_plan


def validate_balance(
    test_cases: List[Dict[str, Any]],
    topics: List[str],
    formats: List[str],
    min_per_cell: int
) -> Dict[str, Any]:
    """Validate topic/format and cell balance for generated test cases."""
    topic_counts = Counter(tc.get("topic_category") for tc in test_cases)
    format_counts = Counter(tc.get("format_type") for tc in test_cases)
    cell_counts = Counter((tc.get("topic_category"), tc.get("format_type")) for tc in test_cases)

    min_topic_required = 6
    min_format_required = 12

    topic_violations = {topic: topic_counts.get(topic, 0) for topic in topics if topic_counts.get(topic, 0) < min_topic_required}
    format_violations = {fmt: format_counts.get(fmt, 0) for fmt in formats if format_counts.get(fmt, 0) < min_format_required}
    cell_violations = {
        f"{topic}::{fmt}": cell_counts.get((topic, fmt), 0)
        for topic in topics
        for fmt in formats
        if cell_counts.get((topic, fmt), 0) < min_per_cell
    }

    return {
        "topic_counts": dict(topic_counts),
        "format_counts": dict(format_counts),
        "cell_counts": {f"{topic}::{fmt}": cell_counts.get((topic, fmt), 0) for topic in topics for fmt in formats},
        "topic_violations": topic_violations,
        "format_violations": format_violations,
        "cell_violations": cell_violations,
        "is_balanced": not topic_violations and not format_violations and not cell_violations
    }


def build_generation_prompt(
    topic: str,
    format_type: str,
    templates: Dict[str, Any],
    target_length: int = 2000
) -> str:
    """Build prompt for test case generation."""
    topic_info = templates["topics"].get(topic, {})
    keywords = topic_info.get("keywords", [])
    formulas = topic_info.get("formulas", [])
    
    format_prompt = templates["format_prompts"].get(format_type, "")
    
    prompt = f"""Erstelle einen akademischen Text zum Thema "{topic}" für eine Vorlesung.

Anforderungen:
- Länge: ca. {target_length} Zeichen
- Thema: {topic}
- Verwende Fachbegriffe: {', '.join(keywords[:5])}
{f'- Enthalte mathematische Formeln: {", ".join(formulas[:3])}' if formulas else ''}

Format-Anforderung:
{format_prompt}

Der Text sollte:
- Einzelnes Thema umfassend behandeln (nicht oberflächlich)
- Technische Konzepte, Definitionen, Prozesse enthalten
- Strukturiert sein (Absätze, ggf. Listen)
- Für Prüfungsvorbereitung geeignet sein

Gib NUR den Text aus, keine Metadaten, keine Einleitung."""
    
    return prompt


async def generate_test_case(
    client: ModelClient,
    model_id: str,
    topic: str,
    format_type: str,
    templates: Dict[str, Any],
    test_id: int
) -> Dict[str, Any]:
    """Generate a single test case."""
    target_length = random.randint(1500, 3000)
    
    system_prompt = """Du erstellst akademische Vorlesungstexte für Benchmarking-Zwecke. 
Erstelle realistische, prüfungsrelevante Inhalte."""
    
    user_prompt = build_generation_prompt(topic, format_type, templates, target_length)
    
    result = await client.generate(
        model_id=model_id,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=4000,
        temperature=0.7
    )
    
    if result.get("error"):
        return {
            "id": f"test_{test_id:04d}",
            "error": result["error"],
            "text": "",
            "topic_category": topic,
            "format_type": format_type
        }
    
    text = result["text"].strip()
    
    return {
        "id": f"test_{test_id:04d}",
        "title": f"{topic.replace('_', ' ').title()} - {format_type.replace('_', ' ').title()}",
        "text": text,
        "topic_category": topic,
        "format_type": format_type,
        "length": len(text),
        "generated_by": model_id,
        "error": None
    }


async def generate_test_cases(
    count: int,
    models: List[str],
    config: Dict[str, Any],
    templates: Dict[str, Any],
    output_path: Path,
    min_per_cell: int = DEFAULT_MIN_PER_CELL
):
    """Generate multiple test cases using free models."""
    topics = config["topics"]
    formats = config["test_case_formats"]
    free_models = models or config["free_generation_models"]

    generation_plan = build_balanced_generation_plan(
        count=count,
        topics=topics,
        formats=formats,
        min_per_cell=min_per_cell
    )
    
    # Check model availability
    async with ModelClient() as client:
        print(f"Checking availability of {len(free_models)} models...")
        availability = await client.check_models_availability(free_models)
        available_models = [m for m in free_models if availability.get(m, False)]
        
        if not available_models:
            print("ERROR: No free models are available!")
            return
        
        print(f"Available models: {len(available_models)}/{len(free_models)}")
        for model in available_models:
            print(f"  ✓ {model}")
        for model in free_models:
            if model not in available_models:
                print(f"  ✗ {model} (unavailable)")
        
        # Generate test cases
        test_cases = []
        model_rotation = 0
        
        print(f"\nGenerating {count} balanced test cases...")
        
        for i, (topic, format_type) in enumerate(generation_plan):
            # Rotate through models
            model_id = available_models[model_rotation % len(available_models)]
            model_rotation += 1

            print(f"  [{i+1}/{count}] Generating {topic} ({format_type}) with {model_id}...")
            
            test_case = await generate_test_case(
                client, model_id, topic, format_type, templates, i + 1
            )
            
            if test_case.get("error"):
                print(f"    ERROR: {test_case['error']}")
            else:
                print(f"    ✓ Generated {test_case['length']} chars")
            
            test_cases.append(test_case)
            
            # Small delay to avoid rate limits
            await asyncio.sleep(0.5)
    
    # Save test cases
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Load existing test cases if file exists to preserve generated text
    existing_cases = {}
    if output_path.exists():
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                existing = json.load(f)
                existing_cases = {tc.get("id"): tc for tc in existing if isinstance(tc, dict)}
        except Exception:
            pass
    
    # Merge with existing, preserving generated text
    for tc in test_cases:
        existing_id = existing_cases.get(tc.get("id"))
        if existing_id and existing_id.get("text") and not tc.get("error"):
            # Preserve existing text if new generation failed
            if not tc.get("text"):
                tc["text"] = existing_id["text"]
                tc["generated_by"] = existing_id.get("generated_by", "previous")
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(test_cases, f, indent=2, ensure_ascii=False)
    
    successful = sum(1 for tc in test_cases if not tc.get("error") and tc.get("text"))
    print(f"\n✓ Generated {successful}/{count} test cases")
    print(f"  Saved to: {output_path}")
    print("  Note: Generated text is preserved for future test case reuse")

    balance_report = validate_balance(test_cases, topics, formats, min_per_cell=min_per_cell)
    print("\nBalance validation:")
    print(f"  Topics covered: {len(balance_report['topic_counts'])}/{len(topics)}")
    print(f"  Formats covered: {len(balance_report['format_counts'])}/{len(formats)}")
    if balance_report["is_balanced"]:
        print("  ✓ Balanced set satisfies topic/format/cell minimums")
    else:
        print("  ✗ Balance violations detected")
        if balance_report["topic_violations"]:
            print(f"    topic violations: {balance_report['topic_violations']}")
        if balance_report["format_violations"]:
            print(f"    format violations: {balance_report['format_violations']}")
        if balance_report["cell_violations"]:
            print(f"    cell violations: {balance_report['cell_violations']}")


def main():
    parser = argparse.ArgumentParser(description="Generate synthetic test cases for benchmarking")
    parser.add_argument(
        "--count",
        type=int,
        default=DEFAULT_COUNT,
        help="Requested test case count (default: 24; auto-raised for matrix balance)"
    )
    parser.add_argument(
        "--min-per-cell",
        type=int,
        default=DEFAULT_MIN_PER_CELL,
        help="Minimum samples per topic x format cell (default: 3)"
    )
    parser.add_argument(
        "--models",
        type=str,
        help="Comma-separated list of model IDs (default: from config)"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="benchmark/results/test_cases.json",
        help="Output path for test cases JSON"
    )
    
    args = parser.parse_args()
    
    models = None
    if args.models:
        models = [m.strip() for m in args.models.split(",")]
    
    config = load_config()
    templates = load_templates()
    output_path = Path(args.output)

    minimum_required = len(config["topics"]) * len(config["test_case_formats"]) * args.min_per_cell
    effective_count = args.count
    if args.count < minimum_required:
        print(
            f"WARNING: Requested --count {args.count} is below balanced minimum "
            f"({minimum_required}). Using {minimum_required} instead."
        )
        effective_count = minimum_required
    
    asyncio.run(generate_test_cases(
        effective_count,
        models,
        config,
        templates,
        output_path,
        min_per_cell=args.min_per_cell
    ))


if __name__ == "__main__":
    main()
