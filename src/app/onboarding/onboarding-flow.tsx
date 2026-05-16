"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { EMPTY_CONCEPT, type ConceptDocument } from "@/lib/concept";

// TIM-619: onboarding wizard rewrite — questions feed the Concept workspace.
// Vision, target customer, differentiation, brand pillars are captured here
// and seeded directly into workspace_documents (concept) on completion.

const DRAFT_KEY = "tim619_onboarding_draft_v1";

type Step =
  | { id: string; type: "welcome" }
  | {
      id: string;
      type: "cards" | "radio";
      question: string;
      hint: string;
      options: ReadonlyArray<string>;
    }
  | {
      id: string;
      type: "text";
      question: string;
      hint: string;
      placeholder: string;
    }
  | {
      id: string;
      type: "textarea";
      question: string;
      hint: string;
      placeholder: string;
      minChars?: number;
    }
  | {
      id: string;
      type: "multiselect";
      question: string;
      hint: string;
      options: ReadonlyArray<string>;
      max?: number;
    }
  | { id: string; type: "review"; question: string; hint: string };

const STEPS: Step[] = [
  { id: "welcome", type: "welcome" },
  {
    id: "shop_name",
    type: "text",
    question: "What are you calling your shop?",
    hint: "Working title is fine — you can change it any time inside the Concept workspace.",
    placeholder: "e.g. Tide & Timber Coffee",
  },
  {
    id: "motivation",
    type: "cards",
    question: "What's pulling you toward opening a coffee shop?",
    hint: "There's no wrong answer here. This shapes how the co-pilot talks to you.",
    options: [
      "I love coffee and want to share it",
      "I want to build something of my own",
      "I see a gap in my community",
      "I want to leave my current career",
    ],
  },
  {
    id: "mission",
    type: "textarea",
    question: "In a sentence or two, what's the shop for?",
    hint: "Don't overthink it. We'll refine this together in the Concept workspace.",
    placeholder: "Serve a tight daily menu of espresso and slow-bar coffee to morning commuters in the South End.",
    minChars: 20,
  },
  {
    id: "target_market",
    type: "textarea",
    question: "Who is the shop for?",
    hint: "Describe the regulars you want walking in every morning. Specificity beats demographics.",
    placeholder: "Under-40 commuters from the South End who'll pay $5 for a cortado and pick up daily on the way to the T.",
    minChars: 20,
  },
  {
    id: "differentiation",
    type: "textarea",
    question: "What makes you different from the cafés already on that block?",
    hint: "One or two things competitors can't easily copy. Don't say 'better coffee'.",
    placeholder: "Direct-trade single-origin program locked in with a Roastery for two years; barista training that's run by a Q-grader.",
    minChars: 20,
  },
  {
    id: "brand_pillars",
    type: "multiselect",
    question: "How should the shop feel? Pick the words that should always come through.",
    hint: "Pick 3–5. These become your brand voice pillars.",
    options: [
      "Warm",
      "Direct",
      "Craft-obsessed",
      "Neighbourhood",
      "Refined",
      "Playful",
      "Daily ritual",
      "Quiet",
      "Educational",
    ],
    max: 5,
  },
  {
    id: "stage",
    type: "radio",
    question: "Where are you in the process?",
    hint: "This tells the co-pilot how much scaffolding vs. acceleration to give you.",
    options: ["Just an idea", "Researching", "Actively planning", "Ready to move"],
  },
  {
    id: "location",
    type: "text",
    question: "Where are you thinking of opening?",
    hint: "Don't have a spot yet? Just put your current city — we'll ask again when it matters.",
    placeholder: "e.g. Austin, TX or Southeast London",
  },
  {
    id: "shop_type",
    type: "multiselect",
    question: "What kind of shop are you imagining?",
    hint: "Pick everything that resonates. You can change this any time.",
    options: [
      "Full café with food",
      "Espresso bar (drinks only)",
      "Roastery café",
      "Drive-through or kiosk",
      "Mobile cart or pop-up",
    ],
  },
  {
    id: "review",
    type: "review",
    question: "Here's what we're seeding into your Concept workspace.",
    hint: "You can edit any of this on the next screen.",
  },
];

type Answers = Record<string, string | string[]>;

function readDraft(): Answers {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as Answers) : {};
  } catch {
    return {};
  }
}

function writeDraft(answers: Answers) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(answers));
  } catch {
    // ignore quota / private mode
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function buildConcept(answers: Answers, fallbackName: string): ConceptDocument {
  const concept: ConceptDocument = { ...EMPTY_CONCEPT };
  const get = (k: string): string =>
    typeof answers[k] === "string" ? (answers[k] as string).trim() : "";
  concept.name = get("shop_name") || `${fallbackName}'s Coffee Shop`;
  concept.mission = get("mission");
  concept.target_market = get("target_market");
  concept.differentiation = get("differentiation");
  const pillars = Array.isArray(answers.brand_pillars)
    ? (answers.brand_pillars as string[])
    : [];
  concept.brand_voice = pillars.length > 0 ? pillars.join(", ") : "";
  return concept;
}

export function OnboardingFlow({ userId, firstName }: { userId: string; firstName: string }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // Hydrate any in-flight draft on mount so a refresh mid-wizard doesn't lose progress.
  // localStorage is browser-only, so this can only run after mount, not in the initial
  // useState initializer (would mismatch SSR hydration).
  useEffect(() => {
    const draft = readDraft();
    if (Object.keys(draft).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnswers(draft);
    }
  }, []);

  // Persist every answer change so reloads survive (TIM-619 success criterion).
  useEffect(() => {
    writeDraft(answers);
  }, [answers]);

  const currentStep = STEPS[step];
  const totalSteps = STEPS.length;

  const currentAnswer: string | string[] =
    currentStep.type === "multiselect"
      ? (answers[currentStep.id] as string[]) ?? []
      : (answers[currentStep.id] as string) ?? "";

  function handleSelect(value: string) {
    setAnswers(prev => ({ ...prev, [currentStep.id]: value }));
  }

  function handleMultiSelect(value: string) {
    if (currentStep.type !== "multiselect") return;
    const current = (answers[currentStep.id] as string[]) ?? [];
    let updated: string[];
    if (current.includes(value)) {
      updated = current.filter(v => v !== value);
    } else {
      const max = currentStep.max;
      if (max && current.length >= max) {
        // Cap reached — replace the oldest pick instead of doing nothing silently.
        updated = [...current.slice(1), value];
      } else {
        updated = [...current, value];
      }
    }
    setAnswers(prev => ({ ...prev, [currentStep.id]: updated }));
  }

  function canAdvance(): boolean {
    if (currentStep.type === "welcome" || currentStep.type === "review") return true;
    const ans = answers[currentStep.id];
    if (!ans) return false;
    if (Array.isArray(ans)) return ans.length > 0;
    const value = (ans as string).trim();
    if (currentStep.type === "textarea") {
      const min = (currentStep as { minChars?: number }).minChars ?? 0;
      return value.length >= min;
    }
    return value.length > 0;
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      // 1. Reuse the most-recent plan when one already exists (idempotent retry),
      //    otherwise create one named from the wizard's shop_name.
      const concept = buildConcept(answers, firstName || "My");
      const planName = concept.name;

      const { data: existingPlan } = await supabase
        .from("coffee_shop_plans")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let planId = existingPlan?.id ?? null;

      if (!planId) {
        const { data: plan, error: planError } = await supabase
          .from("coffee_shop_plans")
          .insert({
            user_id: userId,
            plan_name: planName,
          })
          .select("id")
          .single();
        if (planError || !plan) {
          throw planError ?? new Error("Could not create plan");
        }
        planId = plan.id;
      } else {
        // Rename existing plan to match the wizard answer.
        await supabase
          .from("coffee_shop_plans")
          .update({ plan_name: planName })
          .eq("id", planId);
      }

      // 2. Mark onboarding complete + persist raw wizard answers for AI prompt context.
      const { error: profileError } = await supabase
        .from("users")
        .update({
          onboarding_completed: true,
          onboarding_data: answers,
          readiness_score: 5,
        })
        .eq("id", userId);
      if (profileError) throw profileError;

      // 3. Seed the Concept workspace document. RLS allows plan-owner writes;
      //    we bypass /api/workspaces/concept here because that route is paywalled
      //    and onboarding happens during free_trial.
      const { error: conceptError } = await supabase
        .from("workspace_documents")
        .upsert(
          { plan_id: planId, workspace_key: "concept", content: concept },
          { onConflict: "plan_id,workspace_key" },
        );
      if (conceptError) throw conceptError;

      // 4. First-run milestones for the dashboard ring.
      await supabase.from("milestones").insert([
        {
          plan_id: planId,
          title: "Complete onboarding",
          description: "Tell your co-pilot about your vision",
          target_date: new Date().toISOString().split("T")[0],
          completed_at: new Date().toISOString(),
          is_auto_generated: true,
        },
        {
          plan_id: planId,
          title: "Polish your Concept workspace",
          description: "Refine mission, target market, differentiation, and brand voice with the co-pilot.",
          target_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          is_auto_generated: true,
        },
      ]);

      clearDraft();
      // Land the user directly in Concept with answers already populated.
      router.push("/workspace/concept");
    } catch (err) {
      console.error("onboarding finish failed", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong saving your answers. Try again.",
      );
      setSaving(false);
    }
  }

  async function handleNext() {
    if (step < totalSteps - 1) {
      setStep(s => s + 1);
    } else {
      await handleFinish();
    }
  }

  return (
    <div className="min-h-screen bg-[#faf9f7] flex flex-col">
      <header className="px-6 pt-6 pb-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#155e63] rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
          </Link>
          <span className="text-xs text-[#afafaf]">Step {step + 1} of {totalSteps}</span>
        </div>
        <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${totalSteps}`}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-[#155e63]" : "bg-[#e7e5e0]"}`}
            />
          ))}
        </div>
      </header>

      <main className="flex-1 px-6 py-8 flex flex-col">
        {currentStep.type === "welcome" && (
          <div className="flex-1 flex flex-col justify-center">
            <h1 className="text-3xl font-bold text-[#1a1a1a] mb-4">
              Hi {firstName}, welcome.
            </h1>
            <p className="text-[#6b6b6b] text-base leading-relaxed">
              A few questions and we&apos;ll seed your Concept workspace — the
              home of your mission, your target customer, and your brand voice.
              The co-pilot reads it across every workspace from this point on.
            </p>
          </div>
        )}

        {currentStep.type !== "welcome" && currentStep.type !== "review" && (
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a] mb-2">
              {currentStep.question}
            </h1>
            <p className="text-[#afafaf] text-sm mb-8">{currentStep.hint}</p>

            {(currentStep.type === "cards" || currentStep.type === "radio") && (
              <div className="space-y-3">
                {currentStep.options.map((opt) => {
                  const isSelected =
                    typeof currentAnswer === "string" && currentAnswer === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleSelect(opt)}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-3 ${
                        isSelected
                          ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                          : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                      }`}
                    >
                      {currentStep.type === "radio" && (
                        <span
                          className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                            isSelected ? "border-[#155e63]" : "border-[#afafaf]"
                          }`}
                        >
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-[#155e63] block" />
                          )}
                        </span>
                      )}
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}

            {currentStep.type === "text" && (
              <input
                type="text"
                value={typeof currentAnswer === "string" ? currentAnswer : ""}
                onChange={e => handleSelect(e.target.value)}
                placeholder={currentStep.placeholder}
                className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-white"
              />
            )}

            {currentStep.type === "textarea" && (
              <>
                <textarea
                  value={typeof currentAnswer === "string" ? currentAnswer : ""}
                  onChange={e => handleSelect(e.target.value)}
                  placeholder={currentStep.placeholder}
                  rows={4}
                  className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-white resize-none leading-relaxed"
                />
                {currentStep.minChars ? (
                  <p className="text-xs text-[#afafaf] mt-2">
                    {Math.min((typeof currentAnswer === "string" ? currentAnswer : "").trim().length, currentStep.minChars)}/{currentStep.minChars} characters minimum
                  </p>
                ) : null}
              </>
            )}

            {currentStep.type === "multiselect" && (
              <div className="space-y-3">
                {currentStep.options.map((opt) => {
                  const selected =
                    Array.isArray(currentAnswer) && currentAnswer.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleMultiSelect(opt)}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-3 ${
                        selected
                          ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                          : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                          selected ? "bg-[#155e63] border-[#155e63]" : "border-[#afafaf]"
                        }`}
                      >
                        {selected && <span className="text-white text-xs">&#10003;</span>}
                      </div>
                      {opt}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {currentStep.type === "review" && (
          <div>
            <h1 className="text-2xl font-bold text-[#1a1a1a] mb-2">
              {currentStep.question}
            </h1>
            <p className="text-[#afafaf] text-sm mb-6">{currentStep.hint}</p>

            <ReviewSummary answers={answers} firstName={firstName} />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-sm text-[#a13d3d] mt-4 bg-[#fbeeee] border border-[#f0d0d0] rounded-xl px-3 py-2"
          >
            {error}
          </p>
        )}
      </main>

      <div className="sticky bottom-0 bg-[#faf9f7] border-t border-[#efefef] px-6 py-4 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(s => s - 1)}
            className="px-6 py-3 border border-[#efefef] rounded-xl text-sm text-[#afafaf] hover:border-[#afafaf] hover:text-[#1a1a1a] transition-colors"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={!canAdvance() || saving}
          className="flex-1 bg-[#155e63] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#0e4448] transition-colors disabled:opacity-40"
        >
          {saving
            ? "Saving your Concept..."
            : step === totalSteps - 1
            ? "Open my Concept workspace →"
            : "Next →"}
        </button>
      </div>
    </div>
  );
}

function ReviewSummary({ answers, firstName }: { answers: Answers; firstName: string }) {
  const concept = buildConcept(answers, firstName || "My");
  const rows: Array<{ label: string; value: string }> = [
    { label: "Shop name", value: concept.name },
    { label: "Mission", value: concept.mission },
    { label: "Target customer", value: concept.target_market },
    { label: "Differentiation", value: concept.differentiation },
    { label: "Brand voice", value: concept.brand_voice },
  ];

  return (
    <div className="bg-white border border-[#efefef] rounded-2xl divide-y divide-[#efefef]">
      {rows.map((row) => (
        <div key={row.label} className="px-4 py-3">
          <p className="text-xs text-[#afafaf] uppercase tracking-wide">{row.label}</p>
          <p className="text-sm text-[#1a1a1a] mt-1 whitespace-pre-wrap">
            {row.value ? row.value : <span className="text-[#afafaf]">—</span>}
          </p>
        </div>
      ))}
    </div>
  );
}
