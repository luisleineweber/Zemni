"use client";

import { ReactNode, useMemo } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkProvider, useAuth } from "@clerk/nextjs";

function MissingAppConfig({ missing }: { missing: string[] }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#f7f7f3",
        color: "#1f2933",
        fontFamily: "var(--font-body), system-ui, sans-serif"
      }}
    >
      <section
        style={{
          width: "min(100%, 680px)",
          border: "1px solid #d8d8cf",
          borderRadius: "8px",
          background: "#ffffff",
          padding: "28px",
          boxShadow: "0 12px 36px rgba(31, 41, 51, 0.08)"
        }}
      >
        <p style={{ margin: "0 0 8px", fontSize: "13px", fontWeight: 700, textTransform: "uppercase" }}>
          Local setup needed
        </p>
        <h1 style={{ margin: "0 0 12px", fontSize: "28px", lineHeight: 1.15 }}>
          App services are not configured
        </h1>
        <p style={{ margin: "0 0 18px", lineHeight: 1.6 }}>
          Add the missing values to <code>.env.local</code>, then restart <code>npm run dev</code>.
        </p>
        <pre
          style={{
            overflowX: "auto",
            margin: 0,
            padding: "16px",
            borderRadius: "6px",
            background: "#111827",
            color: "#f9fafb",
            fontSize: "14px"
          }}
        >
          <code>{missing.join("\n")}</code>
        </pre>
      </section>
    </main>
  );
}

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  
  // Create Convex client inside component to ensure proper initialization
  const convex = useMemo(() => {
    if (!convexUrl) {
      console.error('[Convex] ERROR: NEXT_PUBLIC_CONVEX_URL is not set!');
      return null;
    }
    return new ConvexReactClient(convexUrl);
  }, [convexUrl]);
  
  const hasKey = clerkKey && typeof clerkKey === "string";
  const isValidKey = hasKey && 
    clerkKey.startsWith("pk_") && 
    !clerkKey.includes("YOUR_CLERK_PUBLISHABLE_KEY");
  const missingConfig = [
    ...(!convexUrl ? ["NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud"] : []),
    ...(!isValidKey ? ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_..."] : [])
  ];
  
  if (!convexUrl || !convex) {
    console.error('[Convex] Cannot render - missing Convex URL');
    return <MissingAppConfig missing={missingConfig} />;
  }
  
  if (!isValidKey) {
    if (typeof window !== "undefined") {
      console.warn("Clerk publishable key is missing or invalid.");
    }
    return <MissingAppConfig missing={missingConfig} />;
  }
  
  return (
    <ClerkProvider publishableKey={clerkKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
