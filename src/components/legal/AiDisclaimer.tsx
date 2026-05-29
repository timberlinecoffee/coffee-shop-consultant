// TIM-1359: Point-of-output AI disclaimer. Copy is verbatim from the audit doc
// rev 2 (TIM-1158#document-audit), "Per-Surface Disclaimer / Consent / ToS Triplet".
// Visual style matches the inline disclaimers already shipped on Surfaces 4/8/10/12/15.

interface AiDisclaimerProps {
  /** Bolded lead-in, e.g. "AI-Generated Draft." */
  lead: string;
  /** Body copy following the lead. */
  body: string;
  /** Placement overrides (margins, borders) for the wrapping <p>. */
  className?: string;
}

export function AiDisclaimer({ lead, body, className }: AiDisclaimerProps) {
  return (
    <p
      className={`text-[10px] leading-relaxed text-[var(--muted-foreground)]${
        className ? ` ${className}` : ""
      }`}
    >
      <span className="font-semibold">{lead}</span> {body}
    </p>
  );
}
