import { type NextRequest, NextResponse } from "next/server";
import type { ErrorPayload } from "@/lib/error-reporter";

/**
 * POST /api/report-error
 *
 * Receives error payloads from the client-side error reporter.
 * In production this would forward to an observability backend
 * (e.g. Vercel Log Drains, Sentry, Datadog).
 * For now it logs to the server console (visible in Vercel Function logs).
 */

/** Maximum accepted request body size (bytes). Rejects oversized payloads to
 *  prevent log-flooding and memory pressure. */
const MAX_BODY_BYTES = 8_192; // 8 KiB

/** Allowed string field lengths — truncated before logging. */
const FIELD_LIMITS: Record<string, number> = {
  type: 32,
  message: 500,
  digest: 64,
  route: 256,
  component: 128,
  stack: 2_000,
  extra: 1_000,
  userAgent: 512,
  timestamp: 32,
};

/** Accepted error types — anything else is dropped. */
const VALID_TYPES = new Set([
  "caught-error",
  "uncaught-error",
  "unhandled-rejection",
  "global-error",
]);

export async function POST(request: NextRequest) {
  // ── Origin check ──────────────────────────────────────────────────────────
  // Only accept requests that originate from the same host (i.e. our own
  // pages). Beacon / fetch from the browser won't send an Origin header when
  // navigating away, but the Referer will be ours. We allow the request
  // through only when at least one of the two headers matches our origin, or
  // when neither header is present (server-side call / automated test).
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  if (origin && host && !origin.endsWith(host)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  if (!origin && referer && host && !referer.includes(host)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  // ── Size cap ──────────────────────────────────────────────────────────────
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  try {
    // Read body with an explicit size limit regardless of the Content-Length
    // header (which could be spoofed).
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 413 });
    }

    let payload: Partial<ErrorPayload>;
    try {
      payload = JSON.parse(rawBody) as Partial<ErrorPayload>;
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // ── Schema validation ────────────────────────────────────────────────────
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (!VALID_TYPES.has(payload.type as string)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    /** Safely truncate a string field to its allowed max length. */
    const safe = (field: string): string | undefined => {
      const v = (payload as Record<string, unknown>)[field];
      if (typeof v !== "string") return undefined;
      const limit = FIELD_LIMITS[field] ?? 128;
      return v.slice(0, limit);
    };

    const extra =
      payload.extra && typeof payload.extra === "object"
        ? JSON.stringify(payload.extra).slice(0, FIELD_LIMITS.extra ?? 1_000)
        : undefined;

    // Sanitise — only log known, length-capped fields to prevent log injection
    console.error("[ErrorReport]", {
      type: safe("type"),
      message: safe("message"),
      digest: safe("digest"),
      route: safe("route"),
      component: safe("component"),
      stack: safe("stack"),
      extra,
      userAgent: safe("userAgent"),
      timestamp: safe("timestamp"),
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    // Malformed body — still return 200 so the client doesn't retry
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
