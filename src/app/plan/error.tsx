'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function PlanError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl border border-grey-light p-10 max-w-md w-full text-center">
        <div className="text-4xl mb-4">☕</div>
        <h1 className="text-xl font-bold text-neutral-950 mb-2">Something went wrong</h1>
        <p className="text-sm text-neutral-500 mb-6">
          We hit a snag loading this page. Your plan data is safe; go back to the dashboard to continue.
          {error.digest && (
            <span className="block mt-2 font-mono text-xs text-neutral-300">
              ref: {error.digest}
            </span>
          )}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => unstable_retry()}
            className="px-4 py-2 bg-teal text-white text-sm font-medium rounded-lg hover:bg-teal-dark transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="px-4 py-2 border border-grey-light text-sm font-medium rounded-lg text-neutral-500 hover:text-neutral-950 transition-colors"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
