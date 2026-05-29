"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Coffee } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl border border-[var(--border)] p-10 max-w-md w-full text-center">
        <Coffee className="w-10 h-10 mb-4 mx-auto text-current" />
        <h1 className="text-xl font-bold text-[var(--foreground)] mb-2">Something went wrong</h1>
        <p className="text-sm text-[var(--dark-grey)] mb-6">
          We hit a snag loading your dashboard. This is on us; your plan data is safe.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => unstable_retry()}
            className="px-4 py-2 bg-[var(--teal)] text-white text-sm font-medium rounded-lg hover:bg-[var(--teal-800)] transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 border border-[var(--border)] text-sm font-medium rounded-lg text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
