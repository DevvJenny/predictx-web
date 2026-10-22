"use client";

import { useEffect } from "react";
import { Home } from "lucide-react";
import Link from "next/link";
import { GlowCard } from "@/components/shared/glow-card";
import { GamingButton } from "@/components/shared/gaming-button";
import { ErrorState } from "@/components/shared/error-state";
import { reportError } from "@/lib/error-reporter";

interface ErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Route/component context to attach to the error report */
  context?: string;
}

export function ErrorFallback({ error, reset, context }: ErrorFallbackProps) {
  useEffect(() => {
    reportError(error, {
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      component: context,
    });
  }, [error, context]);

  return (
    <main className="min-h-[60vh] flex items-center justify-center px-4">
      <GlowCard variant="danger" className="max-w-md w-full text-center">
        <div className="relative z-20 space-y-4">
          <ErrorState
            title="Something went wrong"
            message="An unexpected error occurred. Our team has been notified."
            onRetry={reset}
            className="p-8"
          />

          {error.digest && (
            <p className="px-8 text-xs font-mono text-primary/70">
              Error ID: {error.digest}
            </p>
          )}

          <div className="flex justify-center px-8 pb-8">
            <Link href="/">
              <GamingButton variant="ghost" size="md">
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </GamingButton>
            </Link>
          </div>
        </div>
      </GlowCard>
    </main>
  );
}
