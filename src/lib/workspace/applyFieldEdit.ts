/**
 * Shared plan-API write path: GET workspace content → merge updated field → PATCH.
 * Used by the CoPilot chat drawer (TIM-855) and the AIAssist field callout (TIM-876).
 */
export interface ApplyFieldEditResult {
  merged: Record<string, unknown>;
}

export class WorkspaceWriteError extends Error {
  constructor(
    message: string,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "WorkspaceWriteError";
  }
}

export async function applyFieldEdit(
  workspaceKey: string,
  fieldPath: string,
  newValue: string,
): Promise<ApplyFieldEditResult> {
  const getRes = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceKey)}`,
    { credentials: "same-origin" },
  );
  const current = getRes.ok
    ? ((await getRes.json()) as { content: unknown }).content
    : {};
  const merged = {
    ...(current as Record<string, unknown>),
    [fieldPath]: newValue,
  };

  const patchRes = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceKey)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ content: merged }),
    },
  );

  if (!patchRes.ok) {
    const data = (await patchRes.json().catch(() => ({}))) as {
      reason?: string;
    };
    const msg =
      data.reason === "paywall"
        ? "Subscription paused. Reactivate to apply edits."
        : "Could not apply the change. Please try again.";
    throw new WorkspaceWriteError(msg, data.reason);
  }

  return { merged };
}
