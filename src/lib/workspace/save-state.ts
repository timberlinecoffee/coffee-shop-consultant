// TIM-4105: an honest save state.
//
// The bug this exists to prevent, found on the Hiring workspace:
//
//   setRoles(optimisticValue);          // screen updated first
//   try { await fetch(...); }           // response never checked
//   catch { /* swallow — user can refresh */ }
//
// Three separate failures stacked on one line of intent. The screen showed the
// new value before knowing whether it saved; a rejection from the server was
// treated exactly like success because `res.ok` was never read; and a thrown
// request was discarded without telling anyone, including us. Meanwhile the
// header rendered `savedAt` frozen at page-load time and `unsaved={false}`
// hardcoded, so it sat there reading "Saved · 9:14am" while nothing had been
// saved since 9:14am.
//
// The rule this module encodes: A SCREEN MAY ONLY CLAIM "SAVED" IF A SERVER
// ACCEPTED THE WRITE. Anything else is "saving", "unsaved", or "failed" — and
// "failed" must be recoverable, not just announced.
//
// Pure and dependency-free (no runtime "@/" imports) so `node
// --experimental-strip-types` can load it under `npm test`.

export type SaveStateKind = "idle" | "saving" | "saved" | "unsaved" | "failed";

export interface SaveState {
  kind: SaveStateKind;
  // ISO timestamp of the last write a server actually accepted. Null until one
  // has. Deliberately NOT seeded at mount — that was the original lie.
  savedAt: string | null;
  // Owner-facing failure message. Present only when kind === "failed".
  message: string | null;
  // Number of writes currently in flight. A workspace fires these per-edit, so
  // several can overlap; the indicator must not flip to "Saved" because the
  // fastest one landed while another is still going.
  inFlight: number;
}

export const IDLE_SAVE_STATE: SaveState = {
  kind: "idle",
  savedAt: null,
  message: null,
  inFlight: 0,
};

export type SaveEvent =
  | { type: "start" }
  | { type: "success"; at: string }
  | { type: "failure"; message?: string };

// One owner-facing sentence for a save that did not land. Names what to do,
// and does not blame the owner for our network.
export const SAVE_FAILED_MESSAGE =
  "That change didn't save. Check your connection and press Save to try again.";

export function saveStateReducer(state: SaveState, event: SaveEvent): SaveState {
  switch (event.type) {
    case "start":
      return {
        // A new write while an earlier one is still failed keeps the failure
        // visible until something actually succeeds — otherwise the spinner
        // would paper over unsaved work.
        kind: "saving",
        savedAt: state.savedAt,
        message: state.kind === "failed" ? state.message : null,
        inFlight: state.inFlight + 1,
      };

    case "success": {
      const inFlight = Math.max(0, state.inFlight - 1);
      // A success does NOT clear an outstanding failure. Some earlier edit is
      // still only in the browser, and saying "Saved" now would lose it
      // quietly — exactly the original bug in a new costume.
      //
      // Note this tests `message`, not `kind`. A later edit moves `kind` to
      // "saving", so `kind` alone forgets that something is still unsaved;
      // the message is what survives. Only an explicit retry clears it.
      if (state.message !== null) {
        return { ...state, kind: "failed", savedAt: event.at, inFlight };
      }
      return {
        kind: inFlight > 0 ? "saving" : "saved",
        savedAt: event.at,
        message: null,
        inFlight,
      };
    }

    case "failure":
      return {
        kind: "failed",
        savedAt: state.savedAt,
        message: event.message ?? SAVE_FAILED_MESSAGE,
        inFlight: Math.max(0, state.inFlight - 1),
      };
  }
}

// What the shared SaveIndicator should be handed. Keeping this derivation in
// one tested place stops a caller reinventing it and getting it subtly wrong —
// the previous version passed literal `false`s.
export interface SaveIndicatorView {
  saving: boolean;
  savedAt: string | null;
  unsaved: boolean;
  error: string | null;
}

export function toIndicatorView(state: SaveState): SaveIndicatorView {
  return {
    saving: state.kind === "saving",
    // Never surface a timestamp while a failure is outstanding. "Saved ·
    // 9:14am" next to unsaved work is the single most misleading thing this
    // screen used to do.
    savedAt: state.kind === "failed" ? null : state.savedAt,
    unsaved: state.kind === "unsaved",
    error: state.kind === "failed" ? state.message : null,
  };
}

// True when the owner has work that exists only in their browser. Callers use
// this to warn before navigating away.
export function hasUnsavedWork(state: SaveState): boolean {
  return state.kind === "failed" || state.kind === "unsaved";
}
