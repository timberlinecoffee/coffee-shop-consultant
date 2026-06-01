import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";
import { Logo } from "../_components/Logo";

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
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center mb-10" aria-label="Groundwork home">
        <Logo variant="color" height={32} priority />
      </Link>

      <div className="bg-white rounded-2xl border border-[var(--border)] p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2 text-center">Set a New Password</h1>
        <p className="text-[var(--dark-grey)] text-sm text-center mb-8">
          Choose a password with at least 8 characters.
        </p>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
