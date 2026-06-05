import Link from "next/link";
import Image from "next/image";
import { FadeUp, ScaleIn } from "./AnimatedElements";

/* Pexels photos by Ketut Subiyanto (Pexels License — free for commercial use).
   Warm overlay is applied at runtime (not baked in) so the originals stay editable. */
const pexels = (id: number, w = 1200) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

type Benefit = {
  key: string;
  eyebrow: string;
  headline: string;
  oneLiner: string;
  ctaLabel: string;
  ctaHref: string;
  photoSrc: string;
  photoAlt: string;
  objectPosition: string;
  photoSide: "left" | "right";
  tilt: number; // degrees; sign follows anchor side
  card: React.ReactNode;
};

const TEAL = "var(--teal)";
const SAGE = "var(--sage)";

export default function BenefitSections() {
  return (
    <div>
      {BENEFITS.map((b, i) => (
        <BenefitSection key={b.key} benefit={b} index={i} />
      ))}
    </div>
  );
}

function BenefitSection({ benefit, index }: { benefit: Benefit; index: number }) {
  const photoLeft = benefit.photoSide === "left";
  const bg = index % 2 === 0 ? "var(--warm-50)" : "var(--coffee-100)";
  // Card overlaps the inner edge of the photo (the edge facing the text column).
  const cardAnchor: React.CSSProperties = photoLeft
    ? { right: "-28px", bottom: "32px" }
    : { left: "-28px", bottom: "32px" };

  return (
    <section style={{ background: bg, padding: "84px 24px" }}>
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1.08fr_0.92fr] gap-10 lg:gap-16 items-center">
          {/* Photo + floating tilted UI card */}
          <ScaleIn className={`relative ${photoLeft ? "lg:order-1" : "lg:order-2"}`}>
            <div className="relative rounded-2xl overflow-hidden aspect-[4/3]">
              <Image
                src={benefit.photoSrc}
                alt={benefit.photoAlt}
                fill
                className="object-cover"
                style={{ objectPosition: benefit.objectPosition }}
                sizes="(max-width: 1024px) 100vw, 55vw"
              />
              {/* Uniform warm overlay for cross-section cohesion */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "rgba(245,230,211,0.08)" }}
              />
            </div>
            {/* Desktop: dog-eared card tilted over the photo edge */}
            <div
              className="hidden lg:block absolute z-10"
              style={{ ...cardAnchor, transform: `rotate(${benefit.tilt}deg)`, width: "264px" }}
            >
              <MockCard>{benefit.card}</MockCard>
            </div>
          </ScaleIn>

          {/* Text column */}
          <FadeUp className={photoLeft ? "lg:order-2" : "lg:order-1"}>
            <p
              className="font-semibold uppercase mb-3"
              style={{ fontSize: "11px", letterSpacing: "0.1em", color: SAGE }}
            >
              {benefit.eyebrow}
            </p>
            <h2
              className="font-bold mb-4"
              style={{
                fontSize: "clamp(1.75rem, 3.2vw, 2.35rem)",
                lineHeight: 1.18,
                fontWeight: 700,
                color: "var(--foreground)",
                letterSpacing: "-0.01em",
              }}
            >
              {benefit.headline}
            </h2>
            <p
              style={{ fontSize: "18px", lineHeight: 1.6, color: "var(--gray-1200)", maxWidth: "420px" }}
            >
              {benefit.oneLiner}
            </p>
            <Link
              href={benefit.ctaHref}
              className="inline-flex items-center gap-1.5 mt-6 font-semibold transition-colors"
              style={{ fontSize: "16px", color: TEAL }}
            >
              {benefit.ctaLabel}
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </FadeUp>
        </div>

        {/* Mobile: card stacked below the photo, no tilt */}
        <div className="lg:hidden mt-6 max-w-sm mx-auto">
          <MockCard>{benefit.card}</MockCard>
        </div>
      </div>
    </section>
  );
}

/* Shared white card chrome for every UI cluster */
function MockCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--card)",
        borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        border: "1px solid rgba(0,0,0,0.04)",
        padding: "14px",
      }}
    >
      {children}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "9px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--neutral-500)",
};

/* ── Section 1 — Plan Financials (12-month projection) ────────────────────── */
function PlanFinancialsCluster() {
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p style={{ fontSize: "11px", fontWeight: 600, color: TEAL }}>12-Month Projection</p>
        <span style={{ fontSize: "9px", fontWeight: 600, color: SAGE }}>Healthy</span>
      </div>
      <div className="rounded-lg p-2.5 mb-2.5" style={{ background: "var(--neutral-50)", border: "1px solid var(--warm-gray-ef)" }}>
        <p style={labelStyle}>Year 1 revenue</p>
        <p style={{ fontSize: "20px", fontWeight: 700, color: TEAL, lineHeight: 1.1 }}>$578,400</p>
        <div className="flex items-end gap-0.5 h-6 mt-2">
          {[28, 34, 42, 48, 55, 60, 64, 68, 72, 75, 78, 82].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{ height: `${h}%`, background: i === 11 ? "var(--sage)" : "var(--border-subtle)" }}
            />
          ))}
        </div>
      </div>
      <p style={{ ...labelStyle, marginBottom: "4px" }}>Benchmarks (industry range)</p>
      <div className="flex flex-wrap gap-1.5">
        {["COGS 28%", "Labor 31%", "Rent 8%"].map((c) => (
          <span
            key={c}
            className="rounded-full px-2 py-0.5"
            style={{ fontSize: "10px", fontWeight: 500, color: TEAL, background: "rgba(21,94,99,0.07)" }}
          >
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Section 2 — Menu Pricing (cost-per-cup with margin targets) ──────────── */
function MenuCluster() {
  const rows = [
    { name: "Oat Latte", cost: "18%", margin: "82%", top: true },
    { name: "Cold Brew", cost: "15%", margin: "85%", top: false },
    { name: "Drip Coffee", cost: "22%", margin: "78%", top: false },
  ];
  return (
    <div>
      <p style={{ fontSize: "11px", fontWeight: 600, color: TEAL, marginBottom: "8px" }}>
        Cost Per Cup &amp; Margin
      </p>
      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--warm-gray-ef)" }}>
        <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr] px-2.5 py-1.5" style={{ background: "var(--warm-surface)" }}>
          {["Item", "Cost", "Margin"].map((h) => (
            <p key={h} style={labelStyle}>{h}</p>
          ))}
        </div>
        {rows.map((r, i) => (
          <div
            key={r.name}
            className="grid grid-cols-[1.4fr_0.8fr_0.8fr] items-center px-2.5 py-1.5"
            style={{ background: "white", borderTop: i > 0 ? "1px solid var(--warm-gray-f2)" : "none" }}
          >
            <p style={{ fontSize: "11px", fontWeight: 500, color: TEAL, display: "flex", alignItems: "center", gap: "4px" }}>
              {r.name}
              {r.top && (
                <span
                  className="rounded-full px-1.5"
                  style={{ fontSize: "8px", fontWeight: 600, color: "white", background: "var(--sage)" }}
                >
                  Top
                </span>
              )}
            </p>
            <p style={{ fontSize: "11px", color: "var(--neutral-500)" }}>{r.cost}</p>
            <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--sage)" }}>{r.margin}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Section 3 — Business Plan PDF Export ─────────────────────────────────── */
function BusinessPlanCluster() {
  const variants = [
    { label: "Bank", note: "Lender package", accent: "teal" as const },
    { label: "Investor", note: "Pitch-ready deck", accent: "sage" as const },
    { label: "Internal", note: "Operating doc", accent: "teal" as const },
    { label: "Printable", note: "Board copy", accent: "sage" as const },
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p style={{ fontSize: "11px", fontWeight: 600, color: TEAL }}>Business Plan Export</p>
        <span
          className="rounded px-2 py-0.5"
          style={{ background: "rgba(118,179,157,0.12)", color: SAGE, fontSize: "10px", fontWeight: 600 }}
        >
          PDF
        </span>
      </div>
      <div className="space-y-1">
        {variants.map((v) => (
          <div
            key={v.label}
            className="rounded-lg px-2.5 py-1.5 flex items-center gap-2"
            style={{ background: "white", border: "1px solid var(--warm-gray-ef)" }}
          >
            <div
              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
              style={{ background: v.accent === "sage" ? "rgba(118,179,157,0.14)" : "rgba(21,94,99,0.08)" }}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={v.accent === "sage" ? "var(--sage)" : "var(--teal)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div className="flex-1">
              <p style={{ fontSize: "11px", color: TEAL, fontWeight: 600, lineHeight: 1.2 }}>{v.label}</p>
              <p style={{ fontSize: "9px", color: "var(--neutral-500)", lineHeight: 1.2 }}>{v.note}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const BENEFITS: Benefit[] = [
  {
    key: "financials-planning",
    eyebrow: "Financials",
    headline: "Numbers a Landlord and Lender Will Actually Read",
    oneLiner:
      "Startup costs and a 12-month projection benchmarked against real coffee shops. Stress-test rent and ticket size before signing anything.",
    ctaLabel: "Explore Financials",
    ctaHref: "/signup",
    photoSrc: pexels(4474033),
    photoAlt:
      "Coffee shop owner working across laptop and tablet to model startup costs and projections",
    objectPosition: "center 25%",
    photoSide: "right",
    tilt: 6,
    card: <PlanFinancialsCluster />,
  },
  {
    key: "menu-pricing",
    eyebrow: "Menu Pricing",
    headline: "Price Every Drink for the Margin You Need to Open",
    oneLiner:
      "Cost-per-cup with margin targets and industry benchmarks, so your menu prices match the numbers in your plan.",
    ctaLabel: "Explore Menu Pricing",
    ctaHref: "/signup",
    photoSrc: pexels(4349948),
    photoAlt:
      "Barista creating latte art by carefully pouring steamed milk into a takeaway cup",
    objectPosition: "center",
    photoSide: "left",
    tilt: -5,
    card: <MenuCluster />,
  },
  {
    key: "business-plan-export",
    eyebrow: "Business Plan Export",
    headline: "One Plan. Four PDFs Ready for Whoever Is Asking.",
    oneLiner:
      "Export bank, investor, internal, and printable versions of your plan. The numbers stay in sync because they are pulled from the same source.",
    ctaLabel: "Explore Business Plan Export",
    ctaHref: "/signup",
    photoSrc: pexels(4350061),
    photoAlt:
      "Two cafe owners in aprons collaborating over a printed business plan at their coffee shop counter",
    objectPosition: "center 30%",
    photoSide: "right",
    tilt: 6,
    card: <BusinessPlanCluster />,
  },
];
