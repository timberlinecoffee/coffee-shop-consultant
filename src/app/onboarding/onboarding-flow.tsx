"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogoMark } from "@/app/_components/Logo";
import { EMPTY_CONCEPT, type ConceptDocument } from "@/lib/concept";
import { COPILOT_NAME } from "@/lib/copilot/branding";
import {
  ShopVisionScreen,
  TargetCustomerScreen,
  DifferentiationScreen,
  type ShopVisionMeta,
  type TargetCustomerMeta,
  type DifferentiationState,
} from "./guided-screens";
import type { ObservationEntry } from "@/components/onboarding/observation-tracker";
import { FieldExamplePopover } from "@/components/ui/field-example-popover";
import { FIELD_EXAMPLES } from "@/lib/field-examples";
import Illustration from "@/components/illustrations/Illustration";

// TIM-1697: one line-art mark per coffee-shop model type, shown beside each
// option in the shop_type multiselect. Keyed by the option label; unmapped
// options simply render no illustration.
const SHOP_TYPE_RECIPE: Record<string, string> = {
  "Full cafe with food": "model-full-cafe",
  "Espresso bar (drinks only)": "model-espresso-bar",
  "Roastery cafe": "model-roastery-cafe",
  "Drive-through or kiosk": "model-drive-thru",
  "Mobile cart or pop-up": "model-mobile-cart",
};

// TIM-619: onboarding wizard.
// TIM-821: mission / target_market / differentiation steps replaced by guided
//   scaffolded screens (EducationBlock + ScaffoldedForm + ExampleDrawer).

type LocationSelection = {
  city: string;
  region: string;
  countryCode: string;
  displayName: string;
};

const DRAFT_KEY = "tim619_onboarding_draft_v2";

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
  | { id: string; type: "review"; question: string; hint: string }
  | { id: string; type: "city-autocomplete"; question: string; hint: string }
  | { id: string; type: "guided-shop-vision" }
  | { id: string; type: "guided-target-customer" }
  | { id: string; type: "guided-differentiation" };

const STEPS: Step[] = [
  { id: "welcome", type: "welcome" },
  {
    id: "shop_name",
    type: "text",
    question: "What are you calling your shop?",
    hint: "Working title is fine — you can change it any time inside the Concept workspace.",
    placeholder: "e.g. Ironside Coffee",
  },
  {
    id: "motivation",
    type: "cards",
    question: "What's pulling you toward opening a coffee shop?",
    hint: `There's no wrong answer here. This shapes how ${COPILOT_NAME} talks to you.`,
    options: [
      "I love coffee and want to share it",
      "I want to build something of my own",
      "I see a gap in my community",
      "I want to leave my current career",
    ],
  },
  // TIM-821: replaces the cold-ask "In a sentence or two, what's the shop for?" textarea
  { id: "shop_vision", type: "guided-shop-vision" },
  // TIM-821: replaces the cold-ask "Who is the shop for?" textarea
  { id: "target_customer", type: "guided-target-customer" },
  // TIM-821: replaces the cold-ask "What makes you different?" textarea; deferrable
  { id: "differentiation", type: "guided-differentiation" },
  {
    id: "brand_pillars",
    type: "multiselect",
    question: "How should the shop feel? Pick the words that should always come through.",
    hint: "Pick 3 to 5. These become your brand voice pillars.",
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
    hint: `This tells ${COPILOT_NAME} how much scaffolding vs. acceleration to give you.`,
    options: ["Just an idea", "Researching", "Actively planning", "Ready to move"],
  },
  {
    id: "location",
    type: "city-autocomplete",
    question: "Where are you thinking of opening?",
    hint: "Don't have a spot yet? Just put your current city — we'll ask again when it matters.",
  },
  {
    id: "shop_type",
    type: "multiselect",
    question: "What kind of shop are you imagining?",
    hint: "Pick everything that resonates. You can change this any time.",
    options: [
      "Full cafe with food",
      "Espresso bar (drinks only)",
      "Roastery cafe",
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

// ─── Answer types ────────────────────────────────────────────────────────────

const EMPTY_VISION_META: ShopVisionMeta = {
  usage_types: [],
  great_visit: "",
  coffee_vs_experience: "",
};

const EMPTY_CUSTOMER_META: TargetCustomerMeta = {
  neighborhood: "",
  ideal_customer: "",
  pre_post_visit: "",
};

const EMPTY_DIFF_STATE: DifferentiationState = {
  observations: [],
  meta: { gap_noticed: "", closest_competitor: "", unique_offering: "" },
  synthesized: "",
  deferred: false,
  skippedObservation: false,
};

type Answers = Record<string, string | string[] | LocationSelection>;

// TIM-821 adds guided-screen state alongside the flat Answers map
interface WizardState {
  answers: Answers;
  shopVisionMeta: ShopVisionMeta;
  shopVisionText: string;
  targetCustomerMeta: TargetCustomerMeta;
  targetCustomerText: string;
  diffState: DifferentiationState;
}

const EMPTY_WIZARD: WizardState = {
  answers: {},
  shopVisionMeta: EMPTY_VISION_META,
  shopVisionText: "",
  targetCustomerMeta: EMPTY_CUSTOMER_META,
  targetCustomerText: "",
  diffState: EMPTY_DIFF_STATE,
};

function readDraft(): WizardState {
  if (typeof window === "undefined") return EMPTY_WIZARD;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_WIZARD;
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed
      ? (parsed as WizardState)
      : EMPTY_WIZARD;
  } catch {
    return EMPTY_WIZARD;
  }
}

function writeDraft(state: WizardState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
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

function buildConcept(state: WizardState, fallbackName: string): ConceptDocument {
  const concept: ConceptDocument = { ...EMPTY_CONCEPT };
  const get = (k: string): string =>
    typeof state.answers[k] === "string"
      ? (state.answers[k] as string).trim()
      : "";

  concept.name = get("shop_name") || `${fallbackName}'s Coffee Shop`;
  // TIM-821: synthesized answers feed concept fields
  concept.mission = state.shopVisionText.trim();
  concept.target_market = state.targetCustomerText.trim();
  concept.differentiation = state.diffState.deferred
    ? ""
    : state.diffState.synthesized.trim();

  const pillars = Array.isArray(state.answers.brand_pillars)
    ? (state.answers.brand_pillars as string[])
    : [];
  concept.brand_voice = pillars.length > 0 ? pillars.join(", ") : "";
  return concept;
}

// serializes state into onboarding_data for DB storage
function buildOnboardingData(state: WizardState): Record<string, unknown> {
  return {
    ...state.answers,
    shop_vision: state.shopVisionText,
    shop_vision_meta: state.shopVisionMeta,
    target_customer: state.targetCustomerText,
    target_customer_meta: state.targetCustomerMeta,
    differentiation: state.diffState.deferred
      ? null
      : state.diffState.synthesized,
    differentiation_meta: state.diffState.meta,
    differentiation_observations: state.diffState.observations,
    differentiation_deferred: state.diffState.deferred,
  };
}

// ─── Step status for progress bar ────────────────────────────────────────────

type StepStatus = "done" | "current" | "deferred" | "pending";

function getStepStatus(
  stepIndex: number,
  currentStep: number,
  diffDeferred: boolean,
): StepStatus {
  const step = STEPS[stepIndex];
  if (stepIndex === currentStep) return "current";
  if (stepIndex < currentStep) {
    if (step.id === "differentiation" && diffDeferred) return "deferred";
    return "done";
  }
  return "pending";
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OnboardingFlow({
  userId,
  firstName,
}: {
  userId: string;
  firstName: string;
}) {
  const [step, setStep] = useState(0);
  const [wizardState, setWizardState] = useState<WizardState>(EMPTY_WIZARD);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  // WCAG 2.4.3 Focus Order: move focus to the step container on each advance so
  // AT users land at the new step instead of being stranded on the old Next button.
  const stepContainerRef = useRef<HTMLElement>(null);
  const isFirstStepRender = useRef(true);
  useEffect(() => {
    if (isFirstStepRender.current) {
      isFirstStepRender.current = false;
      return;
    }
    stepContainerRef.current?.focus();
  }, [step]);

  useEffect(() => {
    const draft = readDraft();
    const hasContent =
      Object.keys(draft.answers).length > 0 ||
      draft.shopVisionText ||
      draft.targetCustomerText ||
      draft.diffState.synthesized;
    if (hasContent) {
      setWizardState(draft);
    }
  }, []);

  useEffect(() => {
    writeDraft(wizardState);
  }, [wizardState]);

  const { answers, shopVisionMeta, shopVisionText, targetCustomerMeta, targetCustomerText, diffState } = wizardState;

  const currentStep = STEPS[step];
  const totalSteps = STEPS.length;

  const currentAnswer: string | string[] | LocationSelection | null =
    currentStep.type === "multiselect"
      ? (answers[currentStep.id] as string[]) ?? []
      : currentStep.type === "city-autocomplete"
      ? (answers[currentStep.id] as LocationSelection) ?? null
      : (answers[currentStep.id] as string) ?? "";

  function setAnswers(updater: (prev: Answers) => Answers) {
    setWizardState((s) => ({ ...s, answers: updater(s.answers) }));
  }

  function handleSelect(value: string) {
    setAnswers((prev) => ({ ...prev, [currentStep.id]: value }));
  }

  function handleMultiSelect(value: string) {
    if (currentStep.type !== "multiselect") return;
    const current = (answers[currentStep.id] as string[]) ?? [];
    let updated: string[];
    if (current.includes(value)) {
      updated = current.filter((v) => v !== value);
    } else {
      const max = (currentStep as { max?: number }).max;
      if (max && current.length >= max) {
        updated = [...current.slice(1), value];
      } else {
        updated = [...current, value];
      }
    }
    setAnswers((prev) => ({ ...prev, [currentStep.id]: updated }));
  }

  function canAdvance(): boolean {
    if (currentStep.type === "welcome" || currentStep.type === "review") return true;

    if (currentStep.type === "guided-shop-vision") {
      return shopVisionText.trim().length > 0;
    }
    if (currentStep.type === "guided-target-customer") {
      return targetCustomerText.trim().length > 0;
    }
    if (currentStep.type === "guided-differentiation") {
      // Deferred counts as answered — founder can proceed
      return diffState.deferred || diffState.synthesized.trim().length > 0;
    }

    const ans = answers[currentStep.id];
    if (!ans) return false;
    if (currentStep.type === "city-autocomplete") {
      return (
        typeof ans === "object" &&
        !Array.isArray(ans) &&
        Boolean((ans as LocationSelection).city)
      );
    }
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
      const concept = buildConcept(wizardState, firstName || "My");
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
          .insert({ user_id: userId, plan_name: planName })
          .select("id")
          .single();
        if (planError || !plan) throw planError ?? new Error("Could not create plan");
        planId = plan.id;
      } else {
        await supabase
          .from("coffee_shop_plans")
          .update({ plan_name: planName })
          .eq("id", planId);
      }

      const { error: profileError } = await supabase
        .from("users")
        .update({
          onboarding_completed: true,
          onboarding_data: buildOnboardingData(wizardState),
          readiness_score: 5,
        })
        .eq("id", userId);
      if (profileError) throw profileError;

      const { error: conceptError } = await supabase
        .from("workspace_documents")
        .upsert(
          { plan_id: planId, workspace_key: "concept", content: concept },
          { onConflict: "plan_id,workspace_key" },
        );
      if (conceptError) throw conceptError;

      // TIM-1417: brand_pillars from onboarding flow feed the Marketing
      // workspace's Story And Brand section on first open. Persist as part of
      // the marketing workspace_document under workspace_key='marketing'.
      const brandPillars = Array.isArray(wizardState.answers.brand_pillars)
        ? (wizardState.answers.brand_pillars as string[])
        : [];
      if (brandPillars.length > 0) {
        const differentiator = brandPillars.filter(Boolean).join(", ");
        await supabase.from("workspace_documents").upsert(
          {
            plan_id: planId,
            workspace_key: "marketing",
            content: {
              overview: { narrative: "" },
              channels: { selected: [] },
              story: {
                founder_story: "",
                origin: "",
                differentiator,
                target_customer: "",
              },
              pre_launch: { milestones: [] },
              last_generated_at: null,
            },
          },
          { onConflict: "plan_id,workspace_key" },
        );
      }

      await supabase.from("milestones").insert([
        {
          plan_id: planId,
          title: "Complete onboarding",
          description: `Tell ${COPILOT_NAME} about your vision`,
          target_date: new Date().toISOString().split("T")[0],
          completed_at: new Date().toISOString(),
          is_auto_generated: true,
        },
        {
          plan_id: planId,
          title: "Polish your Concept workspace",
          description:
            `Refine mission, target customer, differentiation, and brand voice with ${COPILOT_NAME}.`,
          target_date: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          )
            .toISOString()
            .split("T")[0],
          is_auto_generated: true,
        },
        ...(diffState.deferred
          ? [
              {
                plan_id: planId,
                title: "Come back: How will you stand out?",
                description:
                  "You deferred the differentiation question. Visit a few local shops and come back to answer it.",
                target_date: new Date(
                  Date.now() + 14 * 24 * 60 * 60 * 1000,
                )
                  .toISOString()
                  .split("T")[0],
                is_auto_generated: true,
              },
            ]
          : []),
      ]);

      clearDraft();
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
      setStep((s) => s + 1);
    } else {
      await handleFinish();
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] sm:bg-[var(--warm-750)] sm:flex sm:items-start sm:justify-center sm:py-12 sm:px-4">
      <div className="flex flex-col w-full sm:max-w-[680px] bg-[var(--background)] min-h-screen sm:min-h-0 sm:rounded-2xl sm:shadow-lg sm:overflow-hidden">
      <header className="px-6 pt-6 pb-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="Groundwork home">
            <LogoMark variant="color" height={28} />
          </Link>
          <span className="text-xs text-[var(--dark-grey)]">
            Step {step + 1} of {totalSteps}
          </span>
        </div>
        {/* Progress bar — amber for deferred, teal for done, gray for pending */}
        <div
          className="flex gap-1.5"
          aria-label={`Step ${step + 1} of ${totalSteps}`}
        >
          {STEPS.map((_, i) => {
            const status = getStepStatus(i, step, diffState.deferred);
            return (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${
                  status === "done" || status === "current"
                    ? "bg-[var(--teal)]"
                    : status === "deferred"
                    ? "bg-[var(--warning)]"
                    : "bg-[var(--warm-650)]"
                }`}
              />
            );
          })}
        </div>
        {diffState.deferred && (
          <p className="text-xs text-[var(--warning-darker)] bg-[var(--warning-bg)] border border-[var(--warning-amber-2)] rounded-lg px-3 py-1.5">
            One question deferred: How will you stand out? You can finish onboarding and come back.
          </p>
        )}
      </header>

      <main ref={stepContainerRef} tabIndex={-1} style={{ outline: "none" }} className="flex-1 px-6 py-8 flex flex-col">
        {currentStep.type === "welcome" && (
          <div className="flex-1 flex flex-col justify-center">
            <div className="relative w-full rounded-2xl overflow-hidden mb-6" style={{ height: "180px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.pexels.com/photos/4350061/pexels-photo-4350061.jpeg?auto=compress&cs=tinysrgb&w=900&h=360&dpr=1"
                alt="Cozy coffee shop interior with warm morning light"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 rounded-2xl" style={{ background: "linear-gradient(to bottom, transparent 40%, rgba(12,58,61,0.6) 100%)" }} />
            </div>
            <h1 className="text-3xl font-bold text-[var(--foreground)] mb-4">
              Hi {firstName}, welcome.
            </h1>
            <p className="text-[var(--muted-foreground)] text-base leading-relaxed">
              A few questions and we&apos;ll seed your Concept workspace, the
              home of your mission, your target customer, and your brand voice.
              {COPILOT_NAME} reads it across every workspace from this point on.
            </p>
          </div>
        )}

        {/* TIM-821: guided shop vision screen */}
        {currentStep.type === "guided-shop-vision" && (
          <ShopVisionScreen
            meta={shopVisionMeta}
            synthesized={shopVisionText}
            onMetaChange={(meta) =>
              setWizardState((s) => ({ ...s, shopVisionMeta: meta }))
            }
            onSynthesizedChange={(text) =>
              setWizardState((s) => ({ ...s, shopVisionText: text }))
            }
          />
        )}

        {/* TIM-821: guided target customer screen */}
        {currentStep.type === "guided-target-customer" && (
          <TargetCustomerScreen
            meta={targetCustomerMeta}
            synthesized={targetCustomerText}
            onMetaChange={(meta) =>
              setWizardState((s) => ({ ...s, targetCustomerMeta: meta }))
            }
            onSynthesizedChange={(text) =>
              setWizardState((s) => ({ ...s, targetCustomerText: text }))
            }
          />
        )}

        {/* TIM-821: guided differentiation screen — deferrable */}
        {currentStep.type === "guided-differentiation" && (
          <DifferentiationScreen
            state={diffState}
            onChange={(ds) =>
              setWizardState((s) => ({ ...s, diffState: ds }))
            }
          />
        )}

        {currentStep.type !== "welcome" &&
          currentStep.type !== "review" &&
          currentStep.type !== "guided-shop-vision" &&
          currentStep.type !== "guided-target-customer" &&
          currentStep.type !== "guided-differentiation" && (
            <div>
              <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
                {(currentStep as { question: string }).question}
              </h1>
              <p className="text-[var(--dark-grey)] text-sm mb-8">
                {(currentStep as { hint: string }).hint}
              </p>

              {(currentStep.type === "cards" ||
                currentStep.type === "radio") && (
                <div className="space-y-3">
                  {(currentStep as { options: ReadonlyArray<string> }).options.map(
                    (opt) => {
                      const isSelected =
                        typeof currentAnswer === "string" &&
                        currentAnswer === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => handleSelect(opt)}
                          className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-3 ${
                            isSelected
                              ? "border-[var(--teal)] bg-[var(--teal)]/5 text-[var(--teal)] font-medium"
                              : "border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--dark-grey)]"
                          }`}
                        >
                          {currentStep.type === "radio" && (
                            <span
                              className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                                isSelected
                                  ? "border-[var(--teal)]"
                                  : "border-[var(--dark-grey)]"
                              }`}
                            >
                              {isSelected && (
                                <span className="w-2 h-2 rounded-full bg-[var(--teal)] block" />
                              )}
                            </span>
                          )}
                          {opt}
                        </button>
                      );
                    },
                  )}
                </div>
              )}

              {currentStep.type === "text" && (
                <>
                  {currentStep.id === "shop_name" && (
                    <FieldExamplePopover examples={FIELD_EXAMPLES.shop_identity} />
                  )}
                  <input
                    type="text"
                    value={
                      typeof currentAnswer === "string" ? currentAnswer : ""
                    }
                    onChange={(e) => handleSelect(e.target.value)}
                    placeholder={(currentStep as { placeholder: string }).placeholder}
                    className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--dark-grey)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-white"
                  />
                </>
              )}

              {currentStep.type === "city-autocomplete" && (
                <CityAutocompleteInput
                  value={currentAnswer as LocationSelection | null}
                  onChange={(v) =>
                    setAnswers((prev) => {
                      if (!v) {
                        const next = { ...prev };
                        delete next[currentStep.id];
                        return next;
                      }
                      return { ...prev, [currentStep.id]: v };
                    })
                  }
                />
              )}

              {currentStep.type === "textarea" && (
                <>
                  <textarea
                    value={
                      typeof currentAnswer === "string" ? currentAnswer : ""
                    }
                    onChange={(e) => handleSelect(e.target.value)}
                    placeholder={(currentStep as { placeholder: string }).placeholder}
                    rows={4}
                    className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--dark-grey)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-white resize-none leading-relaxed"
                  />
                  {(currentStep as { minChars?: number }).minChars ? (
                    <p className="text-xs text-[var(--dark-grey)] mt-2">
                      {Math.min(
                        (
                          typeof currentAnswer === "string"
                            ? currentAnswer
                            : ""
                        ).trim().length,
                        (currentStep as { minChars: number }).minChars,
                      )}
                      /
                      {(currentStep as { minChars: number }).minChars}{" "}
                      characters minimum
                    </p>
                  ) : null}
                </>
              )}

              {currentStep.type === "multiselect" && (
                <div className="space-y-3">
                  {(
                    currentStep as { options: ReadonlyArray<string> }
                  ).options.map((opt) => {
                    const selected =
                      Array.isArray(currentAnswer) &&
                      currentAnswer.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleMultiSelect(opt)}
                        className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-3 ${
                          selected
                            ? "border-[var(--teal)] bg-[var(--teal)]/5 text-[var(--teal)] font-medium"
                            : "border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--dark-grey)]"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                            selected
                              ? "bg-[var(--teal)] border-[var(--teal)]"
                              : "border-[var(--dark-grey)]"
                          }`}
                        >
                          {selected && (
                            <span className="text-white text-xs">
                              &#10003;
                            </span>
                          )}
                        </div>
                        {SHOP_TYPE_RECIPE[opt] && (
                          <Illustration
                            recipeId={SHOP_TYPE_RECIPE[opt]}
                            className="h-12 w-auto flex-shrink-0"
                          />
                        )}
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
            <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
              {currentStep.question}
            </h1>
            <p className="text-[var(--dark-grey)] text-sm mb-6">{currentStep.hint}</p>
            <ReviewSummary wizardState={wizardState} firstName={firstName} />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-sm text-[var(--error)] mt-4 bg-[var(--warning-amber-bg-10)] border border-[var(--error-bg-9)] rounded-xl px-3 py-2"
          >
            {error}
          </p>
        )}
      </main>

      <div className="sticky bottom-0 sm:static bg-[var(--background)] border-t border-[var(--border)] px-6 py-4 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="px-6 py-3 border border-[var(--border)] rounded-xl text-sm text-[var(--dark-grey)] hover:border-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors"
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={!canAdvance() || saving}
          className="flex-1 bg-[var(--teal)] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[var(--teal-dark)] transition-colors disabled:opacity-40"
        >
          {saving
            ? "Saving your Concept..."
            : step === totalSteps - 1
            ? "Open my Concept workspace"
            : "Next"}
        </button>
      </div>
      </div>
    </div>
  );
}

// ─── City autocomplete ───────────────────────────────────────────────────────

function CityAutocompleteInput({
  value,
  onChange,
}: {
  value: LocationSelection | null;
  onChange: (v: LocationSelection | null) => void;
}) {
  const [inputValue, setInputValue] = useState(value?.displayName ?? "");
  const [results, setResults] = useState<LocationSelection[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setInputValue(v);
    setActiveIndex(-1);
    if (value) onChange(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (v.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/cities/search?q=${encodeURIComponent(v.trim())}`,
        );
        if (res.ok) {
          const data = await res.json();
          const list: LocationSelection[] = data.results ?? [];
          setResults(list);
          setOpen(list.length > 0);
        }
      } catch {
        // silent fail
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function handleSelect(item: LocationSelection) {
    onChange(item);
    setInputValue(item.displayName);
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
  }

  function handleClear() {
    onChange(null);
    setInputValue("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="city-listbox"
          aria-activedescendant={
            activeIndex >= 0 ? `city-option-${activeIndex}` : undefined
          }
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a city name..."
          className="w-full border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--dark-grey)] focus-visible:outline-none focus:border-[var(--teal)] transition-colors bg-white pr-10"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-4 h-4 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && value && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear city selection"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--dark-grey)] hover:text-[var(--foreground)] transition-colors text-xl leading-none"
          >
            &#215;
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          id="city-listbox"
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white border border-[var(--border)] rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto"
        >
          {results.map((item, i) => (
            <li
              key={item.displayName}
              id={`city-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item);
              }}
              className={`px-4 py-3 text-sm cursor-pointer transition-colors ${
                i === activeIndex
                  ? "bg-[var(--teal)]/10 text-[var(--teal)]"
                  : "text-[var(--foreground)] hover:bg-[var(--warm-300)]"
              }`}
            >
              <span className="font-medium">{item.city}</span>
              {(item.region || item.countryCode) && (
                <span className="text-[var(--dark-grey)] ml-1.5">
                  {[item.region, item.countryCode].filter(Boolean).join(", ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Review summary ──────────────────────────────────────────────────────────

function ReviewSummary({
  wizardState,
  firstName,
}: {
  wizardState: WizardState;
  firstName: string;
}) {
  const concept = buildConcept(wizardState, firstName || "My");
  const { diffState } = wizardState;

  const rows: Array<{ label: string; value: string; deferred?: boolean }> = [
    { label: "Shop name", value: concept.name },
    { label: "What kind of shop", value: concept.mission },
    { label: "Target Customer Personas", value: concept.target_market },
    {
      label: "Differentiation",
      value: diffState.deferred ? "" : concept.differentiation,
      deferred: diffState.deferred,
    },
    { label: "Brand voice", value: concept.brand_voice },
  ];

  return (
    <div className="bg-white border border-[var(--border)] rounded-2xl divide-y divide-[var(--border)]">
      {rows.map((row) => (
        <div key={row.label} className="px-4 py-3">
          <p className="text-xs text-[var(--dark-grey)] uppercase tracking-wide">
            {row.label}
          </p>
          {row.deferred ? (
            <p className="text-sm text-[var(--warning-darker)] mt-1 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--warning)]" />
              Deferred: come back after your shop visits
            </p>
          ) : (
            <p className="text-sm text-[var(--foreground)] mt-1 whitespace-pre-wrap">
              {row.value ? (
                row.value
              ) : (
                <span className="text-[var(--dark-grey)]">—</span>
              )}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
