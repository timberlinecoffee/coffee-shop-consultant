"use client";

// TIM-1937 (board reopen): the SaveIndicator and the manual Save button are
// one visual unit, not two siblings the cluster can interleave with Export /
// Print / View. The board rejected the Financials chrome because Saved status
// sat far from Save with Export PDF / Export Excel in between. Pages that have
// a manual Save MUST render this paired component at the end of the action
// cluster instead of placing a bare <SaveIndicator/> and a Save
// <WorkspaceActionButton/> as separate siblings.

import { Save } from "lucide-react";

import { SaveIndicator } from "@/components/ui/save-indicator";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";

type SaveStatusAndButtonProps = {
  saving: boolean;
  savedAt: string | null;
  unsaved?: boolean;
  error?: string | null;
  canEdit?: boolean;
  onSave: () => void;
};

export function SaveStatusAndButton({
  saving,
  savedAt,
  unsaved,
  error,
  canEdit = true,
  onSave,
}: SaveStatusAndButtonProps) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      <SaveIndicator
        saving={saving}
        savedAt={savedAt}
        unsaved={unsaved}
        error={error ?? null}
        canEdit={canEdit}
        onRetry={onSave}
      />
      {canEdit && (
        <WorkspaceActionButton onClick={onSave} disabled={saving}>
          <Save size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
          Save
        </WorkspaceActionButton>
      )}
    </div>
  );
}
