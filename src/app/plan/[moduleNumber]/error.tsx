'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function ModuleError({
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
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="max-w-md">
        <h1 className="mb-2 text-2xl font-semibold text-gray-900">
          Coming soon
        </h1>
        <p className="text-gray-600">
          This module is still being built. Check back soon — we&apos;re adding
          new content regularly.
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
        >
          Back to dashboard
        </Link>
        <button
          onClick={unstable_retry}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
