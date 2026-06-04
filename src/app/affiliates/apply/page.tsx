"use client";

import { useState } from "react";
import Link from "next/link";
import { Logo } from "@/app/_components/Logo";

const ROLES = [
  { value: "educator", label: "Coffee Educator / Barista Trainer" },
  { value: "roaster", label: "Coffee Roaster / Wholesale" },
  { value: "owner", label: "Coffee Shop Owner / Operator" },
  { value: "other", label: "Other (please specify)" },
];

const FAQ = [
  {
    q: "Who qualifies as an affiliate?",
    a: "Coffee educators, barista trainers, SCA-certified instructors, and roasters with wholesale accounts who work directly with aspiring coffee shop owners.",
  },
  {
    q: "Is there a cost to join?",
    a: "No. The program is free to join. There are no performance minimums or fees.",
  },
  {
    q: "How soon will I hear back?",
    a: "Within 5 business days of submitting your application.",
  },
  {
    q: "What happens after I'm approved?",
    a: "You'll receive a welcome email with your referral code, tracking link, full asset kit, and payout setup instructions.",
  },
  {
    q: "Can I apply if I'm based outside Canada?",
    a: "Yes. Payout is in CAD via Interac e-Transfer (Canada) or PayPal (international).",
  },
];

type FormState = "idle" | "submitting" | "success" | "error";

export default function AffiliateApplyPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [role, setRole] = useState("");
  const [roleOther, setRoleOther] = useState("");
  const [platformAudience, setPlatformAudience] = useState("");
  const [whyReferring, setWhyReferring] = useState("");
  const [affiliateAgreement, setAffiliateAgreement] = useState(false);
  const [caslConsent, setCaslConsent] = useState(false);
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState("submitting");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/affiliates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          businessName,
          role,
          roleOther: role === "other" ? roleOther : undefined,
          platformAudience,
          whyReferring,
          affiliateAgreement,
          caslConsent,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFormState("success");
      } else {
        setFormState("error");
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormState("error");
      setErrorMsg("Network error. Please check your connection and try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <nav className="bg-white border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" aria-label="Groundwork home">
            <Logo variant="color" height={28} />
          </Link>
          <Link href="/login" className="text-sm text-[var(--teal)] font-medium hover:underline">
            Sign In
          </Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 pt-12 pb-20">

        {/* Section 1: Program overview */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-3">
            Refer Your Clients to Groundwork
          </h1>
          <p className="text-lg text-[var(--muted-foreground)] mb-6">
            A referral program for coffee educators and roaster partners.
          </p>
          <div className="text-[var(--foreground)] text-sm leading-relaxed space-y-3 mb-8 max-w-2xl">
            <p>
              Your clients who are planning to open specialty coffee shops need a solid planning
              foundation. Groundwork is that tool, built for the 3 to 18 month window before
              opening.
            </p>
            <p>
              When a client signs up through your referral, they get 10% off their first 3 months.
              You earn a 20% recurring commission for the first 6 months of their paid
              subscription. Applications are reviewed within 5 business days.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { label: "Your commission", value: "20% recurring", detail: "6 months per paid referral" },
              { label: "Client discount", value: "10% off", detail: "First 3 months" },
              { label: "Payouts", value: "Monthly, 15th", detail: "Min. $50 CAD" },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-white border border-[var(--border)] rounded-lg px-5 py-4"
              >
                <p className="text-xs text-[var(--muted-foreground)] mb-1">{item.label}</p>
                <p className="font-semibold text-[var(--teal)] text-base">{item.value}</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{item.detail}</p>
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-1 text-sm text-[var(--muted-foreground)] list-disc list-inside">
            <li>Personal referral code and trackable link</li>
            <li>Plug-and-play asset kit provided on approval</li>
          </ul>
        </div>

        {/* Section 2: Application form */}
        <div
          id="apply"
          className="bg-[var(--card)] rounded-lg border border-[var(--border)] shadow-sm p-8 mb-12"
        >
          {formState === "success" ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-[var(--teal-tint-200)] flex items-center justify-center mx-auto mb-4">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">Application Received</h2>
              <p className="text-[var(--muted-foreground)] text-sm max-w-sm mx-auto">
                We review applications within 5 business days. You will hear from us at{" "}
                <span className="font-medium text-[var(--foreground)]">{email}</span>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <h2 className="text-xl font-semibold text-[var(--foreground)] mb-1">Apply to Join</h2>
              <p className="text-sm text-[var(--muted-foreground)] mb-6">
                We review applications within 5 business days. We focus on educators and roaster
                partners who work directly with aspiring coffee shop owners.
              </p>

              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-[var(--foreground)] mb-1">
                    First name <span className="text-[var(--destructive)]">*</span>
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                    autoComplete="given-name"
                    className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-[var(--foreground)] mb-1">
                    Last name <span className="text-[var(--destructive)]">*</span>
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                    autoComplete="family-name"
                    className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Email address <span className="text-[var(--destructive)]">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors"
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  We will send approval or rejection to this address.
                </p>
              </div>

              <div className="mb-4">
                <label htmlFor="businessName" className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Business or organization name <span className="text-[var(--destructive)]">*</span>
                </label>
                <input
                  id="businessName"
                  type="text"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  required
                  className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors"
                />
              </div>

              <div className="mb-4">
                <label htmlFor="role" className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Role <span className="text-[var(--destructive)]">*</span>
                </label>
                <select
                  id="role"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  required
                  className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] bg-white focus-visible:outline-none focus:border-[var(--teal)] transition-colors"
                >
                  <option value="" disabled>Select your role</option>
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {role === "other" && (
                <div className="mb-4">
                  <label htmlFor="roleOther" className="block text-sm font-medium text-[var(--foreground)] mb-1">
                    Please specify your role <span className="text-[var(--destructive)]">*</span>
                  </label>
                  <input
                    id="roleOther"
                    type="text"
                    value={roleOther}
                    onChange={e => setRoleOther(e.target.value)}
                    required
                    className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors"
                  />
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="platformAudience" className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Platform and audience <span className="text-[var(--destructive)]">*</span>
                </label>
                <textarea
                  id="platformAudience"
                  value={platformAudience}
                  onChange={e => setPlatformAudience(e.target.value)}
                  required
                  maxLength={500}
                  rows={3}
                  className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors resize-none"
                  placeholder="Briefly describe where and how you reach your clients or students..."
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Briefly describe where and how you reach your clients or students (for example:
                  in-person classes, email list, Instagram, wholesale accounts). Approximate reach
                  is helpful. Max 500 characters.
                </p>
              </div>

              <div className="mb-6">
                <label htmlFor="whyReferring" className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Why are you referring clients to Groundwork? <span className="text-[var(--destructive)]">*</span>
                </label>
                <textarea
                  id="whyReferring"
                  value={whyReferring}
                  onChange={e => setWhyReferring(e.target.value)}
                  required
                  maxLength={500}
                  rows={3}
                  className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors resize-none"
                  placeholder="Tell us why you think Groundwork is a good fit..."
                />
                <p className="text-xs text-[var(--muted-foreground)] mt-1">
                  Tell us why you think Groundwork is a good fit for your clients and how you plan
                  to introduce it. Max 500 characters.
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <label className="flex items-start gap-3 text-sm text-[var(--foreground)] leading-relaxed cursor-pointer">
                  <input
                    type="checkbox"
                    checked={affiliateAgreement}
                    onChange={e => setAffiliateAgreement(e.target.checked)}
                    required
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-[var(--border)] text-[var(--teal)] focus:ring-[var(--teal)]"
                  />
                  <span>
                    I have read and agree to the{" "}
                    <a
                      href="#"
                      className="text-[var(--teal)] underline"
                      onClick={e => e.preventDefault()}
                    >
                      Groundwork Affiliate Program Terms
                    </a>{" "}
                    and understand the commission, payout, and conduct requirements.
                  </span>
                </label>

                <label className="flex items-start gap-3 text-sm text-[var(--foreground)] leading-relaxed cursor-pointer">
                  <input
                    type="checkbox"
                    checked={caslConsent}
                    onChange={e => setCaslConsent(e.target.checked)}
                    required
                    className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-[var(--border)] text-[var(--teal)] focus:ring-[var(--teal)]"
                  />
                  <span>
                    I consent to receive email communications from Groundwork regarding my
                    affiliate application and, if approved, my affiliate account.
                  </span>
                </label>
              </div>

              {errorMsg && (
                <p role="alert" className="text-xs text-[var(--destructive)] bg-red-50 rounded-lg px-3 py-2 mb-4">
                  {errorMsg}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={formState === "submitting"}
                  className="w-full sm:w-auto bg-[var(--teal)] text-white px-8 py-3 rounded-xl font-semibold text-sm hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {formState === "submitting" ? "Submitting..." : "Submit Application"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Section 3: FAQ */}
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold text-[var(--foreground)] mb-6">
            Frequently Asked Questions
          </h2>
          <div className="space-y-2">
            {FAQ.map((item, i) => (
              <div
                key={i}
                className="bg-white border border-[var(--border)] rounded-xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 font-medium text-[var(--foreground)] text-sm hover:bg-[var(--background)] transition-colors"
                >
                  <span>{item.q}</span>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`flex-shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4 text-sm text-[var(--muted-foreground)] leading-relaxed border-t border-[var(--border)]">
                    <p className="pt-3">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex gap-6 text-xs text-[var(--muted-foreground)]">
          <Link href="/terms" className="hover:text-[var(--teal)] transition-colors">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-[var(--teal)] transition-colors">Privacy Policy</Link>
        </div>
      </div>
    </div>
  );
}
