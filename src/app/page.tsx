import Link from "next/link";

const MODULES = [
  { num: 1, title: "Concept & Positioning", desc: "Figure out what kind of shop you're building and what makes it different." },
  { num: 2, title: "Financial Modeling", desc: "Build your numbers so you know what it takes to be profitable." },
  { num: 3, title: "Site Selection & Lease", desc: "Learn what to look for in a location and how to negotiate a lease." },
  { num: 4, title: "Menu Design & Sourcing", desc: "Design a menu that works and find the right coffee partner." },
  { num: 5, title: "Bar Design & Equipment", desc: "Plan your bar layout and choose the right gear for your model." },
  { num: 6, title: "Hiring, Training & Culture", desc: "Build a team that can run the shop the way it needs to be run." },
  { num: 7, title: "Pre-Opening Marketing", desc: "Get people lined up before your doors even open." },
  { num: 8, title: "BRD Assembly & Long-Term Ops", desc: "Bring everything together into your complete Business Readiness Document." },
];

const PRICING = [
  {
    name: "Free",
    price: "$0",
    period: "",
    description: "Get started and see if this is for you.",
    features: [
      "Complete onboarding questionnaire",
      "Access your dashboard with all 8 modules",
      "Preview Module 1 content",
      "No AI coaching",
    ],
    cta: "Start for free",
    href: "/login",
    highlight: false,
  },
  {
    name: "Builder",
    price: "$49",
    period: "/month",
    annualNote: "$39/mo billed annually",
    description: "Everything you need to build your plan.",
    features: [
      "Full access to all 8 modules",
      "All deliverable generation (concept brief, financial model, BRD)",
      "50 AI coaching credits per month",
      "Export everything as PDF",
      "Equipment list builder",
      "Financial model calculator",
      "Progress tracking & milestones",
      "Email support",
    ],
    cta: "Start building",
    href: "/login?plan=starter",
    highlight: true,
  },
  {
    name: "Accelerator",
    price: "$99",
    period: "/month",
    annualNote: "$79/mo billed annually",
    description: "For serious owners who want to move fast.",
    features: [
      "Everything in Builder",
      "Unlimited AI coaching",
      "Weekly async Q&A with Trent",
      "Financial model stress-testing",
      "Equipment sourcing assistance",
      "Roaster matching recommendations",
      "30-min 1-on-1 call with Trent at BRD completion",
      "Priority support",
    ],
    cta: "Get accelerated",
    href: "/login?plan=pro",
    highlight: false,
  },
];

const FAQS = [
  {
    q: "Is this just a chatbot?",
    a: "No. The AI coach is one part of a structured 8-module planning system. You're building a real document. The Business Readiness Document reflects your specific concept, location, budget, and timeline. The AI reads everything you've built and responds to your actual plan, not a generic question.",
  },
  {
    q: "Can I really plan a coffee shop without a consultant?",
    a: "This platform was built by someone who has hired consultants and opened shops without them. A good consultant costs $150-300/hour and you'd need 20+ hours to cover what this platform covers. The methodology here is the same. The price isn't.",
  },
  {
    q: "What if I already have a business plan?",
    a: "A business plan written for a bank is different from a Business Readiness Document written for you. This platform helps you stress-test your assumptions, find gaps you haven't thought of, and get coffee-specific feedback. Most people who come in with existing plans leave with a much better one.",
  },
  {
    q: "Can I use this on my phone?",
    a: "Yes. The platform is fully mobile-responsive. Many users plan on their phones during commutes, breaks, or late nights after their shift. We tested every screen at 375px and 390px viewports.",
  },
  {
    q: "What happens if I cancel?",
    a: "Your plan stays in your account on the free tier. You can always come back and pick up where you left off. You won't lose anything you've built.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white border-b border-[#efefef] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#155e63] rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span className="font-semibold text-[#155e63] text-sm hidden sm:block">Timberline Coffee School</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/pricing" className="text-sm text-[#afafaf] hover:text-[#1a1a1a] transition-colors hidden sm:block">
              Pricing
            </Link>
            <Link href="/login" className="text-sm text-[#155e63] font-medium hover:underline">
              Sign in
            </Link>
            <Link
              href="/login"
              className="text-sm bg-[#155e63] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#0e4448] transition-colors"
            >
              Start planning
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-[#faf9f7] px-6 py-20 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-block bg-[#155e63]/10 text-[#155e63] text-xs font-semibold px-3 py-1 rounded-full mb-6 uppercase tracking-wide">
            Coffee Shop Planning Platform
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#1a1a1a] leading-tight mb-6">
            You have a vision for your coffee shop.{" "}
            <span className="text-[#155e63]">We&apos;ll help you build the plan to make it real.</span>
          </h1>
          <p className="text-lg text-[#afafaf] mb-8 max-w-2xl mx-auto leading-relaxed">
            An AI-powered planning platform built by a World Coffee Championships judge who has opened and closed his own shops. Everything he teaches in Coffee Shop Basecamp, available to you 24/7.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="bg-[#155e63] text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-[#0e4448] transition-colors"
            >
              Start planning for free &rarr;
            </Link>
            <Link
              href="#how-it-works"
              className="border border-[#efefef] text-[#1a1a1a] px-8 py-4 rounded-xl font-semibold text-lg hover:border-[#afafaf] transition-colors bg-white"
            >
              See how it works
            </Link>
          </div>
          <p className="text-sm text-[#afafaf] mt-4">Free to start. No credit card required.</p>
        </div>
      </section>

      {/* Problem */}
      <section className="bg-white px-6 py-16">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xl text-[#1a1a1a] leading-relaxed font-light">
            Opening a coffee shop without a plan is like{" "}
            <strong className="font-semibold">pulling espresso without a recipe</strong>.
            Most new coffee shops fail in the first two years, not because the coffee was bad,
            but because the planning was.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-[#faf9f7] px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4 text-[#1a1a1a]">How it works</h2>
          <p className="text-center text-[#afafaf] mb-12 max-w-xl mx-auto">
            Three steps from &ldquo;I have an idea&rdquo; to &ldquo;I&apos;m ready to open.&rdquo;
          </p>
          <div className="grid sm:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Tell us about your vision", desc: "A quick onboarding questionnaire captures your concept, budget, location, and timeline so your AI coach knows where you're starting from." },
              { step: "02", title: "Work through 8 guided modules", desc: "Each module combines concise lessons, interactive exercises, and an AI coach that references your actual plan, not generic advice." },
              { step: "03", title: "Open your doors with a real plan", desc: "You walk away with a complete Business Readiness Document: concept brief, financial model, equipment list, and 90-day operations plan." },
            ].map((item) => (
              <div key={item.step} className="bg-white rounded-2xl p-8 border border-[#efefef]">
                <div className="text-4xl font-bold text-[#155e63]/20 mb-4">{item.step}</div>
                <h3 className="font-semibold text-lg mb-3 text-[#1a1a1a]">{item.title}</h3>
                <p className="text-[#afafaf] leading-relaxed text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Module Preview */}
      <section className="bg-white px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4 text-[#1a1a1a]">What you&apos;ll build</h2>
          <p className="text-center text-[#afafaf] mb-12 max-w-xl mx-auto">
            8 modules. 8 deliverables. One complete plan for opening your coffee shop.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MODULES.map((m) => (
              <div key={m.num} className="bg-[#faf9f7] rounded-xl p-5 border border-[#efefef]">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-[#155e63] text-white rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {m.num}
                  </div>
                  <h3 className="font-semibold text-sm text-[#1a1a1a] leading-tight">{m.title}</h3>
                </div>
                <p className="text-xs text-[#afafaf] leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Coach Demo */}
      <section className="bg-[#155e63] px-6 py-20 text-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">Your AI coach isn&apos;t a chatbot</h2>
          <p className="text-center text-[#76b39d] mb-12 max-w-xl mx-auto">
            It reads your plan, challenges your assumptions, and gives you real coffee-industry feedback.
          </p>
          <div className="bg-[#0e4448] rounded-2xl p-6 sm:p-8 max-w-2xl mx-auto">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-[#76b39d] rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-[#155e63]">M</div>
                <div className="bg-white/10 rounded-2xl rounded-tl-none px-4 py-3 text-sm text-white/80 max-w-xs">
                  My target customer is anyone who likes good coffee.
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <div className="bg-[#76b39d] rounded-2xl rounded-tr-none px-4 py-3 text-sm text-[#155e63] max-w-sm">
                  <p className="mb-2">That&apos;s a starting point, but &ldquo;anyone who likes good coffee&rdquo; is basically the entire adult population of your city.</p>
                  <p className="mb-2">Think about it this way: who is the ONE person you&apos;d design this whole shop for? Are they a remote worker who needs 4 hours of space? A parent grabbing a quick latte on the school run? A coffee nerd who wants to talk about processing methods?</p>
                  <p>Try filling in: <em>&ldquo;My shop exists for _____ who need _____ and can&apos;t currently get it at _____.&rdquo;</em></p>
                </div>
                <div className="w-8 h-8 bg-[#155e63] border border-[#76b39d] rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-[#76b39d]">AI</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Deliverables */}
      <section className="bg-white px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4 text-[#1a1a1a]">What you walk away with</h2>
          <p className="text-center text-[#afafaf] mb-12 max-w-xl mx-auto">
            Every module produces a real document. By the end, you have a complete Business Readiness Document.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                  </svg>
                ),
                title: "Concept Brief",
                desc: "Your shop's identity, target customer, differentiator, and brand voice. It fits on one page.",
                tags: ["Vision", "Positioning", "Brand"],
              },
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>
                  </svg>
                ),
                title: "Financial Model",
                desc: "Build-out costs, revenue projections, break-even analysis, and 3-year P&L, all editable.",
                tags: ["Revenue", "Costs", "Break-even"],
              },
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                  </svg>
                ),
                title: "Equipment List",
                desc: "A complete, spec'd equipment list with sourcing notes and estimated costs for your specific model.",
                tags: ["Bar setup", "Pricing", "Sourcing"],
              },
              {
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                ),
                title: "Business Readiness Document",
                desc: "All 8 modules compiled into one comprehensive document: your opening playbook.",
                tags: ["Operations", "Hiring", "Marketing"],
              },
            ].map((d) => (
              <div key={d.title} className="bg-[#faf9f7] rounded-2xl p-6 border border-[#efefef] flex flex-col">
                <div className="mb-4 text-[#155e63]">{d.icon}</div>
                <h3 className="font-semibold text-[#1a1a1a] mb-2">{d.title}</h3>
                <p className="text-sm text-[#afafaf] leading-relaxed mb-4 flex-1">{d.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {d.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-[#155e63]/10 text-[#155e63] px-2 py-1 rounded-full font-medium">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-[#faf9f7] px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4 text-[#1a1a1a]">Simple pricing</h2>
          <p className="text-center text-[#afafaf] mb-12 max-w-xl mx-auto">
            Start free. Upgrade when you&apos;re ready to go deep.
          </p>
          <div className="grid sm:grid-cols-3 gap-6">
            {PRICING.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 border flex flex-col ${
                  plan.highlight
                    ? "bg-[#155e63] text-white border-[#155e63]"
                    : "bg-white text-[#1a1a1a] border-[#efefef]"
                }`}
              >
                <div className="mb-6">
                  <h3 className={`font-bold text-lg mb-1 ${plan.highlight ? "text-white" : "text-[#1a1a1a]"}`}>
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    {plan.period && <span className={`text-sm ${plan.highlight ? "text-[#76b39d]" : "text-[#afafaf]"}`}>{plan.period}</span>}
                  </div>
                  {plan.annualNote && (
                    <p className={`text-xs ${plan.highlight ? "text-[#76b39d]" : "text-[#afafaf]"}`}>{plan.annualNote}</p>
                  )}
                  <p className={`text-sm mt-2 ${plan.highlight ? "text-[#76b39d]" : "text-[#afafaf]"}`}>{plan.description}</p>
                </div>
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2 text-sm">
                      <span className={`flex-shrink-0 mt-0.5 ${plan.highlight ? "text-[#76b39d]" : "text-[#155e63]"}`}>&#10003;</span>
                      <span className={plan.highlight ? "text-white/80" : "text-[#1a1a1a]"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`text-center py-3 rounded-xl font-semibold text-sm transition-colors ${
                    plan.highlight
                      ? "bg-white text-[#155e63] hover:bg-[#faf9f7]"
                      : "bg-[#155e63] text-white hover:bg-[#0e4448]"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trent credibility */}
      <section className="bg-white px-6 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <div className="w-20 h-20 bg-[#155e63]/10 rounded-full mx-auto mb-6 flex items-center justify-center">
            <span className="text-3xl">&#9749;</span>
          </div>
          <h2 className="text-2xl font-bold mb-4 text-[#1a1a1a]">Built by someone who&apos;s been there</h2>
          <p className="text-[#afafaf] leading-relaxed mb-6">
            Trent Rollings is a World Coffee Championships judge, SCA Authorized Specialty Trainer, and the founder of Timberline Coffee School. He&apos;s spent years teaching the Coffee Shop Basecamp curriculum to aspiring café owners and has personally opened and closed coffee businesses.
          </p>
          <p className="text-[#afafaf] leading-relaxed">
            This platform is everything he teaches in live cohorts: the frameworks, the honest advice, the hard numbers, available to you 24 hours a day, at a fraction of the cost of a consultant.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-[#faf9f7] px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12 text-[#1a1a1a]">Common questions</h2>
          <div className="space-y-6">
            {FAQS.map((faq) => (
              <div key={faq.q} className="bg-white rounded-xl p-6 border border-[#efefef]">
                <h3 className="font-semibold text-[#1a1a1a] mb-3">{faq.q}</h3>
                <p className="text-[#afafaf] text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[#155e63] px-6 py-20 text-center text-white">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold mb-4">Your coffee shop is waiting.</h2>
          <p className="text-[#76b39d] mb-8 text-lg">Start planning today. It&apos;s free. No credit card required.</p>
          <Link
            href="/login"
            className="inline-block bg-white text-[#155e63] px-10 py-4 rounded-xl font-bold text-lg hover:bg-[#faf9f7] transition-colors"
          >
            Let&apos;s do this &rarr;
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1a1a1a] text-[#afafaf] px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[#155e63] rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
            <span>Timberline Coffee School</span>
          </div>
          <div className="flex gap-6 flex-wrap justify-center">
            <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link href="/login" className="hover:text-white transition-colors">Sign in</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <a href="mailto:hello@timberline.coffee" className="hover:text-white transition-colors">Contact</a>
          </div>
          <p>&#169; {new Date().getFullYear()} Timberline Coffee School</p>
        </div>
      </footer>
    </main>
  );
}
