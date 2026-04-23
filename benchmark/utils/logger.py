"""Structured JSON logging for benchmark system."""
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List


LOG_DIR = Path(__file__).parent.parent / "results" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)


class BenchmarkLogger:
    """Structured JSON logger for benchmarks."""
    
    def __init__(self, log_file: Optional[Path] = None, console: bool = True):
        """
        Initialize logger.
        
        Args:
            log_file: Optional path to log file (default: timestamped file in results/logs/)
            console: Whether to also print to console
        """
        self.console = console
        if log_file is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            log_file = LOG_DIR / f"benchmark_{timestamp}.jsonl"
        
        self.log_file = log_file
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
    
    def log(self, level: str, message: str, **kwargs):
        """
        Log a structured message.
        
        Args:
            level: Log level (info, warning, error, debug)
            message: Log message
            **kwargs: Additional structured data
        """
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "message": message,
            **kwargs
        }
        
        # Write to file (JSONL format - one JSON object per line)
        try:
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
        except Exception as e:
            # Fallback to console if file write fails
            print(f"ERROR: Failed to write log: {e}", file=sys.stderr)
        
        # Print to console if enabled
        if self.console:
            # Format for console readability (ASCII-safe for Windows)
            prefix = {
                "info": "[i]",
                "warning": "[!]",
                "error": "[x]",
                "debug": "[D]"
            }.get(level, "[*]")
            
            if kwargs:
                # Include key data in console output
                extra = ", ".join(f"{k}={v}" for k, v in kwargs.items() if not k.startswith("_"))
                print(f"{prefix} {message} ({extra})")
            else:
                print(f"{prefix} {message}")
    
    def info(self, message: str, **kwargs):
        """Log info message."""
        self.log("info", message, **kwargs)
    
    def warning(self, message: str, **kwargs):
        """Log warning message."""
        self.log("warning", message, **kwargs)
    
    def error(self, message: str, **kwargs):
        """Log error message."""
        self.log("error", message, **kwargs)
    
    def debug(self, message: str, **kwargs):
        """Log debug message."""
        self.log("debug", message, **kwargs)
    
    def benchmark_start(self, total_tasks: int, models: List[str], tasks: List[str]):
        """Log benchmark start."""
        self.info(
            "Benchmark started",
            total_tasks=total_tasks,
            models=models,
            tasks=tasks,
            _event="benchmark_start"
        )
    
    def benchmark_progress(self, completed: int, total: int, current_model: Optional[str] = None):
        """Log benchmark progress."""
        self.debug(
            "Benchmark progress",
            completed=completed,
            total=total,
            progress_pct=round(completed / total * 100, 1) if total > 0 else 0,
            current_model=current_model,
            _event="benchmark_progress"
        )
    
    def benchmark_complete(self, total: int, duration_seconds: float, total_cost: float):
        """Log benchmark completion."""
        self.info(
            "Benchmark completed",
            total_tasks=total,
            duration_seconds=round(duration_seconds, 2),
            total_cost=round(total_cost, 4),
            _event="benchmark_complete"
        )
    
    def model_result(self, model_id: str, task: str, test_case_id: str, 
                     reliability: float, quality: float, cost: float, latency_ms: float):
        """Log individual model result."""
        self.debug(
            "Model result",
            model_id=model_id,
            task=task,
            test_case_id=test_case_id,
            reliability_score=round(reliability, 2),
            quality_score=round(quality, 2),
            cost=round(cost, 6),
            latency_ms=round(latency_ms, 0),
            _event="model_result"
        )
