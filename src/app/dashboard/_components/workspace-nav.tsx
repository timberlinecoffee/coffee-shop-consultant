// TIM-1268: dashboard workspace display that mirrors the sidebar. Workspace
// names are grouped under their phase categories (Plan / Set Up / Launch /
// Operate) with no numbers, matching the sidebar exactly. The grouping comes
// from the shared manifest source of truth (WORKSPACE_MANIFEST +
// WORKSPACE_CATEGORY_ORDER/LABEL via buildNavItems) so the two cannot drift.

import Link from "next/link";
import {
  WORKSPACE_CATEGORY_LABEL,
  WORKSPACE_CATEGORY_ORDER,
  type WorkspaceNavItem,
} from "@/lib/workspace-manifest";
import { WORKSPACE_ICONS } from "@/lib/workspace-icons";
import {
  WORKSPACE_STATUS_LABEL,
  type WorkspaceStatus,
} from "@/lib/workspace-status";

function statusPillClasses(status: WorkspaceStatus): string {
  switch (status) {
    case "complete":
      return "bg-[#155e63]/10 text-[#155e63] border-[#155e63]/20";
    case "in_progress":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "not_started":
      return "bg-[#f5f4f0] text-[#8a8a8a] border-[#e6e3dd]";
  }
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function WorkspaceRow({ item }: { item: WorkspaceNavItem }) {
  const Icon = WORKSPACE_ICONS[item.icon];

  if (!item.isUnlocked) {
    return (
      <span
        aria-disabled="true"
        title="Coming soon"
        className="flex items-center gap-2.5 rounded-lg border border-[#efefef] px-3 py-2.5 text-[#afafaf] cursor-default select-none"
      >
        <LockIcon />
        <span className="text-sm truncate flex-1 min-w-0">{item.label}</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      className="group flex items-center gap-2.5 rounded-lg border border-[#efefef] px-3 py-2.5 hover:border-[#155e63]/30 hover:bg-[#155e63]/[0.03] transition-colors"
    >
      <span className="text-[#155e63] flex-shrink-0">
        {Icon ? <Icon width={16} height={16} strokeWidth={1.75} aria-hidden="true" /> : null}
      </span>
      <span className="text-sm font-medium text-[#1a1a1a] truncate flex-1 min-w-0 group-hover:text-[#155e63] transition-colors">
        {item.label}
      </span>
      <span
        className={`inline-flex items-center text-[10px] font-medium px-1.5 py-[1px] rounded-full border leading-none whitespace-nowrap flex-shrink-0 ${statusPillClasses(item.status)}`}
      >
        {WORKSPACE_STATUS_LABEL[item.status]}
      </span>
    </Link>
  );
}

export function WorkspaceNav({ items }: { items: WorkspaceNavItem[] }) {
  return (
    <div className="mb-10">
      <p className="text-xs font-semibold text-[#afafaf] uppercase tracking-widest mb-3">
        Your Workspaces
      </p>
      <div className="bg-white rounded-xl border border-[#efefef] p-5 space-y-6">
        {WORKSPACE_CATEGORY_ORDER.map((category) => {
          const groupItems = items.filter((item) => item.category === category);
          if (groupItems.length === 0) return null;
          return (
            <section key={category}>
              <h2 className="text-[10px] font-semibold text-[#afafaf] uppercase tracking-wider mb-2.5">
                {WORKSPACE_CATEGORY_LABEL[category]}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {groupItems.map((item) => (
                  <WorkspaceRow key={item.moduleNumber} item={item} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
