"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

const QUESTIONS = [
  {
    id: "first_name",
    question: "What should we call you?",
    hint: "First name only. We'll use it throughout the platform.",
    type: "text",
    placeholder: "Marcus",
  },
  {
    id: "motivation",
    question: "What's pulling you toward opening a coffee shop?",
    hint: "There's no wrong answer here. This helps your coach understand your \"why.\"",
    type: "quickselect_text",
    options: [
      "I love coffee and want to share it",
      "I want to build something of my own",
      "I see a gap in my community",
      "I want to leave my current career",
    ],
    placeholder: "Tell us in your own words...",
  },
  {
    id: "stage",
    question: "Where are you in the process?",
    hint: "This tells your coach how much scaffolding vs. acceleration to give you.",
    type: "select",
    options: [
      "Just an idea, haven't done anything yet",
      "Researching and learning",
      "Actively planning: looking at locations and numbers",
      "Ready to go: need to organize everything into a plan",
    ],
  },
  {
    id: "location",
    question: "Where are you thinking of opening?",
    hint: "City or region is enough. This shapes location-specific advice throughout.",
    type: "text",
    placeholder: "e.g. Austin, TX or Southeast London",
  },
  {
    id: "budget",
    question: "What's your budget range?",
    hint: "Your honest starting point. Not a commitment.",
    type: "select",
    options: [
      "Under $50K",
      "$50K–$100K",
      "$100K–$200K",
      "$200K–$500K",
      "$500K+",
      "I haven't figured this out yet",
    ],
  },
  {
    id: "timeline",
    question: "When do you want to open?",
    hint: "This sets your milestone timeline and action plan urgency.",
    type: "select",
    options: ["3-6 months", "6-12 months", "1-2 years", "No timeline yet"],
  },
  {
    id: "coffee_experience",
    question: "Have you worked in coffee before?",
    hint: "Your coach adapts its language based on your experience level.",
    type: "select",
    options: [
      "No, I'm a coffee lover, not a coffee professional",
      "Yes, I've worked as a barista",
      "Yes, I've managed or trained in a coffee shop",
      "Yes, I've owned a coffee business before",
    ],
  },
  {
    id: "shop_type",
    question: "What kind of shop are you imagining?",
    hint: "Pick everything that resonates. You can change this in Module 1.",
    type: "multiselect",
    options: [
      "Full café with food",
      "Espresso bar (drinks only)",
      "Roastery café",
      "Drive-through or kiosk",
      "Mobile cart or pop-up",
      "I'm not sure yet",
    ],
  },
] as const;

type Answers = Record<string, string | string[]>;

export function OnboardingFlow({ userId }: { userId: string }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const question = QUESTIONS[step];
  const totalSteps = QUESTIONS.length;
  const progress = Math.round(((step) / totalSteps) * 100);
  const currentAnswer = answers[question.id] ?? (question.type === "multiselect" ? [] : "");

  function handleSelect(value: string) {
    setAnswers(prev => ({ ...prev, [question.id]: value }));
  }

  function handleMultiSelect(value: string) {
    const current = (answers[question.id] as string[]) ?? [];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    setAnswers(prev => ({ ...prev, [question.id]: updated }));
  }

  function canAdvance() {
    const ans = answers[question.id];
    if (!ans) return false;
    if (Array.isArray(ans)) return ans.length > 0;
    return ans.trim().length > 0;
  }

  async function handleFinish() {
    setSaving(true);
    try {
      const { data: plan } = await supabase.from("coffee_shop_plans").insert({
        user_id: userId,
        plan_name: `${answers.first_name || "My"}'s Coffee Shop`,
      }).select().single();

      await supabase.from("users").update({
        onboarding_completed: true,
        onboarding_data: answers,
        full_name: answers.first_name as string || null,
        target_opening_date: answers.timeline === "3-6 months"
          ? new Date(Date.now() + 4 * 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
          : answers.timeline === "6-12 months"
            ? new Date(Date.now() + 9 * 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
            : answers.timeline === "1-2 years"
              ? new Date(Date.now() + 18 * 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
              : null,
        readiness_score: 5,
      }).eq("id", userId);

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
    <div className="min-h-screen bg-[#faf9f7] flex flex-col">
      <nav className="px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#155e63] rounded flex items-center justify-center">
            <span className="text-white text-xs font-bold">TCS</span>
          </div>
        </Link>
        <span className="text-xs text-[#afafaf]">{step + 1} of {totalSteps}</span>
      </nav>

      <div className="h-1 bg-[#efefef]">
        <div
          className="h-1 bg-[#155e63] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-2">{question.question}</h1>
          <p className="text-[#afafaf] text-sm mb-8">{question.hint}</p>

          {(question.type === "text" || question.type === "quickselect_text") && (
            <div className="space-y-3">
              {question.type === "quickselect_text" && (
                <div className="grid grid-cols-1 gap-2 mb-4">
                  {"options" in question && question.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleSelect(opt)}
                      className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                        currentAnswer === opt
                          ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                          : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                value={typeof currentAnswer === "string" ? currentAnswer : ""}
                onChange={e => handleSelect(e.target.value)}
                placeholder={"placeholder" in question ? question.placeholder : ""}
                rows={3}
                className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors resize-none bg-white"
              />
            </div>
          )}

          {question.type === "select" && (
            <div className="space-y-2">
              {"options" in question && question.options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleSelect(opt)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                    currentAnswer === opt
                      ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                      : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {question.type === "multiselect" && (
            <div className="space-y-2">
              {"options" in question && question.options.map((opt) => {
                const selected = (currentAnswer as string[]).includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => handleMultiSelect(opt)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-3 ${
                      selected
                        ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                        : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      selected ? "bg-[#155e63] border-[#155e63]" : "border-[#afafaf]"
                    }`}>
                      {selected && <span className="text-white text-xs">&#10003;</span>}
                    </div>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="px-6 py-3 border border-[#efefef] rounded-xl text-sm text-[#afafaf] hover:border-[#afafaf] hover:text-[#1a1a1a] transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canAdvance() || saving}
              className="flex-1 bg-[#155e63] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#0e4448] transition-colors disabled:opacity-40"
            >
              {saving ? "Setting up your plan..." : step < totalSteps - 1 ? "Next →" : "Let's do this →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
