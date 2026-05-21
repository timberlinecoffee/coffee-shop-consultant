// TIM-634 / TIM-618-E: Conversation thread browser
// Grouped-by-workspace collapsible list. Click loads a thread into the drawer.
"use client"

import { useCallback, useMemo, useState, useEffect } from "react"
import type { WorkspaceKey } from "@/types/supabase"

export const WORKSPACE_ORDER: WorkspaceKey[] = [
  "concept",
  "location_lease",
  "financials",
  "menu_pricing",
  "buildout_equipment",
  "launch_plan",
]

export const WORKSPACE_LABELS: Record<WorkspaceKey, string> = {
  concept: "Concept",
  location_lease: "Location & Lease",
  financials: "Financials",
  menu_pricing: "Menu & Pricing",
  buildout_equipment: "Build-out & Equipment",
  launch_plan: "Launch Plan",
}

export interface ThreadBrowserItem {
  id: string
  workspace_key: WorkspaceKey
  title: string | null
  last_message_at: string
  message_count: number
}

export interface ThreadBrowserProps {
  planId: string
  activeWorkspaceKey: WorkspaceKey
  activeThreadId: string | null
  onSelectThread: (item: ThreadBrowserItem) => void
  onNewThread: () => void
  /** Bump this number from the parent (after a successful send) to force a refresh. */
  refreshKey?: number
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; items: ThreadBrowserItem[] }
  | { kind: "error"; message: string }

function titleOrFallback(title: string | null | undefined): string {
  const trimmed = title?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : "New conversation"
}

function formatTimestamp(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function ThreadBrowser({
  planId,
  activeWorkspaceKey,
  activeThreadId,
  onSelectThread,
  onNewThread,
  refreshKey = 0,
}: ThreadBrowserProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  // Manual collapse overrides — group is open unless explicitly closed by the user.
  const [collapsed, setCollapsed] = useState<Partial<Record<WorkspaceKey, boolean>>>({})

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/copilot/threads?planId=${encodeURIComponent(planId)}`, {
      method: "GET",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? `Failed to load threads (${res.status})`)
        }
        return (await res.json()) as { threads: ThreadBrowserItem[] }
      })
      .then((payload) => {
        setState({ kind: "ready", items: payload.threads ?? [] })
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Couldn't load threads.",
        })
      })
    return () => controller.abort()
  }, [planId, refreshKey])

  const items = useMemo(
    () => (state.kind === "ready" ? state.items : []),
    [state],
  )
  const totalCount = items.length

  const grouped = useMemo(() => {
    const groups: Record<WorkspaceKey, ThreadBrowserItem[]> = {
      concept: [],
      location_lease: [],
      financials: [],
      menu_pricing: [],
      buildout_equipment: [],
      launch_plan: [],
    }
    for (const item of items) {
      if (groups[item.workspace_key]) groups[item.workspace_key].push(item)
    }
    for (const key of WORKSPACE_ORDER) {
      groups[key].sort((a, b) => {
        const at = new Date(a.last_message_at).getTime()
        const bt = new Date(b.last_message_at).getTime()
        return bt - at
      })
    }
    return groups
  }, [items])

  const toggleGroup = useCallback((key: WorkspaceKey) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const groupIsOpen = useCallback(
    (key: WorkspaceKey) => {
      // Default open. Active workspace is always open even if collapsed elsewhere.
      if (collapsed[key] === undefined) return true
      if (key === activeWorkspaceKey) return true
      return !collapsed[key]
    },
    [collapsed, activeWorkspaceKey],
  )

  return (
    <div className="border-b border-[#efefef]" data-testid="thread-browser">
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#666]">
          Conversations ({totalCount})
        </span>
        <button
          type="button"
          onClick={onNewThread}
          className="text-xs font-semibold text-[#155e63] hover:underline"
        >
          + New
        </button>
      </div>

      <div className="max-h-60 overflow-y-auto px-2 pb-2">
        {state.kind === "loading" ? (
          <p className="px-2 py-3 text-xs text-[#888]">Loading conversations…</p>
        ) : state.kind === "error" ? (
          <p className="px-2 py-3 text-xs text-red-600">{state.message}</p>
        ) : totalCount === 0 ? (
          <p className="px-2 py-3 text-xs text-[#888]">No saved conversations yet.</p>
        ) : (
          <ul className="space-y-1">
            {WORKSPACE_ORDER.map((key) => {
              const groupThreads = grouped[key]
              if (groupThreads.length === 0) return null
              const isOpen = groupIsOpen(key)
              return (
                <li key={key} className="rounded-lg">
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-[#1a1a1a] hover:bg-[#f7f6f3] rounded-md"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}
                      >
                        ▸
                      </span>
                      {WORKSPACE_LABELS[key]}
                      <span className="text-[10px] font-medium text-[#888]">
                        {groupThreads.length}
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="mt-1 space-y-1 pl-3">
                      {groupThreads.map((thread) => {
                        const selected = thread.id === activeThreadId
                        return (
                          <li key={thread.id}>
                            <button
                              type="button"
                              onClick={() => onSelectThread(thread)}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                selected
                                  ? "bg-[#155e63]/10 text-[#155e63]"
                                  : "hover:bg-[#f7f6f3] text-[#1a1a1a]"
                              }`}
                            >
                              <span className="block truncate font-medium">
                                {titleOrFallback(thread.title)}
                              </span>
                              <span className="block text-[11px] text-[#888]">
                                {formatTimestamp(thread.last_message_at)}
                                {thread.message_count > 0
                                  ? ` · ${thread.message_count} msg${
                                      thread.message_count === 1 ? "" : "s"
                                    }`
                                  : ""}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export default ThreadBrowser
