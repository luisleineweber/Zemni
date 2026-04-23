"""Format checker for Reliability Score (separate from Content Quality)."""
import json
import re
from typing import Dict, Any, Optional

# Penalty constants for reliability scoring
MARKDOWN_ISSUE_PENALTY = 5.0  # Penalty per markdown issue
LATEX_ISSUE_PENALTY = 3.0  # Penalty per LaTeX issue
JSON_SCHEMA_ISSUE_PENALTY = 10.0  # Penalty per JSON schema issue (more severe)
LATEX_IN_JSON_PENALTY = 2.0  # Penalty per LaTeX issue in JSON strings


def check_latex_escaping(text: str) -> tuple[bool, list[str]]:
    """
    Check if LaTeX formulas are properly escaped.
    Returns (is_valid, list_of_issues)
    """
    issues = []
    
    # Check for proper escaping in markdown context
    # LaTeX should not break markdown parsing
    # Check for $ inside code blocks (should be fine)
    # Check for $ in regular text (should be paired)
    
    dollar_count = text.count('$')
    if dollar_count > 0 and dollar_count % 2 != 0:
        issues.append("Unpaired dollar signs (LaTeX delimiters)")
    
    # Check for display math blocks
    display_blocks = re.findall(r'\$\$[^$]+\$\$', text)
    for block in display_blocks:
        if len(block) < 5:  # At least $$x$$
            issues.append(f"Invalid display math block: {block[:20]}")
    
    is_valid = len(issues) == 0
    return is_valid, issues


def check_markdown_structure(text: str) -> tuple[bool, list[str]]:
    """Check basic markdown structure for summaries."""
    issues = []
    
    # Must start with H1
    if not text.strip().startswith('#'):
        issues.append("Does not start with H1 heading")
    elif not text.strip().startswith('# '):
        # Check if it's properly formatted H1 (not ## or ###)
        first_line = text.strip().split('\n')[0]
        if not first_line.startswith('# '):
            issues.append("First heading is not properly formatted H1 (# Title)")
    
    # Check for forbidden metadata/frontmatter
    if text.strip().startswith('---'):
        issues.append("Contains frontmatter (---)")
    
    # Check for forbidden phrases
    forbidden_phrases = [
        "Damit kann man sich gut vorbereiten",
        "Alles kommt aus den Vorlesungsfolien",
        "Diese Zusammenfassung basiert auf"
    ]
    for phrase in forbidden_phrases:
        if phrase.lower() in text.lower():
            issues.append(f"Contains forbidden phrase: {phrase}")
    
    # Basic markdown validity (check for common issues)
    # Unclosed code blocks
    code_block_count = text.count('```')
    if code_block_count % 2 != 0:
        issues.append("Unclosed code block")
    
    is_valid = len(issues) == 0
    return is_valid, issues


def check_json_structure(data: Any, schema_type: str) -> tuple[bool, list[str]]:
    """Check JSON structure for quizzes and flashcards."""
    issues = []
    
    if not isinstance(data, dict):
        issues.append("Top level is not an object")
        return False, issues
    
    if schema_type == "quiz":
        if "questions" not in data:
            issues.append("Missing 'questions' key")
        elif not isinstance(data["questions"], list):
            issues.append("'questions' is not an array")
        else:
            for i, q in enumerate(data["questions"]):
                if not isinstance(q, dict):
                    issues.append(f"Question {i} is not an object")
                    continue
                
                required_fields = ["sectionId", "sectionTitle", "question", "options", "correctIndex", "sourceSnippet"]
                for field in required_fields:
                    if field not in q:
                        issues.append(f"Question {i} missing field: {field}")
                
                if "options" in q:
                    if not isinstance(q["options"], list):
                        issues.append(f"Question {i} options is not an array")
                    elif len(q["options"]) != 4:
                        issues.append(f"Question {i} does not have exactly 4 options")
                
                if "correctIndex" in q:
                    idx = q["correctIndex"]
                    if not isinstance(idx, int) or idx < 0 or idx > 3:
                        issues.append(f"Question {i} has invalid correctIndex: {idx}")
    
    elif schema_type == "flashcards":
        if "flashcards" not in data:
            issues.append("Missing 'flashcards' key")
        elif not isinstance(data["flashcards"], list):
            issues.append("'flashcards' is not an array")
        else:
            for i, card in enumerate(data["flashcards"]):
                if not isinstance(card, dict):
                    issues.append(f"Flashcard {i} is not an object")
                    continue
                
                required_fields = ["sectionId", "sectionTitle", "type", "front", "back", "sourceSnippet"]
                for field in required_fields:
                    if field not in card:
                        issues.append(f"Flashcard {i} missing field: {field}")
                
                if "type" in card:
                    if card["type"] not in ["qa", "cloze"]:
                        issues.append(f"Flashcard {i} has invalid type: {card['type']}")
    
    is_valid = len(issues) == 0
    return is_valid, issues


def evaluate_reliability(
    task_type: str,
    output_text: str,
    parsed_json: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Evaluate Reliability Score (1-100) separate from Content Quality.
    
    Args:
        task_type: "summary", "quiz", or "flashcards"
        output_text: The raw output text from the model
        parsed_json: Parsed JSON (for quiz/flashcards), None for summaries
    
    Returns:
        Dict with reliability_score (1-100), issues list, and details
    """
    score = 100.0
    all_issues = []
    details: Dict[str, Any] = {}

    # Global critical check: completely empty output is always maximally unreliable
    if not output_text or not str(output_text).strip():
        all_issues.append("Empty output text")
        score = 1.0  # Minimum score is 1, not 0
        details["empty_output"] = True
        if task_type in ["quiz", "flashcards"]:
            details["json_parseable"] = False
            details["parse_error"] = "Empty output text"
        return {
            "reliability_score": max(1.0, score),
            "issues": all_issues,
            "details": details,
        }
    
    if task_type == "summary":
        # Check markdown structure
        md_valid, md_issues = check_markdown_structure(output_text)
        all_issues.extend(md_issues)
        if not md_valid:
            score -= len(md_issues) * MARKDOWN_ISSUE_PENALTY
        
        # Check LaTeX escaping
        latex_valid, latex_issues = check_latex_escaping(output_text)
        all_issues.extend(latex_issues)
        if not latex_valid:
            score -= len(latex_issues) * LATEX_ISSUE_PENALTY
        
        details["markdown_valid"] = md_valid
        details["latex_valid"] = latex_valid
        details["markdown_issues"] = md_issues
        details["latex_issues"] = latex_issues
    
    elif task_type in ["quiz", "flashcards"]:
        # Try to parse JSON
        try:
            if parsed_json is None:
                parsed_json = json.loads(output_text)
        except json.JSONDecodeError as e:
            all_issues.append(f"JSON parse error: {str(e)}")
            score = 1.0  # Critical: unparseable JSON (minimum score is 1, not 0)
            return {
                "reliability_score": max(1.0, score),
                "issues": all_issues,
                "details": {"json_parseable": False, "parse_error": str(e)}
            }
        
        # Check JSON structure
        schema_type = "quiz" if task_type == "quiz" else "flashcards"
        json_valid, json_issues = check_json_structure(parsed_json, schema_type)
        all_issues.extend(json_issues)
        
        if not json_valid:
            # Severe penalty for schema issues
            score -= len(json_issues) * JSON_SCHEMA_ISSUE_PENALTY
        
        details["json_parseable"] = True
        details["json_valid"] = json_valid
        details["json_issues"] = json_issues
        
        # Also check LaTeX in JSON strings (for explanations, etc.)
        json_str = json.dumps(parsed_json)
        latex_valid, latex_issues = check_latex_escaping(json_str)
        if latex_issues:
            all_issues.extend([f"LaTeX in JSON: {issue}" for issue in latex_issues])
            score -= len(latex_issues) * LATEX_IN_JSON_PENALTY
    
    # Clamp score to 1-100
    score = max(1.0, min(100.0, score))
    
    return {
        "reliability_score": score,
        "issues": all_issues,
        "details": details
    }
