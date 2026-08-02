// TIM-4108 (UX Phase 3): what the Hiring & Onboarding header states.
//
// A count, not a bar (D-011). Hiring is the clearest case in the whole batch:
// there is no correct number of roles or candidates, and a bar would have to
// invent one. A three-person shop that has hired three people is finished; a
// bar telling them they are at 40% of some imagined headcount would be worse
// than saying nothing.
//
// Roles lead because roles come first — you decide what you need before you
// meet anyone. Candidates only appear once there are some, so an owner still
// writing job descriptions is not shown a nag about interviews they have not
// booked.
//
// Pure and dependency-free (no runtime "@/" imports) so node:test can load it.

import type { WorkspaceProgress } from "../workspace/workspace-progress";

export interface HiringCounts {
  roles: number;
  candidates: number;
}

export function hiringProgress(counts: HiringCounts): WorkspaceProgress {
  const roles = Math.max(0, Math.floor(counts.roles));
  const candidates = Math.max(0, Math.floor(counts.candidates));

  if (roles === 0 && candidates === 0) {
    return { kind: "count", text: "No roles yet" };
  }

  const pieces: string[] = [];
  if (roles > 0) pieces.push(`${roles} ${roles === 1 ? "role" : "roles"}`);
  if (candidates > 0) {
    pieces.push(`${candidates} ${candidates === 1 ? "candidate" : "candidates"}`);
  }
  return { kind: "count", text: pieces.join(" · ") };
}
