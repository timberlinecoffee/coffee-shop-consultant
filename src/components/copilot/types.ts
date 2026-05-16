import type { WorkspaceKey } from "@/types/supabase";

export type CopilotRole = "user" | "assistant";

export interface CopilotMessage {
  role: CopilotRole;
  content: string;
}

export interface CopilotThreadSummary {
  threadId: string;
  title: string | null;
  lastMessageAt: string;
  workspaceKey: WorkspaceKey;
  modelUsed: string | null;
}

export type CopilotErrorCode =
  | "upstream_error"
  | "timeout"
  | "quota"
  | "paywall"
  | "unauthorized"
  | "bad_request"
  | "network";

export interface CopilotErrorState {
  code: CopilotErrorCode;
  message: string;
  /** Optional structured payload from the server (e.g. tier_required for paywall). */
  details?: Record<string, unknown>;
}

export interface CopilotFocus {
  anchor?: string;
  label?: string;
}
