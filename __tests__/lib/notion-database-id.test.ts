import { describe, expect, it } from "vitest";
import { getNotionDatabaseUrl, normalizeNotionDatabaseId } from "@/lib/notion-database-id";

describe("normalizeNotionDatabaseId", () => {
  it("keeps a plain database id", () => {
    expect(normalizeNotionDatabaseId("a1b2c3d4e5f64788a9b0c1d2e3f45678")).toBe(
      "a1b2c3d4e5f64788a9b0c1d2e3f45678"
    );
  });

  it("removes hyphens from a plain database id", () => {
    expect(normalizeNotionDatabaseId("a1b2c3d4-e5f6-4788-a9b0-c1d2e3f45678")).toBe(
      "a1b2c3d4e5f64788a9b0c1d2e3f45678"
    );
  });

  it("extracts the database id from a Notion database URL", () => {
    expect(
      normalizeNotionDatabaseId(
        "https://www.notion.so/luis/Subjects-a1b2c3d4e5f64788a9b0c1d2e3f45678?v=abc&pvs=4"
      )
    ).toBe("a1b2c3d4e5f64788a9b0c1d2e3f45678");
  });

  it("extracts the database id from a URL with a hyphenated id", () => {
    expect(
      normalizeNotionDatabaseId(
        "https://www.notion.so/a1b2c3d4-e5f6-4788-a9b0-c1d2e3f45678?v=abc"
      )
    ).toBe("a1b2c3d4e5f64788a9b0c1d2e3f45678");
  });

  it("returns non-url invalid input unchanged so existing validation errors stay specific", () => {
    expect(normalizeNotionDatabaseId("not a database")).toBe("not a database");
  });

  it("builds a direct Notion database URL from the normalized id", () => {
    expect(getNotionDatabaseUrl("a1b2c3d4-e5f6-4788-a9b0-c1d2e3f45678")).toBe(
      "https://www.notion.so/a1b2c3d4e5f64788a9b0c1d2e3f45678"
    );
  });
});
