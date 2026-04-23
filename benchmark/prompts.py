"""Prompt building logic ported from TypeScript."""
from pathlib import Path
from typing import Optional, List, Dict, Any


BASE_IDENTITY = [
    "Du bist ein spezialisierter KI-Assistent fuer akademische Aufbereitung.",
    "Deine einzige Aufgabe ist es, komplexe Vorlesungsskripte in hocheffiziente, pruefungsorientierte Zusammenfassungen zu transformieren.",
    "",
    "Arbeitsumgebung und Materialien:",
    "1) Das Regelwerk (KI-Vorgaben) definiert Stil, Struktur und No-Gos und hat hoechste Prioritaet.",
    "2) Die Quelle ist ein Text-Extrakt aus Uni-Folien (60-100 Seiten).",
    "3) Der Kontext: Der Nutzer will das Material fuer die langfristige Klausurvorbereitung in Notion speichern."
]

BASE_IDENTITY_STUDY = [
    "Du bist ein spezialisierter KI-Assistent fuer akademische Aufbereitung.",
    "Deine Aufgabe ist es, aus gegebenem Lernstoff hochwertige, pruefungsorientierte Lernartefakte zu erstellen (Zusammenfassung, Flashcards, Quiz).",
    "Du arbeitest strikt mit dem gelieferten Text und erfindest nichts hinzu.",
    "Ausgabe ist auf Deutsch (englische Fachbegriffe aus dem Skript beibehalten)."
]

NON_CONTENT_EXCLUSION_RULES = [
    "Nicht-Inhalts-Regeln (kritisch):",
    "- Behandle strukturelles, organisatorisches oder navigatives Material nicht als Lerninhalt.",
    "- Schließe Agenda, Kapiteluebersichten, Lernziele, Recap/Uebergangsfolien, Klausur-/Organisationshinweise, Deadlines, Abgaben, Literatur-/Kontakt-/Referenzfolien, Setup-Hinweise und aehnliches Meta/Admin-Material aus.",
    "- Erzeuge keine Zusammenfassungsabschnitte, Flashcards oder Quizfragen zu Ueberschriften wie \"Agenda\", \"Overview\", \"Recap\", \"Organizational\", \"Learning Goals\", \"Next Time\" oder \"Questions?\", sofern der eigentliche Text darunter kein fachliches Wissen enthaelt.",
    "- Wenn eine Section Fachinhalt und Meta/Admin-Text mischt, uebernimm nur den Fachinhalt und ignoriere den Rest."
]

FORMAT_CONTRACT = [
    "",
    "WICHTIG - Formatvertrag:",
    "- Ausgabe beginnt DIREKT mit einer H1-Ueberschrift (# Titel).",
    "- KEINE Metadaten, KEIN Frontmatter, KEINE einleitenden Kommentare.",
    "- Nur reines Markdown.",
    "- Nach der Titel-H1: Vor jeder neuen Hauptkapitel-H1 (# ...) steht genau eine Divider-Zeile `---` (mit Leerzeile davor/danach).",
    "- Ueberschriften niemals nummerieren (kein '## 1.' / '## I.' etc).",
    "- Key Definitions (wenn sinnvoll): Am Ende eines Unterkapitels eine Zeile `**Key Definitions**`, danach Bullets im Format `- **Term**: Definition`.",
    "- Wenn Mathe/Formeln vorkommen: nutze LaTeX (inline $...$, Display $$ ... $$) und erklaere Variablen direkt danach.",
    "- VERBOTEN: Abschluss-Saetze wie 'Damit kann man sich gut vorbereiten' oder 'Alles kommt aus den Vorlesungsfolien'.",
    "- Auch wenn der Text kuerz, verrauscht (OCR) oder lueckenhaft ist: Erstelle immer die bestmoegliche fachliche Zusammenfassung des vorhandenen Inhalts.",
    "- Gib KEINE Fehlermeldungen wie 'Fehlende Quelle', 'kein Text bereitgestellt' oder aehnliche Meta-Kommentare aus. Schreibe stattdessen immer eine inhaltliche Zusammenfassung."
]

GUIDELINES_GENERAL = "guidelines/general.en.md"
GUIDELINES_SUMMARY = "guidelines/summary.en.md"
GUIDELINES_FLASHCARDS = "guidelines/flashcards.en.md"
GUIDELINES_QUIZ = "guidelines/quiz.en.md"


def load_guidelines(files: List[str]) -> str:
    """Load guideline files and combine them."""
    project_root = Path(__file__).parent.parent
    parts = []
    
    for file in files:
        file_path = project_root / file
        try:
            if file_path.exists():
                content = file_path.read_text(encoding="utf-8")
                if content.strip():
                    parts.append(content)
        except Exception:
            pass
    
    return "\n\n---\n\n".join(parts)


def build_summary_prompts(text: str, structure: Optional[str] = None) -> Dict[str, str]:
    """Build prompts for summary generation."""
    guidelines = load_guidelines([GUIDELINES_GENERAL, GUIDELINES_SUMMARY])
    
    system_prompt = "\n".join([
        "\n".join(BASE_IDENTITY),
        "",
        "\n".join(NON_CONTENT_EXCLUSION_RULES),
        "",
        "Regelwerk (KI-Vorgaben):",
        guidelines,
        "",
        "Halte dich strikt an das Regelwerk.",
        "\n".join(FORMAT_CONTRACT)
    ])
    
    user_prompt = "\n".join([
        "Quelle (PDF-Extrakt):",
        text,
        "",
        "Optionale Strukturvorgaben (Ueberschriften):",
        structure.strip() if structure and structure.strip() else "Keine",
        "",
        "Ignoriere strukturelle, organisatorische, navigative und sonstige Nicht-Inhalts-Teile wie Agenda, Recap, Lernziele, Klausurhinweise, Deadlines, Literatur/Kontakt und aehnliche Meta-Folien.",
        "",
        "Gib ausschliesslich die fertige Zusammenfassung in Markdown aus. Beginne direkt mit # Titel."
    ])
    
    return {"systemPrompt": system_prompt, "userPrompt": user_prompt}


def build_section_summary_prompts(
    sections: List[Dict[str, Any]],
    structure: Optional[str] = None
) -> Dict[str, str]:
    """Build prompts for section-based summary generation."""
    guidelines = load_guidelines([GUIDELINES_GENERAL, GUIDELINES_SUMMARY])
    
    system_prompt = "\n".join([
        "\n".join(BASE_IDENTITY_STUDY),
        "",
        "\n".join(NON_CONTENT_EXCLUSION_RULES),
        "",
        "Regelwerk (KI-Vorgaben):",
        guidelines,
        "",
        "Format:",
        "- Ausgabe ist reines Markdown.",
        "- Beginnt direkt mit einer H1 (# Titel).",
        "- Nach der Titel-H1: Vor jeder neuen Hauptkapitel-H1 (# ...) steht genau eine Divider-Zeile `---` (mit Leerzeile davor/danach).",
        "- Baue eine klare Gliederung mit mehreren H2 (##) und passenden H3 (###), statt einen langen unstrukturierten Block.",
        "- Pro Unterkapitel: 5-10 dichte Bulletpoints (erklaerend, nicht nur Stichwoerter).",
        "- Key Definitions (wenn sinnvoll): Am Ende eines Unterkapitels eine Zeile `**Key Definitions**`, danach Bullets im Format `- **Term**: Definition`.",
        "- Ueberschriften niemals nummerieren (kein '## 1.' / '## I.' etc).",
        "- Wenn Mathe/Formeln vorkommen: nutze LaTeX (inline $...$, Display $$ ... $$) und erklaere Variablen direkt danach.",
        "- VERBOTEN: Abschluss-Saetze wie 'Damit kann man sich gut vorbereiten' oder 'Alles kommt aus den Vorlesungsfolien'."
    ])
    
    serialized_sections = "\n".join([
        "\n".join([
            "-----",
            " | ".join([
                f"ID: {s.get('id', '')}",
                f"Title: {s.get('title', '')}",
                *([f"Page: {s['page']}"] if isinstance(s.get('page'), int) else [])
            ]),
            "Text:",
            s.get("text", "")
        ])
        for s in sections
    ])
    
    user_prompt = "\n".join([
        "Quelle (Sections):",
        serialized_sections,
        "",
        "Optionale Strukturvorgaben (Ueberschriften):",
        structure.strip() if structure and structure.strip() else "Keine",
        "",
        "Aufgabe:",
        "- Erstelle eine kompakte, pruefungsorientierte Zusammenfassung mit klarer Gliederung (H2/H3).",
        "- Pro Unterkapitel: 5-10 Bulletpoints (kurz, dicht).",
        "- Key Definitions (wenn sinnvoll): `**Key Definitions**` + Bullets `- **Term**: Definition` am Ende des Unterkapitels.",
        "- Ignoriere strukturelle, organisatorische, navigative und sonstige Nicht-Inhalts-Teile wie Agenda, Recap, Lernziele, Klausurhinweise, Deadlines, Literatur/Kontakt und aehnliche Meta-Folien.",
        "- Keine Metadaten, keine Einleitung, kein Frontmatter.",
        "- Ueberschriften nicht nummerieren.",
        "- VERBOTEN: Abschluss-/Meta-Saetze (z.B. 'Damit kann man sich gut vorbereiten', 'Alles kommt aus den Vorlesungsfolien').",
        "",
        "Beginne direkt mit # Titel."
    ])
    
    return {"systemPrompt": system_prompt, "userPrompt": user_prompt}


def build_flashcards_prompts(
    sections: List[Dict[str, Any]],
    cards_per_section: int = 6
) -> Dict[str, str]:
    """Build prompts for flashcard generation."""
    guidelines = load_guidelines([GUIDELINES_GENERAL, GUIDELINES_FLASHCARDS])
    
    system_prompt = "\n".join([
        "\n".join(BASE_IDENTITY_STUDY),
        "",
        "\n".join(NON_CONTENT_EXCLUSION_RULES),
        "",
        "Regelwerk (KI-Vorgaben):",
        guidelines,
        "",
        "Format:",
        "- Ausgabe ist NUR gueltiges JSON (kein Markdown, keine Codefences).",
        "- Top-Level: {\"flashcards\": Flashcard[]}.",
        "",
        "Kuerze (wichtig fuer Geschwindigkeit):",
        "- front: max 140 Zeichen, keine Schachtelsaetze.",
        "- back: max 280 Zeichen, nur die minimale korrekte Antwort (optional 1 kurzer Zusatzsatz).",
        "- Keine Newlines in Strings (nutze Leerzeichen).",
        "",
        "Flashcard Schema:",
        "- sectionId: string",
        "- sectionTitle: string",
        "- type: \"qa\" | \"cloze\"",
        "- front: string",
        "- back: string",
        "- sourceSnippet: string (kurzes, woertliches Zitat aus dem Section-Text, 1-3 Saetze, max 240 Zeichen)",
        "- page?: number (wenn bekannt)"
    ])
    
    serialized_sections = "\n".join([
        "\n".join([
            "-----",
            " | ".join([
                f"ID: {s.get('id', '')}",
                f"Title: {s.get('title', '')}",
                *([f"Page: {s['page']}"] if isinstance(s.get('page'), int) else [])
            ]),
            "Text:",
            s.get("text", "")
        ])
        for s in sections
    ])
    
    user_prompt = "\n".join([
        f"Erzeuge bis zu {cards_per_section} Flashcards pro Section (Ziel: {cards_per_section}).",
        "Mische Q/A und Cloze sinnvoll (mindestens 1 Cloze pro Section, wenn moeglich).",
        "Wenn du die Zielanzahl nicht sauber/ohne Erfindungen erreichst: lieber weniger, aber hochwertig.",
        "",
        "Quelle (Sections):",
        serialized_sections,
        "",
        "WICHTIG:",
        "- sourceSnippet muss ein woertliches Zitat aus dem jeweiligen Section-Text sein.",
        "- Keine doppelten Karten pro Section.",
        "- Erzeuge keine Karten aus strukturellem, organisatorischem, navigativem oder sonstigem Nicht-Inhalts-Material wie Agenda, Recap, Lernzielen, Klausurhinweisen, Deadlines, Literatur/Kontakt oder aehnlichen Meta-Folien.",
        "",
        "Gib nur das JSON aus."
    ])
    
    return {"systemPrompt": system_prompt, "userPrompt": user_prompt}


def build_quiz_prompts(
    section: Dict[str, Any],
    questions_count: int = 6,
    avoid_questions: Optional[List[str]] = None
) -> Dict[str, str]:
    """Build prompts for quiz generation."""
    guidelines = load_guidelines([GUIDELINES_GENERAL, GUIDELINES_QUIZ])
    
    system_prompt = "\n".join([
        "\n".join(BASE_IDENTITY_STUDY),
        "",
        "\n".join(NON_CONTENT_EXCLUSION_RULES),
        "",
        "Regelwerk (KI-Vorgaben):",
        guidelines,
        "",
        "Format:",
        "- Ausgabe ist NUR gueltiges JSON (kein Markdown, keine Codefences).",
        "- Top-Level: {\"questions\": QuizQuestion[]}.",
        "",
        "QuizQuestion Schema:",
        "- sectionId: string",
        "- sectionTitle: string",
        "- question: string",
        "- options: string[4]",
        "- correctIndex: number (0..3)",
        "- explanation: string (kurz, 1-2 Saetze)",
        "- sourceSnippet: string (kurzes, woertliches Zitat aus dem Section-Text, max 240 Zeichen)",
        "- page?: number (wenn bekannt)"
    ])
    
    avoid_questions = avoid_questions or []
    meta = [f"ID: {section.get('id', '')}", f"Title: {section.get('title', '')}"]
    if isinstance(section.get('page'), int):
        meta.append(f"Page: {section['page']}")
    
    user_prompt = "\n".join([
        f"Erzeuge exakt {questions_count} Multiple-Choice Fragen (4 Optionen) fuer diese Section.",
        "Distractors muessen aus Begriffen/Ideen derselben Section kommen (keine externen Facts).",
        "",
        "Vermeide Wiederholungen:",
        *([f"- {q}" for q in avoid_questions] if avoid_questions else ["- (keine)"]),
        "",
        "Section:",
        "-----",
        " | ".join(meta),
        "Text:",
        section.get("text", ""),
        "",
        "WICHTIG:",
        "- sourceSnippet muss ein woertliches Zitat aus dem Section-Text sein.",
        "- correctIndex muss zur richtigen Option passen.",
        "- Erzeuge keine Fragen aus strukturellem, organisatorischem, navigativem oder sonstigem Nicht-Inhalts-Material wie Agenda, Recap, Lernzielen, Klausurhinweisen, Deadlines, Literatur/Kontakt oder aehnlichen Meta-Folien.",
        "",
        "Gib nur das JSON aus."
    ])
    
    return {"systemPrompt": system_prompt, "userPrompt": user_prompt}
