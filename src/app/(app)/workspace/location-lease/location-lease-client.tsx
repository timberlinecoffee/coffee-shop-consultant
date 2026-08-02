"use client";

// TIM-4108 (UX Phase 3): third of eleven, and the first list-shaped one.
//
// Location & Lease is not a path you walk — it is a shortlist you build. Per
// Trent's ruling (D-011) it gets a plain factual count in the header instead of
// a progress bar, because there is no "done" to be a fraction of.
//
// The emphasised action is "Add location", which is genuinely the next real
// thing to do on an empty shortlist. It used to sit in the list's own toolbar;
// it now sits where every other screen keeps its main action.

import { useCallback, useRef, useState } from "react";
import { MapPin, Plus } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { SaveStatusAndButton } from "@/components/workspace/SaveStatusAndButton";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import { useMutationStatus } from "@/hooks/use-mutation-status";
import { CandidateListCard } from "@/components/location-lease/CandidateListCard";
import type { Candidate } from "@/components/location-lease/CandidateListCard";
import {
  locationProgress,
  type LocationCounts,
} from "@/components/location-lease/location-progress";

interface Props {
  initialCandidates: Candidate[];
  planId: string;
  aiCreditsRemaining: number;
  subscriptionTier: string;
}

function countOf(candidates: Candidate[]): LocationCounts {
  return {
    total: candidates.length,
    shortlisted: candidates.filter((c) => c.status === "shortlisted").length,
    signed: candidates.filter((c) => c.status === "signed").length,
  };
}

export function LocationLeaseWorkspaceClient({
  initialCandidates,
  planId,
  aiCreditsRemaining,
  subscriptionTier,
}: Props) {
  const { saving, savedAt, confirmSaved } = useMutationStatus();

  // Seeded from the server render so the header states the truth on first
  // paint rather than flashing "No locations yet" and correcting itself.
  const [counts, setCounts] = useState<LocationCounts>(() =>
    countOf(initialCandidates),
  );
  // Stable — it is an effect dependency inside the list card.
  const handleCountsChange = useCallback((next: LocationCounts) => {
    setCounts(next);
  }, []);

  // The list owns adding; the header owns the button. This is the wire.
  const addRef = useRef<(() => void) | null>(null);

  return (
    <>
      <WorkspaceHeader
        Icon={MapPin}
        title="Location & Lease"
        description="Compare candidate sites and weigh lease terms before you sign."
        scout={
          /* TIM-3676: shared Scout entry point.
             hasContent stays true — the workspace surface is meaningful even
             with 0 candidates (empty-state prompt, competitive analysis, lease
             terms), and SSR-only `initialCandidates` would go stale once the
             owner adds one. */
          <AskScoutButton
            workspaceKey="location_lease"
            focusLabel="location and lease"
            hasContent
          />
        }
        primaryAction={
          <WorkspaceActionButton
            variant="primary"
            onClick={() => addRef.current?.()}
          >
            <Plus size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
            Add location
          </WorkspaceActionButton>
        }
        save={
          <SaveStatusAndButton
            saving={saving}
            savedAt={savedAt}
            unsaved={false}
            canEdit={true}
            onSave={confirmSaved}
          />
        }
        progress={locationProgress(counts)}
      />
      <CandidateListCard
        initialCandidates={initialCandidates}
        planId={planId}
        aiCreditsRemaining={aiCreditsRemaining}
        subscriptionTier={subscriptionTier}
        onCountsChange={handleCountsChange}
        addRef={addRef}
      />
    </>
  );
}
