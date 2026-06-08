"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "var(--background, #faf9f6)", fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "1rem",
              border: "1px solid #e5e7eb",
              padding: "2.5rem",
              maxWidth: "28rem",
              width: "100%",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>☕</p>
            <h1
              style={{
                fontSize: "1.125rem",
                fontWeight: 600,
                color: "#111827",
                marginBottom: "0.5rem",
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#6b7280",
                marginBottom: "1.5rem",
              }}
            >
              We ran into an unexpected error. Your plan data is safe. Please refresh to continue.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                background: "#0d9488",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
