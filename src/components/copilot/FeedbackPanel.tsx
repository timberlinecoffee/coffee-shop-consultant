"use client";

// TIM-2839: Feedback panel for the Scout AI rail.
//
// Displays AI feedback organised into three buckets (Fix this / Looking good /
// Note) derived from the most recent Check or Benchmark run. No new AI calls
// are made here — the panel reads from the session-scoped feedback cache that
// Check/Benchmark runs populate.
//
// States:
//   empty   — no run has completed for this workspace yet
//   loading — route just changed, cache lookup in flight
//   items   — feedback loaded, renders context strip + tone row + item list
//   clean   — run complete, zero "Fix this" items

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, CheckCircle, ShieldCheck } from "lucide-react";
import type { FeedbackCategory, FeedbackData, FeedbackItem } from "./feedback-cache";
import { getFeedback } from "./feedback-cache";
import type { WorkspaceKey } from "@/types/supabase";
import { WORKSPACE_LABELS } from "./ThreadBrowser";

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<FeedbackCategory, {
  label: string;
  dotClass: string;
  badgeClass: string;
}> = {
  fix: {
    label: "Fix This",
    dotClass: "bg-red-500",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
  },
  good: {
    label: "Looking Good",
    dotClass: "bg-[var(--sage)]",
    badgeClass: "bg-[var(--sage-success-bg)] text-[var(--success-dark)] border-[var(--success-bg)]",
  },
  note: {
    label: "Note",
    dotClass: "bg-[var(--warm-grey-400)]",
    badgeClass: "bg-[var(--warm-grey-100)] text-[var(--warm-grey-500)] border-[var(--warm-grey-300)]",
  },
};

// ── Category badge ────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: FeedbackCategory }) {
  const { label, badgeClass } = CATEGORY_CONFIG[category];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold leading-none whitespace-nowrap flex-shrink-0 ${badgeClass}`}
    >
      {label}
    </span>
  );
}

// ── Tone summary row ──────────────────────────────────────────────────────────

function ToneRow({ items }: { items: FeedbackItem[] }) {
  const fixCount = items.filter((i) => i.category === "fix").length;
  const goodCount = items.filter((i) => i.category === "good").length;
  const noteCount = items.filter((i) => i.category === "note").length;

  const allChips: Array<{ category: FeedbackCategory; count: number }> = [
    { category: "fix", count: fixCount },
    { category: "good", count: goodCount },
    { category: "note", count: noteCount },
  ];
  const chips = allChips.filter((c) => c.count > 0);

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {chips.map(({ category, count }) => {
        const { label, dotClass } = CATEGORY_CONFIG[category];
        return (
          <span key={category} className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} aria-hidden />
            <span className="font-semibold text-[var(--foreground)]">{count}</span>
            {label}
          </span>
        );
      })}
    </div>
  );
}

// ── Shimmer skeleton ──────────────────────────────────────────────────────────

function FeedbackSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-label="Loading feedback">
      <div className="h-4 bg-[var(--warm-grey-200)] rounded-lg w-3/4" />
      <div className="flex gap-3">
        <div className="h-3 bg-[var(--warm-grey-200)] rounded-full w-16" />
        <div className="h-3 bg-[var(--warm-grey-200)] rounded-full w-20" />
        <div className="h-3 bg-[var(--warm-grey-200)] rounded-full w-12" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-[var(--border)] px-3 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-4 bg-[var(--warm-grey-200)] rounded-full w-16" />
            <div className="h-3 bg-[var(--warm-grey-100)] rounded-full w-24" />
          </div>
          <div className="h-3 bg-[var(--warm-grey-100)] rounded-lg w-full" />
          <div className="h-3 bg-[var(--warm-grey-100)] rounded-lg w-5/6" />
        </div>
      ))}
    </div>
  );
}

// ── Feedback item card ────────────────────────────────────────────────────────

interface FeedbackCardProps {
  item: FeedbackItem;
  onReview: (item: FeedbackItem) => void;
}

function FeedbackCard({ item, onReview }: FeedbackCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[var(--border)] px-3 py-3 space-y-2">
      <div className="flex items-start gap-2 flex-wrap">
        <CategoryBadge category={item.category} />
        {item.section && (
          <span className="text-[10px] font-medium text-[var(--muted-foreground)] bg-[var(--warm-grey-100)] px-2 py-0.5 rounded-full border border-[var(--warm-grey-200)] whitespace-nowrap flex-shrink-0">
            {item.section}
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--foreground)] leading-snug">{item.body}</p>
      {item.proposedValue && (
        <button
          type="button"
          className="text-xs font-semibold text-[var(--teal)] hover:underline inline-flex items-center gap-1"
          onClick={() => onReview(item)}
        >
          Review change
          <ArrowRight size={10} aria-hidden />
        </button>
      )}
    </div>
  );
}

// ── Item list by category ─────────────────────────────────────────────────────

const CATEGORY_ORDER: FeedbackCategory[] = ["fix", "good", "note"];

interface FeedbackItemListProps {
  items: FeedbackItem[];
  onReview: (item: FeedbackItem) => void;
}

function FeedbackItemList({ items, onReview }: FeedbackItemListProps) {
  return (
    <div className="space-y-2 pb-4">
      {CATEGORY_ORDER.flatMap((cat) =>
        items
          .filter((i) => i.category === cat)
          .map((item) => (
            <FeedbackCard key={item.id} item={item} onReview={onReview} />
          ))
      )}
    </div>
  );
}

// ── FeedbackPanel ─────────────────────────────────────────────────────────────

export interface FeedbackPanelProps {
  workspaceKey: WorkspaceKey;
  feedbackKey: string | null;
  onRunCheck: () => void;
  onReview: (item: FeedbackItem) => void;
}

export function FeedbackPanel({
  workspaceKey,
  feedbackKey,
  onRunCheck,
  onReview,
}: FeedbackPanelProps) {
  const pathname = usePathname();
  const [data, setData] = useState<FeedbackData | null>(null);
  const [loading, setLoading] = useState(false);
  const prevPathRef = useRef<string | null>(null);

  const loadFeedback = useCallback(
    (key: string | null) => {
      if (!key) {
        setData(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      // Synchronous cache read — no async needed since the cache is in-memory.
      // The setTimeout(0) allows the shimmer to render for one frame before
      // resolving so the transition is visible on fast machines.
      const found = getFeedback(key);
      setTimeout(() => {
        setData(found);
        setLoading(false);
      }, 0);
    },
    [],
  );

  useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      loadFeedback(feedbackKey);
    }
  }, [pathname, feedbackKey, loadFeedback]);

  // Initial load when the panel first mounts or feedbackKey changes.
  useEffect(() => {
    loadFeedback(feedbackKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackKey]);

  const workspaceName = workspaceKey ? (WORKSPACE_LABELS[workspaceKey] ?? workspaceKey) : "Plan";

  if (loading) {
    return (
      <div className="px-4 pt-4">
        <FeedbackSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10 px-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--sage-success-bg)] flex items-center justify-center mb-4">
          <ShieldCheck className="w-6 h-6 text-[var(--sage)]" aria-hidden />
        </div>
        <p className="text-sm font-semibold text-[var(--foreground)] mb-1">
          Run Check to get feedback
        </p>
        <p className="text-sm text-[var(--muted-foreground)] mb-6 max-w-[260px] leading-relaxed">
          Feedback appears here after your first Check or Benchmark run.
        </p>
        <button
          type="button"
          onClick={onRunCheck}
          className="bg-[var(--teal)] text-white rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-[var(--teal-dark)] transition-colors"
        >
          Run Check
        </button>
      </div>
    );
  }

  const fixCount = data.items.filter((i) => i.category === "fix").length;

  if (data.items.length === 0 || fixCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10 px-4">
        <div className="w-12 h-12 rounded-2xl bg-[var(--sage-success-bg)] flex items-center justify-center mb-4">
          <CheckCircle className="w-6 h-6 text-[var(--sage)]" aria-hidden />
        </div>
        <p className="text-sm font-semibold text-[var(--foreground)] mb-1">
          No fixes needed
        </p>
        <p className="text-sm text-[var(--muted-foreground)] max-w-[240px]">
          Your plan looks good for {workspaceName}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Context strip */}
      <div className="text-[11px] text-[var(--muted-foreground)] font-medium">
        {workspaceName}
        {data.pageName ? ` · ${data.pageName}` : ""}
      </div>

      {/* Tone summary */}
      <ToneRow items={data.items} />

      {/* Item list */}
      <FeedbackItemList items={data.items} onReview={onReview} />
    </div>
  );
}

// ── Utility: count Fix-this items for FAB badge ───────────────────────────────

export function countFeedbackFixes(feedbackKey: string | null): number {
  if (!feedbackKey) return 0;
  const data = getFeedback(feedbackKey);
  if (!data) return 0;
  return data.items.filter((i) => i.category === "fix").length;
}
