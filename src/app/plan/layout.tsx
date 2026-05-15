import { EmailConfirmBanner } from "@/components/email-confirm-banner";

export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EmailConfirmBanner />
      {children}
    </>
  );
}
