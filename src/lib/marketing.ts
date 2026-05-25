// TIM-1036: Marketing Suite v1 — types, constants, and helpers.

export interface MarketingBrand {
  id: string;
  plan_id: string;
  positioning_statement: string;
  brand_pillar_1: string;
  brand_pillar_2: string;
  brand_pillar_3: string;
  do_say: string;
  dont_say: string;
  created_at: string;
  updated_at: string;
}

export function emptyMarketingBrand(planId: string): MarketingBrand {
  return { id: "", plan_id: planId, positioning_statement: "", brand_pillar_1: "", brand_pillar_2: "", brand_pillar_3: "", do_say: "", dont_say: "", created_at: "", updated_at: "" };
}

export type PresenceStatus = "not_started" | "in_progress" | "live";

export interface DigitalPresenceRow {
  id: string;
  plan_id: string;
  channel_name: string;
  status: PresenceStatus;
  url_or_handle: string | null;
  owner: string | null;
  last_updated_at: string | null;
  is_system: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export const PRESENCE_STATUS_CONFIG: Record<PresenceStatus, { label: string; className: string }> = {
  not_started: { label: "Not Started", className: "bg-[#f5f5f5] text-[#888] border-[#e0e0e0]" },
  in_progress: { label: "In Progress", className: "bg-amber-50 text-amber-700 border-amber-200" },
  live:        { label: "Live",        className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export const PRESENCE_STATUS_ORDER: PresenceStatus[] = ["not_started", "in_progress", "live"];

export const DEFAULT_DIGITAL_CHANNELS: Array<{ channel_name: string; position: number }> = [
  { channel_name: "Google Business Profile", position: 0 },
  { channel_name: "Instagram",               position: 1 },
  { channel_name: "TikTok",                  position: 2 },
  { channel_name: "Yelp",                    position: 3 },
  { channel_name: "Apple Maps",              position: 4 },
  { channel_name: "Owned Website",           position: 5 },
  { channel_name: "Email List",              position: 6 },
  { channel_name: "SMS List",                position: 7 },
  { channel_name: "Resy / OpenTable",        position: 8 },
  { channel_name: "DoorDash / Uber Eats",    position: 9 },
];

export type PostFormat  = "photo" | "reel" | "story" | "video" | "graphic" | "other";
export type PostStatus  = "planned" | "scheduled" | "posted";

export interface ContentPost {
  id: string;
  plan_id: string;
  post_date: string;
  channels: string[];
  theme: string;
  format: PostFormat;
  caption_draft: string;
  status: PostStatus;
  created_at: string;
  updated_at: string;
}

export const POST_FORMAT_OPTIONS: PostFormat[] = ["photo", "reel", "story", "video", "graphic", "other"];

export const POST_STATUS_CONFIG: Record<PostStatus, { label: string; className: string }> = {
  planned:   { label: "Planned",   className: "bg-[#f5f5f5] text-[#888] border-[#e0e0e0]" },
  scheduled: { label: "Scheduled", className: "bg-blue-50 text-blue-700 border-blue-200" },
  posted:    { label: "Posted",    className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export interface CalendarTemplate {
  name: string;
  description: string;
  posts: Array<{ dayOfWeek: number; theme: string; format: PostFormat }>;
}

export const CADENCE_TEMPLATES: CalendarTemplate[] = [
  {
    name: "Community Builder",
    description: "Monday menu feature, Wednesday behind-the-scenes, Friday community spotlight",
    posts: [
      { dayOfWeek: 1, theme: "Menu Feature",        format: "photo" },
      { dayOfWeek: 3, theme: "Behind the Scenes",   format: "reel"  },
      { dayOfWeek: 5, theme: "Community Spotlight", format: "photo" },
    ],
  },
  {
    name: "Storyteller",
    description: "Tuesday origin story, Thursday customer story, Saturday weekend special",
    posts: [
      { dayOfWeek: 2, theme: "Origin Story",    format: "reel"  },
      { dayOfWeek: 4, theme: "Customer Story",  format: "story" },
      { dayOfWeek: 6, theme: "Weekend Special", format: "photo" },
    ],
  },
];

export type CampaignObjective = "awareness" | "trial" | "retention" | "loyalty";
export type CampaignStatus    = "planned" | "running" | "completed";

export interface MarketingCampaign {
  id: string;
  plan_id: string;
  name: string;
  objective: CampaignObjective;
  channels: string[];
  start_date: string | null;
  end_date: string | null;
  budget_cents: number;
  actual_spend_cents: number;
  status: CampaignStatus;
  key_results: string;
  created_at: string;
  updated_at: string;
}

export const CAMPAIGN_OBJECTIVE_OPTIONS: CampaignObjective[] = ["awareness", "trial", "retention", "loyalty"];

export const CAMPAIGN_OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  awareness: "Awareness",
  trial:     "Trial",
  retention: "Retention",
  loyalty:   "Loyalty",
};

export const CAMPAIGN_STATUS_CONFIG: Record<CampaignStatus, { label: string; className: string }> = {
  planned:   { label: "Planned",   className: "bg-[#f5f5f5] text-[#888] border-[#e0e0e0]" },
  running:   { label: "Running",   className: "bg-blue-50 text-blue-700 border-blue-200" },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export interface MarketingBudgetLine {
  id: string;
  plan_id: string;
  channel_name: string;
  monthly_cents: number;
  is_system: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_BUDGET_CHANNELS: Array<{ channel_name: string; position: number }> = [
  { channel_name: "Paid Social",   position: 0 },
  { channel_name: "Print / Local", position: 1 },
  { channel_name: "Events",        position: 2 },
  { channel_name: "Influencer",    position: 3 },
  { channel_name: "Tools",         position: 4 },
];

export function totalBudgetCents(lines: MarketingBudgetLine[]): number {
  return lines.reduce((sum, l) => sum + l.monthly_cents, 0);
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100);
}
