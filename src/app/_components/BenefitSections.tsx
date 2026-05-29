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

/* ── Section 1 — Daily Financials ─────────────────────────────────────────── */
function FinancialsCluster() {
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p style={{ fontSize: "11px", fontWeight: 600, color: TEAL }}>Today vs. 30-Day Average</p>
        <span style={{ fontSize: "9px", fontWeight: 600, color: SAGE }}>+12%</span>
      </div>
      <div className="rounded-lg p-2.5 mb-2.5" style={{ background: "var(--neutral-50)", border: "1px solid var(--warm-gray-ef)" }}>
        <p style={labelStyle}>Revenue today</p>
        <p style={{ fontSize: "20px", fontWeight: 700, color: TEAL, lineHeight: 1.1 }}>$1,284</p>
        <div className="flex items-end gap-0.5 h-6 mt-2">
          {[40, 55, 48, 62, 70, 58, 82].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{ height: `${h}%`, background: i === 6 ? "var(--sage)" : "var(--border-subtle)" }}
            />
          ))}
        </div>
      </div>
      <p style={{ ...labelStyle, marginBottom: "4px" }}>Top expenses</p>
      <div className="flex flex-wrap gap-1.5">
        {["Beans 28%", "Labor 31%", "Rent 14%"].map((c) => (
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

/* ── Section 2 — Menu Performance ─────────────────────────────────────────── */
function MenuCluster() {
  const rows = [
    { name: "Oat Latte", cost: "18%", margin: "82%", top: true },
    { name: "Cold Brew", cost: "15%", margin: "85%", top: false },
    { name: "Drip Coffee", cost: "22%", margin: "78%", top: false },
  ];
  return (
    <div>
      <p style={{ fontSize: "11px", fontWeight: 600, color: TEAL, marginBottom: "8px" }}>
        Menu Profitability
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

/* ── Section 3 — Staff Management ─────────────────────────────────────────── */
function ScheduleCluster() {
  const days = ["M", "T", "W", "T", "F"];
  // role color per staff row
  const rows = [
    { who: "Mia", color: "var(--sage)", shifts: [1, 1, 0, 1, 1] },
    { who: "Leo", color: "var(--teal)", shifts: [1, 0, 1, 1, 0] },
    { who: "Ada", color: "var(--coffee-brown-2)", shifts: [0, 1, 1, 0, 1] },
  ];
  return (
    <div>
      <p style={{ fontSize: "11px", fontWeight: 600, color: TEAL, marginBottom: "8px" }}>This Week</p>
      <div className="grid grid-cols-[28px_repeat(5,1fr)] gap-1 mb-2">
        <span />
        {days.map((d, i) => (
          <p key={i} style={{ ...labelStyle, textAlign: "center" }}>{d}</p>
        ))}
        {rows.map((r) => (
          <Row key={r.who} who={r.who} color={r.color} shifts={r.shifts} />
        ))}
      </div>
      <div className="rounded-lg px-2.5 py-1.5" style={{ background: "rgba(118,179,157,0.1)", border: "1px solid rgba(118,179,157,0.22)" }}>
        <div className="flex items-center justify-between mb-1">
          <p style={{ fontSize: "10px", fontWeight: 500, color: "var(--teal)" }}>Labor cost</p>
          <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--teal)" }}>29%</p>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(21,94,99,0.12)" }}>
          <div style={{ width: "29%", height: "100%", background: "var(--sage)" }} />
        </div>
      </div>
    </div>
  );
}

function Row({ who, color, shifts }: { who: string; color: string; shifts: number[] }) {
  return (
    <>
      <p style={{ fontSize: "10px", fontWeight: 500, color: "var(--neutral-700)", display: "flex", alignItems: "center" }}>{who}</p>
      {shifts.map((s, i) => (
        <div
          key={i}
          className="rounded"
          style={{ height: "14px", background: s ? color : "var(--warm-surface)", opacity: s ? 1 : 1 }}
        />
      ))}
    </>
  );
}

/* ── Section 4 — Customer Loyalty ─────────────────────────────────────────── */
function LoyaltyCluster() {
  const regulars = [
    { name: "Sarah K.", visits: 14 },
    { name: "Marcus T.", visits: 11 },
    { name: "Priya N.", visits: 9 },
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <p style={labelStyle}>Active members</p>
          <p style={{ fontSize: "20px", fontWeight: 700, color: TEAL, lineHeight: 1.1 }}>342</p>
        </div>
        <div className="flex items-end gap-0.5 h-7">
          {[50, 62, 58, 70, 78, 88].map((h, i) => (
            <div key={i} className="rounded-sm" style={{ width: "5px", height: `${h}%`, background: i === 5 ? "var(--sage)" : "var(--border-subtle)" }} />
          ))}
        </div>
      </div>
      <p style={{ ...labelStyle, marginBottom: "4px" }}>Top regulars this month</p>
      <div className="space-y-1">
        {regulars.map((r) => (
          <div key={r.name} className="flex items-center justify-between rounded-lg px-2.5 py-1.5" style={{ background: "var(--neutral-50)", border: "1px solid var(--warm-gray-ef)" }}>
            <p style={{ fontSize: "11px", fontWeight: 500, color: "var(--neutral-700)" }}>{r.name}</p>
            <p style={{ fontSize: "10px", fontWeight: 600, color: SAGE }}>{r.visits} visits</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Section 5 — Daily Operations ─────────────────────────────────────────── */
function OpeningCluster() {
  const tasks = [
    { label: "Unlock and disarm", done: true },
    { label: "Calibrate espresso", done: true },
    { label: "Stock pastry case", done: true },
    { label: "Count opening till", done: false },
    { label: "Flip the sign", done: false },
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p style={{ fontSize: "11px", fontWeight: 600, color: TEAL }}>Opening Checklist</p>
        <span
          className="rounded-full px-1.5 py-0.5"
          style={{ fontSize: "8px", fontWeight: 600, color: "var(--coffee-brown-4)", background: "rgba(201,138,94,0.15)" }}
        >
          Low: oat milk
        </span>
      </div>
      <div className="space-y-1 mb-2.5">
        {tasks.map((t) => (
          <div key={t.label} className="flex items-center gap-2">
            <div
              className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: t.done ? "var(--sage)" : "var(--border-subtle)" }}
            >
              {t.done && (
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </div>
            <p style={{ fontSize: "11px", color: t.done ? "var(--neutral-500)" : "var(--neutral-700)", textDecoration: t.done ? "line-through" : "none" }}>
              {t.label}
            </p>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        {["Bean Co.", "Dairy", "Baker"].map((s) => (
          <span key={s} className="rounded-md px-2 py-1" style={{ fontSize: "9px", fontWeight: 500, color: TEAL, background: "rgba(21,94,99,0.07)" }}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Section 6 — Business Growth ──────────────────────────────────────────── */
function GrowthCluster() {
  const bars = [38, 42, 40, 48, 52, 50, 58, 63, 60, 70, 76, 84];
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <p style={{ fontSize: "11px", fontWeight: 600, color: TEAL }}>Revenue Trend</p>
        <span
          className="rounded-full px-1.5 py-0.5"
          style={{ fontSize: "9px", fontWeight: 700, color: "white", background: "var(--sage)" }}
        >
          +18% YoY
        </span>
      </div>
      <div className="rounded-lg p-2.5 mb-2.5" style={{ background: "var(--neutral-50)", border: "1px solid var(--warm-gray-ef)" }}>
        <div className="flex items-end gap-0.5 h-12">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{ height: `${h}%`, background: i === bars.length - 1 ? "var(--teal)" : "var(--sage-bg-2)" }}
            />
          ))}
        </div>
        <p style={{ ...labelStyle, marginTop: "6px" }}>12-month revenue</p>
      </div>
      <div className="rounded-lg px-2.5 py-1.5 flex items-center gap-2" style={{ background: "rgba(118,179,157,0.1)", border: "1px solid rgba(118,179,157,0.22)" }}>
        <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--sage)" }}>
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p style={{ fontSize: "10px", fontWeight: 500, color: "var(--teal)" }}>3 months from your 6-month goal</p>
      </div>
    </div>
  );
}

const BENEFITS: Benefit[] = [
  {
    key: "financials",
    eyebrow: "Daily Financials",
    headline: "See Your Numbers Before You Need Them",
    oneLiner:
      "Your P&L, daily sales, and cash position, updated automatically. No accountant required.",
    ctaLabel: "Explore Daily Financials",
    ctaHref: "/login?plan=builder",
    photoSrc: pexels(4474033),
    photoAlt:
      "Coffee shop owner working across laptop and tablet to track daily business finances",
    objectPosition: "center 25%",
    photoSide: "right",
    tilt: 6,
    card: <FinancialsCluster />,
  },
  {
    key: "menu",
    eyebrow: "Menu Performance",
    headline: "Find Out What Actually Pays the Bills",
    oneLiner: "See which drinks earn the most and which ones you are better off dropping.",
    ctaLabel: "Explore Menu Analytics",
    ctaHref: "/login?plan=builder",
    photoSrc: pexels(4349948),
    photoAlt:
      "Barista creating latte art by carefully pouring steamed milk into a takeaway cup",
    objectPosition: "center",
    photoSide: "left",
    tilt: -5,
    card: <MenuCluster />,
  },
  {
    key: "staff",
    eyebrow: "Staff Management",
    headline: "Post Shifts Before Monday Morning Stress Hits",
    oneLiner:
      "Build the schedule, track hours, and see your labor cost before it hits the payroll.",
    ctaLabel: "Explore Scheduling",
    ctaHref: "/login?plan=builder",
    photoSrc: pexels(4349746),
    photoAlt:
      "Two baristas in aprons laughing together during a shift in a bright modern coffee shop",
    objectPosition: "center 30%",
    photoSide: "right",
    tilt: 7,
    card: <ScheduleCluster />,
  },
  {
    key: "loyalty",
    eyebrow: "Loyal Customers",
    headline: "Turn Today's First-Timer Into Next Week's Regular",
    oneLiner:
      "A stamp program that runs itself. No apps to download, no confusing points, just customers who come back.",
    ctaLabel: "Explore Loyalty Tools",
    ctaHref: "/login?plan=builder",
    photoSrc: pexels(4353585),
    photoAlt: "Barista handing a paper coffee cup across the counter to a customer",
    objectPosition: "center",
    photoSide: "left",
    tilt: -5,
    card: <LoyaltyCluster />,
  },
  {
    key: "operations",
    eyebrow: "Opening Checklist",
    headline: "Open Every Day Without Scrambling",
    oneLiner:
      "Your morning tasks, inventory alerts, and vendor contacts in one spot. Nothing falls through the cracks.",
    ctaLabel: "Explore Operations Tools",
    ctaHref: "/login?plan=builder",
    photoSrc: pexels(4473398),
    photoAlt:
      "Cafe owner holding a wooden 'Welcome We Are Open' sign at her shop door",
    objectPosition: "center 35%",
    photoSide: "right",
    tilt: 6,
    card: <OpeningCluster />,
  },
  {
    key: "growth",
    eyebrow: "Business Growth",
    headline: "Know When You Are Ready to Grow",
    oneLiner:
      "Real trends and simple projections so you can add a hire, open a second location, or expand the menu at the right time.",
    ctaLabel: "Explore Growth Tools",
    ctaHref: "/login?plan=builder",
    photoSrc: pexels(4350061),
    photoAlt:
      "Two cafe owners in aprons collaborating behind the counter of their coffee shop",
    objectPosition: "center 30%",
    photoSide: "left",
    tilt: -5,
    card: <GrowthCluster />,
  },
];
