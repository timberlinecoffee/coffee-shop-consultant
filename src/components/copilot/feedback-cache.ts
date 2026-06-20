// TIM-2839: Session-scoped feedback cache for the Feedback panel.
//
// Populated when a Check or Benchmark run completes — no new AI calls from
// this feature. Cache lives in module-level memory so it survives client-side
// route changes but resets on page reload.
//
// Cache key format: "feedback:{workspaceType}:{pageSlug}"

export type FeedbackCategory = "fix" | "good" | "note";

export interface FeedbackItem {
  id: string;
  category: FeedbackCategory;
  section: string;
  body: string;
  findingId: string;
  fieldId?: string;
  fieldLabel?: string;
  proposedValue?: string;
  originalValue?: string;
}

export interface FeedbackData {
  workspaceName: string;
  pageName: string;
  items: FeedbackItem[];
  generatedAt: string;
}

const cache = new Map<string, FeedbackData>();

export function buildFeedbackKey(workspaceType: string, pageSlug: string): string {
  return `feedback:${workspaceType}:${pageSlug}`;
}

export function storeFeedback(key: string, data: FeedbackData): void {
  cache.set(key, data);
}

export function getFeedback(key: string): FeedbackData | null {
  return cache.get(key) ?? null;
}

export function hasFeedbackForKey(key: string): boolean {
  return cache.has(key);
}

export function clearFeedbackCache(): void {
  cache.clear();
}

export function getAllFeedbackKeys(): string[] {
  return Array.from(cache.keys());
}
