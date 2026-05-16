"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { BottomTabBar } from "@/components/bottom-tab-bar";
import { UpgradeGate } from "@/components/upgrade-gate";
import { PaywallModal } from "@/components/paywall-modal";
import { usePaywallGuard } from "@/lib/use-paywall-guard";
import { canAccessSection } from "@/lib/access";

// ── Types ──────────────────────────────────────────────────────────────────

interface UserProfile {
  full_name: string | null;
  onboarding_data: Record<string, unknown>;
  ai_credits_remaining: number;
  subscription_tier: string;
}

interface SectionResponse {
  response_data: Record<string, unknown>;
  status: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ModuleClientProps {
  moduleNumber: number;
  planId: string;
  planName: string;
  userProfile: UserProfile;
  initialResponses: Record<string, SectionResponse>;
  initialConversations: Record<string, ChatMessage[]>;
  // True when the user is on a free preview and only the first section is
  // fully accessible. Everything else renders an UpgradeGate.
  freePreview?: boolean;
}

// ── Module Section Definitions ────────────────────────────────────────────

const MODULE_TITLES: Record<number, string> = {
  1: "Concept & Positioning",
  2: "Financial Modeling",
  3: "Site Selection & Lease",
  4: "Menu Design & Sourcing",
  5: "Bar Design & Equipment",
  6: "Hiring, Training & Culture",
  7: "Pre-Opening Marketing",
  8: "BRD Assembly & Long-Term Ops",
};

const MODULE_1_SECTIONS = [
  { key: "shop_type", title: "Shop Model", requiredFields: ["model", "size", "seating", "food_level", "service_style"] },
  { key: "your_why", title: "Your Why", requiredFields: ["motivation", "customer_experience", "line_in_sand"] },
  { key: "target_customer", title: "Who are you making coffee for?", requiredFields: ["age_range", "occupation", "income", "coffee_habits", "values"] },
  { key: "competitive_analysis", title: "What's already out there?", requiredFields: ["competitors"] },
  { key: "concept_brief", title: "Concept Brief", requiredFields: ["brief_content"] },
];

const SECTION_1_CONTEXT: Record<string, string> = {
  shop_type: "What kind of shop are you building? This shapes every financial number ahead.",
  your_why: "Your reason is the test for every decision later. The clearer it is, the easier the hard calls get.",
  target_customer: "Knowing exactly who you're serving makes menu, pricing, and location decisions obvious instead of guesses.",
  competitive_analysis: "Knowing who's already out there helps you find the gap. Just add 2–3 spots you'd compete with.",
};

const MODULE_2_SECTIONS = [
  { key: "startup_costs", title: "Startup Budget", requiredFields: ["equipment_budget", "buildout_budget", "licensing_budget", "initial_inventory", "working_capital"] },
  { key: "revenue_projections", title: "Revenue Projections", requiredFields: ["avg_ticket", "daily_transactions", "days_per_week"] },
  { key: "monthly_expenses", title: "Monthly Expenses", requiredFields: ["rent", "labor_cost", "cogs_percentage"] },
  { key: "pricing_strategy", title: "Pricing Strategy", requiredFields: ["espresso_price", "drip_price", "specialty_price"] },
  { key: "financial_summary", title: "Financial Summary", requiredFields: ["summary_notes"] },
];

function getSectionsForModule(moduleNumber: number) {
  if (moduleNumber === 1) return MODULE_1_SECTIONS;
  if (moduleNumber === 2) return MODULE_2_SECTIONS;
  // The /plan/[moduleNumber] page guards on isModuleAvailable() and redirects
  // unknown modules to /dashboard, so this branch should be unreachable in
  // normal flows. Throw explicitly instead of silently rendering Module 1
  // content under another module's label (TIM-543).
  throw new Error(`Module ${moduleNumber} has no sections defined`);
}

const SHOP_MODELS = [
  { id: "full_cafe", label: "Full Café", desc: "Espresso, food, seating (the full experience)", costRange: "$150K–$400K", example: "Blue Bottle, local neighborhood café" },
  { id: "espresso_bar", label: "Espresso Bar", desc: "Drinks only, fast, minimal footprint", costRange: "$80K–$200K", example: "% Arabica, Onyx Coffee Lab" },
  { id: "roastery_cafe", label: "Roastery Café", desc: "Roasting on-site, premium experience, wholesale revenue", costRange: "$200K–$600K", example: "Stumptown, Heart Coffee" },
  { id: "drive_through", label: "Drive-Through / Kiosk", desc: "High volume, low overhead, location-dependent", costRange: "$50K–$150K", example: "Dutch Bros model, airport kiosks" },
  { id: "mobile_popup", label: "Mobile / Pop-Up", desc: "Lowest barrier to entry, builds community", costRange: "$20K–$80K", example: "Farmers market cart, office pop-ups" },
  { id: "specialty_bar", label: "Specialty Bar", desc: "Single origin focus, pour-over, education-forward", costRange: "$100K–$250K", example: "Intelligentsia, George Howell" },
];

// ── Auto-save hook ────────────────────────────────────────────────────────

function useAutoSave(planId: string, moduleNumber: number, sectionKey: string) {
  const supabase = createClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    (data: Record<string, unknown>, status: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        await supabase.from("module_responses").upsert(
          { plan_id: planId, module_number: moduleNumber, section_key: sectionKey, response_data: data, status },
          { onConflict: "plan_id,module_number,section_key" }
        );
      }, 800);
    },
    [planId, moduleNumber, sectionKey, supabase]
  );

  return save;
}

// ── Section components ────────────────────────────────────────────────────

function SectionShopType({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const model = (data.model as string) ?? "";
  const selectedModel = SHOP_MODELS.find((m) => m.id === model);

  return (
    <div className="space-y-8">
      <p className="text-sm italic text-[#afafaf] leading-relaxed">{SECTION_1_CONTEXT.shop_type}</p>
      {/* Learn */}
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">The 6 Shop Models</h3>
        <p className="text-sm text-[#afafaf] mb-5 leading-relaxed">
          Your shop model shapes every decision that follows: staffing, equipment, lease requirements, and your daily rhythm. Choose based on your budget, lifestyle, and the gap you&apos;ve identified, not just what sounds exciting.
        </p>
        <div className="grid gap-3">
          {SHOP_MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => onChange({ ...data, model: m.id })}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                model === m.id
                  ? "border-[#155e63] bg-[#155e63]/5"
                  : "border-[#efefef] bg-white hover:border-[#afafaf]"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className={`font-semibold text-sm mb-1 ${model === m.id ? "text-[#155e63]" : "text-[#1a1a1a]"}`}>
                    {m.label}
                  </div>
                  <div className="text-xs text-[#afafaf] mb-1">{m.desc}</div>
                  <div className="text-xs text-[#afafaf] italic">{m.example}</div>
                </div>
                <div className="flex-shrink-0 text-xs font-medium text-[#155e63] bg-[#155e63]/10 px-2 py-1 rounded-lg whitespace-nowrap">
                  {m.costRange}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Build — only shows after model is selected */}
      {model && (
        <div className="border-t border-[#efefef] pt-6 space-y-5">
          <div>
            <p className="text-sm font-medium text-[#1a1a1a] mb-1">
              You&apos;ve selected: <span className="text-[#155e63]">{selectedModel?.label}</span>
            </p>
            <p className="text-xs text-[#afafaf]">Answer a few follow-up questions to sharpen your concept.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Square footage / size</label>
            <div className="grid grid-cols-2 gap-2">
              {["Under 500 sq ft", "500–1,000 sq ft", "1,000–2,000 sq ft", "Over 2,000 sq ft"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => onChange({ ...data, size: opt })}
                  className={`text-sm px-4 py-2.5 rounded-xl border transition-colors ${
                    data.size === opt
                      ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                      : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Seating capacity</label>
            <div className="grid grid-cols-2 gap-2">
              {["None (grab & go)", "1–12 seats", "13–30 seats", "30+ seats"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => onChange({ ...data, seating: opt })}
                  className={`text-sm px-4 py-2.5 rounded-xl border transition-colors ${
                    data.seating === opt
                      ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                      : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Food service level</label>
            <div className="grid grid-cols-1 gap-2">
              {["No food", "Pastries and grab-and-go only", "Light kitchen (sandwiches, salads)", "Full food menu"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => onChange({ ...data, food_level: opt })}
                  className={`text-left text-sm px-4 py-2.5 rounded-xl border transition-colors ${
                    data.food_level === opt
                      ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                      : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Service style</label>
            <div className="grid grid-cols-1 gap-2">
              {["Counter service only", "Counter + table service", "Table service only", "Grab & go / window service"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => onChange({ ...data, service_style: opt })}
                  className={`text-left text-sm px-4 py-2.5 rounded-xl border transition-colors ${
                    data.service_style === opt
                      ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                      : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionYourWhy({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-8">
      <p className="text-sm italic text-[#afafaf] leading-relaxed">{SECTION_1_CONTEXT.your_why}</p>
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">Why Motivation Matters</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed mb-4">
          Your &quot;why&quot; isn&apos;t just a feel-good exercise. It shapes how you hire, what you put on the menu, who you serve, and how you behave on the hardest days. Successful operators who make it through year two almost always have a clear, specific answer to this. Vague reasons produce vague concepts.
        </p>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          The three prompts below will become the foundation of your positioning statement in Section 5. Answer them as if you&apos;re talking to someone who&apos;s genuinely curious, not a business plan reviewer.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-[#1a1a1a] mb-1">
            What&apos;s pulling you toward this?
          </label>
          <p className="text-xs text-[#afafaf] mb-2">Not what you think sounds good. What&apos;s actually driving you.</p>
          <textarea
            value={(data.motivation as string) ?? ""}
            onChange={(e) => onChange({ ...data, motivation: e.target.value })}
            rows={4}
            placeholder="I've been a barista for six years and I watch the regulars..."
            className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63] transition-colors resize-none bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1a1a1a] mb-1">
            What experience do you want customers to have?
          </label>
          <p className="text-xs text-[#afafaf] mb-2">Describe the feeling, not the features. What do they say when they tell a friend about you?</p>
          <textarea
            value={(data.customer_experience as string) ?? ""}
            onChange={(e) => onChange({ ...data, customer_experience: e.target.value })}
            rows={4}
            placeholder="I want people to feel like they've found their spot. Like the barista knows their name and their order..."
            className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63] transition-colors resize-none bg-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1a1a1a] mb-1">
            What&apos;s your line in the sand?
          </label>
          <p className="text-xs text-[#afafaf] mb-2">What would you never compromise on, even if it cost you customers?</p>
          <textarea
            value={(data.line_in_sand as string) ?? ""}
            onChange={(e) => onChange({ ...data, line_in_sand: e.target.value })}
            rows={4}
            placeholder="I will never serve pre-ground coffee or use flavored syrups with artificial ingredients..."
            className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63] transition-colors resize-none bg-white"
          />
        </div>
      </div>
    </div>
  );
}

function SectionTargetCustomer({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-8">
      <p className="text-sm italic text-[#afafaf] leading-relaxed">{SECTION_1_CONTEXT.target_customer}</p>
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">Your Customer Is Not &quot;Everyone Who Likes Coffee&quot;</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed mb-4">
          The most common mistake in coffee shop planning is designing for everyone. When you try to serve everyone, you end up resonating with no one. Shops that win have a clear, specific customer in mind, and every decision runs through that filter.
        </p>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          Build your primary customer persona here. You&apos;re not excluding everyone else; you&apos;re anchoring your decisions to someone real. Your coach will create a vivid paragraph from your answers and challenge you on blind spots.
        </p>
      </div>

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Age range</label>
            <div className="grid gap-2">
              {["18–25", "26–35", "36–50", "50+", "Mixed"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => onChange({ ...data, age_range: opt })}
                  className={`text-sm px-4 py-2 rounded-xl border transition-colors text-left ${
                    data.age_range === opt
                      ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                      : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Income level</label>
            <div className="grid gap-2">
              {["Budget-conscious", "Middle income", "Upper-middle", "High income", "Mixed"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => onChange({ ...data, income: opt })}
                  className={`text-sm px-4 py-2 rounded-xl border transition-colors text-left ${
                    data.income === opt
                      ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                      : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Occupation / lifestyle</label>
          <div className="grid grid-cols-2 gap-2">
            {["Remote workers / freelancers", "Students", "Office professionals", "Parents / families", "Hospitality workers", "Creatives / artists", "Fitness / wellness crowd", "Local regulars / retirees"].map((opt) => {
              const current = (data.occupation as string[]) ?? [];
              const selected = current.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => {
                    const updated = selected ? current.filter((v) => v !== opt) : [...current, opt];
                    onChange({ ...data, occupation: updated });
                  }}
                  className={`text-left text-sm px-3 py-2 rounded-xl border transition-colors flex items-center gap-2 ${
                    selected
                      ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                      : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${selected ? "bg-[#155e63] border-[#155e63]" : "border-[#afafaf]"}`}>
                    {selected && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <span className="text-xs">{opt}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1a1a1a] mb-2">Coffee habits</label>
          <div className="grid grid-cols-1 gap-2">
            {["Daily drinker, creature of habit", "Occasional: treats coffee as a treat", "Coffee-curious, interested in origin and craft", "Specialty-focused, knows what they want", "On-the-go, speed matters most"].map((opt) => (
              <button
                key={opt}
                onClick={() => onChange({ ...data, coffee_habits: opt })}
                className={`text-left text-sm px-4 py-2.5 rounded-xl border transition-colors ${
                  data.coffee_habits === opt
                    ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                    : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1a1a1a] mb-2">What they value most</label>
          <div className="grid grid-cols-2 gap-2">
            {["Quality above all", "Convenience and speed", "Community and connection", "Sustainability and ethics", "Value for money", "Atmosphere and aesthetics", "Discovery and novelty", "Consistency and reliability"].map((opt) => {
              const current = (data.values as string[]) ?? [];
              const selected = current.includes(opt);
              return (
                <button
                  key={opt}
                  onClick={() => {
                    const updated = selected ? current.filter((v) => v !== opt) : [...current, opt];
                    onChange({ ...data, values: updated });
                  }}
                  className={`text-left text-sm px-3 py-2 rounded-xl border transition-colors flex items-center gap-2 ${
                    selected
                      ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                      : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${selected ? "bg-[#155e63] border-[#155e63]" : "border-[#afafaf]"}`}>
                    {selected && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <span className="text-xs">{opt}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

interface Competitor {
  name: string;
  location: string;
  strengths: string;
  weaknesses: string;
  price_range: string;
  vibe: string;
}

function SectionCompetitiveAnalysis({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const competitors: Competitor[] = (data.competitors as Competitor[]) ?? [];

  function addCompetitor() {
    const newList = [...competitors, { name: "", location: "", strengths: "", weaknesses: "", price_range: "", vibe: "" }];
    onChange({ ...data, competitors: newList });
  }

  function updateCompetitor(index: number, field: keyof Competitor, value: string) {
    const updated = competitors.map((c, i) => (i === index ? { ...c, [field]: value } : c));
    onChange({ ...data, competitors: updated });
  }

  function removeCompetitor(index: number) {
    const updated = competitors.filter((_, i) => i !== index);
    onChange({ ...data, competitors: updated });
  }

  return (
    <div className="space-y-8">
      <p className="text-sm italic text-[#afafaf] leading-relaxed">{SECTION_1_CONTEXT.competitive_analysis}</p>
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">Know What Exists to Find the Gap</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed mb-4">
          You don&apos;t need to be different from everyone; you need to be different from the places that will compete for the same customers and occasions. Map your real competitors: the places your target customer would go instead of you.
        </p>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          Add 3–5 competitors. Your coach will identify patterns and gaps once you&apos;ve filled these in.
        </p>
      </div>

      <div className="space-y-4">
        {competitors.map((comp, i) => (
          <div key={i} className="bg-white border border-[#efefef] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#1a1a1a]">Competitor {i + 1}</span>
              {competitors.length > 1 && (
                <button
                  onClick={() => removeCompetitor(i)}
                  className="text-xs text-[#afafaf] hover:text-red-500 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#afafaf] mb-1">Name</label>
                <input
                  type="text"
                  value={comp.name}
                  onChange={(e) => updateCompetitor(i, "name", e.target.value)}
                  placeholder="Blue Star Coffee"
                  className="w-full border border-[#efefef] rounded-lg px-3 py-2 text-sm text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-[#afafaf] mb-1">Location / area</label>
                <input
                  type="text"
                  value={comp.location}
                  onChange={(e) => updateCompetitor(i, "location", e.target.value)}
                  placeholder="Downtown, 2 blocks away"
                  className="w-full border border-[#efefef] rounded-lg px-3 py-2 text-sm text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63] transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#afafaf] mb-1">Strengths</label>
                <textarea
                  value={comp.strengths}
                  onChange={(e) => updateCompetitor(i, "strengths", e.target.value)}
                  rows={2}
                  placeholder="Great location, loyal regulars, strong brand..."
                  className="w-full border border-[#efefef] rounded-lg px-3 py-2 text-sm text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63] transition-colors resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-[#afafaf] mb-1">Weaknesses</label>
                <textarea
                  value={comp.weaknesses}
                  onChange={(e) => updateCompetitor(i, "weaknesses", e.target.value)}
                  rows={2}
                  placeholder="Long wait times, inconsistent quality..."
                  className="w-full border border-[#efefef] rounded-lg px-3 py-2 text-sm text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63] transition-colors resize-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#afafaf] mb-1">Price range</label>
                <div className="grid grid-cols-4 gap-1">
                  {["$", "$$", "$$$", "$$$$"].map((p) => (
                    <button
                      key={p}
                      onClick={() => updateCompetitor(i, "price_range", p)}
                      className={`py-1.5 text-sm rounded-lg border transition-colors ${
                        comp.price_range === p
                          ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                          : "border-[#efefef] text-[#afafaf] hover:border-[#afafaf]"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#afafaf] mb-1">Vibe / feel</label>
                <input
                  type="text"
                  value={comp.vibe}
                  onChange={(e) => updateCompetitor(i, "vibe", e.target.value)}
                  placeholder="Hip, fast-paced, Instagram-friendly..."
                  className="w-full border border-[#efefef] rounded-lg px-3 py-2 text-sm text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63] transition-colors"
                />
              </div>
            </div>
          </div>
        ))}

        {competitors.length < 5 && (
          <button
            onClick={addCompetitor}
            className="w-full py-3 border border-dashed border-[#afafaf] rounded-xl text-sm text-[#afafaf] hover:border-[#155e63] hover:text-[#155e63] transition-colors"
          >
            + Add competitor {competitors.length === 0 ? "(add at least 3)" : `(${5 - competitors.length} more possible)`}
          </button>
        )}
      </div>
    </div>
  );
}

function SectionConceptBrief({
  data,
  onChange,
  allData,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
  allData: Record<string, Record<string, unknown>>;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const shopTypeData = allData.shop_type ?? {};
  const whyData = allData.your_why ?? {};
  const customerData = allData.target_customer ?? {};
  const compData = allData.competitive_analysis ?? {};

  const selectedModel = SHOP_MODELS.find((m) => m.id === shopTypeData.model);
  const competitors = (compData.competitors as Competitor[]) ?? [];

  const generated = `# Concept Brief\n\n## Shop Model\n${selectedModel?.label ?? "Not defined"}: ${selectedModel?.desc ?? ""}\n\n**Size:** ${(shopTypeData.size as string) ?? "TBD"}  \n**Seating:** ${(shopTypeData.seating as string) ?? "TBD"}  \n**Food level:** ${(shopTypeData.food_level as string) ?? "TBD"}  \n**Service style:** ${(shopTypeData.service_style as string) ?? "TBD"}\n\n## Concept Statement\n${(whyData.motivation as string) ?? "Not yet defined."}\n\n## Target Customer Persona\n**Who they are:** ${Array.isArray(customerData.occupation) ? (customerData.occupation as string[]).join(", ") : (customerData.occupation as string) ?? "TBD"}, ${(customerData.age_range as string) ?? "TBD"}, ${(customerData.income as string) ?? "TBD"} income  \n**Coffee habits:** ${(customerData.coffee_habits as string) ?? "TBD"}  \n**What they value:** ${Array.isArray(customerData.values) ? (customerData.values as string[]).join(", ") : (customerData.values as string) ?? "TBD"}\n\n## Positioning Statement\n${(whyData.customer_experience as string) ?? "Not yet defined."}\n\n## Key Differentiators\n${(whyData.line_in_sand as string) ?? "Not yet defined."}\n\n## Competitive Landscape\n${competitors.length > 0 ? competitors.map((c) => `- **${c.name}** (${c.location}): ${c.vibe}, ${c.price_range}`).join("\n") : "No competitors analyzed yet."}\n`;

  const content = (data.brief_content as string) ?? generated;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">Your Concept Brief</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          This is your plan&apos;s foundation. Everything from here builds on it.
        </p>
      </div>

      <div>
        {isEditing ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[#1a1a1a]">Edit your brief</label>
              {data.brief_content !== generated && (
                <button
                  onClick={() => onChange({ ...data, brief_content: generated })}
                  className="text-xs text-[#afafaf] hover:text-[#155e63] transition-colors"
                >
                  Reset to generated
                </button>
              )}
            </div>
            <textarea
              autoFocus
              value={content}
              onChange={(e) => onChange({ ...data, brief_content: e.target.value })}
              rows={22}
              className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors resize-none bg-white font-mono leading-relaxed"
            />
            <button
              onClick={() => setIsEditing(false)}
              className="mt-2 text-xs text-[#afafaf] hover:text-[#1a1a1a] transition-colors"
            >
              Done editing
            </button>
          </>
        ) : (
          <>
            <pre className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] bg-[#faf9f7] font-mono leading-relaxed whitespace-pre-wrap overflow-auto min-h-[320px]">
              {content}
            </pre>
            <button
              onClick={() => setIsEditing(true)}
              className="mt-3 px-4 py-2 border border-[#155e63] text-[#155e63] rounded-xl text-sm font-medium hover:bg-[#155e63]/5 transition-colors"
            >
              Edit this brief
            </button>
          </>
        )}
      </div>

      <div className="bg-[#155e63]/5 border border-[#155e63]/20 rounded-xl p-4">
        <p className="text-sm text-[#155e63] font-medium mb-1">PDF export coming in a future update</p>
        <p className="text-xs text-[#155e63]/70">Your brief is saved automatically. You can return to it anytime from your dashboard.</p>
      </div>
    </div>
  );
}

// ── Module 2 Section Components ───────────────────────────────────────────

function SectionStartupCosts({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const fields = [
    { key: "equipment_budget", label: "Equipment & Bar Build-Out", placeholder: "e.g. 85000", hint: "Espresso machine, grinders, brewers, refrigeration" },
    { key: "buildout_budget", label: "Construction & Leasehold Improvements", placeholder: "e.g. 120000", hint: "Plumbing, electrical, flooring, walls" },
    { key: "deposit_budget", label: "Deposits & Pre-Opening Fees", placeholder: "e.g. 30000", hint: "Lease deposit, utility deposits, architect" },
    { key: "licensing_budget", label: "Licenses & Legal", placeholder: "e.g. 8000", hint: "Business license, health permits, LLC formation" },
    { key: "initial_inventory", label: "Initial Inventory", placeholder: "e.g. 12000", hint: "Coffee, milk, syrups, cups, food" },
    { key: "working_capital", label: "Working Capital Reserve", placeholder: "e.g. 40000", hint: "3–6 months of operating cash on hand" },
  ];

  const total = fields.reduce((sum, f) => {
    const val = parseFloat((data[f.key] as string) ?? "0") || 0;
    return sum + val;
  }, 0);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-2">Startup Budget</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          Break down your total startup cost by category. Be honest; most operators underestimate buildout and working capital by 20-30%.
        </p>
      </div>
      <div className="space-y-5">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-sm font-medium text-[#1a1a1a] block mb-1">{f.label}</label>
            <p className="text-xs text-[#afafaf] mb-2">{f.hint}</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">$</span>
              <input
                type="number"
                min="0"
                value={(data[f.key] as string) ?? ""}
                onChange={(e) => onChange({ ...data, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className="w-full border border-[#efefef] rounded-xl pl-7 pr-4 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors"
              />
            </div>
          </div>
        ))}
      </div>
      {total > 0 && (
        <div className="bg-[#155e63]/5 border border-[#155e63]/20 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-[#155e63]">Estimated Total Startup Cost</span>
          <span className="text-lg font-bold text-[#155e63]">${total.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

function SectionRevenueProjections({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const avgTicket = parseFloat((data.avg_ticket as string) ?? "0") || 0;
  const dailyTx = parseFloat((data.daily_transactions as string) ?? "0") || 0;
  const daysPerWeek = parseFloat((data.days_per_week as string) ?? "0") || 0;
  const monthlyRevenue = avgTicket * dailyTx * daysPerWeek * 4.33;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-2">Revenue Projections</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          Start with realistic daily transaction counts, not best-case. Most independent cafés average 80–150 transactions/day in year one.
        </p>
      </div>
      <div className="space-y-5">
        <div>
          <label className="text-sm font-medium text-[#1a1a1a] block mb-1">Average Ticket Size</label>
          <p className="text-xs text-[#afafaf] mb-2">Total sale per customer including food and add-ons</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">$</span>
            <input
              type="number"
              min="0"
              step="0.50"
              value={(data.avg_ticket as string) ?? ""}
              onChange={(e) => onChange({ ...data, avg_ticket: e.target.value })}
              placeholder="e.g. 8.50"
              className="w-full border border-[#efefef] rounded-xl pl-7 pr-4 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-[#1a1a1a] block mb-1">Daily Transactions</label>
          <p className="text-xs text-[#afafaf] mb-2">Estimated unique customer transactions per day</p>
          <input
            type="number"
            min="0"
            value={(data.daily_transactions as string) ?? ""}
            onChange={(e) => onChange({ ...data, daily_transactions: e.target.value })}
            placeholder="e.g. 120"
            className="w-full border border-[#efefef] rounded-xl px-4 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1a1a1a] block mb-1">Days Open Per Week</label>
          <input
            type="number"
            min="1"
            max="7"
            value={(data.days_per_week as string) ?? ""}
            onChange={(e) => onChange({ ...data, days_per_week: e.target.value })}
            placeholder="e.g. 6"
            className="w-full border border-[#efefef] rounded-xl px-4 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1a1a1a] block mb-1">Seasonal Notes</label>
          <p className="text-xs text-[#afafaf] mb-2">Describe any seasonality expected in your market</p>
          <textarea
            value={(data.seasonal_notes as string) ?? ""}
            onChange={(e) => onChange({ ...data, seasonal_notes: e.target.value })}
            placeholder="e.g. Tourist area: expect 40% volume spike June-August, slower January-February"
            rows={3}
            className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors resize-none"
          />
        </div>
      </div>
      {monthlyRevenue > 0 && (
        <div className="bg-[#155e63]/5 border border-[#155e63]/20 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-[#155e63]">Estimated Monthly Revenue</span>
          <span className="text-lg font-bold text-[#155e63]">${Math.round(monthlyRevenue).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

function SectionMonthlyExpenses({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const fields = [
    { key: "rent", label: "Rent / Lease Payment", placeholder: "e.g. 6500", hint: "Monthly base rent (don't include CAM yet)" },
    { key: "labor_cost", label: "Total Labor (Gross)", placeholder: "e.g. 14000", hint: "All staff wages + your own owner pay" },
    { key: "utilities", label: "Utilities", placeholder: "e.g. 1200", hint: "Electric, gas, water, internet" },
    { key: "marketing_budget", label: "Marketing", placeholder: "e.g. 800", hint: "Social ads, loyalty program, events" },
    { key: "other_expenses", label: "Other Operating Expenses", placeholder: "e.g. 2000", hint: "Insurance, POS fees, repairs, supplies" },
  ];

  const cogsPercent = parseFloat((data.cogs_percentage as string) ?? "0") || 0;
  const otherFixed = fields.reduce((sum, f) => {
    return sum + (parseFloat((data[f.key] as string) ?? "0") || 0);
  }, 0);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-2">Monthly Expenses</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          Know your fixed and variable costs before you open. Labor + rent typically make up 50–60% of a café&apos;s revenue.
        </p>
      </div>
      <div className="space-y-5">
        <div>
          <label className="text-sm font-medium text-[#1a1a1a] block mb-1">Cost of Goods Sold (COGS) %</label>
          <p className="text-xs text-[#afafaf] mb-2">Typical specialty café COGS is 25–35% of revenue</p>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              value={(data.cogs_percentage as string) ?? ""}
              onChange={(e) => onChange({ ...data, cogs_percentage: e.target.value })}
              placeholder="e.g. 30"
              className="w-full border border-[#efefef] rounded-xl px-4 pr-8 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">%</span>
          </div>
        </div>
        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-sm font-medium text-[#1a1a1a] block mb-1">{f.label}</label>
            <p className="text-xs text-[#afafaf] mb-2">{f.hint}</p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">$</span>
              <input
                type="number"
                min="0"
                value={(data[f.key] as string) ?? ""}
                onChange={(e) => onChange({ ...data, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className="w-full border border-[#efefef] rounded-xl pl-7 pr-4 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors"
              />
            </div>
          </div>
        ))}
      </div>
      {otherFixed > 0 && (
        <div className="bg-[#155e63]/5 border border-[#155e63]/20 rounded-xl p-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#155e63]">Fixed Monthly Costs</span>
            <span className="text-lg font-bold text-[#155e63]">${otherFixed.toLocaleString()}</span>
          </div>
          {cogsPercent > 0 && (
            <p className="text-xs text-[#155e63]/70">Plus {cogsPercent}% of revenue in COGS (variable)</p>
          )}
        </div>
      )}
    </div>
  );
}

function SectionPricingStrategy({ data, onChange }: { data: Record<string, unknown>; onChange: (d: Record<string, unknown>) => void }) {
  const pricingFields = [
    { key: "espresso_price", label: "Espresso / Americano", placeholder: "e.g. 4.50" },
    { key: "drip_price", label: "Drip / Filter Coffee", placeholder: "e.g. 3.50" },
    { key: "specialty_price", label: "Specialty Latte / Signature Drink", placeholder: "e.g. 7.00" },
    { key: "food_avg_price", label: "Average Food Item", placeholder: "e.g. 6.00" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-2">Pricing Strategy</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          Set your core price points. Specialty cafés in major metros average $5–$7 for espresso drinks. Price confidently; customers pay for experience, not just coffee.
        </p>
      </div>
      <div className="space-y-5">
        {pricingFields.map((f) => (
          <div key={f.key}>
            <label className="text-sm font-medium text-[#1a1a1a] block mb-1">{f.label}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">$</span>
              <input
                type="number"
                min="0"
                step="0.25"
                value={(data[f.key] as string) ?? ""}
                onChange={(e) => onChange({ ...data, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                className="w-full border border-[#efefef] rounded-xl pl-7 pr-4 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors"
              />
            </div>
          </div>
        ))}
        <div>
          <label className="text-sm font-medium text-[#1a1a1a] block mb-1">Pricing Philosophy</label>
          <p className="text-xs text-[#afafaf] mb-2">How will you position on price vs. local competitors?</p>
          <textarea
            value={(data.pricing_notes as string) ?? ""}
            onChange={(e) => onChange({ ...data, pricing_notes: e.target.value })}
            placeholder="e.g. Premium pricing (10% above market) justified by single-origin sourcing and barista education. Loyalty program to offset frequency sensitivity."
            rows={4}
            className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors resize-none"
          />
        </div>
      </div>
    </div>
  );
}

function SectionFinancialSummary({
  data,
  onChange,
  allData,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
  allData: Record<string, Record<string, unknown>>;
}) {
  const costs = allData.startup_costs ?? {};
  const revenue = allData.revenue_projections ?? {};
  const expenses = allData.monthly_expenses ?? {};

  const startupTotal = ["equipment_budget", "buildout_budget", "deposit_budget", "licensing_budget", "initial_inventory", "working_capital"]
    .reduce((s, k) => s + (parseFloat((costs[k] as string) ?? "0") || 0), 0);

  const avgTicket = parseFloat((revenue.avg_ticket as string) ?? "0") || 0;
  const dailyTx = parseFloat((revenue.daily_transactions as string) ?? "0") || 0;
  const daysPerWeek = parseFloat((revenue.days_per_week as string) ?? "0") || 0;
  const monthlyRevenue = avgTicket * dailyTx * daysPerWeek * 4.33;

  const cogs = monthlyRevenue * ((parseFloat((expenses.cogs_percentage as string) ?? "0") || 0) / 100);
  const fixedExpenses = ["rent", "labor_cost", "utilities", "marketing_budget", "other_expenses"]
    .reduce((s, k) => s + (parseFloat((expenses[k] as string) ?? "0") || 0), 0);
  const totalMonthlyExpenses = cogs + fixedExpenses;
  const monthlyProfit = monthlyRevenue - totalMonthlyExpenses;

  const generated = `# Financial Summary\n\n## Startup Investment\nTotal estimated startup cost: $${startupTotal.toLocaleString()}\n\n## Monthly P&L Projection\n- Revenue: $${Math.round(monthlyRevenue).toLocaleString()}\n- COGS: $${Math.round(cogs).toLocaleString()}\n- Fixed costs: $${Math.round(fixedExpenses).toLocaleString()}\n- **Net operating income: $${Math.round(monthlyProfit).toLocaleString()}**\n\n## Notes\n[Add your notes on assumptions, risks, and funding plan here.]`;

  const content = (data.summary_notes as string) ?? generated;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-2">Financial Summary</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          Your financial model auto-compiled from the sections above. Review it, annotate your assumptions, and use it as the financial section of your BRD.
        </p>
      </div>
      {monthlyRevenue > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Startup Cost", value: `$${startupTotal.toLocaleString()}` },
            { label: "Monthly Revenue", value: `$${Math.round(monthlyRevenue).toLocaleString()}` },
            { label: "Monthly Profit", value: `$${Math.round(monthlyProfit).toLocaleString()}`, highlight: monthlyProfit > 0 },
          ].map((stat) => (
            <div key={stat.label} className={`rounded-xl border p-4 ${stat.highlight ? "bg-[#155e63]/5 border-[#155e63]/20" : "bg-[#f9f9f9] border-[#efefef]"}`}>
              <div className="text-xs text-[#afafaf] mb-1">{stat.label}</div>
              <div className={`text-lg font-bold ${stat.highlight ? "text-[#155e63]" : "text-[#1a1a1a]"}`}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[#1a1a1a]">Financial Summary Document</label>
          {data.summary_notes !== generated && (
            <button
              onClick={() => onChange({ ...data, summary_notes: generated })}
              className="text-xs text-[#afafaf] hover:text-[#155e63] transition-colors"
            >
              Reset to generated
            </button>
          )}
        </div>
        <textarea
          value={content}
          onChange={(e) => onChange({ ...data, summary_notes: e.target.value })}
          rows={18}
          className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors resize-none bg-white font-mono leading-relaxed"
        />
      </div>
    </div>
  );
}

// ── Coach Panel ───────────────────────────────────────────────────────────

function parseSseErrorMessage(text: string): string | null {
  for (const block of text.split("\n\n")) {
    const lines = block.split("\n");
    const isError = lines.some((l) => l === "event: error");
    const dataLine = lines.find((l) => l.startsWith("data:"));
    if (isError && dataLine) {
      try {
        const payload = JSON.parse(dataLine.slice(5).trim()) as { message?: string };
        return payload.message ?? null;
      } catch {
        // ignore malformed data
      }
    }
  }
  return null;
}

function CoachPanel({
  isOpen,
  onClose,
  sectionKey,
  sectionTitle,
  planId,
  moduleNumber,
  messages,
  onMessages,
  onboardingData,
  allResponses,
  credits,
  subscriptionTier,
  guardedFetch,
}: {
  isOpen: boolean;
  onClose: () => void;
  sectionKey: string;
  sectionTitle: string;
  planId: string;
  moduleNumber: number;
  messages: ChatMessage[];
  onMessages: (msgs: ChatMessage[]) => void;
  onboardingData: Record<string, unknown>;
  allResponses: Record<string, Record<string, unknown>>;
  credits: number;
  subscriptionTier: string;
  guardedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response | null>;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    onMessages(newMessages);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const res = await guardedFetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          moduleNumber,
          sectionKey,
          messages: newMessages,
          onboardingData,
          allResponses,
        }),
      });

      // guardedFetch returns null on 402 (paywall shown automatically)
      if (!res) {
        setLoading(false);
        return;
      }

      const contentType = res.headers.get("content-type") ?? "";
      const body = await res.text();

      if (contentType.includes("text/event-stream")) {
        const msg = parseSseErrorMessage(body);
        setError(msg ?? "Connection error. Please try again.");
        setLoading(false);
        return;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(body) as Record<string, unknown>;
      } catch {
        setError("Connection error. Please try again.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError((data.error as string) ?? "Something went wrong. Please try again.");
      } else {
        onMessages([...newMessages, { role: "assistant", content: data.message as string }]);
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 lg:hidden"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-96 lg:w-80 xl:w-96 bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#efefef]">
          <div>
            <div className="font-semibold text-sm text-[#1a1a1a]">AI Coach</div>
            <div className="text-xs text-[#afafaf]">{sectionTitle}</div>
          </div>
          <div className="flex items-center gap-3">
            {subscriptionTier === "pro" ? (
              <span className="text-xs text-[#76b39d] font-medium">Unlimited</span>
            ) : (
              <span className={`text-xs font-medium ${credits <= 10 && credits > 0 ? "text-amber-500" : "text-[#afafaf]"}`}>
                {credits} credits
              </span>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-[#f5f5f5] hover:bg-[#efefef] flex items-center justify-center transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#afafaf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-[#155e63]/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#155e63" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
              </div>
              <p className="text-sm text-[#1a1a1a] font-medium mb-1">Your coach is ready</p>
              <p className="text-xs text-[#afafaf] leading-relaxed">
                Ask anything about {sectionTitle.toLowerCase()}, or share what you&apos;ve filled in and I&apos;ll give you honest feedback.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#155e63] text-white rounded-br-sm"
                    : "bg-[#f5f5f5] text-[#1a1a1a] rounded-bl-sm"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-[#f5f5f5] rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-[#afafaf] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-[#afafaf] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-[#afafaf] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-500 text-center px-2">{error}</div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[#efefef] px-4 py-4">
          {subscriptionTier === "free" ? (
            <div className="text-center">
              <p className="text-sm text-[#1a1a1a] font-medium mb-1">AI coaching requires a paid plan</p>
              <p className="text-xs text-[#afafaf] mb-3">Free accounts can explore modules but cannot use the AI coach.</p>
              <Link
                href="/account"
                className="inline-block text-xs bg-[#155e63] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#0e4448] transition-colors"
              >
                Upgrade to Builder →
              </Link>
            </div>
          ) : credits === 0 ? (
            <div className="text-center">
              <p className="text-sm text-[#1a1a1a] font-medium mb-1">You&apos;re out of AI credits</p>
              <p className="text-xs text-[#afafaf] mb-3">
                Your monthly credits have been used up. Upgrade to Accelerator for unlimited coaching, or wait for your monthly reset.
              </p>
              <Link
                href="/account"
                className="inline-block text-xs bg-[#155e63] text-white px-4 py-2 rounded-lg font-medium hover:bg-[#0e4448] transition-colors"
              >
                Upgrade for unlimited →
              </Link>
            </div>
          ) : (
            <>
              {credits <= 10 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                  <p className="text-xs text-amber-700">
                    <strong>{credits} credits left</strong> this month. <Link href="/account" className="underline hover:no-underline">Upgrade to Accelerator</Link> for unlimited coaching.
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  rows={2}
                  placeholder="Ask your coach..."
                  className="flex-1 border border-[#efefef] rounded-xl px-3 py-2 text-sm text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63] transition-colors resize-none"
                />
                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || loading}
                  className="px-3 bg-[#155e63] text-white rounded-xl hover:bg-[#0e4448] transition-colors disabled:opacity-40 flex-shrink-0"
                >
                  <span className="text-sm">↑</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Module Client ────────────────────────────────────────────────────

export function ModuleClient({
  moduleNumber,
  planId,
  planName,
  userProfile,
  initialResponses,
  initialConversations,
  freePreview = false,
}: ModuleClientProps) {
  const SECTIONS = getSectionsForModule(moduleNumber);
  const [activeSection, setActiveSection] = useState(0);
  const sectionAccessible = (key: string) =>
    !freePreview || canAccessSection(userProfile.subscription_tier, moduleNumber, key);
  const activeSectionAccessible = sectionAccessible(SECTIONS[activeSection]?.key ?? "");
  const [sectionData, setSectionData] = useState<Record<string, Record<string, unknown>>>(() => {
    const init: Record<string, Record<string, unknown>> = {};
    SECTIONS.forEach((s) => {
      init[s.key] = initialResponses[s.key]?.response_data ?? {};
    });
    return init;
  });
  const [sectionStatus, setSectionStatus] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    SECTIONS.forEach((s) => {
      init[s.key] = initialResponses[s.key]?.status ?? "not_started";
    });
    return init;
  });
  const [conversations, setConversations] = useState<Record<string, ChatMessage[]>>(() => {
    const init: Record<string, ChatMessage[]> = {};
    SECTIONS.forEach((s) => {
      init[s.key] = initialConversations[s.key] ?? [];
    });
    return init;
  });
  const [coachOpen, setCoachOpen] = useState(false);
  const [credits, setCredits] = useState(userProfile.ai_credits_remaining);
  const { paywalled, dismissPaywall, guardedFetch } = usePaywallGuard();

  const section = SECTIONS[activeSection];
  const saveSection = useAutoSave(planId, moduleNumber, section.key);

  function isSectionComplete(key: string): boolean {
    const data = sectionData[key];
    const def = SECTIONS.find((s) => s.key === key);
    if (!def) return false;

    return def.requiredFields.every((field) => {
      const val = data[field];
      if (Array.isArray(val)) return val.length > 0;
      if (field === "competitors") return (val as Competitor[])?.length >= 3;
      return val !== undefined && val !== "";
    });
  }

  function handleDataChange(key: string, newData: Record<string, unknown>) {
    setSectionData((prev) => ({ ...prev, [key]: newData }));
    const complete = SECTIONS.find((s) => s.key === key)?.requiredFields.every((f) => {
      const val = newData[f];
      if (Array.isArray(val)) return val.length > 0;
      if (f === "competitors") return (val as Competitor[])?.length >= 3;
      return val !== undefined && val !== "";
    });
    const status = complete ? "completed" : "in_progress";
    setSectionStatus((prev) => ({ ...prev, [key]: status }));
    saveSection(newData, status);
  }

  function handleCoachMessages(key: string, msgs: ChatMessage[]) {
    setConversations((prev) => ({ ...prev, [key]: msgs }));
    if (msgs.some((m) => m.role === "assistant")) {
      setCredits((c) => Math.max(0, c - 1));
    }
  }

  // Free-preview users can't truly complete the module — they only see one
  // section. The "Module complete!" banner is for paid users with everything
  // filled in.
  const allComplete =
    !freePreview && SECTIONS.every((s) => isSectionComplete(s.key));

  return (
    <div className="min-h-screen bg-[#faf9f7] flex flex-col pb-36 lg:pb-0">
      {/* Top nav */}
      <nav className="bg-white border-b border-[#efefef] px-6 py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#155e63] rounded flex items-center justify-center">
                <span className="text-white text-xs font-bold">TCS</span>
              </div>
            </Link>
            <span className="text-[#afafaf] text-sm">/</span>
            <Link href="/dashboard" className="text-sm text-[#afafaf] hover:text-[#1a1a1a] transition-colors hidden sm:block">
              {planName}
            </Link>
            <span className="text-[#afafaf] text-sm hidden sm:block">/</span>
            <span className="text-sm font-medium text-[#1a1a1a]">Module {moduleNumber}: {MODULE_TITLES[moduleNumber] ?? "Module"}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCoachOpen((o) => !o)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                coachOpen
                  ? "bg-[#155e63] text-white"
                  : "bg-[#f5f5f5] text-[#1a1a1a] hover:bg-[#efefef]"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
              <span className="hidden sm:block">Coach</span>
              {userProfile.subscription_tier === "pro" ? (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${coachOpen ? "bg-white/20 text-[#76b39d]" : "bg-[#efefef] text-[#76b39d]"}`}>∞</span>
              ) : credits > 0 ? (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${credits <= 10 ? (coachOpen ? "bg-amber-400/30 text-amber-200" : "bg-amber-100 text-amber-600") : (coachOpen ? "bg-white/20" : "bg-[#efefef]")}`}>{credits}</span>
              ) : null}
            </button>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 max-w-6xl mx-auto w-full px-6 py-8 gap-8">
        {/* Section sidebar */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <div className="sticky top-24 space-y-1">
            <p className="text-xs font-medium text-[#afafaf] uppercase tracking-wide mb-3">Sections</p>
            {SECTIONS.map((s, i) => {
              const complete = isSectionComplete(s.key);
              const active = i === activeSection;
              const started = sectionStatus[s.key] !== "not_started";
              const locked = !sectionAccessible(s.key);

              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(i)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2.5 ${
                    active
                      ? "bg-[#155e63] text-white font-medium"
                      : locked
                      ? "text-[#afafaf] hover:bg-[#efefef]"
                      : "text-[#1a1a1a] hover:bg-[#efefef]"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${
                    complete
                      ? active ? "bg-white text-[#155e63]" : "bg-[#155e63] text-white"
                      : active ? "bg-white/20 text-white" : started ? "bg-[#efefef] text-[#afafaf]" : "bg-[#f5f5f5] text-[#afafaf]"
                  }`}>
                    {locked ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    ) : complete ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className="truncate">{s.title}</span>
                </button>
              );
            })}

            {allComplete && (
              <div className="mt-4 p-3 bg-[#155e63]/10 rounded-xl">
                <p className="text-xs font-medium text-[#155e63]">Module complete!</p>
                <p className="text-xs text-[#155e63]/70 mt-0.5">All {SECTIONS.length} sections done.</p>
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className={`flex-1 min-w-0 transition-all duration-300 ${coachOpen ? "lg:mr-80 xl:mr-96" : ""}`}>
          {/* Mobile section nav */}
          <div className="lg:hidden flex gap-2 mb-6 overflow-x-auto pb-1">
            {SECTIONS.map((s, i) => {
              const complete = isSectionComplete(s.key);
              const active = i === activeSection;
              const locked = !sectionAccessible(s.key);
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(i)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    active
                      ? "bg-[#155e63] text-white"
                      : locked
                      ? "bg-[#f5f5f5] text-[#afafaf]"
                      : complete
                      ? "bg-[#155e63]/10 text-[#155e63]"
                      : "bg-[#efefef] text-[#afafaf]"
                  }`}
                >
                  {locked && !active && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
                  {!locked && complete && !active && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  {s.title}
                </button>
              );
            })}
          </div>

          {/* Section content */}
          <div className="bg-white rounded-2xl border border-[#efefef] p-6 sm:p-8">
            <div className="flex items-start justify-between mb-8">
              <div>
                <div className="text-xs font-medium text-[#afafaf] uppercase tracking-wide mb-1">
                  Section {activeSection + 1} of {SECTIONS.length}
                </div>
                <h2 className="text-xl font-bold text-[#1a1a1a]">{section.title}</h2>
              </div>
              {isSectionComplete(section.key) && activeSectionAccessible && (
                <div className="flex items-center gap-1.5 bg-[#155e63]/10 text-[#155e63] px-3 py-1.5 rounded-full">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span className="text-xs font-medium">Complete</span>
                </div>
              )}
            </div>

            {!activeSectionAccessible && (
              <UpgradeGate
                title={`${section.title} comes with Builder and Accelerator plans`}
                description="Free preview gives you Shop Type — the first real decision every owner has to make. Builder and Accelerator plans get you all five sections of Module 1, the complete financial model in Module 2, the AI coach, and your Business Readiness Document."
                benefits={[
                  "All 5 sections of Module 1 and the live financial model in Module 2",
                  "50 AI coach credits each month (unlimited on Accelerator)",
                  "Concept brief and financial summary you can export and share",
                ]}
                returnHref={`/plan/${moduleNumber}`}
              />
            )}

            {activeSectionAccessible && section.key === "shop_type" && (
              <SectionShopType
                data={sectionData.shop_type}
                onChange={(d) => handleDataChange("shop_type", d)}
              />
            )}
            {activeSectionAccessible && section.key === "your_why" && (
              <SectionYourWhy
                data={sectionData.your_why}
                onChange={(d) => handleDataChange("your_why", d)}
              />
            )}
            {activeSectionAccessible && section.key === "target_customer" && (
              <SectionTargetCustomer
                data={sectionData.target_customer}
                onChange={(d) => handleDataChange("target_customer", d)}
              />
            )}
            {activeSectionAccessible && section.key === "competitive_analysis" && (
              <SectionCompetitiveAnalysis
                data={sectionData.competitive_analysis}
                onChange={(d) => handleDataChange("competitive_analysis", d)}
              />
            )}
            {activeSectionAccessible && section.key === "concept_brief" && (
              <SectionConceptBrief
                data={sectionData.concept_brief}
                onChange={(d) => handleDataChange("concept_brief", d)}
                allData={sectionData}
              />
            )}

            {activeSectionAccessible && section.key === "startup_costs" && (
              <SectionStartupCosts
                data={sectionData.startup_costs ?? {}}
                onChange={(d) => handleDataChange("startup_costs", d)}
              />
            )}
            {activeSectionAccessible && section.key === "revenue_projections" && (
              <SectionRevenueProjections
                data={sectionData.revenue_projections ?? {}}
                onChange={(d) => handleDataChange("revenue_projections", d)}
              />
            )}
            {activeSectionAccessible && section.key === "monthly_expenses" && (
              <SectionMonthlyExpenses
                data={sectionData.monthly_expenses ?? {}}
                onChange={(d) => handleDataChange("monthly_expenses", d)}
              />
            )}
            {activeSectionAccessible && section.key === "pricing_strategy" && (
              <SectionPricingStrategy
                data={sectionData.pricing_strategy ?? {}}
                onChange={(d) => handleDataChange("pricing_strategy", d)}
              />
            )}
            {activeSectionAccessible && section.key === "financial_summary" && (
              <SectionFinancialSummary
                data={sectionData.financial_summary ?? {}}
                onChange={(d) => handleDataChange("financial_summary", d)}
                allData={sectionData}
              />
            )}

            {/* Inline coach prompt — Module 1 only, above section nav */}
            {moduleNumber === 1 && activeSectionAccessible && !coachOpen && (
              <div className="mt-8 flex justify-center">
                {userProfile.subscription_tier === "free" ? (
                  <Link
                    href={`/pricing?return=${encodeURIComponent(`/plan/${moduleNumber}`)}`}
                    className="inline-flex items-center gap-1.5 text-sm text-[#afafaf] hover:text-[#155e63] transition-colors"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                    Ask a question <span className="text-[#155e63] font-medium ml-0.5">(Builder plan)</span>
                  </Link>
                ) : (
                  <button
                    onClick={() => setCoachOpen(true)}
                    className="inline-flex items-center gap-1.5 text-sm text-[#155e63] font-medium hover:underline"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                    Stuck? Ask the coach →
                  </button>
                )}
              </div>
            )}

            {/* Section nav */}
            <div className="flex items-center justify-between mt-6 pt-6 border-t border-[#efefef]">
              <button
                onClick={() => setActiveSection((s) => Math.max(0, s - 1))}
                disabled={activeSection === 0}
                className="px-5 py-2.5 border border-[#efefef] rounded-xl text-sm text-[#afafaf] hover:border-[#afafaf] hover:text-[#1a1a1a] transition-colors disabled:opacity-30"
              >
                ← Back
              </button>

              <div className="flex items-center gap-3">
                {!coachOpen && activeSectionAccessible && isSectionComplete(section.key) && conversations[section.key].length === 0 && moduleNumber !== 1 && (
                  <button
                    onClick={() => setCoachOpen(true)}
                    className="text-sm text-[#155e63] font-medium hover:underline"
                  >
                    Get coach feedback →
                  </button>
                )}

                {(() => {
                  const nextIndex = activeSection + 1;
                  const nextSection = SECTIONS[nextIndex];
                  const nextAccessible =
                    nextSection ? sectionAccessible(nextSection.key) : false;

                  // Free preview: the moment the next section is paid, stop
                  // pretending the user can continue inline and route them to
                  // upgrade. This is the in-product upgrade path.
                  if (freePreview && activeSectionAccessible && nextSection && !nextAccessible) {
                    return (
                      <Link
                        href={`/pricing?return=${encodeURIComponent(`/plan/${moduleNumber}`)}`}
                        className="px-5 py-2.5 bg-[#155e63] text-white rounded-xl text-sm font-medium hover:bg-[#0e4448] transition-colors"
                      >
                        Get full access →
                      </Link>
                    );
                  }

                  if (nextIndex < SECTIONS.length) {
                    return (
                      <button
                        onClick={() => setActiveSection((s) => s + 1)}
                        className="px-5 py-2.5 bg-[#155e63] text-white rounded-xl text-sm font-medium hover:bg-[#0e4448] transition-colors"
                      >
                        Next section →
                      </button>
                    );
                  }

                  return (
                    <Link
                      href={moduleNumber === 1 ? "/plan/2" : "/dashboard"}
                      className="px-5 py-2.5 bg-[#155e63] text-white rounded-xl text-sm font-medium hover:bg-[#0e4448] transition-colors"
                    >
                      {moduleNumber === 1 ? "Continue to Module 2 →" : "Back to dashboard"}
                    </Link>
                  );
                })()}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Coach FAB — bottom-right, above BottomTabBar */}
      <div className="lg:hidden fixed bottom-[72px] right-4 z-30">
        <button
          onClick={() => setCoachOpen((o) => !o)}
          aria-label="Open AI Coach"
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-2xl shadow-lg active:scale-95 transition-all ${
            coachOpen ? "bg-[#0e4448] text-white" : "bg-[#155e63] text-white"
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
          <span className="text-[10px] font-semibold mt-0.5">Coach</span>
        </button>
      </div>

      {/* Coach panel */}
      <CoachPanel
        isOpen={coachOpen}
        onClose={() => setCoachOpen(false)}
        sectionKey={section.key}
        sectionTitle={section.title}
        planId={planId}
        moduleNumber={moduleNumber}
        messages={conversations[section.key]}
        onMessages={(msgs) => handleCoachMessages(section.key, msgs)}
        onboardingData={userProfile.onboarding_data}
        allResponses={Object.fromEntries(
          Object.entries(sectionData).map(([k, v]) => [k, v])
        )}
        credits={credits}
        subscriptionTier={userProfile.subscription_tier}
        guardedFetch={guardedFetch}
      />
      <PaywallModal open={paywalled} onClose={dismissPaywall} />
      <BottomTabBar />
    </div>
  );
}
