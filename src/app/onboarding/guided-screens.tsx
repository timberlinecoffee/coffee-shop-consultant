"use client";

// TIM-821: Three guided onboarding screens for shop_vision, target_customer,
// and differentiation. Replaces the cold-ask textarea steps from TIM-619.
// Each screen scaffolds the founder before asking for a synthesized answer.

import { useState } from "react";
import { EducationBlock } from "@/components/onboarding/education-block";
import { ExampleDrawer } from "@/components/onboarding/example-drawer";
import {
  ObservationTracker,
  type ObservationEntry,
} from "@/components/onboarding/observation-tracker";

// ─── Shared types ────────────────────────────────────────────────────────────

export interface ShopVisionMeta {
  usage_types: string[];
  great_visit: string;
  coffee_vs_experience: string;
}

export interface TargetCustomerMeta {
  neighborhood: string;
  ideal_customer: string;
  pre_post_visit: string;
}

export interface DifferentiationMeta {
  gap_noticed: string;
  closest_competitor: string;
  unique_offering: string;
}

// ─── Screen 1: What kind of shop are you building? ───────────────────────────

const VISION_USAGE_OPTIONS = [
  "Quick stop (under 10 minutes in and out)",
  "Work or study for hours",
  "Drive-through or walk-up window",
  "Sit and have a real conversation",
  "Take a bag of beans home",
  "Other",
];

const VISION_CVE_OPTIONS = [
  "Coffee is the main draw and I want it to be exceptional",
  "Coffee is the anchor, but the place and vibe matter just as much",
  "Coffee is part of a broader food or retail concept",
];

const VISION_EXAMPLES = [
  "We're a drive-through window in a strip mall parking lot. Coffee is the point: fast, good, consistent. Think Dutch Bros, not Blue Bottle.",
  "We're a sit-down spot with a counter, five tables, and a turntable. People come to slow down. We don't have wifi on purpose.",
  "We roast on-site and sell bags wholesale. The cafe is really a showroom for the roastery.",
];

interface ShopVisionScreenProps {
  meta: ShopVisionMeta;
  synthesized: string;
  onMetaChange: (meta: ShopVisionMeta) => void;
  onSynthesizedChange: (value: string) => void;
}

export function ShopVisionScreen({
  meta,
  synthesized,
  onMetaChange,
  onSynthesizedChange,
}: ShopVisionScreenProps) {
  const [skipped, setSkipped] = useState(false);

  function toggleUsage(option: string) {
    const current = meta.usage_types;
    const next = current.includes(option)
      ? current.filter((v) => v !== option)
      : [...current, option];
    onMetaChange({ ...meta, usage_types: next });
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">
            What kind of shop are you building?
          </h1>
        </div>
        {!skipped && (
          <button
            type="button"
            onClick={() => setSkipped(true)}
            className="text-xs text-[#6b6b6b] hover:text-[#155e63] hover:underline transition-colors ml-4 mt-1 shrink-0"
          >
            Already know your shop type? Skip to summary
          </button>
        )}
      </div>

      <EducationBlock
        intro={`Most coffee shops fall into one of a few categories. Knowing which one you're building changes everything from your menu to your lease to who you hire.\n\nThis isn't asking for a tagline. It's asking: what role does your shop play in someone's day?\n\nA few real examples:`}
        examples={[
          {
            name: "Stumptown (Portland)",
            descriptor:
              "a specialty roaster where the coffee itself is the point: origin, process, craft.",
          },
          {
            name: "Dunkin'",
            descriptor:
              "reliable fuel for busy people on the move. Speed and consistency over ceremony.",
          },
          {
            name: "The Living Room Coffee House (Boulder)",
            descriptor:
              "a third place for remote workers. Long tables, good wifi, no one rushes you.",
          },
          {
            name: "Verve (Santa Cruz)",
            descriptor:
              "a neighborhood anchor with a roastery attached: part cafe, part community hub.",
          },
        ]}
      />

      {!skipped && (
        <div className="space-y-6 mb-6">
          <div>
            <p className="text-sm font-semibold text-[#1a1a1a] mb-3">
              1. How will customers use your shop?
            </p>
            <div className="space-y-2">
              {VISION_USAGE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleUsage(opt)}
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-3 ${
                    meta.usage_types.includes(opt)
                      ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                      : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      meta.usage_types.includes(opt)
                        ? "bg-[#155e63] border-[#155e63]"
                        : "border-[#afafaf]"
                    }`}
                  >
                    {meta.usage_types.includes(opt) && (
                      <span className="text-white text-xs">&#10003;</span>
                    )}
                  </div>
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-[#1a1a1a] mb-1">
              2. What does a great visit look like to your ideal customer?
            </p>
            <p className="text-xs text-[#afafaf] mb-2">One or two sentences is enough.</p>
            <textarea
              value={meta.great_visit}
              onChange={(e) =>
                onMetaChange({ ...meta, great_visit: e.target.value })
              }
              placeholder="They walked in, ordered fast, and made it to work on time."
              rows={3}
              className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-white resize-none leading-relaxed"
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-[#1a1a1a] mb-3">
              3. Is coffee the main draw, or is it part of a bigger experience?
            </p>
            <div className="space-y-2">
              {VISION_CVE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    onMetaChange({ ...meta, coffee_vs_experience: opt })
                  }
                  className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors flex items-center gap-3 ${
                    meta.coffee_vs_experience === opt
                      ? "border-[#155e63] bg-[#155e63]/5 text-[#155e63] font-medium"
                      : "border-[#efefef] bg-white text-[#1a1a1a] hover:border-[#afafaf]"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      meta.coffee_vs_experience === opt
                        ? "border-[#155e63]"
                        : "border-[#afafaf]"
                    }`}
                  >
                    {meta.coffee_vs_experience === opt && (
                      <span className="w-2 h-2 rounded-full bg-[#155e63] block" />
                    )}
                  </span>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ExampleDrawer examples={VISION_EXAMPLES} />

      <div>
        <label className="block text-sm font-semibold text-[#1a1a1a] mb-1">
          Describe your shop in a sentence or two.
        </label>
        <p className="text-xs text-[#afafaf] mb-2">
          {skipped
            ? "You can always come back and add more detail."
            : "You built this from the questions above. Change anything you'd like."}
        </p>
        <textarea
          value={synthesized}
          onChange={(e) => onSynthesizedChange(e.target.value)}
          placeholder="We're a neighborhood cafe focused on..."
          rows={3}
          className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-white resize-none leading-relaxed"
        />
      </div>
    </div>
  );
}

// ─── Screen 2: Who are you building this shop for? ───────────────────────────

const CUSTOMER_EXAMPLES = [
  "My customer is a 30-something professional who walks to work. She has opinions about coffee but doesn't want to spend 15 minutes on it. She wants a good flat white, a clean space, and to be out in under five minutes.",
  "My customer is a retired guy who comes in every morning around 7, reads the paper, and stays for an hour. He's a regular before I even open. I'm building the whole thing around making him feel at home.",
];

interface TargetCustomerScreenProps {
  meta: TargetCustomerMeta;
  synthesized: string;
  onMetaChange: (meta: TargetCustomerMeta) => void;
  onSynthesizedChange: (value: string) => void;
}

export function TargetCustomerScreen({
  meta,
  synthesized,
  onMetaChange,
  onSynthesizedChange,
}: TargetCustomerScreenProps) {
  const [skipped, setSkipped] = useState(false);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">
          Who are you building this shop for?
        </h1>
        {!skipped && (
          <button
            type="button"
            onClick={() => setSkipped(true)}
            className="text-xs text-[#6b6b6b] hover:text-[#155e63] hover:underline transition-colors ml-4 mt-1 shrink-0"
          >
            Already know your customer? Skip to summary
          </button>
        )}
      </div>

      <EducationBlock
        intro={`Almost every new shop owner says "everyone." That's not an answer. It makes every decision harder.\n\nWhen you name a real, specific customer, everything else gets easier. Your hours, your music, your prices, your seating all flow from who you're designing for.\n\nYou don't have to be exclusive. You're just starting with someone real.\n\nA few examples of what a specific customer looks like:`}
        examples={[
          {
            name: "Morning commuters",
            descriptor:
              "who need a fast, reliable cortado before the 8:15 bus.",
          },
          {
            name: "Parents with strollers",
            descriptor:
              "who need space, patience, and something that isn't loud or rushed.",
          },
          {
            name: "College students",
            descriptor:
              "pulling all-nighters who want cheap drip, strong wifi, and somewhere to sit until 1am.",
          },
          {
            name: "Remote workers",
            descriptor:
              "who need a change of scenery and a place that doesn't feel transactional.",
          },
        ]}
      />

      {!skipped && (
        <div className="space-y-6 mb-6">
          <div>
            <p className="text-sm font-semibold text-[#1a1a1a] mb-1">
              1. Who lives or works within a 10-minute walk or drive of your
              location?
            </p>
            <textarea
              value={meta.neighborhood}
              onChange={(e) =>
                onMetaChange({ ...meta, neighborhood: e.target.value })
              }
              placeholder="A lot of commuters heading downtown, some families, a few apartment buildings with young professionals."
              rows={2}
              className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-white resize-none leading-relaxed"
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-[#1a1a1a] mb-1">
              2. Who do you most want to serve? Whose success makes you feel
              like the day was worth it?
            </p>
            <textarea
              value={meta.ideal_customer}
              onChange={(e) =>
                onMetaChange({ ...meta, ideal_customer: e.target.value })
              }
              placeholder="The nurse coming off a night shift who just needs one good thing before she sleeps."
              rows={2}
              className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-white resize-none leading-relaxed"
            />
          </div>

          <div>
            <p className="text-sm font-semibold text-[#1a1a1a] mb-1">
              3. What does your customer do right before or right after they
              visit you?
            </p>
            <p className="text-xs text-[#afafaf] mb-2">
              Helps you understand their context.
            </p>
            <textarea
              value={meta.pre_post_visit}
              onChange={(e) =>
                onMetaChange({ ...meta, pre_post_visit: e.target.value })
              }
              placeholder="They drop the kids at school, then come to us before heading to the office."
              rows={2}
              className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-white resize-none leading-relaxed"
            />
          </div>
        </div>
      )}

      <ExampleDrawer examples={CUSTOMER_EXAMPLES} />

      <div>
        <label className="block text-sm font-semibold text-[#1a1a1a] mb-1">
          Describe your core customer in a sentence or two.
        </label>
        <p className="text-xs text-[#afafaf] mb-2">
          {skipped
            ? "You can always add more detail later."
            : "This doesn't have to be perfect. You'll refine it as you learn more."}
        </p>
        <textarea
          value={synthesized}
          onChange={(e) => onSynthesizedChange(e.target.value)}
          placeholder="My core customer is..."
          rows={3}
          className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-white resize-none leading-relaxed"
        />
      </div>
    </div>
  );
}

// ─── Screen 3: How will you stand out? ───────────────────────────────────────

const DIFF_EXAMPLES = [
  "Every cafe near me is designed for solo workers with laptops. Nobody caters to groups. We're putting in big communal tables and encouraging conversation. Our differentiator is: you don't have to whisper here.",
  "The two shops near me close at 2pm. My differentiation is being open until 10pm for the after-dinner crowd who wants something better than dessert wine.",
];

export interface DifferentiationState {
  observations: ObservationEntry[];
  meta: DifferentiationMeta;
  synthesized: string;
  deferred: boolean;
  skippedObservation: boolean;
}

interface DifferentiationScreenProps {
  state: DifferentiationState;
  onChange: (state: DifferentiationState) => void;
}

export function DifferentiationScreen({
  state,
  onChange,
}: DifferentiationScreenProps) {
  const { observations, meta, synthesized, deferred, skippedObservation } =
    state;

  const step2Unlocked =
    observations.some((o) => o.shop_name.trim().length > 0) ||
    skippedObservation;

  function update(partial: Partial<DifferentiationState>) {
    onChange({ ...state, ...partial });
  }

  if (deferred) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-[#1a1a1a] mb-4">
          How will you stand out?
        </h1>
        <div className="bg-[#fffbeb] border border-[#fcd34d] rounded-xl px-4 py-3 mb-6">
          <p className="text-sm text-[#92400e] font-medium">
            You will want real-world info before answering this.
          </p>
        </div>
        <div className="bg-[#f5f3ef] border border-[#e5e3de] rounded-xl px-5 py-4 text-center">
          <p className="text-sm text-[#6b6b6b] mb-3">
            This question is saved for later. Complete the rest of your
            onboarding now and come back once you've visited a few local shops.
          </p>
          <button
            type="button"
            onClick={() => update({ deferred: false })}
            className="text-sm text-[#155e63] hover:underline"
          >
            I'm ready to answer now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <h1 className="text-2xl font-bold text-[#1a1a1a]">
          How will you stand out?
        </h1>
        {!skippedObservation && (
          <button
            type="button"
            onClick={() => update({ skippedObservation: true })}
            className="text-xs text-[#6b6b6b] hover:text-[#155e63] hover:underline transition-colors ml-4 mt-1 shrink-0"
          >
            Already have a clear differentiator? Skip the observation step
          </button>
        )}
      </div>

      <div className="bg-[#fffbeb] border border-[#fcd34d] rounded-xl px-4 py-3 mb-5">
        <p className="text-sm text-[#92400e] font-medium">
          You will want real-world info before answering this.
        </p>
      </div>

      <EducationBlock
        intro={`This is one of the most important questions you'll answer. It is also one of the hardest to answer cold.\n\nMost people guess. They say "better quality" or "friendlier service." Those answers won't help you.\n\nThe owners who get this right go look first.\n\nBefore you answer, visit 3 coffee shops near where you plan to open. Not to copy them, but to understand them. What are they doing well? What frustrates you as a customer? What's missing that you'd want?\n\nYour observations will become the foundation of your answer.`}
      />

      {!skippedObservation && (
        <div className="mb-6">
          <ObservationTracker
            entries={observations}
            onEntriesChange={(entries) => update({ observations: entries })}
            onDefer={() => update({ deferred: true })}
          />
        </div>
      )}

      <div
        className={`space-y-4 mb-6 ${
          !step2Unlocked ? "opacity-40 pointer-events-none select-none" : ""
        }`}
      >
        <p className="text-sm font-semibold text-[#1a1a1a]">
          STEP 2: Now that you've looked around, answer these
        </p>
        {!step2Unlocked && (
          <p className="text-xs text-[#afafaf]">
            Add at least one shop observation above to unlock these questions.
          </p>
        )}

        <div>
          <p className="text-sm font-semibold text-[#1a1a1a] mb-1">
            1. What gap did you notice most often across the shops you visited?
          </p>
          <textarea
            value={meta.gap_noticed}
            onChange={(e) =>
              onChange({
                ...state,
                meta: { ...meta, gap_noticed: e.target.value },
              })
            }
            placeholder="Every shop was quiet and a little cold. Nobody made me feel welcome when I walked in."
            rows={2}
            disabled={!step2Unlocked}
            className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-white resize-none leading-relaxed disabled:bg-[#f5f5f3]"
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-[#1a1a1a] mb-1">
            2. Who is your closest competitor? What do they do well, and what
            would you do differently?
          </p>
          <textarea
            value={meta.closest_competitor}
            onChange={(e) =>
              onChange({
                ...state,
                meta: { ...meta, closest_competitor: e.target.value },
              })
            }
            placeholder="Ritual on Valencia. Great coffee, but it feels cold and the staff turnover shows."
            rows={2}
            disabled={!step2Unlocked}
            className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-white resize-none leading-relaxed disabled:bg-[#f5f5f3]"
          />
        </div>

        <div>
          <p className="text-sm font-semibold text-[#1a1a1a] mb-1">
            3. What will a customer get from you that they genuinely cannot get
            easily anywhere else nearby?
          </p>
          <textarea
            value={meta.unique_offering}
            onChange={(e) =>
              onChange({
                ...state,
                meta: { ...meta, unique_offering: e.target.value },
              })
            }
            placeholder="The only shop open past 9pm on the east side."
            rows={2}
            disabled={!step2Unlocked}
            className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-white resize-none leading-relaxed disabled:bg-[#f5f5f3]"
          />
        </div>
      </div>

      <ExampleDrawer examples={DIFF_EXAMPLES} />

      <div>
        <label className="block text-sm font-semibold text-[#1a1a1a] mb-1">
          What makes your shop different?
        </label>
        <p className="text-xs text-[#afafaf] mb-2">
          Be specific. "Better coffee" isn't a differentiator. "The only shop
          open past 9pm on the east side" is.
        </p>
        <textarea
          value={synthesized}
          onChange={(e) => update({ synthesized: e.target.value })}
          placeholder="We're different because..."
          rows={3}
          className="w-full border border-[#efefef] rounded-xl px-4 py-3 text-sm text-[#1a1a1a] placeholder-[#afafaf] focus:outline-none focus:border-[#155e63] transition-colors bg-white resize-none leading-relaxed"
        />
      </div>
    </div>
  );
}
