// TIM-2798: Canonical workspace empty state — icon, description, primary CTA,
// optional seed link. Used across Equipment, Suppliers, Location, and Hiring.
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WorkspaceEmptyStateProps {
  icon: LucideIcon;
  description: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  seedLabel?: string;
  onSeedClick?: () => void;
}

export function WorkspaceEmptyState({
  icon: Icon,
  description,
  ctaLabel,
  onCtaClick,
  seedLabel,
  onSeedClick,
}: WorkspaceEmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-16 px-5">
      <Icon className="text-[var(--teal)] w-10 h-10" aria-hidden="true" />
      <p className="text-sm text-[var(--muted-foreground)] text-center max-w-xs mt-3">
        {description}
      </p>
      {ctaLabel && onCtaClick && (
        <Button onClick={onCtaClick} className="mt-4">
          {ctaLabel}
        </Button>
      )}
      {seedLabel && onSeedClick && (
        <Button variant="link" size="sm" onClick={onSeedClick} className="mt-2">
          {seedLabel}
        </Button>
      )}
    </div>
  );
}
