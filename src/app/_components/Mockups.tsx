/**
 * Product mockup components shared between the landing page and the
 * Groundwork.AI coming-soon page (TIM-2285).
 *
 * Lifted verbatim out of src/app/page.tsx — same design vocabulary, same
 * tokens. Extracted so the coming-soon page can reuse the exact landing
 * visuals without duplicating the JSX or drifting over time.
 */

/* ── AIChatMockup ─────────────────────────────────────────────────────────── */

export function AIChatMockup() {
  const messages = [
    {
      role: "user" as const,
      text: "What startup cost should I plan for a 900 sq ft cafe in a mid-size city?",
    },
    {
      role: "assistant" as const,
      text: "For a 900 sq ft buildout in a mid-size market, I'd plan $110k–$165k all-in. Here's how I'd break it down:",
    },
    {
      role: "assistant" as const,
      list: [
        "Espresso equipment: $22–38k",
        "Renovation: $35–65k",
        "FF&E: $12–22k",
        "Working capital: $20–30k",
      ],
    },
    {
      role: "check" as const,
      text: "Your current estimate of $142k is within the healthy range for this market size.",
    },
    {
      role: "user" as const,
      text: "What should I watch out for on the renovation estimate?",
    },
  ];

  return (
    <div
      className="rounded-2xl overflow-hidden border border-neutral-200"
      style={{
        boxShadow: "0 16px 48px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200"
        style={{ background: "white" }}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(21,94,99,0.1)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div>
          <p className="font-semibold" style={{ fontSize: "13px", color: "var(--teal)" }}>
            Scout — AI Coffee Planning Assistant
          </p>
          <p style={{ color: "var(--neutral-500)", fontSize: "11px" }}>
            Specialty-specific planning support
          </p>
        </div>
        <div className="ml-auto w-2 h-2 rounded-full" style={{ background: "var(--success-text)", flexShrink: 0 }} />
      </div>

      {/* Messages */}
      <div className="p-4 space-y-3" style={{ background: "var(--neutral-50)" }}>
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "check" ? (
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                style={{
                  background: "rgba(118,179,157,0.1)",
                  border: "1px solid rgba(118,179,157,0.25)",
                }}
              >
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "var(--sage)" }}
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p style={{ fontSize: "11px", color: "var(--teal)", fontWeight: 500 }}>{msg.text}</p>
              </div>
            ) : (
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div
                    className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mr-2 mt-0.5"
                    style={{ background: "rgba(21,94,99,0.1)" }}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                )}
                <div
                  className="rounded-xl px-3 py-2 max-w-xs"
                  style={{
                    background: msg.role === "user" ? "var(--teal)" : "white",
                    borderRadius: msg.role === "user" ? "14px 14px 2px 14px" : "2px 14px 14px 14px",
                    border: msg.role === "assistant" ? "1px solid var(--border-subtle)" : "none",
                  }}
                >
                  {msg.text && (
                    <p
                      style={{
                        fontSize: "12px",
                        color: msg.role === "user" ? "rgba(255,255,255,0.92)" : "var(--neutral-800)",
                        lineHeight: 1.5,
                      }}
                    >
                      {msg.text}
                    </p>
                  )}
                  {msg.list && (
                    <ul className="space-y-1">
                      {msg.list.map((item, j) => (
                        <li key={j} className="flex gap-1.5">
                          <span style={{ color: "var(--sage)", fontSize: "11px", flexShrink: 0 }}>
                            &#10003;
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--neutral-800)", lineHeight: 1.4 }}>
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {/* Typing indicator */}
        <div className="flex justify-start">
          <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center mr-2" style={{ background: "rgba(21,94,99,0.1)" }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="rounded-xl px-3 py-2.5 flex items-center gap-1" style={{ background: "white", border: "1px solid var(--border-subtle)", borderRadius: "2px 14px 14px 14px" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--neutral-400)" }} />
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--neutral-400)" }} />
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--neutral-400)" }} />
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-neutral-200" style={{ background: "white" }}>
        <div className="flex-1 rounded-lg px-3 py-2" style={{ background: "var(--neutral-100)", fontSize: "12px", color: "var(--neutral-400)" }}>
          Ask about your plan...
        </div>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--teal)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ── FinancialsMockup ─────────────────────────────────────────────────────── */

export function FinancialsMockup() {
  return (
    <div className="p-4" style={{ background: "var(--neutral-50)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold" style={{ fontSize: "12px", color: "var(--teal)" }}>Financials</p>
        <span style={{ color: "var(--sage)", fontSize: "10px", fontWeight: 600 }}>67%</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: "Startup cost", value: "$142,500" },
          { label: "Monthly rent", value: "$4,200" },
          { label: "Break-even", value: "Month 14" },
          { label: "Year 1 revenue", value: "$328k" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg p-2.5 border" style={{ background: "white", borderColor: "var(--border-subtle)" }}>
            <p style={{ color: "var(--neutral-500)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>{s.label}</p>
            <p style={{ color: "var(--teal)", fontSize: "14px", fontWeight: 700, lineHeight: 1 }}>{s.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg px-3 py-2 mb-2 flex items-center gap-2" style={{ background: "rgba(118,179,157,0.1)", border: "1px solid rgba(118,179,157,0.2)" }}>
        <div className="w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--sage)" }}>
          <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <p style={{ color: "var(--teal)", fontSize: "10px", fontWeight: 500 }}>Startup cost within healthy range</p>
      </div>
      <div className="rounded-lg p-3" style={{ background: "white", border: "1px solid var(--border-subtle)" }}>
        <p style={{ color: "var(--neutral-500)", fontSize: "9px", marginBottom: "6px" }}>12-month projection</p>
        <div className="flex items-end gap-1 h-8">
          {[20, 35, 45, 55, 60, 68, 75, 82, 88, 90, 95, 100].map((h, i) => (
            <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: i < 6 ? "var(--border-subtle)" : "var(--sage)", opacity: i < 6 ? 0.6 : 1 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── MenuMockup ───────────────────────────────────────────────────────────── */

export function MenuMockup() {
  const items = [
    { name: "Espresso", cost: "$0.48", price: "$3.50", margin: "86%" },
    { name: "Oat Latte", cost: "$1.12", price: "$6.00", margin: "81%" },
    { name: "Cold Brew", cost: "$0.85", price: "$5.50", margin: "85%" },
    { name: "Matcha Latte", cost: "$1.45", price: "$6.50", margin: "78%" },
  ];
  return (
    <div className="p-4" style={{ background: "var(--neutral-50)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold" style={{ fontSize: "12px", color: "var(--teal)" }}>Menu Pricing</p>
        <span className="rounded px-2 py-0.5" style={{ background: "rgba(118,179,157,0.12)", color: "var(--sage)", fontSize: "10px", fontWeight: 600 }}>4 items</span>
      </div>
      <div className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="grid grid-cols-4 px-3 py-1.5" style={{ background: "var(--warm-surface)" }}>
          {["Item", "Cost", "Price", "Margin"].map((h) => (
            <p key={h} style={{ fontSize: "9px", color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</p>
          ))}
        </div>
        {items.map((item, i) => (
          <div key={item.name} className="grid grid-cols-4 px-3 py-2" style={{ background: "white", borderTop: i > 0 ? "1px solid var(--warm-surface)" : "none" }}>
            <p style={{ fontSize: "11px", color: "var(--teal)", fontWeight: 500 }}>{item.name}</p>
            <p style={{ fontSize: "11px", color: "var(--neutral-500)" }}>{item.cost}</p>
            <p style={{ fontSize: "11px", color: "var(--neutral-700)" }}>{item.price}</p>
            <p style={{ fontSize: "11px", color: "var(--sage)", fontWeight: 600 }}>{item.margin}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── BusinessPlanExportMockup ─────────────────────────────────────────────── */

export function BusinessPlanExportMockup() {
  const variants = [
    { label: "Bank", note: "Lender package", accent: "teal" as const },
    { label: "Investor", note: "Pitch-ready deck", accent: "sage" as const },
    { label: "Internal", note: "Operating doc", accent: "teal" as const },
    { label: "Printable", note: "Board copy", accent: "sage" as const },
  ];
  return (
    <div className="p-4" style={{ background: "var(--neutral-50)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold" style={{ fontSize: "12px", color: "var(--teal)" }}>Business Plan Export</p>
        <span className="rounded px-2 py-0.5" style={{ background: "rgba(118,179,157,0.12)", color: "var(--sage)", fontSize: "10px", fontWeight: 600 }}>PDF</span>
      </div>
      <div className="rounded-lg p-3 mb-2" style={{ background: "white", border: "1px solid var(--border-subtle)" }}>
        <p style={{ color: "var(--neutral-500)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>Pulled from your plan</p>
        <div className="grid grid-cols-2 gap-1.5">
          {["Concept", "Lease", "Menu", "Equipment", "Hiring", "Launch"].map((m) => (
            <div key={m} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "var(--sage)" }}>
                <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <p style={{ fontSize: "10px", color: "var(--teal)", fontWeight: 500 }}>{m}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {variants.map((v) => (
          <div
            key={v.label}
            className="rounded-lg px-3 py-2 flex items-center justify-between"
            style={{ background: "white", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: v.accent === "sage" ? "rgba(118,179,157,0.14)" : "rgba(21,94,99,0.08)" }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={v.accent === "sage" ? "var(--sage)" : "var(--teal)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div>
                <p style={{ fontSize: "11px", color: "var(--teal)", fontWeight: 600, lineHeight: 1.2 }}>{v.label}</p>
                <p style={{ fontSize: "9px", color: "var(--neutral-500)", lineHeight: 1.2 }}>{v.note}</p>
              </div>
            </div>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--neutral-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── LaunchMockup ─────────────────────────────────────────────────────────── */

export function LaunchMockup() {
  const milestones = [
    { label: "Lease signed", done: true, date: "Mar 1" },
    { label: "Permits filed", done: true, date: "Mar 15" },
    { label: "Equipment ordered", done: true, date: "Apr 1" },
    { label: "Staff hired", done: false, date: "May 1", next: true },
    { label: "Soft open", done: false, date: "Jun 1" },
    { label: "Grand opening", done: false, date: "Jun 15" },
  ];
  return (
    <div className="p-4" style={{ background: "var(--neutral-50)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold" style={{ fontSize: "12px", color: "var(--teal)" }}>Launch Plan</p>
        <span style={{ color: "var(--sage)", fontSize: "10px", fontWeight: 600 }}>3 of 6 done</span>
      </div>
      <div className="space-y-1.5">
        {milestones.map((m) => (
          <div
            key={m.label}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2"
            style={{
              background: m.next ? "rgba(118,179,157,0.08)" : "white",
              border: m.next ? "1px solid rgba(118,179,157,0.25)" : "1px solid var(--warm-surface)",
            }}
          >
            <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: m.done ? "var(--sage)" : "var(--border-subtle)" }}>
              {m.done && (
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              )}
            </div>
            <p style={{ fontSize: "11px", color: m.done ? "var(--neutral-500)" : m.next ? "var(--teal)" : "var(--neutral-700)", textDecoration: m.done ? "line-through" : "none", flex: 1, fontWeight: m.next ? 600 : 400 }}>
              {m.label}
              {m.next && <span style={{ color: "var(--sage)", fontSize: "10px", fontWeight: 500, marginLeft: "4px" }}>← next</span>}
            </p>
            <p style={{ fontSize: "10px", color: "var(--neutral-400)", flexShrink: 0 }}>{m.date}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
