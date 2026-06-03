"use client";

// TIM-1942: Canonical sub-nav for the admin portal. Routes through the shared
// WorkspaceSubNav (TIM-1793) so the admin shell uses the same pill chrome the
// rest of the platform uses — Financials reference, locked tokens.

import { Users, LayoutDashboard, MessageSquare, History, ExternalLink } from "lucide-react";
import { WorkspaceSubNav } from "@/components/workspace/WorkspaceSubNav";

export type AdminTab = "overview" | "members" | "support" | "audit" | "referrals";

export function AdminSubNav({ active }: { active: AdminTab }) {
  return (
    <WorkspaceSubNav
      ariaLabel="Admin portal sections"
      active={active}
      tabs={[
        { key: "overview", label: "Overview", href: "/admin", Icon: LayoutDashboard },
        { key: "members", label: "Members", href: "/admin/members", Icon: Users },
        { key: "support", label: "Support inbox", href: "/admin/support", Icon: MessageSquare },
        { key: "audit", label: "Audit log", href: "/admin/audit-log", Icon: History },
        { key: "referrals", label: "Referrals", href: "/admin/equipment-referrals", Icon: ExternalLink },
      ]}
    />
  );
}
