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
    <div className="flex min-h-screen items-center justify-center bg-[#faf9f7]">
      <div className="max-w-md w-full mx-auto px-6 text-center">
        <h1 className="text-xl font-semibold text-[#1a1a1a] mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-[#6b6b6b] mb-6">
          The workspace could not load. Try refreshing or head back to your
          dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-[#155e63] text-white text-sm font-medium hover:bg-[#0f4a4e] transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 rounded-lg border border-[#efefef] text-[#1a1a1a] text-sm font-medium hover:bg-[#f5f4f0] transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
