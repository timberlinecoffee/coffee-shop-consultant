// TIM-634 / TIM-618-E: Conversation thread browser
// Grouped-by-workspace collapsible list. Click loads a thread into the drawer.
// TIM-906: Inline rename (pencil icon) and delete (trash icon + confirm) added.
// TIM-1149: General (workspace-less) conversations group, search/filter,
// and a split "+ New" affordance for current-workspace vs general threads.
"use client"

import { useCallback, useMemo, useState, useEffect, useRef } from "react"
import { ChevronRight, Pencil, Search, Trash2 } from "lucide-react"
import type { WorkspaceKey } from "@/types/supabase"

// TIM-1149: A thread is either bound to a WorkspaceKey or it is a "general"
// (workspace-less) conversation, represented by null.
export type ConversationScope = WorkspaceKey | null

// Sentinel for the "General" group key inside the grouped map. Not a valid
// WorkspaceKey — we keep it as a separate string union member at the UI layer.
export const GENERAL_GROUP_KEY = "__general__" as const
export const GENERAL_CONVERSATION_LABEL = "General"

type GroupKey = typeof GENERAL_GROUP_KEY | WorkspaceKey

export const WORKSPACE_ORDER: WorkspaceKey[] = [
  "concept",
  "location_lease",
  "financials",
  "menu_pricing",
  "buildout_equipment",
  "launch_plan",
  "hiring",
  "marketing",
  "suppliers",
  "operations_playbook",
  "marketing_pre_launch",
]

export const WORKSPACE_LABELS: Record<WorkspaceKey, string> = {
  concept: "Concept",
  location_lease: "Location & Lease",
  financials: "Financials",
  menu_pricing: "Menu & Pricing",
  buildout_equipment: "Build-out & Equipment",
  launch_plan: "Launch Plan",
  hiring: "Hiring & Onboarding",
  marketing: "Marketing",
  suppliers: "Suppliers & Vendors",
  operations_playbook: "Operations Playbook",
  marketing_pre_launch: "Marketing & Pre-Launch",
}

export function scopeLabel(scope: ConversationScope): string {
  return scope === null ? GENERAL_CONVERSATION_LABEL : WORKSPACE_LABELS[scope]
}

export interface ThreadBrowserItem {
  id: string
  // TIM-1149: null = general (workspace-less) conversation.
  workspace_key: WorkspaceKey | null
  title: string | null
  last_message_at: string
  message_count: number
}

export interface ThreadBrowserProps {
  planId: string
  activeScope: ConversationScope
  activeThreadId: string | null
  onSelectThread: (item: ThreadBrowserItem) => void
  onNewThread: (scope: ConversationScope) => void
  onRenameThread?: (threadId: string, newTitle: string) => void
  onDeleteThread?: (threadId: string) => void
  /** Bump this number from the parent (after a successful send) to force a refresh. */
  refreshKey?: number
  /** The workspace the drawer was opened from. Drives the "+ New here" button. */
  currentWorkspaceKey: WorkspaceKey
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
  activeScope,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onRenameThread,
  onDeleteThread,
  refreshKey = 0,
  currentWorkspaceKey,
}: ThreadBrowserProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  // Manual collapse overrides — group is open unless explicitly closed by the user.
  const [collapsed, setCollapsed] = useState<Partial<Record<GroupKey, boolean>>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState("")
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const editInputRef = useRef<HTMLInputElement | null>(null)

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

  // Focus + select-all when rename input mounts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingId])

  const items = useMemo(
    () => (state.kind === "ready" ? state.items : []),
    [state],
  )

  // TIM-1149: client-side substring filter on titles.
  const filteredItems = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) =>
      titleOrFallback(item.title).toLowerCase().includes(q),
    )
  }, [items, filter])
  const totalCount = items.length
  const filteredCount = filteredItems.length

  const grouped = useMemo(() => {
    const groups: Record<GroupKey, ThreadBrowserItem[]> = {
      [GENERAL_GROUP_KEY]: [],
      concept: [],
      location_lease: [],
      financials: [],
      menu_pricing: [],
      buildout_equipment: [],
      launch_plan: [],
      hiring: [],
      marketing: [],
      suppliers: [],
      operations_playbook: [],
      marketing_pre_launch: [],
    }
    for (const item of filteredItems) {
      const key: GroupKey = item.workspace_key ?? GENERAL_GROUP_KEY
      if (groups[key]) groups[key].push(item)
    }
    const sortByRecency = (a: ThreadBrowserItem, b: ThreadBrowserItem) => {
      const at = new Date(a.last_message_at).getTime()
      const bt = new Date(b.last_message_at).getTime()
      return bt - at
    }
    for (const key of Object.keys(groups) as GroupKey[]) {
      groups[key].sort(sortByRecency)
    }
    return groups
  }, [filteredItems])

  const toggleGroup = useCallback((key: GroupKey) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const activeGroupKey: GroupKey = activeScope === null ? GENERAL_GROUP_KEY : activeScope

  const groupIsOpen = useCallback(
    (key: GroupKey) => {
      // Default open. Active scope is always open even if collapsed elsewhere.
      // When the user is filtering, force every non-empty group open so matches are visible.
      if (filter.trim()) return true
      if (collapsed[key] === undefined) return true
      if (key === activeGroupKey) return true
      return !collapsed[key]
    },
    [collapsed, activeGroupKey, filter],
  )

  const startEdit = useCallback((thread: ThreadBrowserItem) => {
    setPendingDeleteId(null)
    setEditingValue(titleOrFallback(thread.title))
    setEditingId(thread.id)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditingValue("")
  }, [])

  const saveEdit = useCallback(
    async (threadId: string) => {
      const newTitle = editingValue.trim()
      setEditingId(null)
      setEditingValue("")
      if (!newTitle) return

      // Optimistic update
      setState((prev) => {
        if (prev.kind !== "ready") return prev
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.id === threadId ? { ...item, title: newTitle } : item,
          ),
        }
      })

      try {
        const res = await fetch(`/api/copilot/threads/${encodeURIComponent(threadId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ planId, title: newTitle }),
        })
        if (res.ok) {
          onRenameThread?.(threadId, newTitle)
        }
      } catch {
        // leave optimistic state
      }
    },
    [editingValue, planId, onRenameThread],
  )

  const confirmDelete = useCallback(
    async (threadId: string) => {
      setPendingDeleteId(null)

      // Optimistic removal
      setState((prev) => {
        if (prev.kind !== "ready") return prev
        return { ...prev, items: prev.items.filter((item) => item.id !== threadId) }
      })

      try {
        const res = await fetch(
          `/api/copilot/threads/${encodeURIComponent(threadId)}?planId=${encodeURIComponent(planId)}`,
          { method: "DELETE", credentials: "same-origin" },
        )
        if (res.ok || res.status === 204) {
          onDeleteThread?.(threadId)
        }
      } catch {
        // leave optimistic state
      }
    },
    [planId, onDeleteThread],
  )

  const orderedGroupKeys: GroupKey[] = useMemo(
    () => [GENERAL_GROUP_KEY, ...WORKSPACE_ORDER],
    [],
  )

  return (
    <div className="border-b border-[#efefef]" data-testid="thread-browser">
      <div className="flex items-center justify-between px-4 py-2 gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#666] truncate">
          Conversations ({filter.trim() ? `${filteredCount} of ${totalCount}` : totalCount})
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onNewThread(currentWorkspaceKey)}
            className="text-xs font-semibold text-[#155e63] hover:underline"
            title={`New conversation in ${WORKSPACE_LABELS[currentWorkspaceKey]}`}
          >
            + Here
          </button>
          <span aria-hidden className="text-[#ccc]">·</span>
          <button
            type="button"
            onClick={() => onNewThread(null)}
            className="text-xs font-semibold text-[#155e63] hover:underline"
            title="New general conversation (not tied to a workspace)"
          >
            + General
          </button>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-[#e5e3df] bg-white px-2 py-1 focus-within:ring-2 focus-within:ring-[#155e63]/30">
          <Search aria-hidden className="w-3.5 h-3.5 text-[#aaa]" />
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search conversations"
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#bbb]"
            aria-label="Search conversations"
          />
          {filter && (
            <button
              type="button"
              onClick={() => setFilter("")}
              className="text-[10px] text-[#888] hover:text-[#1a1a1a]"
              aria-label="Clear search"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="max-h-60 overflow-y-auto px-2 pb-2">
        {state.kind === "loading" ? (
          <p className="px-2 py-3 text-xs text-[#888]">Loading conversations…</p>
        ) : state.kind === "error" ? (
          <p className="px-2 py-3 text-xs text-red-600">{state.message}</p>
        ) : totalCount === 0 ? (
          <p className="px-2 py-3 text-xs text-[#888]">No saved conversations yet.</p>
        ) : filteredCount === 0 ? (
          <p className="px-2 py-3 text-xs text-[#888]">No matches.</p>
        ) : (
          <ul className="space-y-1">
            {orderedGroupKeys.map((key) => {
              const groupThreads = grouped[key]
              if (groupThreads.length === 0) return null
              const isOpen = groupIsOpen(key)
              const label =
                key === GENERAL_GROUP_KEY
                  ? GENERAL_CONVERSATION_LABEL
                  : WORKSPACE_LABELS[key]
              return (
                <li key={key} className="rounded-lg">
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-[#1a1a1a] hover:bg-[#f7f6f3] rounded-md"
                  >
                    <span className="flex items-center gap-2">
                      <ChevronRight
                        aria-hidden
                        className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}
                      />
                      {label}
                      <span className="text-[10px] font-medium text-[#888]">
                        {groupThreads.length}
                      </span>
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="mt-1 space-y-0.5 pl-3">
                      {groupThreads.map((thread) => {
                        const selected = thread.id === activeThreadId
                        const isEditing = editingId === thread.id
                        const isPendingDelete = pendingDeleteId === thread.id

                        if (isPendingDelete) {
                          return (
                            <li key={thread.id}>
                              <div className="px-3 py-2 rounded-lg border border-red-200 bg-red-50">
                                <p className="text-xs text-[#1a1a1a] mb-2">
                                  Delete this conversation? This can&#39;t be undone.
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteId(null)}
                                    className="text-xs px-2 py-1 rounded border border-[#e5e3df] bg-white text-[#555] hover:bg-[#f7f6f3]"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void confirmDelete(thread.id)}
                                    className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </li>
                          )
                        }

                        return (
                          <li key={thread.id}>
                            <div
                              className={`group flex items-center rounded-lg transition-colors ${
                                selected
                                  ? "bg-[#155e63]/10"
                                  : "hover:bg-[#f7f6f3]"
                              }`}
                            >
                              {isEditing ? (
                                <div className="flex-1 min-w-0 px-3 py-2">
                                  <input
                                    ref={editInputRef}
                                    type="text"
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onBlur={() => void saveEdit(thread.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault()
                                        void saveEdit(thread.id)
                                      }
                                      if (e.key === "Escape") cancelEdit()
                                    }}
                                    maxLength={200}
                                    className="w-full text-sm font-medium bg-transparent border-b border-[#155e63] outline-none text-[#1a1a1a]"
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onSelectThread(thread)}
                                  className={`flex-1 min-w-0 px-3 py-2 text-left ${
                                    selected ? "text-[#155e63]" : "text-[#1a1a1a]"
                                  }`}
                                >
                                  <span className="block truncate font-medium text-sm">
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
                              )}

                              {!isEditing && (
                                <div className="pr-1 shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                                  <button
                                    type="button"
                                    aria-label="Rename"
                                    onClick={() => startEdit(thread)}
                                    className="w-6 h-6 flex items-center justify-center rounded text-[#aaa] hover:text-[#155e63] hover:bg-[#155e63]/10"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Delete"
                                    onClick={() => {
                                      setEditingId(null)
                                      setPendingDeleteId(thread.id)
                                    }}
                                    className="w-6 h-6 flex items-center justify-center rounded text-[#aaa] hover:text-red-600 hover:bg-red-50"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
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
