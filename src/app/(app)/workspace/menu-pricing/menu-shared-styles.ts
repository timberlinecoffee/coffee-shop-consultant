// TIM-4110: the two form-control class strings shared by menu-workspace.tsx
// and its extracted tabs. Kept in their own file so the split does not create
// a circular import between a parent and its children — which is the trap the
// obvious version of this refactor falls into.

export const inputCls =
  "w-full text-sm border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";

export const labelCls =
  "block text-xs font-medium text-[var(--muted-foreground)] mb-1";
