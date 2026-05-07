"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { normalizeNotionDatabaseId } from "@/lib/notion-database-id";

type Notice = { type: "success" | "error"; text: string; actionHref?: string; actionLabel?: string } | null;
type NotionSubjectsResponse = { subjects?: unknown; error?: string; databaseUrl?: string };

/**
 * Configure Notion integration settings for exports.
 */
export function NotionTab() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const clearNotionConfig = useMutation(api.users.clearNotionConfig);
  const updateAutoCreateFolders = useMutation(api.users.updateAutoCreateFoldersFromNotionSubjects);

  const [notionToken, setNotionToken] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [exportMethod, setExportMethod] = useState<"database" | "page">("database");
  const [autoCreateFolders, setAutoCreateFolders] = useState(false);
  const [loading, setLoading] = useState(false);
  const [folderSettingLoading, setFolderSettingLoading] = useState(false);
  const [message, setMessage] = useState<Notice>(null);
  const [folderNotice, setFolderNotice] = useState<Notice>(null);
  const [hasStoredToken, setHasStoredToken] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setNotionToken("");
      setHasStoredToken(!!currentUser.notionToken);
      setDatabaseId(currentUser.notionDatabaseId || "");
      setExportMethod(currentUser.notionExportMethod || "database");
      setAutoCreateFolders(currentUser.autoCreateFoldersFromNotionSubjects ?? false);
    }
  }, [currentUser]);

  /**
   * Handle toggling the auto-create folders setting.
   */
  const handleAutoCreateFoldersToggle = async (enabled: boolean) => {
    if (!currentUser) return;

    const previousValue = autoCreateFolders;
    setFolderSettingLoading(true);
    setFolderNotice({
      type: "success",
      text: enabled ? "Enabling automatic folder creation..." : "Disabling automatic folder creation...",
    });
    setAutoCreateFolders(enabled);

    try {
      await updateAutoCreateFolders({ enabled });
      setFolderNotice({
        type: "success",
        text: enabled
          ? "Auto-create folders enabled. New folders will be created from Notion subjects when exporting."
          : "Auto-create folders disabled.",
      });
    } catch (error) {
      setAutoCreateFolders(previousValue);
      setFolderNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to update setting",
      });
    } finally {
      setFolderSettingLoading(false);
    }
  };

  /**
   * Save or clear Notion settings via API endpoints.
   */
  const handleSave = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const cleanedDatabaseId = normalizeNotionDatabaseId(databaseId);

      if (!notionToken && !hasStoredToken) {
        setMessage({
          type: "error",
          text: "Please enter a Notion API token.",
        });
        setLoading(false);
        return;
      }

      if (exportMethod === "database" && !cleanedDatabaseId) {
        setMessage({
          type: "error",
          text: "Please enter a Notion database ID.",
        });
        setLoading(false);
        return;
      }

      const response = await fetch("/api/user/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: notionToken || undefined,
          databaseId: exportMethod === "database" && cleanedDatabaseId ? cleanedDatabaseId : undefined,
          exportMethod,
        }),
      });

      if (!response.ok) {
        const status = response.status;
        const bodyText = await response.text();
        let errorMessage = `Failed to save configuration (HTTP ${status})`;

        if (bodyText) {
          try {
            const parsed = JSON.parse(bodyText) as { error?: string };
            const detail = typeof parsed?.error === "string" ? parsed.error : bodyText;
            errorMessage = `Failed to save configuration (HTTP ${status}): ${detail}`;
          } catch {
            errorMessage = `Failed to save configuration (HTTP ${status}): ${bodyText}`;
          }
        }

        throw new Error(errorMessage);
      }

      if (notionToken) {
        if (exportMethod === "database" && cleanedDatabaseId) {
          const url = new URL("/api/notion/subjects", window.location.origin);
          url.searchParams.set("databaseId", cleanedDatabaseId);
          const testRes = await fetch(url.toString(), {
            headers: {
              "x-notion-token": notionToken,
            },
          });

          if (testRes.ok) {
            const data = await testRes.json();
            if (data.subjects && Array.isArray(data.subjects)) {
              setMessage({ type: "success", text: `Notion configuration saved and verified. Found ${data.subjects.length} subject(s).` });
            } else {
              setMessage({ type: "success", text: "Notion configuration saved and verified." });
            }
          } else {
            const data = await parseNotionSubjectsResponse(testRes);
            setMessage({
              type: "error",
              text: data.error || "Configuration saved, but Zemni could not read your Notion subjects yet.",
              actionHref: data.databaseUrl,
              actionLabel: data.databaseUrl ? "Open database in Notion" : undefined,
            });
          }
        } else if (exportMethod === "page") {
          setMessage({ type: "success", text: "Notion configuration saved. You can now export directly to pages." });
        } else {
          setMessage({ type: "success", text: "Configuration saved. Token only - you can export to new pages." });
        }

        setNotionToken("");
        setHasStoredToken(true);
      } else {
        setMessage({ type: "success", text: "Configuration updated successfully." });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save configuration",
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Clear Notion configuration after confirmation.
   */
  const handleClear = async () => {
    if (confirm("Are you sure you want to clear your Notion configuration?")) {
      setLoading(true);
      setMessage(null);
      try {
        await clearNotionConfig({});
        setNotionToken("");
        setHasStoredToken(false);
        setDatabaseId("");
        setExportMethod("database");
        setAutoCreateFolders(false);
        setFolderNotice(null);
        setMessage({ type: "success", text: "Configuration cleared." });
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to clear configuration",
        });
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <h2>Notion Integration</h2>
      </div>

      <div className="settings-card">
        <div className="field">
          <label className="field-label" htmlFor="notion-token" style={{ fontSize: "14px" }}>
            Notion API Token {!hasStoredToken && <span style={{ color: "var(--error-text)" }}>*</span>}
          </label>
          <input
            id="notion-token"
            type="password"
            className="field-input"
            placeholder={hasStoredToken ? "Token saved (leave empty to keep or enter a new one to change)" : "secret_..."}
            value={notionToken}
            onChange={(e) => setNotionToken(e.target.value)}
            disabled={loading}
          />
          {hasStoredToken && !notionToken && (
            <p className="field-hint" style={{ color: "var(--success-text)" }}>
              Token is saved. Leave empty to keep it or enter a new one to change.
            </p>
          )}
          {(!hasStoredToken || notionToken) && (
            <p className="field-hint">
              Create an integration at{" "}
              <a
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="settings-link"
              >
                notion.so/my-integrations
              </a>
              {" "}and copy the token.
            </p>
          )}
        </div>

        <div className="settings-divider" />

        <div className="field">
          <label className="field-label" style={{ fontSize: "14px" }}>Export Method</label>
          <div className="settings-radio-group">
            <label className="settings-radio">
              <input
                type="radio"
                name="export-method"
                value="database"
                checked={exportMethod === "database"}
                onChange={(e) => setExportMethod(e.target.value as "database")}
                disabled={loading}
              />
              <span>Subjects Database (Organized)</span>
            </label>
            <label className="settings-radio">
              <input
                type="radio"
                name="export-method"
                value="page"
                checked={exportMethod === "page"}
                onChange={(e) => setExportMethod(e.target.value as "page")}
                disabled={loading}
              />
              <span>Direct Page Export (Simple)</span>
            </label>
          </div>
        </div>

        {exportMethod === "database" && (
          <div className="field">
            <label className="field-label" htmlFor="notion-database-id">
              Subjects Database ID <span style={{ color: "var(--error-text)" }}>*</span>
            </label>
            <input
              id="notion-database-id"
              type="text"
              className="field-input"
              placeholder="a1b2c3d4e5f6g7h8i9j0k1l2m3"
              value={databaseId}
              onChange={(e) => setDatabaseId(e.target.value)}
              disabled={loading}
            />
            <p className="field-hint">
              Paste the database ID or full Notion database link.
            </p>
          </div>
        )}

        <div className="settings-divider" />

        <div className="field">
          <label className="field-label" style={{ fontSize: "14px" }}>
            Folder Management
          </label>
          <div className="settings-checkbox-row">
            <label className="settings-checkbox-label">
              <input
                type="checkbox"
                checked={autoCreateFolders}
                onChange={(e) => void handleAutoCreateFoldersToggle(e.target.checked)}
                disabled={loading || folderSettingLoading || !currentUser?.notionDatabaseId}
              />
              <span>
                Automatically create folders from Notion subjects
                {folderSettingLoading ? " (saving...)" : ""}
              </span>
            </label>
          </div>
          <p className="field-hint">
            When enabled, exporting to a Notion subject will automatically create a folder with the subject name
            (if it doesn&apos;t exist) and organize your document there.
          </p>
          {folderNotice && (
            <div className={`settings-notice ${folderNotice.type}`} style={{ marginTop: "8px" }}>
              {folderNotice.text}
            </div>
          )}
          {!currentUser?.notionDatabaseId && (
            <p className="field-hint" style={{ color: "var(--warning)" }}>
              Configure a Notion database above to enable this feature.
            </p>
          )}
        </div>

        {message && (
          <div className={`settings-notice ${message.type}`}>
            <span>{message.text}</span>
            {message.actionHref && message.actionLabel && (
              <a
                href={message.actionHref}
                target="_blank"
                rel="noopener noreferrer"
                className="settings-notice-action"
              >
                {message.actionLabel}
              </a>
            )}
          </div>
        )}

        <div className="settings-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleSave()}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save Configuration"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleClear()}
            disabled={loading}
          >
            Clear
          </button>
        </div>

        <div className="settings-divider" />

        <div className="field">
          <label className="field-label">Setup Instructions</label>
          <ol className="settings-instructions">
            <li>Create an integration at{" "}
              <a
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="settings-link"
              >
                notion.so/my-integrations
              </a>
            </li>
            <li>Copy the integration token and paste it above</li>
            {exportMethod === "database" && (
              <>
                <li>Open your database in Notion {"->"} "..." {"->"} "Add connections" {"->"} Select your integration</li>
                <li>Copy the database ID from the URL and paste it above</li>
              </>
            )}
            <li>Click "Save Configuration"</li>
          </ol>
        </div>
      </div>
    </section>
  );
}

async function parseNotionSubjectsResponse(response: Response): Promise<NotionSubjectsResponse> {
  try {
    return (await response.json()) as NotionSubjectsResponse;
  } catch {
    return {};
  }
}
