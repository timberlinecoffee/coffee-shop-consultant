"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STEPS = [
  {
    id: "welcome",
    type: "welcome" as const,
  },
  {
    id: "motivation",
    type: "cards" as const,
    question: "What's pulling you toward opening a coffee shop?",
    hint: "There's no wrong answer here. This helps your coach understand your why.",
    options: [
      "I love coffee and want to share it",
      "I want to build something of my own",
      "I see a gap in my community",
      "I want to leave my current career",
    ] as const,
  },
  {
    id: "stage",
    type: "radio" as const,
    question: "Where are you in the process?",
    hint: "This tells your coach how much scaffolding vs. acceleration to give you.",
    options: [
      "Just an idea",
      "Researching",
      "Actively planning",
      "Ready to move",
    ] as const,
  },
  {
    id: "location",
    type: "text" as const,
    question: "Where are you thinking of opening?",
    hint: "Don't have one yet? Just put your current city. We'll ask again when it matters.",
    placeholder: "e.g. Austin, TX or Southeast London",
  },
  {
    id: "shop_type",
    type: "multiselect" as const,
    question: "What kind of shop are you imagining?",
    hint: "Pick everything that resonates. You can change this in Module 1.",
    options: [
      "Full café with food",
      "Espresso bar (drinks only)",
      "Roastery café",
      "Drive-through or kiosk",
      "Mobile cart or pop-up",
    ] as const,
  },
];

type Answers = Record<string, string | string[]>;

export function OnboardingFlow({ userId, firstName }: { userId: string; firstName: string }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabase = createClient();

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
    const current = (answers[currentStep.id] as string[]) ?? [];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    setAnswers(prev => ({ ...prev, [currentStep.id]: updated }));
  }

  function canAdvance() {
    if (currentStep.type === "welcome") return true;
    const ans = answers[currentStep.id];
    if (!ans) return false;
    if (Array.isArray(ans)) return ans.length > 0;
    return (ans as string).trim().length > 0;
  }

  async function handleFinish() {
    setSaving(true);
    try {
      const { data: plan } = await supabase
        .from("coffee_shop_plans")
        .insert({
          user_id: userId,
          plan_name: `${firstName || "My"}'s Coffee Shop`,
        })
        .select()
        .single();

      await supabase
        .from("users")
        .update({
          onboarding_completed: true,
          onboarding_data: answers,
          readiness_score: 5,
        })
        .eq("id", userId);

      if (plan) {
        await supabase.from("milestones").insert([
          {
            plan_id: plan.id,
            title: "Complete onboarding",
            description: "Tell your coach about your vision",
            target_date: new Date().toISOString().split("T")[0],
            completed_at: new Date().toISOString(),
            is_auto_generated: true,
          },
          {
            plan_id: plan.id,
            title: "Complete Module 1: Concept & Positioning",
            description: "Define your shop type, target customer, and competitive positioning",
            target_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            is_auto_generated: true,
          },
        ]);
      }

      router.push("/dashboard");
    } catch {
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
    <div className="min-h-screen bg-neutral-100 flex flex-col">
      <header className="px-6 pt-6 pb-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-teal rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">TCS</span>
            </div>
          </Link>
          <span className="text-xs text-neutral-500">Step {step + 1} of {totalSteps}</span>
        </div>
        <div className="flex gap-2" aria-label={`Step ${step + 1} of ${totalSteps}`}>
          {STEPS.map((_, i) => (
            <span key={i} className={`text-lg leading-none ${i <= step ? "text-teal" : "text-neutral-300"}`}>
              {i <= step ? "●" : "○"}
            </span>
          ))}
        </div>
      </header>

      <main className="flex-1 px-6 py-8 flex flex-col">
        {currentStep.type === "welcome" && (
          <div className="flex-1 flex flex-col justify-center">
            <h1 className="text-3xl font-bold text-neutral-950 mb-4">
              Hi {firstName}, welcome.
            </h1>
            <p className="text-neutral-500 text-base">
              A few quick questions and your plan is ready.
            </p>
          </div>
        )}

        {currentStep.type !== "welcome" && (
          <div>
            {"question" in currentStep && (
              <h1 className="text-2xl font-bold text-neutral-950 mb-2">
                {currentStep.question}
              </h1>
            )}
            {"hint" in currentStep && (
              <p className="text-neutral-500 text-sm mb-8">{currentStep.hint}</p>
            )}

            {(currentStep.type === "cards" || currentStep.type === "radio") && (
              <div className="space-y-3">
                {"options" in currentStep &&
                  currentStep.options.map((opt) => {
                    const isSelected = typeof currentAnswer === "string" && currentAnswer === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => handleSelect(opt)}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-3 ${
                          isSelected
                            ? "border-teal bg-teal/5 text-teal font-medium"
                            : "border-grey-light bg-white text-neutral-950 hover:border-neutral-500"
                        }`}
                      >
                        {currentStep.type === "radio" && (
                          <span
                            className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                              isSelected
                                ? "border-teal"
                                : "border-neutral-500"
                            }`}
                          >
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-teal block" />
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
                placeholder={"placeholder" in currentStep ? currentStep.placeholder : ""}
                className="w-full border border-grey-light rounded-xl px-4 py-3 text-sm text-neutral-950 placeholder-neutral-500 focus:outline-none focus:border-teal transition-colors bg-white"
              />
            )}

            {currentStep.type === "multiselect" && (
              <div className="space-y-3">
                {"options" in currentStep &&
                  currentStep.options.map((opt) => {
                    const selected =
                      Array.isArray(currentAnswer) && currentAnswer.includes(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() => handleMultiSelect(opt)}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-3 ${
                          selected
                            ? "border-teal bg-teal/5 text-teal font-medium"
                            : "border-grey-light bg-white text-neutral-950 hover:border-neutral-500"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                            selected
                              ? "bg-teal border-teal"
                              : "border-neutral-500"
                          }`}
                        >
                          {selected && (
                            <span className="text-white text-xs">&#10003;</span>
                          )}
                        </div>
                        {opt}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </main>

      <div className="sticky bottom-0 bg-neutral-100 border-t border-grey-light px-6 py-4 flex gap-3">
        {step > 0 && (
          <button
            onClick={() => setStep(s => s - 1)}
            className="px-6 py-3 border border-grey-light rounded-xl text-sm text-neutral-500 hover:border-neutral-500 hover:text-neutral-950 transition-colors"
          >
            Back
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={!canAdvance() || saving}
          className="flex-1 bg-teal text-white py-3 rounded-xl font-semibold text-sm hover:bg-teal-dark transition-colors disabled:opacity-40"
        >
          {saving
            ? "Setting up your plan..."
            : step === totalSteps - 1
            ? "Take me there \u2192"
            : "Next \u2192"}
        </button>
      </div>
    </div>
  );
}
