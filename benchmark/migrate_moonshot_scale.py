"""One-off helper to clean up old 0-10 scale results for moonshotai models.

Usage (from project root):

    cd benchmark
    python migrate_moonshot_scale.py

Effect:
  - Creates backups:
      results/benchmark_results.pre_moonshot_migration.json
      results/benchmark_metrics.pre_moonshot_migration.json
  - Filters ALL entries for models starting with "moonshotai/" out of
    benchmark_results.json and benchmark_metrics.json.
  - After this, re-run the benchmark for those models so that all
    Moonshot-Ergebnisse sauber im 1-100 Scale neu berechnet werden.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict


ROOT = Path(__file__).parent
RESULTS_PATH = ROOT / "results" / "benchmark_results.json"
METRICS_PATH = ROOT / "results" / "benchmark_metrics.json"


def _load_json(path: Path) -> Any:
    if not path.exists():
        print(f"[warn] {path} not found, skipping")
        return None
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _backup(path: Path, suffix: str) -> None:
    if not path.exists():
        return
    backup = path.with_suffix(path.suffix + suffix)
    backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"[ok] backup written: {backup}")


def migrate() -> int:
    # Backups first
    _backup(RESULTS_PATH, ".pre_moonshot_migration")
    _backup(METRICS_PATH, ".pre_moonshot_migration")

    results = _load_json(RESULTS_PATH)
    metrics = _load_json(METRICS_PATH)

    target_models = [
        "moonshotai/kimi-k2.5",
        "moonshotai/kimi-k2-thinking",
    ]

    # Filter ALL entries for the target Moonshot models from results
    if isinstance(results, list):
        before = len(results)
        filtered: list[dict] = []
        removed_counts: Dict[str, int] = {m: 0 for m in target_models}

        for r in results:
            mid = str(r.get("model_id", ""))
            if mid in target_models:
                removed_counts[mid] += 1
                continue
            filtered.append(r)

        RESULTS_PATH.write_text(json.dumps(filtered, ensure_ascii=False, indent=2), encoding="utf-8")
        removed_total = sum(removed_counts.values())
        print(f"[ok] filtered results: {before} -> {len(filtered)} entries (removed {removed_total} Moonshot rows)")
        for mid, cnt in removed_counts.items():
            print(f"    - {mid}: {cnt} rows removed")
    else:
        print("[warn] results file not a list; no changes applied")

    # Remove Moonshot models from metrics structure completely
    if isinstance(metrics, dict):
        model_metrics = metrics.get("model_metrics")
        if isinstance(model_metrics, dict):
            for mid in target_models:
                model_metrics.pop(mid, None)

        comp_metrics = metrics.get("model_metrics_comprehensive")
        if isinstance(comp_metrics, dict):
            for mid in target_models:
                comp_metrics.pop(mid, None)

        comparative = metrics.get("comparative_metrics")
        if isinstance(comparative, dict):
            rankings = comparative.get("rankings")
            if isinstance(rankings, dict):
                for key, arr in rankings.items():
                    if isinstance(arr, list):
                        comparative["rankings"][key] = [m for m in arr if m not in target_models]
            value_scores = comparative.get("value_scores")
            if isinstance(value_scores, dict):
                for mid in target_models:
                    value_scores.pop(mid, None)
            if "model_count" in comparative and isinstance(comparative["model_count"], int):
                # Best-effort decrement; exact count will be recomputed on next full run anyway
                comparative["model_count"] = max(0, comparative["model_count"] - len(target_models))

        METRICS_PATH.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[ok] removed metrics entries for: {', '.join(target_models)}")
    else:
        print("[warn] metrics file not a dict; no changes applied")

    print(
        "\nDone. Alle bisherigen Ergebnisse für moonshotai/kimi-k2.5 und moonshotai/kimi-k2-thinking "
        "wurden aus Results & Metrics entfernt.\n"
        "Bitte die Benchmarks für diese beiden Modelle einmal neu laufen lassen, damit sie sauber im 1-100 Scale vorliegen."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(migrate())

