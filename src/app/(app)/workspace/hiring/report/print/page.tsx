// TIM-965: Competency Evaluation Report — printable, server-rendered, no nav.
// V2: per-staff competency report deferred to Operations Management Suite (TIM-1419).
// Route kept as a holding page; full per-staff content and ScoreCircles/PrintButton
// removed from V1. Restore when Operations Management Suite ships.
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HiringReportPrintPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 py-20">
      <div className="max-w-md w-full text-center space-y-5">
        <div className="h-[3px] bg-[#2d9f8f] rounded-full mb-8 max-w-xs mx-auto" />
        <h1 className="text-2xl font-bold text-gray-900">Staff Evaluation Reports</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Per-staff competency evaluation reports are coming in a future update as part of
          the Operations Management Suite.
        </p>
        <p className="text-xs text-gray-400">
          Your competency framework and blank form templates are available now on the
          Competency tab.
        </p>
        <Link
          href="/workspace/hiring"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#2d9f8f] hover:underline mt-4"
        >
          <span aria-hidden="true">←</span> Back to Hiring &amp; Onboarding
        </Link>
      </div>
    </div>
  );
}
