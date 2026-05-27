// TIM-1099: Single source of truth for workspace icons.
// The sidebar (<AppSidebar>) and each workspace page header MUST render the
// same lucide-react icon for a given NavIcon token. Importing through this
// map keeps them locked to the same component so the two can't drift.
import {
  BarChart2,
  ClipboardList,
  FileText,
  Lightbulb,
  MapPin,
  Megaphone,
  Package,
  Rocket,
  Truck,
  Users,
  Utensils,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { NavIcon } from "./workspace-manifest";

export const WORKSPACE_ICONS: Record<NavIcon, LucideIcon> = {
  "lightbulb": Lightbulb,
  "bar-chart": BarChart2,
  "map-pin": MapPin,
  "utensils": Utensils,
  "wrench": Wrench,
  "rocket": Rocket,
  "users": Users,
  "megaphone": Megaphone,
  "file-text": FileText,
  "truck": Truck,
  "clipboard-list": ClipboardList,
  "package": Package,
};
