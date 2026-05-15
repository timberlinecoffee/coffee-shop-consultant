import { EmailConfirmBanner } from "@/components/email-confirm-banner";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <EmailConfirmBanner />
      {children}
    </>
  );
}
