"use client";

// TIM-2783 (Phase 6): canonical v2 shell — WorkspaceHeader + CandidateListCard.
// This client wrapper exists solely to keep the MapPin lucide icon co-located
// with WorkspaceHeader; both are client components and the icon can't be passed
// as a serializable prop from the server page across the RSC boundary.

import { MapPin } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import {
  CandidateListCard,
  type Candidate,
} from "@/components/location-lease/CandidateListCard";

interface Props {
  initialCandidates: Candidate[];
  planId: string;
  aiCreditsRemaining: number;
  subscriptionTier: string;
}

export function LocationLeaseWorkspace({
  initialCandidates,
  planId,
  aiCreditsRemaining,
  subscriptionTier,
}: Props) {
  return (
    <div className="bg-[var(--background)]">
      <div className="w-full px-4 sm:px-6 pt-8 pb-12">
        <WorkspaceHeader
          Icon={MapPin}
          title="Location & Lease"
          description="Compare candidate sites and weigh lease terms before you sign."
        />
        <CandidateListCard
          initialCandidates={initialCandidates}
          planId={planId}
          aiCreditsRemaining={aiCreditsRemaining}
          subscriptionTier={subscriptionTier}
        />
      </div>
    </div>
  );
}
