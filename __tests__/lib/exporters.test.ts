import { describe, expect, it } from "vitest";
import {
  flashcardsToAnkiCsv,
  flashcardsToQuizletCsv,
  flashcardsToTsv,
  quizToGift,
  quizToMarkdown,
} from "@/lib/exporters";
import type { Flashcard, QuizQuestion } from "@/types";

const flashcards: Flashcard[] = [
  {
    id: "card-1",
    sectionId: "sec-1",
    sectionTitle: "Important Section",
    type: "qa",
    front: "What is \"osmosis\",\nand why?",
    back: "Water moves,\nacross a membrane.",
    sourceSnippet: "Source line 1\nSource line 2",
    page: 7,
  },
];

const quizQuestions: QuizQuestion[] = [
  {
    id: "q-1",
    sectionId: "sec-1",
    sectionTitle: "Cell Transport",
    question: "Pick {best}: osmosis = ?",
    options: ["Water movement", "Active ~ transport", "Diffusion # always"],
    correctIndex: 0,
    explanation: "Because it is passive transport.",
    sourceSnippet: "Lecture slide 12",
    page: 12,
  },
];

describe("exporters", () => {
  it("exports flashcards to Anki CSV with HTML line breaks and escaped quotes", () => {
    const exported = flashcardsToAnkiCsv(flashcards, "lecture.pdf");

    expect(exported.fileName).toBe("lecture-flashcards-anki.csv");
    expect(exported.content).toBe(
      "\"What is \"\"osmosis\"\",<br>and why?\",\"Water moves,<br>across a membrane.\"\n"
    );
    expect(exported.content).not.toContain("Source line 1");
    expect(exported.content).not.toContain("Important Section");
  });

  it("exports flashcards to Quizlet CSV with flattened line breaks", () => {
    const exported = flashcardsToQuizletCsv(flashcards, "lecture.pdf");

    expect(exported.fileName).toBe("lecture-flashcards-quizlet.csv");
    expect(exported.content).toBe(
      "\"What is \"\"osmosis\"\", and why?\",\"Water moves, across a membrane.\"\n"
    );
    expect(exported.content).not.toContain("<br>");
    expect(exported.content).not.toContain("Source line 1");
  });

  it("exports quizzes to GIFT and escapes reserved characters", () => {
    const exported = quizToGift(quizQuestions, "lecture.pdf");

    expect(exported.fileName).toBe("lecture-quiz.gift.txt");
    expect(exported.content).toContain(
      "::Q1::Pick \\{best\\}\\: osmosis \\= ? { =Water movement ~Active \\~ transport ~Diffusion \\# always }\n"
    );
    expect(exported.content).not.toContain("Because it is passive transport.");
    expect(exported.content).not.toContain("Lecture slide 12");
    expect(exported.content).not.toContain("Cell Transport");
  });

  it("keeps the legacy TSV export unchanged", () => {
    const exported = flashcardsToTsv(flashcards, "lecture.pdf");

    expect(exported.fileName).toBe("lecture-flashcards.tsv");
    expect(exported.content).toBe(
      "What is \"osmosis\",<br>and why?\tWater moves,<br>across a membrane.\tSource line 1<br>Source line 2\n"
    );
  });

  it("keeps the legacy quiz markdown export unchanged", () => {
    const exported = quizToMarkdown(quizQuestions, "lecture.pdf");

    expect(exported.fileName).toBe("lecture-quiz.md");
    expect(exported.content).toContain("# Quiz - lecture.pdf");
    expect(exported.content).toContain("**Answer:** A) Water movement");
    expect(exported.content).toContain("**Why:** Because it is passive transport.");
    expect(exported.content).toContain("> Source: Lecture slide 12");
  });
});
