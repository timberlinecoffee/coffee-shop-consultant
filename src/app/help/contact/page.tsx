// TIM-1941: contact page — wraps the client-side support form.

import { HelpPageHeader } from "../_components/HelpPageHeader";
import { ContactForm } from "../_components/ContactForm";

export const metadata = {
  title: "Contact Support | Groundwork",
  description:
    "Send the Groundwork team a message. We typically respond within one business day.",
};

export default function ContactSupportPage() {
  return (
    <>
      <HelpPageHeader
        iconKey="mail"
        title="Contact support"
        description="Send us a note and we'll get back to you within one business day."
        active="contact"
      />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
        <ContactForm />
        <aside className="rounded-xl border border-[var(--border)] bg-white p-5">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-2">
            Prefer email?
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mb-3 leading-relaxed">
            You can also reach us directly. We monitor this inbox every
            business day.
          </p>
          <a
            href="mailto:hello@timberline.coffee"
            className="text-sm font-semibold text-[var(--teal)] hover:underline break-all"
          >
            hello@timberline.coffee
          </a>
          <div className="mt-5 pt-5 border-t border-[var(--border)]">
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">
              Before you write
            </h3>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              Some common questions are covered in the{" "}
              <a
                href="/help"
                className="text-[var(--teal)] hover:underline font-semibold"
              >
                help articles
              </a>
              .
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
