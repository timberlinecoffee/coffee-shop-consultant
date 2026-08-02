// TIM-4108 (UX Phase 3): what the Menu & Pricing header states.
//
// A count, not a bar (D-011). There is no correct size for a menu — a
// three-item cart and a forty-item cafe are both finished menus — so any
// denominator would be a number we invented and then measured the owner
// against.
//
// Items lead because items are the thing being planned; categories are how
// they are filed. A menu with items but no categories still reads sensibly,
// which matters because that is what a half-built menu looks like.
//
// Pure and dependency-free (no runtime "@/" imports) so node:test can load it.

import type { WorkspaceProgress } from "../workspace/workspace-progress";

export interface MenuCounts {
  items: number;
  categories: number;
}

export function menuProgress(counts: MenuCounts): WorkspaceProgress {
  const items = Math.max(0, Math.floor(counts.items));
  if (items === 0) return { kind: "count", text: "No menu items yet" };

  const itemNoun = items === 1 ? "item" : "items";
  const head = `${items} ${itemNoun}`;

  const categories = Math.max(0, Math.floor(counts.categories));
  if (categories === 0) return { kind: "count", text: head };

  const catNoun = categories === 1 ? "category" : "categories";
  return { kind: "count", text: `${head} · ${categories} ${catNoun}` };
}
