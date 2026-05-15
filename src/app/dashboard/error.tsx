"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error]", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl border border-[#efefef] p-10 max-w-md w-full text-center">
        <div className="text-4xl mb-4">☕</div>
        <h1 className="text-xl font-bold text-[#1a1a1a] mb-2">Something went wrong</h1>
        <p className="text-sm text-[#afafaf] mb-6">
          We hit a snag loading your dashboard. This is on us — your plan data is safe.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
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
