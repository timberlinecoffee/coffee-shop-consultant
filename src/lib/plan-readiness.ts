// TIM-1147: plan readiness is now a thin re-export over the manual 3-state
// status model. The legacy filled/total formula (TIM-903) has been retired
// along with the auto-progress system.

export {
  planReadinessPctFromStatuses,
  type WorkspaceStatus,
} from "./workspace-status";
