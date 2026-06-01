"use client";

// TIM-1690: Client wrapper for Location & Lease workspace — mounts CoPilotDrawer
// with onApplySuggestions so chat-proposed candidate notes flow through AIReviewModal.

import { useCallback, useState } from "react";
import type { ApprovedChange } from "@/hooks/useAIReviewModal";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { CandidateListCard } from "@/components/location-lease/CandidateListCard";
import type { Candidate } from "@/components/location-lease/CandidateListCard";

interface Props {
  planId: string;
  initialCandidates: Candidate[];
  aiCreditsRemaining: number;
  subscriptionTier: string;
  initialTrialMessagesUsed?: number;
}

export function LocationLeaseWorkspace({
  planId,
  initialCandidates,
  aiCreditsRemaining,
  subscriptionTier,
  initialTrialMessagesUsed,
}: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates);

  const handleApplySuggestions = useCallback(async (accepted: ApprovedChange[]) => {
    // TIM-1690: fieldId format: "location_lease:candidate:{candidateId}.notes"
    for (const change of accepted) {
      if (!change.fieldId.startsWith("location_lease:candidate:")) continue;
      const rest = change.fieldId.slice("location_lease:candidate:".length);
      const dotIdx = rest.indexOf(".");
      if (dotIdx === -1) continue;
      const candidateId = rest.slice(0, dotIdx);
      const field = rest.slice(dotIdx + 1);
      if (field !== "notes") continue;
      const res = await fetch(`/api/workspaces/location-lease/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: change.finalValue }),
      });
      if (res.ok) {
        setCandidates((prev) =>
          prev.map((c) => c.id === candidateId ? { ...c, notes: change.finalValue } : c)
        );
      }
    }
  }, []);

  return (
    <>
      <CandidateListCard
        initialCandidates={candidates}
        planId={planId}
        aiCreditsRemaining={aiCreditsRemaining}
        subscriptionTier={subscriptionTier}
      />
      <CoPilotDrawer
        planId={planId}
        workspaceKey="location_lease"
        currentFocus={{ label: "Location & Lease" }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
        onApplySuggestions={handleApplySuggestions}
      />
    </>
  );
}
