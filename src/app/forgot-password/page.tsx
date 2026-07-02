import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";
import { Logo } from "../_components/Logo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reset Password | My Coffee Shop Consultant",
};

function errorBannerFor(error: string | undefined): string | null {
  if (error === "expired") {
    return "That link has expired or was already used. Enter your email to get a new one.";
  }
  return null;
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const banner = errorBannerFor(error);

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center mb-10" aria-label="Groundwork home">
        <Logo variant="color" height={48} priority />
      </Link>

      <div className="bg-white rounded-2xl border border-[var(--border)] p-8 w-full max-w-sm shadow-sm">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2 text-center">Reset Your Password</h1>
        <p className="text-[var(--dark-grey)] text-sm text-center mb-8">
          Enter the email tied to your account and we&apos;ll send a reset link.
        </p>
        <ForgotPasswordForm errorMessage={banner} />
        <p className="text-center text-sm text-[var(--dark-grey)] mt-6">
          Remember it?{" "}
          <Link
            href="/login"
            className="text-[var(--teal)] font-medium hover:underline inline-flex items-center min-h-[44px] -my-3 px-1 -mx-1"
          >
            Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
