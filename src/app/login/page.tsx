import Link from "next/link";
import { LoginForm } from "./login-form";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Sign In | My Coffee Shop Consultant",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#faf9f7] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center gap-2 mb-10">
        <div className="w-8 h-8 bg-[#155e63] rounded-lg flex items-center justify-center">
          <span className="text-white text-xs font-bold">TCS</span>
        </div>
        <span className="font-semibold text-[#155e63]">Timberline Coffee School</span>
      </Link>

      <div className="bg-white rounded-2xl border border-[#efefef] p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-bold text-[#1a1a1a] mb-2 text-center">Welcome back</h1>
        <p className="text-[#afafaf] text-sm text-center mb-8">Sign in to your coffee shop plan</p>
        <LoginForm />
        <p className="text-center text-sm text-[#afafaf] mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/login?mode=signup" className="text-[#155e63] font-medium hover:underline">
            Start for free
          </Link>
        </p>
      </div>

      <p className="text-xs text-[#afafaf] mt-8 text-center max-w-xs">
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}
