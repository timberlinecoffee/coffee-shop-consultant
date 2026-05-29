"use client";

// TIM-1268: personable dashboard hero. Replaces the old readiness-% hero the
// founder disliked. Shows a time-of-day greeting (varied per visit so it does
// not feel robotic) and a rotating coffee shop fact. Voice is warm and
// plainspoken — no AI-jargon, no emojis, no em dashes.
//
// Greeting + fact derive from the browser's local time, so they are computed
// client-side via useSyncExternalStore (same idiom as app-sidebar). The server
// snapshot returns null, so SSR and the first client render both show a stable
// "Welcome back" fallback — no hydration mismatch — then the personalized
// greeting fills in after hydration.

import { useCallback, useRef, useSyncExternalStore } from "react";

type PartOfDay = "morning" | "afternoon" | "evening" | "night";

const GREETINGS: Record<PartOfDay, string[]> = {
  morning: ["Good morning", "Morning", "Rise and shine", "Hope your morning's off to a good start"],
  afternoon: ["Good afternoon", "Afternoon", "Hope your day's going well"],
  evening: ["Good evening", "Evening", "Hope you had a good day"],
  night: ["Still up", "Burning the late-night oil", "It's late, but here you are", "Working late tonight"],
};

const COFFEE_FACTS: string[] = [
  "Espresso means pressed out. Hot water is forced through finely ground coffee in about 25 to 30 seconds.",
  "A flat white and a latte start from the same shot. The flat white just has less milk and a thinner layer of foam.",
  "Most of a drink's cost walks out the door as labor and milk, not the beans themselves.",
  "Lighter roasts carry a touch more caffeine than dark roasts. Roasting burns a little of it off.",
  "People judge a coffee shop in the first few seconds, before they ever taste anything. The room does a lot of the selling.",
  "Cold brew and iced coffee are not the same drink. Cold brew steeps for hours in cold water, which makes it smoother and less acidic.",
  "A regular is worth far more over a year than a one-time visitor. The morning routine is the whole business.",
  "The crema is the golden layer on top of an espresso. It comes from oils and gases in fresh-roasted beans.",
  "Beans lose their best flavor within a few weeks of roasting, so freshness on the shelf is part of the product.",
  "A cappuccino is roughly equal parts espresso, steamed milk, and foam. A latte is mostly milk.",
  "Steaming milk well is more about sound and texture than temperature. You are after a smooth, glossy microfoam.",
  "Ethiopia is widely considered the birthplace of coffee, where the plant still grows wild today.",
  "For most cafes the busiest stretch is 7 to 9 in the morning. Staffing that rush well can make or break the day.",
  "A short, well-built menu tends to sell more than a long one. A few good choices beat a wall of options.",
  "Decaf still has a little caffeine in it, usually around three percent of what a regular cup carries.",
];

interface HeroContent {
  greeting: string;
  fact: string;
}

function partOfDay(hour: number): PartOfDay {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function computeContent(): HeroContent {
  const hour = new Date().getHours();
  return {
    greeting: pick(GREETINGS[partOfDay(hour)]),
    fact: pick(COFFEE_FACTS),
  };
}

const subscribe = () => () => {};

export function DashboardHero({ firstName }: { firstName: string }) {
  // Cache the computed content so getSnapshot returns a stable reference and
  // the greeting/fact stay fixed across re-renders within a visit.
  const cacheRef = useRef<HeroContent | null>(null);
  const getSnapshot = useCallback((): HeroContent => {
    if (!cacheRef.current) cacheRef.current = computeContent();
    return cacheRef.current;
  }, []);

  const content = useSyncExternalStore<HeroContent | null>(
    subscribe,
    getSnapshot,
    () => null,
  );

  return (
    <div className="mb-10">
      <h1 className="text-3xl font-bold text-[var(--foreground)] tracking-tight">
        {content ? `${content.greeting}, ${firstName}.` : `Welcome back, ${firstName}.`}
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--muted-foreground)]">
        {content?.fact ?? COFFEE_FACTS[0]}
      </p>
    </div>
  );
}
