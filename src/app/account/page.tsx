import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BottomTabBar } from "@/components/bottom-tab-bar";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Account | My Coffee Shop Consultant" };

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, subscription_tier, ai_credits_remaining, readiness_score")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-neutral-100 pb-16 lg:pb-0">
      <nav className="bg-white border-b border-grey-light px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-teal rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span className="text-sm text-neutral-500 hover:text-neutral-950 transition-colors">← Dashboard</span>
          </Link>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-neutral-950">Account settings</h1>

        <div className="bg-white rounded-xl border border-grey-light p-6">
          <h2 className="font-semibold text-neutral-950 mb-4">Profile</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Name</span>
              <span className="text-neutral-950">{profile?.full_name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Email</span>
              <span className="text-neutral-950">{user.email}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-grey-light p-6">
          <h2 className="font-semibold text-neutral-950 mb-4">Subscription</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">Plan</span>
              <span className="text-neutral-950 capitalize">{profile?.subscription_tier ?? "free"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">AI credits remaining</span>
              <span className="text-neutral-950">{profile?.ai_credits_remaining ?? 0}</span>
            </div>
          </div>
          <Link
            href="/account/billing"
            className="mt-4 inline-block text-sm text-teal font-medium hover:underline"
          >
            Manage billing →
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-grey-light p-6">
          <h2 className="font-semibold text-neutral-950 mb-4">Delete account</h2>
          <p className="text-sm text-neutral-500 mb-4">
            Permanently delete your account and all plan data. This cannot be undone.
          </p>
          <button className="text-sm text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">
            Delete my account
          </button>
        </div>

        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="text-sm text-neutral-500 hover:text-neutral-950 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
      <BottomTabBar />
    </div>
  );
}
