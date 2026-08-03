"use client";

// TIM-1037: Business Plan Generator workspace — main client component.
// TIM-1225: adds Cover & Branding panel above section list.
// TIM-1315: adds worked example reference panel per section.

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { FileText, Download, ChevronDown, ChevronUp, Loader2, Plus, Trash2, Pencil, Eye, EyeOff, RotateCcw, MoreVertical, Archive, ArchiveRestore, Undo2, X } from "lucide-react";
import { SectionHeader, type AiAction } from "@/components/section-header";
// TIM-3950: Two-button split flag. Default-ON. When TRUE, each BP section
// exposes [Write with AI] (opens modal) + [Regenerate with AI] (warn + undo)
// in the SectionHeader slot. When FALSE, we fall back to the TIM-3927 single-
// button "Auto-Write This Section" + inline preview flow.
import { BP_AI_SPLIT } from "@/lib/bp-ai-split";
import { InlineAnalysisCard } from "@/components/ai-analyse/InlineAnalysisCard";
import type { AnalyseResponse } from "@/app/api/ai/analyse/[sectionKind]/route";
import { CollapseButton } from "@/components/ui/CollapseButton";
import { MobileExpandableTextarea } from "@/components/ui/mobile-expandable-textarea";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type {
  BusinessPlanSectionData,
  BusinessPlanSectionKey,
  CustomSectionData,
} from "@/lib/business-plan";
import {
  ALL_BUSINESS_PLAN_SECTION_KEYS,
  BUSINESS_PLAN_GROUPS,
  BUSINESS_PLAN_SECTIONS,
  DEFAULT_BUSINESS_PLAN_SECTION_ORDER,
} from "@/lib/business-plan";
import { resolveSectionOrder } from "@/lib/business-plan/default-section-order";
// TIM-3490: shared DnD canon — single source for grip/lift/sensor patterns.
import {
  DndContext,
  type DragStartEvent,
  type DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import {
  SortableHandle,
  useSortableLift,
  useCanonicalSensors,
  verticalListSortingStrategy,
  arrayMove,
} from "@/lib/dnd/sortable-canon";
import { BP_FIELD_EXAMPLES, type BPFieldExample, type BPFieldExampleKey } from "@/lib/business-plan-field-examples";
import type { CoverSettings } from "./cover-branding-panel";
import { CoverConfigModal } from "./cover-config-modal";
import { FinancialDocumentsPanel, type FinancialDocumentState } from "./financial-documents-panel";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import {
  WorkspaceNextStepButton,
  scrollToStep,
} from "@/components/workspace/WorkspaceNextStepButton";
import { nextStep } from "@/components/workspace/next-step";
import {
  WorkspaceActionMenu,
  WorkspaceActionMenuItem,
} from "@/components/workspace/WorkspaceActionMenu";
import { useAIReviewModal, type ApprovedChange } from "@/hooks/useAIReviewModal";
import { useBusinessPlanProgressOverlay } from "@/hooks/useBusinessPlanProgressOverlay";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import { RegenerateAllButton } from "./regenerate-all-button";
import { ExportGateModal, type ValidationReport } from "./export-gate-modal";
import { PreGenerateChecklist, type PreGenerateChecklistItem } from "./pre-generate-checklist";
import { SaveStatusAndButton } from "@/components/workspace/SaveStatusAndButton";
import type { AuditReport } from "@/lib/business-plan/audit";
import { stripSourceMarkers } from "@/lib/business-plan/source-markers";
import {
  BPWriteWithAIModal,
  type BpOtherSectionExcerpt,
  type ConsistencyContradiction,
  isBpPlaceholderContent,
  type WriteAiApproveExtras,
} from "@/components/business-plan/BPWriteWithAIModal";

PLACEHOLDER_TRUNCATED_DO_NOT_USE