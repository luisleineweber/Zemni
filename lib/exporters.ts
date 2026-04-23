import type { Flashcard, QuizQuestion } from "@/types";

export type TextExportFile = {
  fileName: string;
  content: string;
};

const toBaseName = (fileName: string): string => {
  const trimmed = (fileName || "").trim();
  if (!trimmed) return "document";
  return trimmed.replace(/\.[^.]+$/, "");
};

const tsvEscape = (value: string): string => {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, "<br>");
};

const normalizeLineEndings = (value: string): string => {
  return String(value ?? "").replace(/\r\n?/g, "\n");
};

const csvEscape = (value: string, lineBreakMode: "html" | "space"): string => {
  let normalized = normalizeLineEndings(value);

  if (lineBreakMode === "html") {
    normalized = normalized.replace(/\n/g, "<br>");
  } else {
    normalized = normalized.replace(/\s*\n\s*/g, " ");
  }

  return `"${normalized.replace(/"/g, "\"\"")}"`;
};

const giftEscape = (value: string): string => {
  return normalizeLineEndings(value)
    .replace(/\s*\n\s*/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/([~=#{}:])/g, "\\$1");
};

export const flashcardsToTsv = (cards: Flashcard[], fileName: string): TextExportFile => {
  const base = toBaseName(fileName);
  const lines = cards.map((c) => {
    const front = tsvEscape(c.front);
    const back = tsvEscape(c.back);
    const source = tsvEscape(c.sourceSnippet);
    return `${front}\t${back}\t${source}`;
  });
  return { fileName: `${base}-flashcards.tsv`, content: lines.join("\n") + "\n" };
};

export const flashcardsToAnkiCsv = (cards: Flashcard[], fileName: string): TextExportFile => {
  const base = toBaseName(fileName);
  const lines = cards.map((card) => `${csvEscape(card.front, "html")},${csvEscape(card.back, "html")}`);
  return { fileName: `${base}-flashcards-anki.csv`, content: lines.join("\n") + "\n" };
};

export const flashcardsToQuizletCsv = (cards: Flashcard[], fileName: string): TextExportFile => {
  const base = toBaseName(fileName);
  const lines = cards.map((card) => `${csvEscape(card.front, "space")},${csvEscape(card.back, "space")}`);
  return { fileName: `${base}-flashcards-quizlet.csv`, content: lines.join("\n") + "\n" };
};

const lettersFor = (count: number): string[] => {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(String.fromCharCode(65 + i));
  }
  return out;
};

export const quizToMarkdown = (questions: QuizQuestion[], fileName: string): TextExportFile => {
  const base = toBaseName(fileName);
  const title = fileName ? `Quiz - ${fileName}` : "Quiz";
  let md = `# ${title}\n\n`;
  if (!questions.length) {
    md += "_No questions available._\n";
    return { fileName: `${base}-quiz.md`, content: md };
  }

  questions.forEach((q, idx) => {
    const letters = lettersFor(q.options.length);
    const correctLetter = letters[q.correctIndex] ?? "?";
    md += `## Question ${idx + 1}\n\n`;
    if (q.sectionTitle) md += `**Section:** ${q.sectionTitle}\n\n`;
    if (typeof q.page === "number") md += `**Page:** ${q.page}\n\n`;
    md += `${q.question}\n\n`;
    q.options.forEach((opt, optionIndex) => {
      md += `- ${letters[optionIndex] ?? "?"}) ${opt}\n`;
    });
    md += `\n**Answer:** ${correctLetter}) ${q.options[q.correctIndex] ?? ""}\n\n`;
    if (q.explanation) md += `**Why:** ${q.explanation}\n\n`;
    md += `> Source: ${q.sourceSnippet}\n\n`;
  });

  return { fileName: `${base}-quiz.md`, content: md.trim() + "\n" };
};

export const quizToGift = (questions: QuizQuestion[], fileName: string): TextExportFile => {
  const base = toBaseName(fileName);
  if (!questions.length) {
    return { fileName: `${base}-quiz.gift.txt`, content: "" };
  }

  const content = questions
    .map((question, index) => {
      const prompt = giftEscape(question.question);
      const answers = question.options
        .map((option, optionIndex) => `${optionIndex === question.correctIndex ? "=" : "~"}${giftEscape(option)}`)
        .join(" ");
      return `::Q${index + 1}::${prompt} { ${answers} }`;
    })
    .join("\n\n");

  return { fileName: `${base}-quiz.gift.txt`, content: `${content}\n` };
};
