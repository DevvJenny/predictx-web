"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reportError } from "@/lib/error-reporter";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    reportError(error, {
      type: "global-error",
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      component: "global-error",
    });
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0a0e27 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            margin: "0 16px",
            padding: "2rem",
            background: "rgba(255, 0, 110, 0.05)",
            border: "1px solid rgba(255, 0, 110, 0.3)",
            boxShadow: "0 0 30px rgba(255, 0, 110, 0.2)",
            clipPath:
              "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 56,
              height: 56,
              margin: "0 auto 1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ff006e",
            }}
          >
            <AlertTriangle size={48} />
          </div>

          {/* Title */}
          <h1
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1.5rem",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#fff",
              textShadow: "0 0 20px rgba(255, 0, 110, 0.5)",
            }}
          >
            Critical Error
          </h1>

          <p
            style={{
              margin: "0 0 0.25rem",
              fontSize: "0.875rem",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            Something went wrong at the application level.
          </p>

          {error.digest && (
            <p
              style={{
                margin: "0 0 1.5rem",
                fontSize: "0.75rem",
                fontFamily: "monospace",
                color: "rgba(0, 217, 255, 0.7)",
              }}
            >
              Error ID: {error.digest}
            </p>
          )}

          {/* Reload button — performs a real browser reload so app/layout.tsx
              is re-mounted from scratch, which is the only reliable escape
              from a crashed root layout. */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", alignItems: "center" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 1.5rem",
                background: "rgba(255, 0, 110, 0.15)",
                border: "1px solid rgba(255, 0, 110, 0.5)",
                color: "#ff006e",
                fontSize: "0.875rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                cursor: "pointer",
                clipPath:
                  "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)",
              }}
            >
              <RefreshCw size={16} />
              Reload Application
            </button>

            {/* Secondary: re-run the boundary render without a full page reload.
                Useful for transient errors that may self-resolve. */}
            <button
              onClick={reset}
              style={{
                background: "none",
                border: "none",
                color: "rgba(255,255,255,0.4)",
                fontSize: "0.75rem",
                cursor: "pointer",
                textDecoration: "underline",
                letterSpacing: "0.04em",
              }}
            >
              Try again without reloading
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
