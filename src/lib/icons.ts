/**
 * Timberline icon map — Phosphor Icons as the single source of truth.
 *
 * Default weights per design-direction v3 Section 5:
 *   - Regular: UI icons (nav, buttons, form chrome)
 *   - Thin: decorative / marketing contexts
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
// Spec: design-direction v3 §5 "Custom Workspace Icons" table
// Phase 2: replace each with a custom coffee-themed SVG icon component

export {
  // 1. Concept — coffee bean placeholder (spec: "Coffee bean, single, centered")
  CoffeeBean as ModuleConceptIcon,
  // 2. Financials — calculator placeholder (spec: "Calculator grid simplified")
  Calculator as ModuleFinancialsIcon,
  // 3. Operations — clock placeholder (spec: "Clock with a small steam curl")
  Clock as ModuleOperationsIcon,
  // 4. Staffing — group placeholder (spec: "Two coffee cup silhouettes at different heights")
  UsersThree as ModuleStaffingIcon,
  // 5. Build-Out — floor plan placeholder (spec: "Simple floor plan: four walls, one door")
  Blueprint as ModuleBuildOutIcon,
  // 6. Menu — clipboard placeholder (spec: "Clipboard with a single coffee cup outline")
  ClipboardText as ModuleMenuIcon,
  // 7. Marketing — megaphone placeholder (spec: "Megaphone at 45 degrees, simplified")
  Megaphone as ModuleMarketingIcon,
  // 8. Launch — storefront placeholder (spec: "Storefront with open sign in window")
  Storefront as ModuleLaunchIcon,
} from "@phosphor-icons/react";

// ─── Standard UI Icons ────────────────────────────────────────────────────────

export {
  // Navigation & layout
  CaretDown as ChevronDownIcon,
  CaretUp as ChevronUpIcon,
  CaretLeft as ChevronLeftIcon,
  CaretRight as ChevronRightIcon,
  CaretUpDown as ChevronUpDownIcon,
  ArrowLeft as BackIcon,
  ArrowRight as ForwardIcon,

  // Actions
  PaperPlaneTilt as SendIcon,
  GearSix as SettingsIcon,
  X as CloseIcon,
  Plus as AddIcon,
  Minus as RemoveIcon,
  Pencil as EditIcon,
  Trash as DeleteIcon,
  Check as CheckIcon,
  Copy as CopyIcon,
  ArrowSquareOut as ExternalLinkIcon,
  DownloadSimple as DownloadIcon,
  UploadSimple as UploadIcon,

  // Status & feedback
  WarningCircle as WarningIcon,
  CheckCircle as SuccessIcon,
  Info as InfoIcon,
  XCircle as ErrorIcon,
  Spinner as LoadingIcon,

  // AI co-pilot
  Sparkle as AiIcon,
  Robot as AiBotIcon,

  // Content & data
  MagnifyingGlass as SearchIcon,
  Funnel as FilterIcon,
  SortAscending as SortIcon,

  // Dashboard / progress
  CircleHalf as ProgressIcon,
  ChartBar as ChartIcon,
  TrendUp as TrendUpIcon,
  TrendDown as TrendDownIcon,

  // User / account
  User as UserIcon,
  SignOut as SignOutIcon,
  Bell as NotificationIcon,
  Lock as LockIcon,
} from "@phosphor-icons/react";
