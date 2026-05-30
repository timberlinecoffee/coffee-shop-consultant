// TIM-1417: Marketing planning surface — types, defaults, normalizer.
// Replaces the V2 execution tooling (campaigns, content posts, digital presence,
// budget lines) and the separate Marketing & Pre-Launch surface. Single
// planning document stored in workspace_documents under workspace_key='marketing'.
//
// Four sections: Overview, Channels, Story/Brand, Pre-launch Plan.

import { toTitleCase } from "@/lib/text";

// ── Channels ────────────────────────────────────────────────────────────────

export const MARKETING_CHANNEL_OPTIONS = [
  "Instagram",
  "TikTok",
  "Facebook",
  "Email Newsletter",
  "Local Press",
  "Community Events",
  "Google Business Profile",
  "Word Of Mouth",
  "Local Partnerships",
  "Owned Website",
] as const;

export type MarketingChannelOption = (typeof MARKETING_CHANNEL_OPTIONS)[number];

// ── Sections ────────────────────────────────────────────────────────────────

export interface MarketingOverviewSection {
  narrative: string;
}

export interface MarketingChannelEntry {
  name: string;
  notes: string;
}

export interface MarketingChannelsSection {
  selected: MarketingChannelEntry[];
}

export interface MarketingStorySection {
  founder_story: string;
  origin: string;
  differentiator: string;
  target_customer: string;
}

export interface MarketingMilestone {
  id: string;
  label: string;
  target_date: string | null; // ISO yyyy-mm-dd
  notes: string;
  completed: boolean;
}

export interface MarketingPreLaunchSection {
  milestones: MarketingMilestone[];
}

export interface MarketingDocument {
  overview: MarketingOverviewSection;
  channels: MarketingChannelsSection;
  story: MarketingStorySection;
  pre_launch: MarketingPreLaunchSection;
  last_generated_at: string | null;
}

// ── Defaults ────────────────────────────────────────────────────────────────

export const EMPTY_MARKETING: MarketingDocument = {
  overview: { narrative: "" },
  channels: { selected: [] },
  story: {
    founder_story: "",
    origin: "",
    differentiator: "",
    target_customer: "",
  },
  pre_launch: { milestones: [] },
  last_generated_at: null,
};

function localId(): string {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultPreLaunchMilestones(): MarketingMilestone[] {
  const labels = [
    "Soft Launch For Friends And Family",
    "Industry Preview Night",
    "Public Opening Week",
    "First Community Event",
  ];
  return labels.map((label) => ({
    id: localId(),
    label,
    target_date: null,
    notes: "",
    completed: false,
  }));
}

// ── Section metadata ────────────────────────────────────────────────────────

export type MarketingSectionKey = "overview" | "channels" | "story" | "pre_launch";

export const MARKETING_SECTION_KEYS: MarketingSectionKey[] = [
  "overview",
  "channels",
  "story",
  "pre_launch",
];

export const MARKETING_SECTION_LABELS: Record<MarketingSectionKey, string> = {
  overview: "Overview",
  channels: "Channels",
  story: "Story And Brand",
  pre_launch: "Pre-launch Plan",
};

export const MARKETING_SECTION_TAGLINES: Record<MarketingSectionKey, string> = {
  overview:
    "Your plan, in your own words. The high-level story you tell yourself about how the shop gets known.",
  channels:
    "The places you intend to show up. Pick the ones you can keep up with and skip the rest.",
  story:
    "The prompts that feed everything else. Founder story, origin, what makes this shop different, and who it is for.",
  pre_launch:
    "The handful of milestones between today and a busy opening week. Set dates you can actually hit.",
};

// ── Normalize from jsonb ────────────────────────────────────────────────────

function pickString(obj: Record<string, unknown> | null | undefined, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

function pickBool(obj: Record<string, unknown> | null | undefined, key: string): boolean {
  return obj?.[key] === true;
}

function pickNullableString(
  obj: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const v = obj?.[key];
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

function normalizeChannels(input: unknown): MarketingChannelEntry[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: MarketingChannelEntry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const name = pickString(r, "name").trim();
    if (!name) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, notes: pickString(r, "notes") });
  }
  return out;
}

function normalizeMilestones(input: unknown): MarketingMilestone[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const r = raw as Record<string, unknown>;
      const label = pickString(r, "label");
      if (!label) return null;
      return {
        id: pickString(r, "id") || localId(),
        label,
        target_date: pickNullableString(r, "target_date"),
        notes: pickString(r, "notes"),
        completed: pickBool(r, "completed"),
      };
    })
    .filter((m): m is MarketingMilestone => m !== null);
}

export function normalizeMarketing(input: unknown): MarketingDocument {
  if (!input || typeof input !== "object") return structuredClone(EMPTY_MARKETING);
  const obj = input as Record<string, unknown>;

  const overviewIn = (obj.overview as Record<string, unknown> | undefined) ?? {};
  const channelsIn = (obj.channels as Record<string, unknown> | undefined) ?? {};
  const storyIn = (obj.story as Record<string, unknown> | undefined) ?? {};
  const preIn = (obj.pre_launch as Record<string, unknown> | undefined) ?? {};

  return {
    overview: { narrative: pickString(overviewIn, "narrative") },
    channels: { selected: normalizeChannels(channelsIn.selected) },
    story: {
      founder_story: pickString(storyIn, "founder_story"),
      origin: pickString(storyIn, "origin"),
      differentiator: pickString(storyIn, "differentiator"),
      target_customer: pickString(storyIn, "target_customer"),
    },
    pre_launch: { milestones: normalizeMilestones(preIn.milestones) },
    last_generated_at: pickNullableString(obj, "last_generated_at"),
  };
}

export function isMarketingEmpty(doc: MarketingDocument): boolean {
  return (
    !doc.overview.narrative &&
    doc.channels.selected.length === 0 &&
    !doc.story.founder_story &&
    !doc.story.origin &&
    !doc.story.differentiator &&
    !doc.story.target_customer &&
    doc.pre_launch.milestones.length === 0
  );
}

// ── Title Case at API boundary (label-shaped only) ──────────────────────────
//
// Channel names and milestone labels are label-shaped — Title Case.
// Narratives, prompts, and notes are sentence-form copy — left untouched.

export function titleCaseMarketingFromAI(doc: MarketingDocument): MarketingDocument {
  return {
    overview: doc.overview,
    channels: {
      selected: doc.channels.selected.map((c) => ({
        name: c.name ? toTitleCase(c.name) : "",
        notes: c.notes,
      })),
    },
    story: doc.story,
    pre_launch: {
      milestones: doc.pre_launch.milestones.map((m) => ({
        ...m,
        label: m.label ? toTitleCase(m.label) : "",
      })),
    },
    last_generated_at: doc.last_generated_at,
  };
}

// ── AI copilot context ──────────────────────────────────────────────────────

export function formatMarketingForAI(doc: MarketingDocument): string {
  const lines: string[] = [];

  lines.push("**Overview**");
  lines.push(doc.overview.narrative ? `- ${doc.overview.narrative}` : "- (empty)");

  lines.push("\n**Channels**");
  if (doc.channels.selected.length === 0) {
    lines.push("- (none selected)");
  } else {
    for (const c of doc.channels.selected) {
      lines.push(`- ${c.name}${c.notes ? `: ${c.notes}` : ""}`);
    }
  }

  lines.push("\n**Story And Brand**");
  if (doc.story.founder_story) lines.push(`- Founder story: ${doc.story.founder_story}`);
  if (doc.story.origin) lines.push(`- Origin: ${doc.story.origin}`);
  if (doc.story.differentiator) lines.push(`- What makes us different: ${doc.story.differentiator}`);
  if (doc.story.target_customer) lines.push(`- Who it is for: ${doc.story.target_customer}`);

  lines.push("\n**Pre-launch Plan**");
  if (doc.pre_launch.milestones.length === 0) {
    lines.push("- (no milestones)");
  } else {
    for (const m of doc.pre_launch.milestones) {
      const date = m.target_date ? ` (${m.target_date})` : "";
      const done = m.completed ? " [done]" : "";
      lines.push(`- ${m.label}${date}${done}${m.notes ? ` — ${m.notes}` : ""}`);
    }
  }

  return lines.join("\n");
}
