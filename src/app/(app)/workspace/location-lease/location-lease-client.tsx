"use client";

import { MapPin } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import { SaveStatusAndButton } from "@/components/workspace/SaveStatusAndButton";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import { useMutationStatus } from "@/hooks/use-mutation-status";
import { CandidateListCard } from "@/components/location-lease/CandidateListCard";
import type { Candidate } from "@/components/location-lease/CandidateListCard";

interface Props {
  initialCandidates: Candidate[];
  planId: string;
  aiCreditsRemaining: number;
  subscriptionTier: string;
}

export function LocationLeaseWorkspaceClient({
  initialCandidates,
  planId,
  aiCreditsRemaining,
  subscriptionTier,
}: Props) {
  const { saving, savedAt, confirmSaved } = useMutationStatus();

  return (
    <>
      <WorkspaceHeader
        Icon={MapPin}
        title="Location & Lease"
        description="Compare candidate sites and weigh lease terms before you sign."
        actions={
          <>
            {/* TIM-3676: shared Scout entry point, matches Business Plan / Marketing / Hiring / Ops Playbook. */}
            <AskScoutButton
              workspaceKey="location_lease"
              focusLabel="location and lease"
              hasContent={initialCandidates.length > 0}
            />
            <SaveStatusAndButton
              saving={saving}
              savedAt={savedAt}
              unsaved={false}
              canEdit={true}
              onSave={confirmSaved}
            />
          </>
        }
      />
      <CandidateListCard
        initialCandidates={initialCandidates}
        planId={planId}
        aiCreditsRemaining={aiCreditsRemaining}
        subscriptionTier={subscriptionTier}
      />
    </>
  );
}
