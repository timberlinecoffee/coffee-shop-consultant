import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapseButtonProps {
  onClick: () => void;
  onPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
  size?: number;
  className?: string;
  "aria-label"?: string;
  disabled?: boolean;
}

/**
 * Canonical close/collapse affordance for cards, panels, and drawers.
 * Use ChevronUp (this component) for non-destructive dismiss.
 * Use X directly for delete/remove/discard actions.
 */
export function CollapseButton({
  onClick,
  onPointerDown,
  size = 16,
  className,
  "aria-label": ariaLabel = "Collapse",
  disabled,
}: CollapseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn("transition-colors", className)}
    >
      <ChevronUp size={size} aria-hidden />
    </button>
  );
}
