// TIM-3897: Canonical import location for InlineAnalysisCard across all Phase 5
// workspaces. Re-exports from src/components/location-lease/ which holds the
// original implementation (TIM-3879). New callers should import from here;
// a follow-up will flip location-lease to re-export from here instead.
export {
  InlineAnalysisCard,
  type InlineAnalysisCardProps,
  type AnalyseResponse,
} from '@/components/location-lease/InlineAnalysisCard'
