import Link from "next/link";
import { LoginForm } from "./login-form";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Sign In | My Coffee Shop Consultant",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center gap-2 mb-10">
        <div className="w-8 h-8 bg-teal rounded-lg flex items-center justify-center">
          <span className="text-white text-xs font-bold">TCS</span>
        </div>
        <span className="font-semibold text-teal">Timberline Coffee School</span>
      </Link>

      <div className="bg-white rounded-2xl border border-grey-light p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-bold text-neutral-950 mb-2 text-center">Welcome back</h1>
        <p className="text-neutral-500 text-sm text-center mb-8">Sign in to your coffee shop plan</p>
        <LoginForm />
        <p className="text-center text-sm text-neutral-500 mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/login?mode=signup" className="text-teal font-medium hover:underline">
            Start for free
          </Link>
        </p>
      </div>

      <p className="text-xs text-neutral-500 mt-8 text-center max-w-xs">
        By continuing, you agree to our{" "}
        <Link href="/terms" className="underline hover:text-teal">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline hover:text-teal">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
