"use client"

import React, { useState } from "react"

type Props = {
  planId: string
  className?: string
}

export function ExportPdfButton({ planId, className }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    try {
      const res = await fetch(`/api/pdf/location_lease_summary?planId=${planId}`)
      if (!res.ok) {
        const { error } = (await res.json().catch(() => ({}))) as { error?: string }
        alert(error ?? "Export failed — please try again.")
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get("content-disposition") ?? ""
      const filenameMatch = cd.match(/filename="?([^";]+)"?/)
      const filename = filenameMatch?.[1] ?? "location-lease-summary.pdf"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className={
        className ??
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#1A6E3B] text-[#1A6E3B] hover:bg-[#1A6E3B] hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      }
      aria-label="Export Location & Lease PDF"
    >
      {loading ? (
        <>
          <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
          </svg>
          Exporting...
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export PDF
        </>
      )}
    </button>
  )
}
