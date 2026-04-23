"use client";

import { useEffect, useMemo, useState } from "react";
import type { OutputEntry, QuizQuestion, Status } from "@/types";
import { downloadTextFile } from "@/lib/download";
import { quizToGift, quizToMarkdown } from "@/lib/exporters";
import { getQuizAnswerState } from "@/lib/utils/quiz-state";
import { ConfirmModal, ExportMenu } from "@/components/ui";

/**
 * Determine if a keyboard event target is an editable input.
 */
const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el.isContentEditable ||
    Boolean(el.closest?.("[contenteditable='true']"))
  );
};

type QuizModeProps = {
  extractedText: string;
  fileName: string;
  output?: OutputEntry;
  status: Status;
  onReveal: () => void;
  onNext: () => void | Promise<void>;
  onPrev: () => void;
  onSelectOption: (index: number) => void;
  showKeyboardHints?: boolean;
  onRetry?: () => void | Promise<void>;
};

/**
 * Derive a filename base without extension for exports.
 */
const baseNameFor = (fileName: string): string => {
  const trimmed = (fileName || "").trim();
  if (!trimmed) return "document";
  return trimmed.replace(/\.[^.]+$/, "");
};

/**
 * Display quiz questions with keyboard navigation and exports.
 */
export function QuizMode({
  extractedText,
  fileName,
  output,
  status,
  onReveal,
  onNext,
  onPrev,
  onSelectOption,
  showKeyboardHints = true,
  onRetry
}: QuizModeProps) {
  const quiz = output?.quiz ?? [];
  const state = output?.quizState;

  const cursor = state?.questionCursor ?? 0;
  const currentQuestion: QuizQuestion | undefined = quiz[cursor];
  const answerState = getQuizAnswerState(state, currentQuestion, cursor);
  const reveal = Boolean(answerState?.revealAnswer ?? state?.revealAnswer);
  const selectedIndex = answerState?.selectedOptionIndex ?? state?.selectedOptionIndex;

  const [focusIndex, setFocusIndex] = useState(0);
  const optionCount = currentQuestion?.options.length ?? 0;

  const [showLoadMoreConfirm, setShowLoadMoreConfirm] = useState(false);
  const isAtLastQuestion = cursor >= quiz.length - 1 && quiz.length > 0;

  useEffect(() => {
    setFocusIndex(0);
  }, [cursor, output?.id, optionCount]);

  const isBusy = status === "summarizing" || status === "parsing";

  useEffect(() => {
    if (!currentQuestion) return;

    /**
     * Clamp the focus index within the available options.
     */
    const clampFocusIndex = (value: number): number => {
      if (!optionCount) return 0;
      const normalized = value % optionCount;
      return normalized < 0 ? normalized + optionCount : normalized;
    };

    /**
     * Move the focused option by a delta.
     */
    const moveFocus = (delta: number) => {
      if (!optionCount) return;
      setFocusIndex((prev) => clampFocusIndex(prev + delta));
    };

    /**
     * Select an option and update focus.
     */
    const selectIndex = (index: number) => {
      if (!optionCount) return;
      const safeIndex = clampFocusIndex(index);
      setFocusIndex(safeIndex);
      onSelectOption(safeIndex);
    };

    /**
     * Handle quiz keyboard shortcuts and navigation.
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (!optionCount) return;

      const { key } = e;
      const lower = key.toLowerCase();
      const upper = key.toUpperCase();

      if (key === "ArrowUp" || lower === "k") {
        e.preventDefault();
        moveFocus(-1);
        return;
      }

      if (key === "ArrowDown" || lower === "j") {
        e.preventDefault();
        moveFocus(1);
        return;
      }

      if (key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
        return;
      }

      if (key === "ArrowRight" || lower === "n") {
        e.preventDefault();
        if (!isBusy) {
          const questions = output?.quiz ?? [];
          const currentCursor = state?.questionCursor ?? 0;
          const atLast = currentCursor === questions.length - 1 && questions.length > 0;
          if (currentCursor < questions.length - 1) {
            void onNext();
          } else if (atLast) {
            // At last question - show confirmation before generating more
            setShowLoadMoreConfirm(true);
          }
        }
        return;
      }

      const number = Number(key);
      if (!Number.isNaN(number) && number >= 1 && number <= optionCount) {
        e.preventDefault();
        selectIndex(number - 1);
        return;
      }

      const idxFromLetter = upper.charCodeAt(0) - 65;
      if (idxFromLetter >= 0 && idxFromLetter < optionCount) {
        e.preventDefault();
        selectIndex(idxFromLetter);
        return;
      }

      if (key === "Enter" || key === " ") {
        e.preventDefault();
        selectIndex(focusIndex);
        return;
      }

      if (upper === "R") {
        e.preventDefault();
        onReveal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentQuestion, focusIndex, isBusy, onNext, onPrev, onReveal, onSelectOption, optionCount]);

  const selectedIsCorrect = useMemo(() => {
    if (!currentQuestion) return null;
    if (selectedIndex === undefined || selectedIndex === null) return null;
    return selectedIndex === currentQuestion.correctIndex;
  }, [currentQuestion, selectedIndex]);

  if (!extractedText) {
    return <div className="mode-empty">Upload a PDF/MD file, then click Generate.</div>;
  }

  if (!output) {
    return <div className="mode-empty">No quiz yet. Click Generate.</div>;
  }

  if (output.error) {
    return (
      <div className="mode-empty error">
        <div className="error-display">
          <div className="error-message">
            <strong>Error:</strong> {output.error}
          </div>
          {output.errorSuggestion && (
            <div className="error-suggestion">
              💡 {output.errorSuggestion}
            </div>
          )}
          {output.canRetry && onRetry && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onRetry()}
            >
              Retry Generation
            </button>
          )}
        </div>
      </div>
    );
  }

  if (output.isGenerating && !currentQuestion) {
    return <div className="mode-empty">Generating questions...</div>;
  }

  if (!currentQuestion) {
    return <div className="mode-empty">No questions available.</div>;
  }

  /**
   * Export quiz questions as a markdown file.
   */
  const handleExportMarkdown = () => {
    const { fileName: exportName, content } = quizToMarkdown(quiz, fileName);
    downloadTextFile(exportName, content, "text/markdown;charset=utf-8");
  };

  /**
   * Export quiz questions as JSON.
   */
  const handleExportJson = () => {
    const base = baseNameFor(fileName);
    downloadTextFile(`${base}-quiz.json`, JSON.stringify({ questions: quiz }, null, 2) + "\n", "application/json;charset=utf-8");
  };

  /**
   * Export quiz questions as a GIFT file for Moodle/LMS imports.
   */
  const handleExportGift = () => {
    const { fileName: exportName, content } = quizToGift(quiz, fileName);
    downloadTextFile(exportName, content, "text/plain;charset=utf-8");
  };

  return (
    <div className="quiz-view">
      {output.isCached && (
        <div className="cache-badge" title="This result was loaded from cache">
          💾 Cached
        </div>
      )}
      <div className="quiz-meta">
        <span>Question {cursor + 1} / {Math.max(1, quiz.length)}</span>
        <div className="quiz-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onReveal}>
            {reveal ? "Hide" : "Reveal"}{showKeyboardHints ? " (R)" : ""}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (isAtLastQuestion) {
                setShowLoadMoreConfirm(true);
              } else {
                void onNext();
              }
            }}
            disabled={isBusy}
            title={isAtLastQuestion ? "Generate more questions" : undefined}
          >
            {showKeyboardHints ? "Next (→)" : "Next"}
            {isAtLastQuestion && !isBusy && " (more...)"}
          </button>
          <ExportMenu
            disabled={!quiz.length}
            options={[
              { id: "md", label: "Markdown (.md)", onSelect: handleExportMarkdown },
              { id: "json", label: "JSON (.json)", onSelect: handleExportJson },
              { id: "gift", label: "GIFT (.gift.txt)", onSelect: handleExportGift }
            ]}
          />
        </div>
      </div>

      <div className="quiz-question">{currentQuestion.question}</div>

      <div className="quiz-options" role="list">
        {currentQuestion.options.map((opt, idx) => {
          const isSelected = selectedIndex === idx;
          const isCorrect = idx === currentQuestion.correctIndex;
          const selectedClass = isSelected ? (isCorrect ? " selected correct" : " selected wrong") : "";
          const revealClass = reveal && isCorrect ? " correct" : "";
          const focusClass = idx === focusIndex ? " focused" : "";
          return (
            <button
              key={idx}
              type="button"
              className={`quiz-option${selectedClass}${revealClass}${focusClass}`}
              onClick={() => {
                setFocusIndex(idx);
                onSelectOption(idx);
              }}
              aria-pressed={isSelected}
            >
              <span className="quiz-option-letter">{String.fromCharCode(65 + idx)}.</span>
              <span className="quiz-option-text">{opt}</span>
            </button>
          );
        })}
      </div>

      {(reveal || selectedIndex !== undefined) && (
        <div className="quiz-answer">
          {selectedIsCorrect === true ? (
            <div className="quiz-feedback ok">Correct.</div>
          ) : selectedIsCorrect === false ? (
            <div className="quiz-feedback bad">Wrong.</div>
          ) : null}
          {reveal && currentQuestion.explanation ? <div className="quiz-explanation">{currentQuestion.explanation}</div> : null}
          {reveal ? (
            <details className="quiz-source-details">
              <summary>Source</summary>
              <div className="quiz-source-snippet">{currentQuestion.sourceSnippet}</div>
            </details>
          ) : null}
        </div>
      )}

      <ConfirmModal
        isOpen={showLoadMoreConfirm}
        title="Generate More Questions?"
        message="This will use AI tokens to generate additional quiz questions based on the document. Are you sure you want to continue?"
        confirmLabel="Generate More"
        cancelLabel="Cancel"
        onCancel={() => setShowLoadMoreConfirm(false)}
        onConfirm={() => {
          setShowLoadMoreConfirm(false);
          void onNext();
        }}
      />
    </div>
  );
}
