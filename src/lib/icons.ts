/**
 * Timberline icon map — Phosphor Icons as the single source of truth.
 *
 * Default weights per design-direction v3 Section 5:
 *   Regular — UI icons (nav, buttons, form chrome)
 *   Thin    — decorative / marketing contexts
 *
 * Custom workspace module icons (8 coffee-specific SVGs) are planned for Phase 2.
 * These Phosphor placeholders serve Phase 1 and are replaced during component redesign.
 */

export type { Icon as PhosphorIcon, IconProps as PhosphorIconProps } from "@phosphor-icons/react";
export { IconContext } from "@phosphor-icons/react";

export type IconWeight = "thin" | "light" | "regular" | "bold" | "fill" | "duotone";

export const UI_WEIGHT: IconWeight = "regular";
export const DECORATIVE_WEIGHT: IconWeight = "thin";

// ─── Workspace Module Icons (Phosphor placeholders for Phase 1) ───────────────

export {
  CoffeeBean as ModuleConceptIcon,
  Calculator as ModuleFinancialsIcon,
  Clock as ModuleOperationsIcon,
  UsersThree as ModuleStaffingIcon,
  Blueprint as ModuleBuildOutIcon,
  ClipboardText as ModuleMenuIcon,
  Megaphone as ModuleMarketingIcon,
  Storefront as ModuleLaunchIcon,
} from "@phosphor-icons/react";

// ─── Standard UI Icons ────────────────────────────────────────────────────────

export {
  CaretDown as ChevronDownIcon,
  CaretUp as ChevronUpIcon,
  CaretLeft as ChevronLeftIcon,
  CaretRight as ChevronRightIcon,
  CaretUpDown as ChevronUpDownIcon,
  ArrowLeft as BackIcon,
  ArrowRight as ForwardIcon,
  PaperPlaneTilt as SendIcon,
  GearSix as SettingsIcon,
  X as CloseIcon,
  Plus as AddIcon,
  Minus as RemoveIcon,
  Check as CheckIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  XCircle as ErrorIcon,
  User as UserIcon,
  UserCircle as UserCircleIcon,
  SignOut as SignOutIcon,
  SidebarSimple as SidebarIcon,
  DotsThree as MoreIcon,
  MagnifyingGlass as SearchIcon,
  Bell as NotificationIcon,
  List as MenuIcon,
} from "@phosphor-icons/react";
