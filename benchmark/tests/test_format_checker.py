"""Tests for format_checker evaluator."""
from evaluators.format_checker import (
    evaluate_reliability,
    check_markdown_structure,
    check_latex_escaping,
    check_json_structure
)


class TestMarkdownStructure:
    """Tests for markdown structure checking."""
    
    def test_valid_markdown_starts_with_h1(self):
        """Valid markdown should start with H1."""
        text = "# Title\n\nContent here."
        is_valid, issues = check_markdown_structure(text)
        assert is_valid is True
        assert len(issues) == 0
    
    def test_invalid_markdown_no_h1(self):
        """Invalid markdown without H1."""
        text = "Content without heading."
        is_valid, issues = check_markdown_structure(text)
        assert is_valid is False
        assert any("H1" in issue for issue in issues)
    
    def test_invalid_markdown_frontmatter(self):
        """Invalid markdown with frontmatter."""
        text = "---\nkey: value\n---\n# Title"
        is_valid, issues = check_markdown_structure(text)
        assert is_valid is False
        assert any("frontmatter" in issue.lower() for issue in issues)
    
    def test_invalid_markdown_forbidden_phrase(self):
        """Invalid markdown with forbidden phrase."""
        text = "# Title\n\nDamit kann man sich gut vorbereiten"
        is_valid, issues = check_markdown_structure(text)
        assert is_valid is False
        assert any("forbidden" in issue.lower() for issue in issues)
    
    def test_invalid_markdown_unclosed_code_block(self):
        """Invalid markdown with unclosed code block."""
        text = "# Title\n\n```python\ncode here"
        is_valid, issues = check_markdown_structure(text)
        assert is_valid is False
        assert any("code block" in issue.lower() for issue in issues)


class TestLatexEscaping:
    """Tests for LaTeX escaping checking."""
    
    def test_valid_latex_inline(self):
        """Valid inline LaTeX."""
        text = "# Title\n\nThe formula is $x + y = z$."
        is_valid, issues = check_latex_escaping(text)
        assert is_valid is True
        assert len(issues) == 0
    
    def test_valid_latex_display(self):
        """Valid display LaTeX."""
        text = "# Title\n\n$$\\int_0^1 x dx = \\frac{1}{2}$$"
        is_valid, issues = check_latex_escaping(text)
        assert is_valid is True
        assert len(issues) == 0
    
    def test_invalid_latex_unpaired_dollar(self):
        """Invalid LaTeX with unpaired dollar sign."""
        text = "# Title\n\nThe formula is $x + y."
        is_valid, issues = check_latex_escaping(text)
        assert is_valid is False
        assert any("unpaired" in issue.lower() or "dollar" in issue.lower() for issue in issues)


class TestJsonStructure:
    """Tests for JSON structure checking."""
    
    def test_valid_quiz_structure(self):
        """Valid quiz JSON structure."""
        data = {
            "questions": [
                {
                    "sectionId": "sec1",
                    "sectionTitle": "Section 1",
                    "question": "What is X?",
                    "options": ["A", "B", "C", "D"],
                    "correctIndex": 0,
                    "sourceSnippet": "X is defined as..."
                }
            ]
        }
        is_valid, issues = check_json_structure(data, "quiz")
        assert is_valid is True
        assert len(issues) == 0
    
    def test_invalid_quiz_missing_questions(self):
        """Invalid quiz without questions key."""
        data = {}
        is_valid, issues = check_json_structure(data, "quiz")
        assert is_valid is False
        assert any("questions" in issue.lower() for issue in issues)
    
    def test_invalid_quiz_wrong_options_count(self):
        """Invalid quiz with wrong number of options."""
        data = {
            "questions": [
                {
                    "sectionId": "sec1",
                    "sectionTitle": "Section 1",
                    "question": "What is X?",
                    "options": ["A", "B", "C"],  # Only 3 options
                    "correctIndex": 0,
                    "sourceSnippet": "X is defined as..."
                }
            ]
        }
        is_valid, issues = check_json_structure(data, "quiz")
        assert is_valid is False
        assert any("4 options" in issue.lower() for issue in issues)
    
    def test_invalid_quiz_invalid_correct_index(self):
        """Invalid quiz with invalid correctIndex."""
        data = {
            "questions": [
                {
                    "sectionId": "sec1",
                    "sectionTitle": "Section 1",
                    "question": "What is X?",
                    "options": ["A", "B", "C", "D"],
                    "correctIndex": 5,  # Invalid (should be 0-3)
                    "sourceSnippet": "X is defined as..."
                }
            ]
        }
        is_valid, issues = check_json_structure(data, "quiz")
        assert is_valid is False
        assert any("correctindex" in issue.lower() for issue in issues)
    
    def test_valid_flashcards_structure(self):
        """Valid flashcards JSON structure."""
        data = {
            "flashcards": [
                {
                    "sectionId": "sec1",
                    "sectionTitle": "Section 1",
                    "type": "qa",
                    "front": "What is X?",
                    "back": "X is...",
                    "sourceSnippet": "X is defined as..."
                }
            ]
        }
        is_valid, issues = check_json_structure(data, "flashcards")
        assert is_valid is True
        assert len(issues) == 0
    
    def test_invalid_flashcards_wrong_type(self):
        """Invalid flashcards with wrong type."""
        data = {
            "flashcards": [
                {
                    "sectionId": "sec1",
                    "sectionTitle": "Section 1",
                    "type": "invalid",  # Should be "qa" or "cloze"
                    "front": "What is X?",
                    "back": "X is...",
                    "sourceSnippet": "X is defined as..."
                }
            ]
        }
        is_valid, issues = check_json_structure(data, "flashcards")
        assert is_valid is False
        assert any("type" in issue.lower() for issue in issues)


class TestEvaluateReliability:
    """Tests for evaluate_reliability function."""
    
    def test_summary_reliability_valid(self):
        """Valid summary should get high reliability score."""
        text = "# Title\n\nValid markdown content with $x + y$ formula."
        result = evaluate_reliability("summary", text, None)
        assert result["reliability_score"] >= 80
        assert len(result["issues"]) == 0
    
    def test_summary_reliability_invalid(self):
        """Invalid summary should get low reliability score."""
        text = "No heading, invalid markdown."
        result = evaluate_reliability("summary", text, None)
        assert result["reliability_score"] < 100
        assert len(result["issues"]) > 0
    
    def test_quiz_reliability_valid_json(self):
        """Valid quiz JSON should get high reliability score."""
        text = '{"questions": [{"sectionId": "sec1", "sectionTitle": "S1", "question": "Q?", "options": ["A", "B", "C", "D"], "correctIndex": 0, "sourceSnippet": "..."}]}'
        parsed_json = {
            "questions": [
                {
                    "sectionId": "sec1",
                    "sectionTitle": "S1",
                    "question": "Q?",
                    "options": ["A", "B", "C", "D"],
                    "correctIndex": 0,
                    "sourceSnippet": "..."
                }
            ]
        }
        result = evaluate_reliability("quiz", text, parsed_json)
        assert result["reliability_score"] >= 80
        assert len(result["issues"]) == 0
    
    def test_quiz_reliability_invalid_json(self):
        """Invalid quiz JSON should get low reliability score."""
        text = "Not valid JSON"
        result = evaluate_reliability("quiz", text, None)
        assert result["reliability_score"] == 1.0  # Minimum score for unparseable JSON
        assert len(result["issues"]) > 0
    
    def test_quiz_reliability_empty_text(self):
        """Empty text should get minimum reliability score."""
        text = ""
        result = evaluate_reliability("quiz", text, None)
        assert result["reliability_score"] == 1.0
        assert any("empty" in issue.lower() for issue in result["issues"])
    
    def test_reliability_score_range(self):
        """Reliability score should always be in 1-100 range."""
        test_cases = [
            ("summary", "# Title\n\nContent", None),
            ("quiz", '{"questions": []}', {}),
            ("flashcards", '{"flashcards": []}', {}),
        ]
        
        for task_type, text, parsed_json in test_cases:
            result = evaluate_reliability(task_type, text, parsed_json)
            assert 1.0 <= result["reliability_score"] <= 100.0
            assert isinstance(result["issues"], list)
            assert "details" in result
