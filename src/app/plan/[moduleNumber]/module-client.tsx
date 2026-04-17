"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { BottomTabBar } from "@/components/bottom-tab-bar";

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
}

interface SectionDef {
  key: string;
  title: string;
  requiredFields: string[];
  minArrayLength?: Record<string, number>;
}

// ── Module Definitions ─────────────────────────────────────────────────────

const MODULE_TITLES: Record<number, string> = {
  1: "Concept & Positioning",
  2: "Financial Modeling",
};

const MODULE_1_SECTIONS: SectionDef[] = [
  { key: "shop_type", title: "Shop Type", requiredFields: ["model", "size", "seating", "food_level", "service_style"] },
  { key: "your_why", title: "Your Why", requiredFields: ["motivation", "customer_experience", "line_in_sand"] },
  { key: "target_customer", title: "Target Customer", requiredFields: ["age_range", "occupation", "income", "coffee_habits", "values"] },
  { key: "competitive_analysis", title: "Competitive Analysis", requiredFields: ["competitors"], minArrayLength: { competitors: 3 } },
  { key: "concept_brief", title: "Concept Brief", requiredFields: ["brief_content"] },
];

const MODULE_2_SECTIONS: SectionDef[] = [
  { key: "revenue_modeling", title: "Revenue Modeling", requiredFields: ["daily_customers", "avg_ticket", "days_per_week"] },
  { key: "startup_costs", title: "Startup Costs", requiredFields: ["equipment", "build_out", "working_capital"] },
  { key: "break_even", title: "Break-Even Analysis", requiredFields: ["monthly_rent", "monthly_labor", "cogs_percent"] },
  { key: "operating_expenses", title: "Operating Expenses", requiredFields: ["rent_percent", "labor_percent", "summary_confirmed"] },
];

const MODULE_SECTIONS: Record<number, SectionDef[]> = {
  1: MODULE_1_SECTIONS,
  2: MODULE_2_SECTIONS,
};

// ── Module 1 Data ─────────────────────────────────────────────────────────

const SHOP_MODELS = [
  { id: "full_cafe", label: "Full Café", desc: "Espresso, food, seating — the full experience", costRange: "$150K–$400K", example: "Blue Bottle, local neighborhood café" },
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

// ── Module 1 Section Components ───────────────────────────────────────────

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
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">The 6 Shop Models</h3>
        <p className="text-sm text-[#afafaf] mb-5 leading-relaxed">
          Your shop model shapes every decision that follows — staffing, equipment, lease requirements, and your daily rhythm. Choose based on your budget, lifestyle, and the gap you&apos;ve identified, not just what sounds exciting.
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
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">Why Motivation Matters</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed mb-4">
          Your &quot;why&quot; isn&apos;t just a feel-good exercise. It shapes how you hire, what you put on the menu, who you serve, and how you behave on the hardest days. Successful operators who make it through year two almost always have a clear, specific answer to this. Vague reasons produce vague concepts.
        </p>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          The three prompts below will become the foundation of your positioning statement in Section 5. Answer them as if you&apos;re talking to someone who&apos;s genuinely curious — not a business plan reviewer.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-[#1a1a1a] mb-1">
            What&apos;s pulling you toward this?
          </label>
          <p className="text-xs text-[#afafaf] mb-2">Not what you think sounds good — what&apos;s actually driving you.</p>
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
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">Your Customer Is Not &quot;Everyone Who Likes Coffee&quot;</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed mb-4">
          The most common mistake in coffee shop planning is designing for everyone. When you try to serve everyone, you end up resonating with no one. Shops that win have a clear, specific customer in mind — and every decision runs through that filter.
        </p>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          Build your primary customer persona here. You&apos;re not excluding everyone else — you&apos;re anchoring your decisions to someone real. Your coach will create a vivid paragraph from your answers and challenge you on blind spots.
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
                    {selected && <span className="text-white" style={{ fontSize: 9 }}>✓</span>}
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
            {["Daily drinker, creature of habit", "Occasional — treats coffee as a treat", "Coffee-curious, interested in origin and craft", "Specialty-focused, knows what they want", "On-the-go, speed matters most"].map((opt) => (
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
                    {selected && <span className="text-white" style={{ fontSize: 9 }}>✓</span>}
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
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">Know What Exists to Find the Gap</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed mb-4">
          You don&apos;t need to be different from everyone — you need to be different from the places that will compete for the same customers and occasions. Map your real competitors: the places your target customer would go instead of you.
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
  const shopTypeData = allData.shop_type ?? {};
  const whyData = allData.your_why ?? {};
  const customerData = allData.target_customer ?? {};
  const compData = allData.competitive_analysis ?? {};

  const selectedModel = SHOP_MODELS.find((m) => m.id === shopTypeData.model);
  const competitors = (compData.competitors as Competitor[]) ?? [];

  const generated = `# Concept Brief\n\n## Shop Model\n${selectedModel?.label ?? "Not defined"} — ${selectedModel?.desc ?? ""}\n\n**Size:** ${(shopTypeData.size as string) ?? "TBD"}  \n**Seating:** ${(shopTypeData.seating as string) ?? "TBD"}  \n**Food level:** ${(shopTypeData.food_level as string) ?? "TBD"}  \n**Service style:** ${(shopTypeData.service_style as string) ?? "TBD"}\n\n## Concept Statement\n${(whyData.motivation as string) ?? "Not yet defined."}\n\n## Target Customer Persona\n**Who they are:** ${Array.isArray(customerData.occupation) ? (customerData.occupation as string[]).join(", ") : (customerData.occupation as string) ?? "TBD"}, ${(customerData.age_range as string) ?? "TBD"}, ${(customerData.income as string) ?? "TBD"} income  \n**Coffee habits:** ${(customerData.coffee_habits as string) ?? "TBD"}  \n**What they value:** ${Array.isArray(customerData.values) ? (customerData.values as string[]).join(", ") : (customerData.values as string) ?? "TBD"}\n\n## Positioning Statement\n${(whyData.customer_experience as string) ?? "Not yet defined."}\n\n## Key Differentiators\n${(whyData.line_in_sand as string) ?? "Not yet defined."}\n\n## Competitive Landscape\n${competitors.length > 0 ? competitors.map((c) => `- **${c.name}** (${c.location}): ${c.vibe}, ${c.price_range}`).join("\n") : "No competitors analyzed yet."}\n`;

  const content = (data.brief_content as string) ?? generated;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">Your Concept Brief</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed mb-4">
          A concept brief is your shop&apos;s founding document — a single page that captures who you are, who you serve, and why you win. It&apos;s not a business plan. It&apos;s the anchor document that keeps every future decision aligned.
        </p>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          We&apos;ve auto-generated your brief from everything you&apos;ve built in this module. Review it, edit it, and make it yours. Your coach can help refine it.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[#1a1a1a]">Your Concept Brief</label>
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
          value={content}
          onChange={(e) => onChange({ ...data, brief_content: e.target.value })}
          rows={22}
          className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] focus:outline-none focus:border-[#155e63] transition-colors resize-none bg-white font-mono leading-relaxed"
        />
      </div>

      <div className="bg-[#155e63]/5 border border-[#155e63]/20 rounded-xl p-4">
        <p className="text-sm text-[#155e63] font-medium mb-1">PDF export coming in a future update</p>
        <p className="text-xs text-[#155e63]/70">Your brief is saved automatically. You can return to it anytime from your dashboard.</p>
      </div>
    </div>
  );
}

// ── Module 2 Section Components ───────────────────────────────────────────

function StepperInput({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-[#1a1a1a]">{label}</label>
        <span className="text-sm font-semibold text-[#155e63]">{format(value)}</span>
      </div>
      {hint && <p className="text-xs text-[#afafaf] mb-2">{hint}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(Math.max(min, value - step))}
          className="w-9 h-9 rounded-xl border border-[#efefef] text-[#afafaf] hover:border-[#155e63] hover:text-[#155e63] transition-colors flex items-center justify-center text-lg font-light"
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-[#155e63]"
        />
        <button
          onClick={() => onChange(Math.min(max, value + step))}
          className="w-9 h-9 rounded-xl border border-[#efefef] text-[#afafaf] hover:border-[#155e63] hover:text-[#155e63] transition-colors flex items-center justify-center text-lg font-light"
        >
          +
        </button>
      </div>
    </div>
  );
}

function CurrencyInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#1a1a1a] mb-1">{label}</label>
      {hint && <p className="text-xs text-[#afafaf] mb-2">{hint}</p>}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">$</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "0"}
          min="0"
          className="w-full border border-[#efefef] rounded-xl pl-7 pr-4 py-2.5 text-sm text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63] transition-colors bg-white"
        />
      </div>
    </div>
  );
}

function SectionRevenueModeling({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const dailyCustomers = (data.daily_customers as number) ?? 80;
  const avgTicket = (data.avg_ticket as number) ?? 7;
  const daysPerWeek = (data.days_per_week as number) ?? 6;

  const weeklyRevenue = dailyCustomers * avgTicket * daysPerWeek;
  const monthlyRevenue = weeklyRevenue * 4.3;
  const annualRevenue = monthlyRevenue * 12;

  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${Math.round(n)}`;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">What Does Your Shop Actually Make?</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed mb-4">
          Revenue modeling for a coffee shop comes down to three numbers: how many people come in, how much they spend, and how many days you&apos;re open. Everything else is noise until you nail these. Start conservative — new shops typically run at 40–60% of capacity in year one.
        </p>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          Adjust the sliders below. The projections update in real time.
        </p>
      </div>

      <div className="space-y-6">
        <StepperInput
          label="Daily customers"
          value={dailyCustomers}
          min={10}
          max={500}
          step={5}
          format={(v) => `${v} people/day`}
          onChange={(v) => onChange({ ...data, daily_customers: v })}
          hint="Industry average for a neighborhood café: 80–150 on a busy day. Be conservative for year one."
        />

        <StepperInput
          label="Average ticket size"
          value={avgTicket}
          min={3}
          max={20}
          step={0.5}
          format={(v) => `$${v.toFixed(2)}`}
          onChange={(v) => onChange({ ...data, avg_ticket: v })}
          hint="Drink-only shops: $5–$7. Shops with food add-ons: $8–$12. Specialty + food: $10–$15."
        />

        <StepperInput
          label="Days open per week"
          value={daysPerWeek}
          min={5}
          max={7}
          step={1}
          format={(v) => `${v} days/week`}
          onChange={(v) => onChange({ ...data, days_per_week: v })}
          hint="Most independent cafés open 6–7 days. Factor in your staffing capacity."
        />
      </div>

      {/* Revenue projections */}
      <div className="bg-[#faf9f7] border border-[#efefef] rounded-2xl p-5">
        <p className="text-xs font-medium text-[#afafaf] uppercase tracking-wide mb-4">Revenue Projections</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-[#155e63]">{fmt(weeklyRevenue)}</div>
            <div className="text-xs text-[#afafaf] mt-1">Weekly</div>
          </div>
          <div className="text-center border-x border-[#efefef]">
            <div className="text-2xl font-bold text-[#155e63]">{fmt(monthlyRevenue)}</div>
            <div className="text-xs text-[#afafaf] mt-1">Monthly</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-[#155e63]">{fmt(annualRevenue)}</div>
            <div className="text-xs text-[#afafaf] mt-1">Annual</div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-[#efefef]">
          <p className="text-xs text-[#afafaf] leading-relaxed">
            These are gross revenue figures before any costs. Your coach can help you stress-test these numbers against your concept and location.
          </p>
        </div>
      </div>

      {/* Peak time split */}
      <div>
        <label className="block text-sm font-medium text-[#1a1a1a] mb-2">When are most customers coming in?</label>
        <p className="text-xs text-[#afafaf] mb-3">Select all that apply. This shapes staffing and inventory planning.</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "early_morning", label: "Early morning (6–9am)", note: "Commuters, pre-work" },
            { id: "mid_morning", label: "Mid-morning (9am–12pm)", note: "Remote workers, meetings" },
            { id: "lunch", label: "Lunch rush (12–2pm)", note: "Office crowd, grab-and-go" },
            { id: "afternoon", label: "Afternoon (2–5pm)", note: "Students, slow recharge" },
            { id: "evening", label: "Evening (5pm+)", note: "Social, wine/beer crossover" },
            { id: "weekends", label: "Weekend brunch", note: "Families, leisurely visits" },
          ].map((opt) => {
            const current = (data.peak_times as string[]) ?? [];
            const selected = current.includes(opt.id);
            return (
              <button
                key={opt.id}
                onClick={() => {
                  const updated = selected ? current.filter((v) => v !== opt.id) : [...current, opt.id];
                  onChange({ ...data, peak_times: updated });
                }}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  selected
                    ? "border-[#155e63] bg-[#155e63]/5"
                    : "border-[#efefef] bg-white hover:border-[#afafaf]"
                }`}
              >
                <div className={`text-xs font-medium ${selected ? "text-[#155e63]" : "text-[#1a1a1a]"}`}>{opt.label}</div>
                <div className="text-xs text-[#afafaf] mt-0.5">{opt.note}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SectionStartupCosts({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const get = (key: string) => (data[key] as string) ?? "";
  const num = (key: string) => parseFloat(get(key)) || 0;

  const categories = [
    {
      group: "Space",
      items: [
        { key: "lease_deposit", label: "Lease deposit (first + last month)", placeholder: "8000", hint: "Typically 2–3 months rent upfront" },
        { key: "build_out", label: "Build-out / renovation", placeholder: "60000", hint: "Plumbing, electrical, HVAC, finishes" },
        { key: "signage", label: "Signage & exterior", placeholder: "3000", hint: "Window graphics, awning, exterior sign" },
      ],
    },
    {
      group: "Equipment",
      items: [
        { key: "equipment", label: "Espresso machine + grinders", placeholder: "20000", hint: "Commercial La Marzocco: $10–$20K. Semi-commercial: $3–$8K" },
        { key: "brewing_equipment", label: "Brewing equipment & smallwares", placeholder: "5000", hint: "Batch brewers, pour-over gear, refrigeration" },
        { key: "pos_system", label: "POS system + hardware", placeholder: "2500", hint: "Toast, Square, Lightspeed — hardware + first year" },
      ],
    },
    {
      group: "Pre-opening",
      items: [
        { key: "licenses_permits", label: "Licenses & permits", placeholder: "2000", hint: "Health permit, business license, food handler certs" },
        { key: "inventory_initial", label: "Opening inventory", placeholder: "4000", hint: "Coffee, milk, syrups, pastries, packaging — 2 weeks supply" },
        { key: "marketing_launch", label: "Launch marketing", placeholder: "2000", hint: "Soft opening events, social media setup, local ads" },
      ],
    },
    {
      group: "Cash Buffer",
      items: [
        { key: "working_capital", label: "Working capital reserve", placeholder: "20000", hint: "3–6 months operating costs. Critical — most shops fail from cash flow, not bad coffee" },
      ],
    },
  ];

  const totalCost = categories.flatMap((g) => g.items).reduce((sum, item) => sum + num(item.key), 0);

  const formatCurrency = (n: number) =>
    n === 0 ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">What Does It Actually Cost to Open?</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed mb-4">
          Most first-time operators underestimate by 20–40%. The categories below cover the full picture — not just the fun stuff like espresso machines. Enter your best estimates and your coach will flag anything that looks off given your model and location.
        </p>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          Leave fields blank if you don&apos;t have an estimate yet. Focus on completing Equipment, Build-out, and Working Capital — those three drive 80% of the total.
        </p>
      </div>

      <div className="space-y-6">
        {categories.map((group) => (
          <div key={group.group}>
            <p className="text-xs font-semibold text-[#afafaf] uppercase tracking-wide mb-3">{group.group}</p>
            <div className="space-y-3">
              {group.items.map((item) => (
                <CurrencyInput
                  key={item.key}
                  label={item.label}
                  value={get(item.key)}
                  onChange={(v) => onChange({ ...data, [item.key]: v })}
                  placeholder={item.placeholder}
                  hint={item.hint}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="bg-[#faf9f7] border border-[#efefef] rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-[#afafaf] uppercase tracking-wide mb-1">Estimated Total</p>
            <p className="text-3xl font-bold text-[#155e63]">{formatCurrency(totalCost)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#afafaf]">Industry range</p>
            <p className="text-sm font-medium text-[#1a1a1a]">$50K – $400K+</p>
          </div>
        </div>
        {totalCost > 0 && (
          <div className="mt-4 pt-4 border-t border-[#efefef]">
            <p className="text-xs text-[#afafaf] leading-relaxed">
              Add a 15–20% contingency buffer to this number. Renovation always runs over. Equipment arrives damaged. Permits take longer than expected.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionBreakEven({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
}) {
  const get = (key: string) => (data[key] as string) ?? "";
  const num = (key: string) => parseFloat(get(key)) || 0;
  const cogsPercent = (data.cogs_percent as number) ?? 32;

  const monthlyRent = num("monthly_rent");
  const monthlyLabor = num("monthly_labor");
  const monthlyUtilities = num("monthly_utilities");
  const monthlyOther = num("monthly_other_fixed");

  const totalFixed = monthlyRent + monthlyLabor + monthlyUtilities + monthlyOther;
  const contributionMargin = 1 - cogsPercent / 100;
  const breakEvenRevenue = contributionMargin > 0 ? totalFixed / contributionMargin : 0;

  const avgTicketEstimate = 7;
  const breakEvenCustomersPerDay = breakEvenRevenue > 0 ? Math.ceil(breakEvenRevenue / (avgTicketEstimate * 26)) : 0;

  const formatCurrency = (n: number) =>
    n === 0 ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">The Number That Keeps You in Business</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed mb-4">
          Break-even is the minimum revenue you need every month to cover all your costs. Below it, you&apos;re losing money. Above it, every dollar is profit. Knowing this number before you open is non-negotiable.
        </p>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          Enter your estimated monthly fixed costs. Your COGS (cost of goods sold) — coffee, milk, food — typically runs 28–38% of revenue for independent cafés.
        </p>
      </div>

      {/* Fixed costs */}
      <div>
        <p className="text-xs font-semibold text-[#afafaf] uppercase tracking-wide mb-3">Monthly Fixed Costs</p>
        <div className="space-y-3">
          <CurrencyInput
            label="Rent / lease"
            value={get("monthly_rent")}
            onChange={(v) => onChange({ ...data, monthly_rent: v })}
            placeholder="4500"
            hint="Your negotiated monthly rent. Aim for under 10% of projected monthly revenue."
          />
          <CurrencyInput
            label="Labor (wages + payroll taxes)"
            value={get("monthly_labor")}
            onChange={(v) => onChange({ ...data, monthly_labor: v })}
            placeholder="12000"
            hint="All staff wages including yours if you're paying yourself. Typically the largest line item."
          />
          <CurrencyInput
            label="Utilities (electric, gas, water)"
            value={get("monthly_utilities")}
            onChange={(v) => onChange({ ...data, monthly_utilities: v })}
            placeholder="800"
            hint="Espresso machines are power-hungry. Budget $600–$1,200/month depending on equipment."
          />
          <CurrencyInput
            label="Other fixed costs"
            value={get("monthly_other_fixed")}
            onChange={(v) => onChange({ ...data, monthly_other_fixed: v })}
            placeholder="1500"
            hint="Insurance, POS fees, loan repayment, music licensing, software subscriptions"
          />
        </div>
      </div>

      {/* COGS */}
      <div>
        <p className="text-xs font-semibold text-[#afafaf] uppercase tracking-wide mb-3">Cost of Goods Sold (COGS)</p>
        <StepperInput
          label="COGS as % of revenue"
          value={cogsPercent}
          min={20}
          max={50}
          step={1}
          format={(v) => `${v}%`}
          onChange={(v) => onChange({ ...data, cogs_percent: v })}
          hint="Drinks-only: 28–33%. With food: 32–38%. High food: up to 42%. Lower is better."
        />
        <div className="mt-3 flex gap-2 flex-wrap">
          {[
            { label: "Lean (drinks-only)", value: 30 },
            { label: "Typical café", value: 33 },
            { label: "Café + light food", value: 36 },
            { label: "Full food menu", value: 40 },
          ].map((preset) => (
            <button
              key={preset.value}
              onClick={() => onChange({ ...data, cogs_percent: preset.value })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                cogsPercent === preset.value
                  ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                  : "border-[#efefef] text-[#afafaf] hover:border-[#afafaf]"
              }`}
            >
              {preset.label} ({preset.value}%)
            </button>
          ))}
        </div>
      </div>

      {/* Break-even result */}
      {totalFixed > 0 && (
        <div className="bg-[#faf9f7] border border-[#efefef] rounded-2xl p-5 space-y-4">
          <p className="text-xs font-medium text-[#afafaf] uppercase tracking-wide">Your Break-Even</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xl font-bold text-[#155e63]">{formatCurrency(breakEvenRevenue)}</div>
              <div className="text-xs text-[#afafaf] mt-1">Revenue needed per month</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[#155e63]">{breakEvenCustomersPerDay > 0 ? `~${breakEvenCustomersPerDay}` : "—"}</div>
              <div className="text-xs text-[#afafaf] mt-1">Customers/day to break even*</div>
            </div>
          </div>
          <div className="pt-3 border-t border-[#efefef]">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-[#afafaf]">Total fixed monthly costs</span>
              <span className="font-medium text-[#1a1a1a]">{formatCurrency(totalFixed)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#afafaf]">Contribution margin</span>
              <span className="font-medium text-[#1a1a1a]">{(contributionMargin * 100).toFixed(0)}%</span>
            </div>
          </div>
          <p className="text-xs text-[#afafaf]">*Assumes $7 avg ticket, 26 open days/month. Ask your coach to adjust for your numbers.</p>
        </div>
      )}
    </div>
  );
}

function SectionOperatingExpenses({
  data,
  onChange,
  allData,
}: {
  data: Record<string, unknown>;
  onChange: (d: Record<string, unknown>) => void;
  allData: Record<string, Record<string, unknown>>;
}) {
  const breakEvenData = allData.break_even ?? {};
  const revenueData = allData.revenue_modeling ?? {};

  const num = (obj: Record<string, unknown>, key: string) => parseFloat((obj[key] as string) ?? "0") || 0;
  const cogsPercent = (breakEvenData.cogs_percent as number) ?? 32;
  const monthlyRent = num(breakEvenData, "monthly_rent");
  const monthlyLabor = num(breakEvenData, "monthly_labor");
  const monthlyUtilities = num(breakEvenData, "monthly_utilities");
  const monthlyOther = num(breakEvenData, "monthly_other_fixed");
  const dailyCustomers = (revenueData.daily_customers as number) ?? 80;
  const avgTicket = (revenueData.avg_ticket as number) ?? 7;
  const daysPerWeek = (revenueData.days_per_week as number) ?? 6;
  const monthlyRevenue = dailyCustomers * avgTicket * daysPerWeek * 4.3;

  const monthlyCogs = monthlyRevenue * (cogsPercent / 100);
  const totalMonthlyExpenses = monthlyCogs + monthlyRent + monthlyLabor + monthlyUtilities + monthlyOther;
  const netProfit = monthlyRevenue - totalMonthlyExpenses;
  const netMargin = monthlyRevenue > 0 ? (netProfit / monthlyRevenue) * 100 : 0;

  const rentPercent = monthlyRevenue > 0 ? (monthlyRent / monthlyRevenue) * 100 : 0;
  const laborPercent = monthlyRevenue > 0 ? (monthlyLabor / monthlyRevenue) * 100 : 0;
  const primeCost = cogsPercent + laborPercent;

  const formatCurrency = (n: number) =>
    `$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const pnlRows = [
    { label: "Gross revenue", value: monthlyRevenue, isTotal: false, positive: true },
    { label: `COGS (${cogsPercent}%)`, value: -monthlyCogs, isTotal: false, positive: false },
    { label: "Rent / lease", value: -monthlyRent, isTotal: false, positive: false },
    { label: "Labor", value: -monthlyLabor, isTotal: false, positive: false },
    { label: "Utilities", value: -monthlyUtilities, isTotal: false, positive: false },
    { label: "Other fixed", value: -monthlyOther, isTotal: false, positive: false },
    { label: "Net profit / loss", value: netProfit, isTotal: true, positive: netProfit >= 0 },
  ];

  const benchmarks = [
    { label: "Rent %", value: rentPercent, target: "< 10%", good: rentPercent < 10, na: monthlyRevenue === 0 },
    { label: "Labor %", value: laborPercent, target: "< 35%", good: laborPercent < 35, na: monthlyRevenue === 0 },
    { label: "COGS %", value: cogsPercent, target: "< 35%", good: cogsPercent < 35, na: false },
    { label: "Prime cost", value: primeCost, target: "< 65%", good: primeCost < 65, na: monthlyRevenue === 0 },
  ];

  const get = (key: string) => (data[key] as string) ?? "";
  const rentPctInput = get("rent_percent") || (rentPercent > 0 ? rentPercent.toFixed(1) : "");
  const laborPctInput = get("labor_percent") || (laborPercent > 0 ? laborPercent.toFixed(1) : "");

  const isConfirmed = data.summary_confirmed === true;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold text-[#1a1a1a] mb-3">Your Monthly P&amp;L Snapshot</h3>
        <p className="text-sm text-[#afafaf] leading-relaxed mb-4">
          This is pulled from your Revenue Modeling and Break-Even sections. It gives you a complete picture of how your shop looks month-to-month — and flags whether your cost structure is within healthy ranges.
        </p>
        <p className="text-sm text-[#afafaf] leading-relaxed">
          Industry benchmarks are shown on the right. &quot;Prime cost&quot; — COGS plus labor — should stay under 65% to run a healthy operation.
        </p>
      </div>

      {/* P&L table */}
      {monthlyRevenue > 0 ? (
        <div className="border border-[#efefef] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 bg-[#faf9f7] border-b border-[#efefef]">
            <p className="text-xs font-semibold text-[#afafaf] uppercase tracking-wide">Monthly P&amp;L</p>
          </div>
          <div className="divide-y divide-[#f5f5f5]">
            {pnlRows.map((row, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-5 py-3 ${row.isTotal ? "bg-[#faf9f7] font-semibold" : ""}`}
              >
                <span className={`text-sm ${row.isTotal ? "text-[#1a1a1a]" : "text-[#afafaf]"}`}>{row.label}</span>
                <span className={`text-sm font-medium ${
                  row.isTotal
                    ? row.positive ? "text-[#155e63]" : "text-red-500"
                    : row.positive ? "text-[#1a1a1a]" : "text-[#afafaf]"
                }`}>
                  {row.value < 0 ? `(${formatCurrency(row.value)})` : formatCurrency(row.value)}
                </span>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 bg-[#faf9f7] border-t border-[#efefef]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#afafaf]">Net margin</span>
              <span className={`text-sm font-semibold ${netMargin >= 10 ? "text-[#155e63]" : netMargin >= 0 ? "text-amber-500" : "text-red-500"}`}>
                {netMargin.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#faf9f7] border border-dashed border-[#efefef] rounded-2xl p-6 text-center">
          <p className="text-sm text-[#afafaf]">Complete Revenue Modeling and Break-Even sections to see your P&amp;L here.</p>
        </div>
      )}

      {/* Benchmarks */}
      <div>
        <p className="text-xs font-semibold text-[#afafaf] uppercase tracking-wide mb-3">Industry Benchmarks</p>
        <div className="grid grid-cols-2 gap-3">
          {benchmarks.map((b) => (
            <div key={b.label} className={`p-3 rounded-xl border ${b.na ? "border-[#efefef] bg-white" : b.good ? "border-[#155e63]/20 bg-[#155e63]/5" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-[#1a1a1a]">{b.label}</span>
                <span className={`text-xs font-semibold ${b.na ? "text-[#afafaf]" : b.good ? "text-[#155e63]" : "text-amber-600"}`}>
                  {b.na ? "—" : `${typeof b.value === "number" ? b.value.toFixed(1) : b.value}%`}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#afafaf]">Target: {b.target}</span>
                {!b.na && (
                  <span className={`text-xs ${b.good ? "text-[#155e63]" : "text-amber-600"}`}>
                    {b.good ? "✓ Good" : "↑ Review"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hidden fields to satisfy required completions */}
      <input type="hidden" value={rentPctInput} onChange={(e) => onChange({ ...data, rent_percent: e.target.value })} />
      <input type="hidden" value={laborPctInput} onChange={(e) => onChange({ ...data, labor_percent: e.target.value })} />

      {/* Manual overrides */}
      <div>
        <p className="text-xs font-semibold text-[#afafaf] uppercase tracking-wide mb-3">Override Percentages (optional)</p>
        <p className="text-xs text-[#afafaf] mb-4">If your real-world rent or labor numbers differ from what was calculated above, enter them here for accurate benchmarking.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-[#afafaf] mb-1">Actual rent % of revenue</label>
            <div className="relative">
              <input
                type="number"
                value={rentPctInput}
                onChange={(e) => onChange({ ...data, rent_percent: e.target.value })}
                placeholder={rentPercent > 0 ? rentPercent.toFixed(1) : "0"}
                min="0"
                max="100"
                className="w-full border border-[#efefef] rounded-xl px-3 pr-7 py-2.5 text-sm text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63] transition-colors bg-white"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">%</span>
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#afafaf] mb-1">Actual labor % of revenue</label>
            <div className="relative">
              <input
                type="number"
                value={laborPctInput}
                onChange={(e) => onChange({ ...data, labor_percent: e.target.value })}
                placeholder={laborPercent > 0 ? laborPercent.toFixed(1) : "0"}
                min="0"
                max="100"
                className="w-full border border-[#efefef] rounded-xl px-3 pr-7 py-2.5 text-sm text-[#1a1a1a] placeholder-[#d0d0d0] focus:outline-none focus:border-[#155e63] transition-colors bg-white"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#afafaf]">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm */}
      <div className="border-t border-[#efefef] pt-6">
        <button
          onClick={() => onChange({
            ...data,
            rent_percent: rentPctInput || rentPercent.toFixed(1),
            labor_percent: laborPctInput || laborPercent.toFixed(1),
            summary_confirmed: !isConfirmed,
          })}
          className={`w-full py-3 rounded-xl border text-sm font-medium transition-colors ${
            isConfirmed
              ? "border-[#155e63] bg-[#155e63] text-white"
              : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#155e63]"
          }`}
        >
          {isConfirmed ? "✓ Financial model reviewed and confirmed" : "I've reviewed my operating expense model →"}
        </button>
        {isConfirmed && (
          <p className="text-xs text-center text-[#afafaf] mt-2">
            Module 2 complete. Your coach can help you pressure-test any of these numbers before you proceed.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Coach Panel ───────────────────────────────────────────────────────────

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
      const res = await fetch("/api/coach", {
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

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        onMessages([...newMessages, { role: "assistant", content: data.message }]);
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const isFinancialModule = moduleNumber === 2;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40 lg:hidden"
        onClick={onClose}
      />

      <div className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-96 lg:w-80 xl:w-96 bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#efefef]">
          <div>
            <div className="font-semibold text-sm text-[#1a1a1a]">AI Coach</div>
            <div className="text-xs text-[#afafaf]">{sectionTitle}</div>
          </div>
          <div className="flex items-center gap-3">
            {subscriptionTier === "accelerator" ? (
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
              <span className="text-[#afafaf] text-sm">✕</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-[#155e63]/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">{isFinancialModule ? "📊" : "☕"}</span>
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
}: ModuleClientProps) {
  const SECTIONS = MODULE_SECTIONS[moduleNumber] ?? MODULE_1_SECTIONS;
  const moduleTitle = MODULE_TITLES[moduleNumber] ?? `Module ${moduleNumber}`;

  const [activeSection, setActiveSection] = useState(0);
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

  const section = SECTIONS[activeSection];
  const saveSection = useAutoSave(planId, moduleNumber, section.key);

  function isSectionComplete(key: string): boolean {
    const d = sectionData[key];
    const def = SECTIONS.find((s) => s.key === key);
    if (!def) return false;

    return def.requiredFields.every((field) => {
      const val = d[field];
      if (Array.isArray(val)) {
        const min = def.minArrayLength?.[field] ?? 1;
        return val.length >= min;
      }
      if (typeof val === "boolean") return val === true;
      return val !== undefined && val !== "" && val !== null;
    });
  }

  function handleDataChange(key: string, newData: Record<string, unknown>) {
    setSectionData((prev) => ({ ...prev, [key]: newData }));
    const def = SECTIONS.find((s) => s.key === key);
    const complete = def?.requiredFields.every((f) => {
      const val = newData[f];
      if (Array.isArray(val)) {
        const min = def.minArrayLength?.[f] ?? 1;
        return val.length >= min;
      }
      if (typeof val === "boolean") return val === true;
      return val !== undefined && val !== "" && val !== null;
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

  const allComplete = SECTIONS.every((s) => isSectionComplete(s.key));

  return (
    <div className="min-h-screen bg-[#faf9f7] flex flex-col pb-16 lg:pb-0">
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
            <span className="text-sm font-medium text-[#1a1a1a]">Module {moduleNumber}: {moduleTitle}</span>
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
              <span>{moduleNumber === 2 ? "📊" : "☕"}</span>
              <span className="hidden sm:block">Coach</span>
              {userProfile.subscription_tier === "accelerator" ? (
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

              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(i)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors flex items-center gap-2.5 ${
                    active
                      ? "bg-[#155e63] text-white font-medium"
                      : "text-[#1a1a1a] hover:bg-[#efefef]"
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${
                    complete
                      ? active ? "bg-white text-[#155e63]" : "bg-[#155e63] text-white"
                      : active ? "bg-white/20 text-white" : started ? "bg-[#efefef] text-[#afafaf]" : "bg-[#f5f5f5] text-[#afafaf]"
                  }`}>
                    {complete ? "✓" : i + 1}
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
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(i)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    active
                      ? "bg-[#155e63] text-white"
                      : complete
                      ? "bg-[#155e63]/10 text-[#155e63]"
                      : "bg-[#efefef] text-[#afafaf]"
                  }`}
                >
                  {complete && !active && <span>✓</span>}
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
              {isSectionComplete(section.key) && (
                <div className="flex items-center gap-1.5 bg-[#155e63]/10 text-[#155e63] px-3 py-1.5 rounded-full">
                  <span className="text-xs">✓</span>
                  <span className="text-xs font-medium">Complete</span>
                </div>
              )}
            </div>

            {/* Module 1 sections */}
            {section.key === "shop_type" && (
              <SectionShopType
                data={sectionData.shop_type}
                onChange={(d) => handleDataChange("shop_type", d)}
              />
            )}
            {section.key === "your_why" && (
              <SectionYourWhy
                data={sectionData.your_why}
                onChange={(d) => handleDataChange("your_why", d)}
              />
            )}
            {section.key === "target_customer" && (
              <SectionTargetCustomer
                data={sectionData.target_customer}
                onChange={(d) => handleDataChange("target_customer", d)}
              />
            )}
            {section.key === "competitive_analysis" && (
              <SectionCompetitiveAnalysis
                data={sectionData.competitive_analysis}
                onChange={(d) => handleDataChange("competitive_analysis", d)}
              />
            )}
            {section.key === "concept_brief" && (
              <SectionConceptBrief
                data={sectionData.concept_brief}
                onChange={(d) => handleDataChange("concept_brief", d)}
                allData={sectionData}
              />
            )}

            {/* Module 2 sections */}
            {section.key === "revenue_modeling" && (
              <SectionRevenueModeling
                data={sectionData.revenue_modeling}
                onChange={(d) => handleDataChange("revenue_modeling", d)}
              />
            )}
            {section.key === "startup_costs" && (
              <SectionStartupCosts
                data={sectionData.startup_costs}
                onChange={(d) => handleDataChange("startup_costs", d)}
              />
            )}
            {section.key === "break_even" && (
              <SectionBreakEven
                data={sectionData.break_even}
                onChange={(d) => handleDataChange("break_even", d)}
              />
            )}
            {section.key === "operating_expenses" && (
              <SectionOperatingExpenses
                data={sectionData.operating_expenses}
                onChange={(d) => handleDataChange("operating_expenses", d)}
                allData={sectionData}
              />
            )}

            {/* Section nav */}
            <div className="flex items-center justify-between mt-10 pt-6 border-t border-[#efefef]">
              <button
                onClick={() => setActiveSection((s) => Math.max(0, s - 1))}
                disabled={activeSection === 0}
                className="px-5 py-2.5 border border-[#efefef] rounded-xl text-sm text-[#afafaf] hover:border-[#afafaf] hover:text-[#1a1a1a] transition-colors disabled:opacity-30"
              >
                ← Back
              </button>

              <div className="flex items-center gap-3">
                {!coachOpen && isSectionComplete(section.key) && conversations[section.key].length === 0 && (
                  <button
                    onClick={() => setCoachOpen(true)}
                    className="text-sm text-[#155e63] font-medium hover:underline"
                  >
                    Get coach feedback →
                  </button>
                )}

                {activeSection < SECTIONS.length - 1 ? (
                  <button
                    onClick={() => setActiveSection((s) => s + 1)}
                    className="px-5 py-2.5 bg-[#155e63] text-white rounded-xl text-sm font-medium hover:bg-[#0e4448] transition-colors"
                  >
                    Next section →
                  </button>
                ) : (
                  <Link
                    href="/dashboard"
                    className="px-5 py-2.5 bg-[#155e63] text-white rounded-xl text-sm font-medium hover:bg-[#0e4448] transition-colors"
                  >
                    Back to dashboard
                  </Link>
                )}
              </div>
            </div>
          </div>
        </main>
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
      />
      <BottomTabBar />
    </div>
  );
}
