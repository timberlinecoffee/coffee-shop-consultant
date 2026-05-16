import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export default async function GroundworkLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 lg:pb-0">
      <nav className="bg-white border-b border-neutral-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-sm text-teal font-medium hover:underline flex items-center gap-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Dashboard
          </Link>
          <span className="text-xs text-neutral-500 font-medium">Groundwork</span>
        </div>
      </nav>
      {children}
      <BottomTabBar />
    </div>
  );
}
