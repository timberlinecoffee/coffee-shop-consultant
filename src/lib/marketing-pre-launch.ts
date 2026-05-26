// TIM-1060: Marketing & Pre-Launch workspace types and helpers.
// Stored in workspace_documents.content as jsonb where workspace_key='marketing_pre_launch'.

import { toTitleCase } from "@/lib/text";

// ── Waitlist ──────────────────────────────────────────────────────────────────

export interface WaitlistSection {
  tool: string;
  landing_headline: string;
  landing_copy: string;
  form_fields: string[];
  early_bird_offer: string;
  signup_goal: string;
}

export const EMPTY_WAITLIST: WaitlistSection = {
  tool: "",
  landing_headline: "",
  landing_copy: "",
  form_fields: ["Email", "First name", "Zip code"],
  early_bird_offer: "",
  signup_goal: "",
};

export const WAITLIST_TOOL_OPTIONS = ["Mailchimp", "ConvertKit", "Klaviyo", "Beehiiv", "Substack", "Other"];

// ── Google Business Profile ───────────────────────────────────────────────────

export interface GbpChecklistItem {
  key: string;
  label: string;
  hint: string;
}

export const GBP_CHECKLIST_ITEMS: GbpChecklistItem[] = [
  { key: "claim_listing",     label: "Claim listing",       hint: "Claim before any signage installs." },
  { key: "verify_address",    label: "Verify address",      hint: "Postcard or video verification." },
  { key: "set_hours",         label: "Set hours",           hint: "Include grand-opening hours." },
  { key: "upload_photos",     label: "Upload photos",       hint: "Exterior, interior, drinks, team." },
  { key: "set_categories",    label: "Set categories",      hint: "Primary: Coffee Shop. Secondary as needed." },
  { key: "set_attributes",    label: "Set attributes",      hint: "Wi-Fi, outdoor seating, payment options." },
  { key: "answer_qa",         label: "Seed Q&A",            hint: "Pre-answer the obvious questions." },
  { key: "post_opening",      label: "Post opening update", hint: "Publish a Google Post for grand opening." },
];

export interface GbpSection {
  status: Record<string, boolean>;
  listing_url: string;
  primary_category: string;
  notes: string;
}

export const EMPTY_GBP: GbpSection = {
  status: Object.fromEntries(GBP_CHECKLIST_ITEMS.map((i) => [i.key, false])),
  listing_url: "",
  primary_category: "Coffee Shop",
  notes: "",
};

// ── Social setup ──────────────────────────────────────────────────────────────

export interface SocialPostIdea {
  label: string;
  caption: string;
  format: "Photo" | "Reel" | "Story" | "Carousel";
}

export interface SocialSection {
  instagram_handle: string;
  tiktok_handle: string;
  bio_template: string;
  cadence: string;
  first_12_posts: SocialPostIdea[];
}

export const EMPTY_SOCIAL: SocialSection = {
  instagram_handle: "",
  tiktok_handle: "",
  bio_template: "",
  cadence: "",
  first_12_posts: [],
};

// ── Opening-day promo ─────────────────────────────────────────────────────────

export interface OpeningPromoSection {
  promo_idea: string;
  mechanic: string;
  target_reach: string;
  partner_crosspromo: string;
}

export const EMPTY_PROMO: OpeningPromoSection = {
  promo_idea: "",
  mechanic: "",
  target_reach: "",
  partner_crosspromo: "",
};

// ── Press list ────────────────────────────────────────────────────────────────

export interface PressContact {
  id: string;
  name: string;
  outlet: string;
  role: string;
  contact: string;
  angle: string;
  send_by: string | null;
  contacted: boolean;
}

export interface PressSection {
  contacts: PressContact[];
}

export const EMPTY_PRESS: PressSection = { contacts: [] };

// ── Full document ─────────────────────────────────────────────────────────────

export interface MarketingPreLaunchDocument {
  waitlist: WaitlistSection;
  gbp: GbpSection;
  social: SocialSection;
  opening_promo: OpeningPromoSection;
  press: PressSection;
}

export const EMPTY_MARKETING_PRE_LAUNCH: MarketingPreLaunchDocument = {
  waitlist: EMPTY_WAITLIST,
  gbp: EMPTY_GBP,
  social: EMPTY_SOCIAL,
  opening_promo: EMPTY_PROMO,
  press: EMPTY_PRESS,
};

function pickString(obj: Record<string, unknown> | null | undefined, key: string): string {
  const v = obj?.[key];
  return typeof v === "string" ? v : "";
}

function pickStringArray(obj: Record<string, unknown> | null | undefined, key: string, fallback: string[]): string[] {
  const v = obj?.[key];
  if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v as string[];
  return fallback;
}

function pickBool(obj: Record<string, unknown> | null | undefined, key: string): boolean {
  return obj?.[key] === true;
}

export function normalizeMarketingPreLaunch(input: unknown): MarketingPreLaunchDocument {
  if (!input || typeof input !== "object") return structuredClone(EMPTY_MARKETING_PRE_LAUNCH);
  const obj = input as Record<string, unknown>;

  const waitlistIn = (obj.waitlist as Record<string, unknown> | undefined) ?? {};
  const waitlist: WaitlistSection = {
    tool: pickString(waitlistIn, "tool"),
    landing_headline: pickString(waitlistIn, "landing_headline"),
    landing_copy: pickString(waitlistIn, "landing_copy"),
    form_fields: pickStringArray(waitlistIn, "form_fields", EMPTY_WAITLIST.form_fields.slice()),
    early_bird_offer: pickString(waitlistIn, "early_bird_offer"),
    signup_goal: pickString(waitlistIn, "signup_goal"),
  };

  const gbpIn = (obj.gbp as Record<string, unknown> | undefined) ?? {};
  const gbpStatusIn = (gbpIn.status as Record<string, unknown> | undefined) ?? {};
  const gbpStatus: Record<string, boolean> = {};
  for (const item of GBP_CHECKLIST_ITEMS) {
    gbpStatus[item.key] = pickBool(gbpStatusIn, item.key);
  }
  const gbp: GbpSection = {
    status: gbpStatus,
    listing_url: pickString(gbpIn, "listing_url"),
    primary_category: pickString(gbpIn, "primary_category") || "Coffee Shop",
    notes: pickString(gbpIn, "notes"),
  };

  const socialIn = (obj.social as Record<string, unknown> | undefined) ?? {};
  const postsIn = Array.isArray(socialIn.first_12_posts) ? (socialIn.first_12_posts as unknown[]) : [];
  const first_12_posts: SocialPostIdea[] = postsIn
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const r = p as Record<string, unknown>;
      const formatRaw = typeof r.format === "string" ? r.format : "Photo";
      const format = (["Photo", "Reel", "Story", "Carousel"] as const).includes(formatRaw as "Photo")
        ? (formatRaw as SocialPostIdea["format"])
        : "Photo";
      return {
        label: pickString(r, "label"),
        caption: pickString(r, "caption"),
        format,
      };
    })
    .filter((p): p is SocialPostIdea => p !== null);

  const social: SocialSection = {
    instagram_handle: pickString(socialIn, "instagram_handle"),
    tiktok_handle: pickString(socialIn, "tiktok_handle"),
    bio_template: pickString(socialIn, "bio_template"),
    cadence: pickString(socialIn, "cadence"),
    first_12_posts,
  };

  const promoIn = (obj.opening_promo as Record<string, unknown> | undefined) ?? {};
  const opening_promo: OpeningPromoSection = {
    promo_idea: pickString(promoIn, "promo_idea"),
    mechanic: pickString(promoIn, "mechanic"),
    target_reach: pickString(promoIn, "target_reach"),
    partner_crosspromo: pickString(promoIn, "partner_crosspromo"),
  };

  const pressIn = (obj.press as Record<string, unknown> | undefined) ?? {};
  const contactsIn = Array.isArray(pressIn.contacts) ? (pressIn.contacts as unknown[]) : [];
  const contacts: PressContact[] = contactsIn
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const r = c as Record<string, unknown>;
      const sendBy = r.send_by;
      return {
        id: pickString(r, "id") || `local_${Math.random().toString(36).slice(2, 10)}`,
        name: pickString(r, "name"),
        outlet: pickString(r, "outlet"),
        role: pickString(r, "role"),
        contact: pickString(r, "contact"),
        angle: pickString(r, "angle"),
        send_by: typeof sendBy === "string" ? sendBy : null,
        contacted: pickBool(r, "contacted"),
      };
    })
    .filter((c): c is PressContact => c !== null);

  return { waitlist, gbp, social, opening_promo, press: { contacts } };
}

// ── Title-case at API boundary for AI-generated content ──────────────────────

// Title-case label-shaped fields. Sentence-form copy (landing_copy, bio_template,
// captions, notes) stays in sentence case.
export function titleCaseAiPayload(input: MarketingPreLaunchDocument): MarketingPreLaunchDocument {
  return {
    waitlist: {
      ...input.waitlist,
      landing_headline: input.waitlist.landing_headline ? toTitleCase(input.waitlist.landing_headline) : "",
      early_bird_offer: input.waitlist.early_bird_offer ? toTitleCase(input.waitlist.early_bird_offer) : "",
    },
    gbp: input.gbp,
    social: {
      ...input.social,
      cadence: input.social.cadence ? toTitleCase(input.social.cadence) : "",
      first_12_posts: input.social.first_12_posts.map((p) => ({
        ...p,
        label: p.label ? toTitleCase(p.label) : "",
      })),
    },
    opening_promo: {
      ...input.opening_promo,
      promo_idea: input.opening_promo.promo_idea ? toTitleCase(input.opening_promo.promo_idea) : "",
    },
    press: {
      contacts: input.press.contacts.map((c) => ({
        ...c,
        name: c.name ? toTitleCase(c.name) : "",
        outlet: c.outlet ? toTitleCase(c.outlet) : "",
        role: c.role ? toTitleCase(c.role) : "",
      })),
    },
  };
}

// ── AI copilot context ───────────────────────────────────────────────────────

export function formatMarketingPreLaunchForAI(doc: MarketingPreLaunchDocument): string {
  const lines: string[] = [];

  lines.push("**Waitlist**");
  if (doc.waitlist.tool) lines.push(`- Tool: ${doc.waitlist.tool}`);
  if (doc.waitlist.landing_headline) lines.push(`- Headline: ${doc.waitlist.landing_headline}`);
  if (doc.waitlist.early_bird_offer) lines.push(`- Early-bird offer: ${doc.waitlist.early_bird_offer}`);
  if (doc.waitlist.signup_goal) lines.push(`- Signup goal: ${doc.waitlist.signup_goal}`);

  lines.push("\n**Google Business Profile**");
  const gbpDone = GBP_CHECKLIST_ITEMS.filter((i) => doc.gbp.status[i.key]).map((i) => i.label);
  lines.push(`- Completed: ${gbpDone.length ? gbpDone.join(", ") : "_none yet_"}`);
  if (doc.gbp.listing_url) lines.push(`- Listing URL: ${doc.gbp.listing_url}`);

  lines.push("\n**Social setup**");
  if (doc.social.instagram_handle) lines.push(`- Instagram: ${doc.social.instagram_handle}`);
  if (doc.social.tiktok_handle) lines.push(`- TikTok: ${doc.social.tiktok_handle}`);
  if (doc.social.cadence) lines.push(`- Cadence: ${doc.social.cadence}`);
  lines.push(`- First 12 posts planned: ${doc.social.first_12_posts.length}/12`);

  lines.push("\n**Opening-day promo**");
  if (doc.opening_promo.promo_idea) lines.push(`- Idea: ${doc.opening_promo.promo_idea}`);
  if (doc.opening_promo.mechanic) lines.push(`- Mechanic: ${doc.opening_promo.mechanic}`);

  lines.push("\n**Press list**");
  lines.push(`- Contacts: ${doc.press.contacts.length}`);
  const sent = doc.press.contacts.filter((c) => c.contacted).length;
  if (doc.press.contacts.length) lines.push(`- Pitched: ${sent}/${doc.press.contacts.length}`);

  return lines.join("\n");
}

export function isMarketingPreLaunchEmpty(doc: MarketingPreLaunchDocument): boolean {
  return (
    !doc.waitlist.tool &&
    !doc.waitlist.landing_headline &&
    !doc.waitlist.landing_copy &&
    !doc.waitlist.early_bird_offer &&
    !doc.waitlist.signup_goal &&
    Object.values(doc.gbp.status).every((v) => !v) &&
    !doc.gbp.listing_url &&
    !doc.gbp.notes &&
    !doc.social.instagram_handle &&
    !doc.social.tiktok_handle &&
    !doc.social.bio_template &&
    !doc.social.cadence &&
    doc.social.first_12_posts.length === 0 &&
    !doc.opening_promo.promo_idea &&
    !doc.opening_promo.mechanic &&
    !doc.opening_promo.target_reach &&
    !doc.opening_promo.partner_crosspromo &&
    doc.press.contacts.length === 0
  );
}
