const NOTION_DATABASE_ID_PATTERN = /[0-9a-fA-F]{32}/;

/**
 * Accepts a raw Notion database ID or a full Notion database URL and returns
 * the 32-character database ID Notion's API expects.
 */
export function normalizeNotionDatabaseId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const compact = trimmed.replace(/-/g, "");
  if (/^[0-9a-fA-F]{32}$/.test(compact)) {
    return compact;
  }

  const decoded = safeDecodeURIComponent(trimmed);
  const match = decoded.replace(/-/g, "").match(NOTION_DATABASE_ID_PATTERN);
  return match ? match[0] : trimmed;
}

export function getNotionDatabaseUrl(databaseId: string): string {
  const normalized = normalizeNotionDatabaseId(databaseId);
  return normalized ? `https://www.notion.so/${normalized}` : "https://www.notion.so";
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
