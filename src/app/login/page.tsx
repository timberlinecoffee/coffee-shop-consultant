import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { Logo } from "../_components/Logo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Sign In | My Coffee Shop Consultant",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; error?: string }>;
}) {
  const { mode, next, error } = await searchParams;
  const initialMode = mode === "signup" ? "signup" : "signin";
  const isSignup = initialMode === "signup";

  // TIM-2352: if the visitor is already authenticated, bounce them straight to
  // their next destination so revisiting /login does not look like a re-login
  // prompt. Skip the bounce when ?error= is present — they came here because
  // an auth flow failed and the error message belongs in front of them.
  if (!error) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const safeNext =
        typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
          ? next
          : "/dashboard";
      redirect(safeNext);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center mb-10" aria-label="Groundwork home">
        <Logo variant="color" height={48} priority />
      </Link>

      <div className="bg-white rounded-2xl border border-[var(--border)] p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2 text-center">
          {isSignup ? "Create your account" : "Welcome Back"}
        </h1>
        <p className="text-[var(--dark-grey)] text-sm text-center mb-8">
          {isSignup ? "Start your coffee shop journey for free" : "Sign in to your coffee shop plan"}
        </p>
        <LoginForm initialMode={initialMode} />
        <p className="text-center text-sm text-[var(--dark-grey)] mt-6">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-[var(--teal)] font-medium hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              Don&apos;t have an account?{" "}
              <Link href="/login?mode=signup" className="text-[var(--teal)] font-medium hover:underline">
                Start for Free
              </Link>
            </>
          )}
        </p>
      </div>

      <p className="text-xs text-[var(--dark-grey)] mt-8 text-center max-w-xs">
        By continuing, you agree to our{" "}
        <Link href="/terms" className="underline hover:text-[var(--teal)]">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline hover:text-[var(--teal)]">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
