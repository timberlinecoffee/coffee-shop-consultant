import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Choose a New Password | My Coffee Shop Consultant",
};

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/forgot-password?error=expired");
  }

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center gap-2 mb-10">
        <div className="w-8 h-8 bg-teal rounded-lg flex items-center justify-center">
          <span className="text-white text-xs font-bold">TCS</span>
        </div>
        <span className="font-semibold text-teal">Timberline Coffee School</span>
      </Link>

      <div className="bg-white rounded-2xl border border-grey-light p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-bold text-neutral-950 mb-2 text-center">Set a new password</h1>
        <p className="text-neutral-500 text-sm text-center mb-8">
          Choose a password with at least 8 characters.
        </p>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
