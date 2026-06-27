// TIM-3155: skip/resume banner for the project intake interview.
// Shown when a Pro user created a 2nd+ project but has not completed or dismissed the
// per-project onboarding interview. Polls GET /api/projects/[id]/intake on mount.
//
// DismissibleCallout is not used here because it persists dismissal to the user-level
// `dismissedCallouts` table (keyed by a string constant). This banner requires
// per-project persistence via POST /api/projects/[id]/intake { dismissed: true }, which
// is incompatible with DismissibleCallout's user-scoped model.
"use client";

import { useEffect, useState } from "react";
import { OnboardingFlow } from "@/app/onboarding/onboarding-flow";

interface IntakeState {
  completed: boolean;
  dismissed: boolean;
}

export function IntakeBanner({ planId, subscriptionTier }: { planId: string; subscriptionTier: string }) {
  const [intake, setIntake] = useState<IntakeState | null>(null);
  const [showInterview, setShowInterview] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    // TIM-3274: skip intake fetch for non-Pro users — they will never see the banner.
    if (subscriptionTier !== "pro") return;
    fetch(`/api/projects/${planId}/intake`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setIntake({ completed: data.completed, dismissed: data.dismissed });
      })
      .catch(() => {});
  }, [planId, subscriptionTier]);

  async function handleDismiss() {
    if (dismissing) return;
    setDismissing(true);
    try {
      await fetch(`/api/projects/${planId}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed: true }),
      });
      setIntake((prev) => prev ? { ...prev, dismissed: true } : prev);
    } catch {
      // silent
    } finally {
      setDismissing(false);
    }
  }

  // TIM-3274: AC5 guard — free/legacy users never see the interview prompt.
  if (subscriptionTier !== "pro") return null;

  if (!intake || intake.completed || intake.dismissed) return null;

  if (showInterview) {
    return (
      <div
        className="fixed inset-0 z-[60] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Project interview"
      >
        <OnboardingFlow
          projectId={planId}
          onDismiss={() => {
            setShowInterview(false);
            // Re-fetch to sync completed/dismissed state
            fetch(`/api/projects/${planId}/intake`)
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => {
                if (data) setIntake({ completed: data.completed, dismissed: data.dismissed });
              })
              .catch(() => {});
          }}
        />
      </div>
    );
  }

  return (
    <div
      role="status"
      data-testid="intake-banner"
      className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border bg-[var(--teal-bg-50)] border-[var(--teal-tint)] mb-6"
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[var(--teal)]">
          This project is missing its interview answers
        </p>
        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
          A quick interview helps the Copilot give project-specific advice for this location.
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={() => setShowInterview(true)}
          className="text-xs font-semibold px-3 py-1.5 rounded-xl border bg-[var(--teal)] border-[var(--teal)] text-white hover:bg-[var(--teal-dark)] transition-colors"
        >
          Complete Your Project Interview
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={dismissing}
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
        >
          Don&apos;t Ask Again
        </button>
      </div>
    </div>
  );
}
