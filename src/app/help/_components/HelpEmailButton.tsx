"use client";

// TIM-1941: "Email us" header action for the docs index. Wrapped in a
// client component so the help index page can stay a server component while
// still using the canonical WorkspaceActionButton.

import { Mail } from "lucide-react";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";

export function HelpEmailButton() {
  return (
    <a href="mailto:hello@timberline.coffee" tabIndex={-1}>
      <WorkspaceActionButton title="Email hello@timberline.coffee">
        <Mail size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
        Email us
      </WorkspaceActionButton>
    </a>
  );
}
