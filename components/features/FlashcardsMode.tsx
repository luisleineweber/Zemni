"use client";

import { useEffect, useMemo, useState } from "react";
import type { Flashcard, OutputEntry } from "@/types";
import { downloadTextFile } from "@/lib/download";
import { flashcardsToMarkdown } from "@/lib/output-previews";
import { flashcardsToAnkiCsv, flashcardsToQuizletCsv, flashcardsToTsv } from "@/lib/exporters";
import { ExportMenu } from "@/components/ui";

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

type FlashcardsModeProps = {
  extractedText: string;
  fileName: string;
  output?: OutputEntry;
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
 * Display generated flashcards and a study player.
 */
export function FlashcardsMode({ extractedText, fileName, output, showKeyboardHints = true, onRetry }: FlashcardsModeProps) {
  const cards = output?.flashcards ?? [];

  const [playerOpen, setPlayerOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const canStudy = cards.length > 0 && !output?.isGenerating;

  useEffect(() => {
    if (!playerOpen) return;
    document.body.classList.add("flashcard-player-open");
    return () => document.body.classList.remove("flashcard-player-open");
  }, [playerOpen]);

  useEffect(() => {
    if (!playerOpen) return;

    /**
     * Handle keyboard controls in the flashcard player.
     */
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setPlayerOpen(false);
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCursor((prev) => Math.max(0, prev - 1));
        setFlipped(false);
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        setCursor((prev) => Math.min(cards.length - 1, prev + 1));
        setFlipped(false);
        return;
      }

      if (e.key === " " || e.key === "Enter" || e.key.toLowerCase() === "f" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setFlipped((prev) => !prev);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [playerOpen, cards.length]);

  useEffect(() => {
    if (!playerOpen) return;
    if (cursor < 0) setCursor(0);
    if (cursor >= cards.length) setCursor(Math.max(0, cards.length - 1));
  }, [cards.length, cursor, playerOpen]);

  const current: Flashcard | undefined = useMemo(() => cards[cursor], [cards, cursor]);

  /**
   * Open the flashcard player at a specific index.
   */
  const openAt = (index: number) => {
    setCursor(index);
    setFlipped(false);
    setPlayerOpen(true);
  };

  if (!extractedText) {
    return <div className="mode-empty">Upload a PDF/MD file, then click Generate.</div>;
  }

  if (!output) {
    return <div className="mode-empty">No flashcards yet. Click Generate.</div>;
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

  if (output.isGenerating) {
    return <div className="mode-empty">Generating flashcards...</div>;
  }

  if (cards.length === 0) {
    return <div className="mode-empty">No flashcards generated.</div>;
  }

  /**
   * Export flashcards as a markdown file.
   */
  const handleExportMarkdown = () => {
    const base = baseNameFor(fileName);
    const content = flashcardsToMarkdown(cards, fileName);
    downloadTextFile(`${base}-flashcards.md`, content, "text/markdown;charset=utf-8");
  };

  /**
   * Export flashcards as a TSV file for Anki/spreadsheets.
   */
  const handleExportTsv = () => {
    const { fileName: exportName, content } = flashcardsToTsv(cards, fileName);
    downloadTextFile(exportName, content, "text/tab-separated-values;charset=utf-8");
  };

  /**
   * Export flashcards as an Anki-friendly CSV file.
   */
  const handleExportAnkiCsv = () => {
    const { fileName: exportName, content } = flashcardsToAnkiCsv(cards, fileName);
    downloadTextFile(exportName, content, "text/csv;charset=utf-8");
  };

  /**
   * Export flashcards as a Quizlet-friendly CSV file.
   */
  const handleExportQuizletCsv = () => {
    const { fileName: exportName, content } = flashcardsToQuizletCsv(cards, fileName);
    downloadTextFile(exportName, content, "text/csv;charset=utf-8");
  };

  return (
    <div className="flashcards-view">
      {output.isCached && (
        <div className="cache-badge" title="This result was loaded from cache">
          💾 Cached
        </div>
      )}
      <div className="flashcards-meta">
        <span>{cards.length} cards</span>
        <div className="flashcards-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => openAt(0)} disabled={!canStudy}>
            Study
          </button>
          <ExportMenu
            disabled={!cards.length}
            options={[
              { id: "md", label: "Markdown (.md)", onSelect: handleExportMarkdown },
              { id: "tsv", label: "TSV (Raw/Spreadsheet)", onSelect: handleExportTsv },
              { id: "anki-csv", label: "Anki CSV (.csv)", onSelect: handleExportAnkiCsv },
              { id: "quizlet-csv", label: "Quizlet CSV (.csv)", onSelect: handleExportQuizletCsv }
            ]}
          />
        </div>
      </div>

      <div className="flashcards-grid">
        {cards.map((card, idx) => (
          <button
            key={card.id}
            type="button"
            className="flashcard"
            onClick={() => openAt(idx)}
            aria-label={`Open flashcard ${idx + 1}`}
            title="Click: open fullscreen flashcard"
          >
            <div className="flashcard-front">{card.front}</div>
            <div className="flashcard-hint" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                <path d="M16 3h3a2 2 0 0 1 2 2v3" />
                <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
                <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                <path d="M9 9l6 6" />
                <path d="M15 9v6H9" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {playerOpen && current ? (
        <div className="flashcard-player-overlay" role="dialog" aria-modal="true" aria-label="Flashcard Player">
          <div className="flashcard-player">
            <div className="flashcard-player-top">
              <div className="flashcard-player-meta">
                <span className="flashcard-player-progress">{cursor + 1} / {cards.length}</span>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPlayerOpen(false)}>
                {showKeyboardHints ? "Close (Esc)" : "Close"}
              </button>
            </div>

            <button
              type="button"
              className="flashcard-stage"
              onClick={() => setFlipped((v) => !v)}
              aria-label={flipped ? "Show front side" : "Show back side"}
            >
              <div className={"flashcard-card" + (flipped ? " is-flipped" : "")}>
                <div className="flashcard-face flashcard-face-front">
                  <div className="flashcard-player-title">Front</div>
                  <div className="flashcard-player-content">{current.front}</div>
                  {showKeyboardHints ? (
                    <div className="flashcard-player-hint">Click / Space / Enter / arrows / F to flip</div>
                  ) : null}
                </div>
                <div className="flashcard-face flashcard-face-back">
                  <div className="flashcard-player-title">Back</div>
                  <div className="flashcard-player-content">{current.back}</div>
                  <div className="flashcard-player-source">{current.sourceSnippet}</div>
                </div>
              </div>
            </button>

            <div className="flashcard-player-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setCursor((prev) => Math.max(0, prev - 1));
                  setFlipped(false);
                }}
                disabled={cursor <= 0}
              >
                {showKeyboardHints ? "Back (Left)" : "Back"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setFlipped((v) => !v)}
              >
                {showKeyboardHints ? "Flip (Space)" : "Flip"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setCursor((prev) => Math.min(cards.length - 1, prev + 1));
                  setFlipped(false);
                }}
                disabled={cursor >= cards.length - 1}
              >
                {showKeyboardHints ? "Next (Right)" : "Next"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
