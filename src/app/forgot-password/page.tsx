import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reset Password | My Coffee Shop Consultant",
};

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-[#faf9f7] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center gap-2 mb-10">
        <div className="w-8 h-8 bg-[#155e63] rounded-lg flex items-center justify-center">
          <span className="text-white text-xs font-bold">TCS</span>
        </div>
        <span className="font-semibold text-[#155e63]">Timberline Coffee School</span>
      </Link>

      <div className="bg-white rounded-2xl border border-[#efefef] p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-bold text-[#1a1a1a] mb-2 text-center">Reset your password</h1>
        <p className="text-[#afafaf] text-sm text-center mb-8">
          Enter the email tied to your account and we&apos;ll send a reset link.
        </p>
        <ForgotPasswordForm />
        <p className="text-center text-sm text-[#afafaf] mt-6">
          Remember it?{" "}
          <Link href="/login" className="text-[#155e63] font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
