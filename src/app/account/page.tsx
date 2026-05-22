import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PLAN_DISPLAY_NAMES } from "@/lib/plan-names";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Account | My Coffee Shop Consultant" };

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, subscription_tier, subscription_status, ai_credits_remaining, copilot_trial_messages_used, readiness_score")
    .eq("id", user.id)
    .single();

  const tierDisplayName = PLAN_DISPLAY_NAMES[profile?.subscription_tier ?? "free"] ?? "Free";
  const isFree = (profile?.subscription_tier ?? "free") === "free";
  const trialUsed = profile?.copilot_trial_messages_used ?? 0;

  return (
    <div className="bg-[#faf9f7]">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-[#1a1a1a]">Account settings</h1>

        <div className="bg-white rounded-xl border border-[#efefef] p-6">
          <h2 className="font-semibold text-[#1a1a1a] mb-4">Profile</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#afafaf]">Name</span>
              <span className="text-[#1a1a1a]">{profile?.full_name ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#afafaf]">Email</span>
              <span className="text-[#1a1a1a]">{user.email}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#efefef] p-6">
          <h2 className="font-semibold text-[#1a1a1a] mb-4">Subscription</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[#afafaf]">Plan</span>
              <span className="text-[#1a1a1a]">{tierDisplayName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#afafaf]">
                {isFree ? "Coaching sessions" : "AI credits remaining"}
              </span>
              <span className="text-[#1a1a1a]">
                {isFree
                  ? `${trialUsed} of 5 free coaching sessions used`
                  : profile?.ai_credits_remaining ?? 0}
              </span>
            </div>
          </div>
          <Link
            href="/account/billing"
            className="mt-4 inline-block text-sm text-[#155e63] font-medium hover:underline"
          >
            Manage billing →
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-[#efefef] p-6">
          <h2 className="font-semibold text-[#1a1a1a] mb-4">Delete account</h2>
          <p className="text-sm text-[#afafaf] mb-4">
            Permanently delete your account and all plan data. This cannot be undone.
          </p>
          <button className="text-sm text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">
            Delete my account
          </button>
        </div>

        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="text-sm text-[#afafaf] hover:text-[#1a1a1a] transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
