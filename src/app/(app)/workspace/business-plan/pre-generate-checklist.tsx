// TIM-2466: Pre-generate checklist.
//
// CQ-06 byte-identical content surfaced because the four AI-source workspaces
// (Concept, Menu & Pricing, Marketing, Hiring) were empty across every test
// persona, so the prompt assemblers returned empty strings and the LLM fell
// back to a generic café. The narrower fix (shop_type → founder context) lifts
// every persona out of "literally identical", but the durable answer is to
// nudge the founder into filling the source workspaces *before* clicking
// Generate. This banner is that nudge — it only renders when at least one
// source workspace is empty, and links straight to the workspace.

import Link from "next/link";
import { CircleAlert } from "lucide-react";

export interface PreGenerateChecklistItem {
  key: "concept" | "menu" | "marketing" | "hiring";
  label: string;
  href: string;
  complete: boolean;
}

interface Props {
  items: PreGenerateChecklistItem[];
}

export function PreGenerateChecklist({ items }: Props) {
  const missing = items.filter((i) => !i.complete);
  if (missing.length === 0) return null;

  return (
    <div
      data-testid="pre-generate-checklist"
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-900">
            Your plan will be more specific if you complete:
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {missing.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="text-amber-900 underline decoration-amber-400 underline-offset-2 hover:decoration-amber-700"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
