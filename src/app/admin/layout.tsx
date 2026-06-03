// TIM-1942: Admin portal layout.
// Server component — gates on requireAdminPage() which calls notFound() for
// non-admins (per the spec "refuse non-admins with 404 — don't reveal the
// route exists"). The page chrome (WorkspaceSubNav) is rendered by each leaf
// page so the active tab is set correctly without prop drilling.

import type { ReactNode } from "react";
import { requireAdminPage } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage();
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-7xl mx-auto px-6 pt-10 pb-20">{children}</div>
    </div>
  );
}
