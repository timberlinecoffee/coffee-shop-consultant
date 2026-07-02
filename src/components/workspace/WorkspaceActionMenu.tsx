"use client";

// TIM-2413 (spec on TIM-2412, plan §10 in TIM-1792): canonical hamburger menu
// for the workspace header action cluster. Replaces the inline secondary
// buttons that used to sit between the primary CTA and SaveStatusAndButton.
//
// Cluster order at >=1200px: [Primary CTA] [⋯ trigger] [SaveStatusAndButton].
// The primary CTA and SaveStatusAndButton stay outside the menu; only
// low-frequency secondary utilities (Export, Manage, Import, View) live inside.
//
// Threshold (§10.2): show the trigger only when there are >=2 secondary
// actions. Workspaces with 0 or 1 secondaries render inline.

import { MoreHorizontal, Check, Sparkles } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

type MenuContext = {
  /** Close the menu and return focus to the trigger. */
  closeMenu: () => void;
};

type WorkspaceActionMenuProps = {
  /**
   * Render the rows that go inside the popover. The callback receives a
   * `closeMenu` so custom items (e.g. components with their own dialog
   * workflow like RegenerateAllButton) can dismiss the menu on click.
   */
  children: (ctx: MenuContext) => ReactNode;
  /** Optional override for the trigger's accessible label. */
  triggerAriaLabel?: string;
  /**
   * TIM-3556: hide the default "Open Advisor" row. Set on workspaces that
   * already expose a header-level Scout entry point (e.g. `AskScoutButton`
   * on Business Plan) so the menu doesn't duplicate the same drawer action.
   */
  hideAdvisor?: boolean;
};

export function WorkspaceActionMenu({
  children,
  triggerAriaLabel = "More actions",
  hideAdvisor = false,
}: WorkspaceActionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Stable callback for descendants to dismiss the menu. We intentionally do
  // NOT restore focus here — that happens in the ESC handler below, where the
  // ref access is inside an event handler (compliant with react-hooks/refs).
  const closeMenu = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [open]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    ).filter((el) => !el.hasAttribute("disabled"));
    if (items.length === 0) return;
    e.preventDefault();
    const active = document.activeElement as HTMLElement | null;
    const idx = active ? items.indexOf(active) : -1;
    const next =
      e.key === "ArrowDown"
        ? items[(idx + 1) % items.length]
        : items[(idx - 1 + items.length) % items.length];
    next?.focus();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={triggerAriaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        className="flex items-center justify-center rounded-lg border border-[var(--teal)]/30 text-[var(--teal)] p-1.5 hover:bg-[var(--teal)]/5 transition-colors"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={triggerAriaLabel}
          onKeyDown={handleMenuKeyDown}
          className="absolute top-[calc(100%+4px)] right-0 z-30 w-[220px] bg-white border border-[var(--border)] rounded-xl shadow-md py-1 overflow-y-auto max-h-80"
        >
          {!hideAdvisor && (
            <WorkspaceActionMenuItem
              Icon={Sparkles}
              label="Open Advisor"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("copilot:open-in-mode", { detail: { mode: "coach" } }),
                );
                closeMenu();
              }}
            />
          )}
          {children({ closeMenu })}
        </div>
      )}
    </div>
  );
}

// Canonical icon size for items inside the hamburger popover.
export const WORKSPACE_ACTION_MENU_ICON_SIZE = 14;

type IconComponent = (props: { size?: number; className?: string; "aria-hidden"?: boolean }) => ReactNode;

type WorkspaceActionMenuItemProps = {
  Icon: IconComponent;
  label: ReactNode;
  /**
   * Toggle-state indicator. When defined, the row renders a teal check on the
   * right when `checked` is true (e.g. View Options for E&S).
   */
  checked?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">;

/**
 * Canonical row inside `WorkspaceActionMenu`. Use for any standard action item
 * so the layout, padding, focus ring, and disabled handling stay consistent.
 */
export const WorkspaceActionMenuItem = forwardRef<
  HTMLButtonElement,
  WorkspaceActionMenuItemProps
>(function WorkspaceActionMenuItem({ Icon, label, checked, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      role="menuitem"
      type="button"
      disabled={disabled}
      {...rest}
      className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-[var(--foreground)] hover:bg-[var(--background)] focus:bg-[var(--background)] focus:outline-none transition-colors text-left disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <Icon
        size={WORKSPACE_ACTION_MENU_ICON_SIZE}
        className="text-[var(--muted-foreground)] shrink-0"
        aria-hidden={true}
      />
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {checked === true && (
        <Check
          size={WORKSPACE_ACTION_MENU_ICON_SIZE}
          className="text-[var(--teal)] shrink-0"
          aria-hidden="true"
        />
      )}
    </button>
  );
});
