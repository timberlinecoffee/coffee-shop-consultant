import Link from "next/link";
import { LoginForm } from "@/app/login/login-form";
import { Logo } from "../_components/Logo";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Sign Up | My Coffee Shop Consultant",
};

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center mb-10" aria-label="Groundwork home">
        <Logo variant="color" height={48} priority />
      </Link>

      <div className="bg-white rounded-2xl border border-[var(--border)] p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2 text-center">Create Your Account</h1>
        <p className="text-[var(--dark-grey)] text-sm text-center mb-8">Start your coffee shop journey for free</p>
        <LoginForm initialMode="signup" />
        <p className="text-center text-sm text-[var(--dark-grey)] mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-[var(--teal)] font-medium hover:underline">
            Sign In
          </Link>
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
