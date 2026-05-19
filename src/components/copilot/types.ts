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
  | "unauthorized"
  | "bad_request"
  | "network"
  | "paywall";

export interface CopilotErrorState {
  code: CopilotErrorCode;
  message: string;
}

export interface CopilotFocus {
  anchor?: string;
  label?: string;
}
