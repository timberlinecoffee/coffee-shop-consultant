import Image from "next/image";

/**
 * Canonical Groundwork brand logo (TIM-1602).
 *
 * Single source of truth for the wordmark lockup and icon mark. Do not
 * hard-code logo paths elsewhere — import this component instead.
 *
 * Variant by background, not by page:
 *   - "color" → dark wordmark + green mark, for light surfaces (default)
 *   - "white" → white lockup, for dark surfaces
 *
 * Assets are 4:1 (lockup) / 1:1 (mark). Aspect ratio is preserved from
 * the `height` prop; never set width independently.
 */

type LogoVariant = "color" | "white";

const LOCKUP_RATIO = 200 / 50; // 4:1

const LOCKUP_SRC: Record<LogoVariant, string> = {
  color: "/brand/groundwork-logo-color.png",
  white: "/brand/groundwork-logo-white.png",
};

const MARK_SRC: Record<LogoVariant, string> = {
  color: "/brand/groundwork-mark-color.png",
  white: "/brand/groundwork-mark-white.png",
};

type LogoProps = {
  /** Background-driven variant: "color" on light surfaces, "white" on dark. */
  variant?: LogoVariant;
  /** Rendered height in px. Width is derived to preserve aspect ratio. */
  height?: number;
  className?: string;
  /** Set on above-the-fold logos (header / hero) for LCP. */
  priority?: boolean;
  alt?: string;
};

/** Full wordmark lockup (icon + "groundwork"). */
export function Logo({
  variant = "color",
  height = 28,
  className,
  priority = false,
  alt = "Groundwork",
}: LogoProps) {
  const width = Math.round(height * LOCKUP_RATIO);
  return (
    <Image
      src={LOCKUP_SRC[variant]}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}

/** Icon-only mark (the stacked-bars glyph), square. */
export function LogoMark({
  variant = "color",
  height = 28,
  className,
  priority = false,
  alt = "Groundwork",
}: LogoProps) {
  return (
    <Image
      src={MARK_SRC[variant]}
      alt={alt}
      width={height}
      height={height}
      priority={priority}
      className={className}
      style={{ height, width: "auto" }}
    />
  );
}
