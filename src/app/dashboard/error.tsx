"use client";

import { useEffect } from "react";
import Link from "next/link";
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
    <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl border border-[#efefef] p-10 max-w-md w-full text-center">
        <div className="w-12 h-12 rounded-full bg-[#f5f5f5] flex items-center justify-center mx-auto mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-[#1a1a1a] mb-2">Something went wrong</h1>
        <p className="text-sm text-[#afafaf] mb-6">
          We hit a snag loading your dashboard. This is on us; your plan data is safe.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => unstable_retry()}
            className="px-4 py-2 bg-[#155e63] text-white text-sm font-medium rounded-lg hover:bg-[#0f4548] transition-colors"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-4 py-2 border border-[#efefef] text-sm font-medium rounded-lg text-[#afafaf] hover:text-[#1a1a1a] transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
