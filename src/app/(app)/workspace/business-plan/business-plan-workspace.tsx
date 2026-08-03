"use client";

// TIM-1037: Business Plan Generator workspace — main client component.
// TIM-1225: adds Cover & Branding panel above section list.
// TIM-1315: adds worked example reference panel per section.

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { FileText, Download, ChevronDown, ChevronUp, Loader2, Plus, Trash2, Pencil, Eye, EyeOff, RotateCcw, MoreVertical, Archive, ArchiveRestore, Undo2, X } from "lucide-react";
import { SectionHeader, type AiAction } from "@/components/section-header";
PLACEHOLDER_RESTORE_IN_PROGRESS