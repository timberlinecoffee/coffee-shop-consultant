"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <div className="max-w-md w-full mx-auto px-6 text-center">
        <h1 className="text-xl font-semibold text-[var(--foreground)] mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mb-6">
          The workspace could not load. Try refreshing or head back to your
          dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-[var(--teal)] text-white text-sm font-medium hover:bg-[var(--teal-darker)] transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg border border-[var(--border)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--surface-warm-100)] transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
