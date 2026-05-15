import { EmailConfirmBanner } from "@/components/email-confirm-banner";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EmailConfirmBanner />
      {children}
    </>
  );
}
