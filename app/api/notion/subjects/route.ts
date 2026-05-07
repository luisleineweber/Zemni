import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import { listSubjects } from "@/lib/notion";
import { trackError } from "@/lib/error-tracking";
import { decryptKey } from "@/lib/encryption";
import { getConvexClient } from "@/lib/convex-server";
import { getNotionDatabaseUrl, normalizeNotionDatabaseId } from "@/lib/notion-database-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const envDatabaseId = process.env.NOTION_SUBJECTS_DATABASE_ID;
  const envNotionToken = process.env.NOTION_TOKEN;

  const userDatabaseId = normalizeOptionalDatabaseId(searchParams.get("databaseId"));
  const userToken = request.headers.get("x-notion-token")?.trim() || null;

  let databaseId: string | null = userDatabaseId;
  let notionToken: string | null = userToken;
  let tokenSource: "header" | "env" | "convex" | "none" = userToken ? "header" : "none";

  if (!userToken) {
    try {
      const { userId } = await auth();
      if (userId) {
        const convex = getConvexClient();
        const user = await convex.query(api.users.getUserByClerkUserId, {
          clerkUserId: userId,
        });
        if (user?.notionToken) {
          notionToken = decryptKey(user.notionToken);
          tokenSource = "convex";
          databaseId = userDatabaseId || normalizeOptionalDatabaseId(user.notionDatabaseId || null);
        }
      }
    } catch (error) {
      console.warn("Failed to get Notion config from Convex:", error);
    }

    if (!notionToken && envNotionToken) {
      notionToken = envNotionToken;
      tokenSource = "env";
    }
    if (!databaseId && tokenSource === "env") {
      databaseId = normalizeOptionalDatabaseId(envDatabaseId || null);
    }
  }

  // Default database ID when using a header token (caller did not specify a databaseId).
  if (userToken && !databaseId) {
    databaseId = normalizeOptionalDatabaseId(envDatabaseId || null);
  }

  // Env tokens may only access the configured default database; any caller-supplied databaseId is rejected unless it
  // matches NOTION_SUBJECTS_DATABASE_ID (and when that env var is unset, env token requests are denied entirely).
  if (userDatabaseId && !userToken && tokenSource === "env") {
    const normalizedEnvDatabaseId = normalizeOptionalDatabaseId(envDatabaseId || null);
    if (!normalizedEnvDatabaseId || databaseId !== normalizedEnvDatabaseId) {
      return NextResponse.json({ subjects: [], error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!databaseId || !notionToken) {
    return NextResponse.json(
      { error: "missing Notion configuration: databaseId and/or notionToken" },
      { status: 400 }
    );
  }

  try {
    const subjects = await listSubjects(databaseId, notionToken);
    return NextResponse.json({ subjects });
  } catch (error) {
    const errorAny = error as any;
    const isNotFoundError = 
      errorAny.code === "object_not_found" || 
      errorAny.status === 404 || 
      (error instanceof Error && error.message.includes("Could not find database"));
    const isTimeoutError =
      errorAny.code === "ETIMEDOUT" ||
      errorAny.status === 408 ||
      (error instanceof Error && error.message.toLowerCase().includes("timed out"));
    const isAuthError =
      errorAny.status === 401 ||
      (error instanceof Error &&
        (error.message.includes("401") || error.message.includes("Unauthorized")));
      
    let errorMessage = "Failed to fetch subjects";
    let status = 500;

    if (isNotFoundError) {
      errorMessage = "Zemni found this database ID, but Notion has not shared the database with your Zemni integration yet. Open the database in Notion, choose ... -> Add connections, then select Zemni.";
      console.warn(`[Notion] Database not found: ${databaseId}`);
      status = 404;
    } else if (isTimeoutError) {
      errorMessage = "Request timed out. Please check your connection and try again.";
      status = 408;
      if (error instanceof Error) {
        trackError(error, {
          action: "notion_subjects_timeout",
          metadata: { databaseId },
        });
      }
    } else if (isAuthError) {
      errorMessage = "Invalid Notion token. Please check your integration settings.";
      status = 401;
      if (error instanceof Error) {
        trackError(error, {
          action: "notion_subjects_auth",
          metadata: { databaseId },
          silent: true,
        });
      }
    } else if (error instanceof Error) {
      errorMessage = error.message || errorMessage;
      trackError(error, {
        action: "notion_subjects_unexpected",
        metadata: { databaseId, errorCode: errorAny.code, status: errorAny.status },
      });
    }
    
    return NextResponse.json(
      {
        subjects: [],
        error: errorMessage,
        ...(isNotFoundError && databaseId ? { databaseUrl: getNotionDatabaseUrl(databaseId) } : {}),
      },
      { status }
    );
  }
}

function normalizeOptionalDatabaseId(value: string | null): string | null {
  if (!value) return null;
  return normalizeNotionDatabaseId(value) || null;
}
