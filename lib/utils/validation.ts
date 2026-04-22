/**
 * Comprehensive input validation utilities
 * Provides validation for text length, structure hints, model IDs, and file types
 */

import { loadModels } from "@/lib/models";

// Validation limits
const MAX_TEXT_LENGTH = 1_000_000; // 1M characters (beyond size limits)
const MAX_STRUCTURE_HINTS_LENGTH = 10_000; // 10K characters for structure hints
const MAX_MESSAGES_ARRAY_LENGTH = 100; // Maximum number of messages in refine endpoint

/**
 * Validate text length (character count, not byte size)
 * Returns validation result with error message if invalid
 */
export function validateTextLength(text: string, maxLength: number = MAX_TEXT_LENGTH): { valid: boolean; error?: string } {
  if (text.length > maxLength) {
    const lengthK = Math.floor(text.length / 1000);
    const maxK = Math.floor(maxLength / 1000);
    return {
      valid: false,
      error: `Text exceeds maximum length of ${maxK}K characters (current: ${lengthK}K characters)`,
    };
  }
  
  return { valid: true };
}

/**
 * Validate structure hints format and length
 * Structure hints should be plain text with optional headings
 */
export function validateStructureHints(structureHints: string): { valid: boolean; error?: string } {
  if (!structureHints || structureHints.trim().length === 0) {
    return { valid: true }; // Empty is valid (optional field)
  }

  // Check length
  if (structureHints.length > MAX_STRUCTURE_HINTS_LENGTH) {
    const lengthK = Math.floor(structureHints.length / 1000);
    const maxK = Math.floor(MAX_STRUCTURE_HINTS_LENGTH / 1000);
    return {
      valid: false,
      error: `Structure hints exceed maximum length of ${maxK}K characters (current: ${lengthK}K characters)`,
    };
  }

  // Check for potentially malicious content (basic check)
  // Reject if contains script tags or suspicious patterns
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // Event handlers like onclick=
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(structureHints)) {
      return {
        valid: false,
        error: "Structure hints contain invalid content",
      };
    }
  }

  return { valid: true };
}

/**
 * Validate model ID exists in available models
 * Returns validation result with error message if invalid
 */
export async function validateModelId(modelId: string): Promise<{ valid: boolean; error?: string }> {
  if (!modelId || typeof modelId !== "string" || modelId.trim().length === 0) {
    return {
      valid: false,
      error: "Model ID is required",
    };
  }

  try {
    const models = await loadModels();
    const model = models.find((m) => m.openrouterId === modelId);
    
    if (!model) {
      return {
        valid: false,
        error: `Model "${modelId}" not found in available models`,
      };
    }

    return { valid: true };
  } catch (error) {
    console.error("Failed to load models for validation:", error);
    // Fail open - allow request if model loading fails
    return { valid: true };
  }
}

/**
 * Validate file type (PDF or Markdown)
 * Returns validation result with error message if invalid
 */
export function validateFileType(fileName: string, mimeType?: string): { valid: boolean; error?: string } {
  if (!fileName) {
    return {
      valid: false,
      error: "File name is required",
    };
  }

  const lowerFileName = fileName.toLowerCase();
  const isPdf = lowerFileName.endsWith(".pdf") || mimeType === "application/pdf";
  const isMarkdown = lowerFileName.endsWith(".md") || 
                     lowerFileName.endsWith(".markdown") || 
                     mimeType === "text/markdown" ||
                     mimeType === "text/x-markdown";

  if (!isPdf && !isMarkdown) {
    return {
      valid: false,
      error: `Invalid file type. Only PDF (.pdf) and Markdown (.md, .markdown) files are supported. Got: ${fileName}`,
    };
  }

  return { valid: true };
}

/**
 * Validate messages array for refine endpoint
 * Checks array length and individual message structure
 */
export function validateMessagesArray(messages: unknown[]): { valid: boolean; error?: string } {
  if (!Array.isArray(messages)) {
    return {
      valid: false,
      error: "Messages must be an array",
    };
  }

  if (messages.length > MAX_MESSAGES_ARRAY_LENGTH) {
    return {
      valid: false,
      error: `Messages array exceeds maximum length of ${MAX_MESSAGES_ARRAY_LENGTH} messages (current: ${messages.length})`,
    };
  }

  // Validate each message has required fields
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") {
      return {
        valid: false,
        error: `Message at index ${i} must be an object`,
      };
    }

    const msgObj = msg as Record<string, unknown>;
    if (typeof msgObj.role !== "string" || typeof msgObj.content !== "string") {
      return {
        valid: false,
        error: `Message at index ${i} must have "role" and "content" string fields`,
      };
    }

    // Validate role is valid
    const validRoles = ["user", "assistant"];
    if (!validRoles.includes(msgObj.role)) {
      return {
        valid: false,
        error: `Message at index ${i} has invalid role "${msgObj.role}". Must be one of: ${validRoles.join(", ")}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate summary text for refine endpoint
 * Checks length and basic format
 */
export function validateSummaryText(summary: string): { valid: boolean; error?: string } {
  if (!summary || typeof summary !== "string") {
    return {
      valid: false,
      error: "Summary must be a non-empty string",
    };
  }

  // Use same length limit as text validation
  return validateTextLength(summary, MAX_TEXT_LENGTH);
}

/**
 * Validate flashcards density value
 * Must be between 1 and 5 (inclusive)
 */
export function validateFlashcardsDensity(density: unknown): { valid: boolean; error?: string } {
  if (typeof density !== "number") {
    return {
      valid: false,
      error: "Flashcards density must be a number",
    };
  }

  if (density < 1 || density > 5 || !Number.isInteger(density)) {
    return {
      valid: false,
      error: "Flashcards density must be an integer between 1 and 5",
    };
  }

  return { valid: true };
}

/**
 * Validate quiz questions count
 * Must be a positive integer within reasonable bounds
 */
export function validateQuestionsCount(count: unknown, maxCount: number = 50): { valid: boolean; error?: string } {
  if (typeof count !== "number") {
    return {
      valid: false,
      error: "Questions count must be a number",
    };
  }

  if (!Number.isInteger(count) || count < 1 || count > maxCount) {
    return {
      valid: false,
      error: `Questions count must be an integer between 1 and ${maxCount}`,
    };
  }

  return { valid: true };
}
