"use client";
import { usePathname } from "next/navigation";
import { type WorkspaceKey } from "@/types/supabase";

const WORKSPACE_PATH_MAP: Record<string, WorkspaceKey> = {
  "concept":             "concept",
  "location-lease":      "location_lease",
  "financials":          "financials",
  "menu-pricing":        "menu_pricing",
  "buildout-equipment":  "buildout_equipment",
  "opening-month-plan":  "opening_month_plan",
  "hiring":              "hiring",
  "marketing":           "marketing",
  "suppliers":           "suppliers",
  "operations-playbook": "operations_playbook",
  "business-plan":       "business_plan",
};

export function useCurrentWorkspaceKey(): WorkspaceKey | null {
  const pathname = usePathname();
  const match = pathname?.match(/^\/workspace\/([^\/]+)/);
  if (!match) return null;
  return WORKSPACE_PATH_MAP[match[1]] ?? null;
}
