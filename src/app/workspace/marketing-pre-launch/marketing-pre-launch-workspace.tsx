"use client";

// TIM-1060: Marketing & Pre-Launch workspace — 5-section client UI.
// Sections: Waitlist, Google Business Profile, Social setup, Opening-day promo, Press list.
// Storage: workspace_documents.content jsonb under workspace_key='marketing_pre_launch'.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Megaphone, ExternalLink, Plus, Trash2, Sparkles, Check, Mail } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import {
  type MarketingPreLaunchDocument,
  type SocialPostIdea,
  type PressContact,
  GBP_CHECKLIST_ITEMS,
  WAITLIST_TOOL_OPTIONS,
} from "@/lib/marketing-pre-launch";

// ── Shared styles — match Marketing Suite / Concept tokens ──────────────────

const inputCls =
  "w-full text-sm border border-[#e0e0e0] rounded-lg px-3 py-2 text-[#1a1a1a] placeholder-[#c0c0c0] focus:outline-none focus:border-[#155e63] disabled:bg-[#faf9f7] disabled:text-[#afafaf] transition-colors";
const labelCls = "block text-xs font-medium text-[#6b6b6b] mb-1";
const sectionLabelCls = "text-[10px] font-semibold uppercase tracking-wider text-[#155e63] mb-3";
const cardCls = "rounded-2xl border border-[#efefef] bg-white";
const helperCls = "text-[10px] text-[#afafaf] mt-1";

function localId() {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

type SectionKey = "waitlist" | "gbp" | "social" | "opening_promo" | "press";

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: "waitlist",      label: "Waitlist" },
  { key: "gbp",           label: "Google Business Profile" },
  { key: "social",        label: "Social Setup" },
  { key: "opening_promo", label: "Opening-Day Promo" },
  { key: "press",         label: "Press List" },
];

interface Props {
  planId: string;
  canEdit: boolean;
  initialDoc: MarketingPreLaunchDocument;
  conceptShopIdentity: string;
  conceptBrandVoice: string;
  targetOpeningDate: string | null;
  initialTrialMessagesUsed?: number;
}

export function MarketingPreLaunchWorkspace({
  planId,
  canEdit,
  initialDoc,
  conceptShopIdentity,
  conceptBrandVoice,
  targetOpeningDate,
  initialTrialMessagesUsed,
}: Props) {
  const [doc, setDoc] = useState<MarketingPreLaunchDocument>(initialDoc);
  const [active, setActive] = useState<SectionKey>("waitlist");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [paywallReason, setPaywallReason] = useState<"no_subscription" | "paused" | "expired" | null>(null);
  const [generating, setGenerating] = useState<SectionKey | null>(null);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const save = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/workspaces/marketing_pre_launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: docRef.current }),
      });
      if (res.status === 402) {
        const body = await res.json().catch(() => null);
        setPaywallReason(body?.reason ?? "no_subscription");
        return;
      }
      if (res.ok) {
        setSavedAt(new Date().toISOString());
      }
    } finally {
      setSaving(false);
    }
  }, [canEdit]);

  // Debounced autosave on doc change (skips initial mount).
  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      void save();
    }, 700);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [doc, save]);

  const updateDoc = useCallback(
    (mut: (d: MarketingPreLaunchDocument) => MarketingPreLaunchDocument) => {
      setDoc((prev) => mut(prev));
    },
    [],
  );

  async function handleGenerate(section: SectionKey) {
    if (!canEdit || generating) return;
    setGenerating(section);
    try {
      const res = await fetch("/api/workspaces/marketing_pre_launch/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section }),
      });
      if (res.status === 402) {
        const body = await res.json().catch(() => null);
        setPaywallReason(body?.reason ?? "no_subscription");
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { content: MarketingPreLaunchDocument };
      setDoc(body.content);
      setSavedAt(new Date().toISOString());
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="bg-[#faf9f7] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-12">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="w-5 h-5 text-[#155e63] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[#1a1a1a]" style={{ fontSize: "28px" }}>
              Marketing & Pre-Launch
            </h1>
          </div>
          <p className="text-sm text-[#6b6b6b] leading-relaxed">
            Build demand before opening day. Waitlist, Google Business Profile, social setup,
            opening-day promo, and your press list. All in one place.
          </p>
          <div className="mt-3 flex items-center gap-3 text-xs text-[#afafaf]">
            <SaveStatus saving={saving} savedAt={savedAt} canEdit={canEdit} />
            {targetOpeningDate && (
              <span>Target opening: {targetOpeningDate}</span>
            )}
          </div>
        </header>

        <SectionTabs active={active} onChange={setActive} doc={doc} />

        <div className="mt-6 space-y-6">
          {active === "waitlist" && (
            <WaitlistSectionView
              canEdit={canEdit}
              doc={doc}
              updateDoc={updateDoc}
              onGenerate={() => handleGenerate("waitlist")}
              generating={generating === "waitlist"}
            />
          )}

          {active === "gbp" && (
            <GbpSectionView
              canEdit={canEdit}
              doc={doc}
              updateDoc={updateDoc}
              onGenerate={() => handleGenerate("gbp")}
              generating={generating === "gbp"}
            />
          )}

          {active === "social" && (
            <SocialSectionView
              canEdit={canEdit}
              doc={doc}
              updateDoc={updateDoc}
              conceptShopIdentity={conceptShopIdentity}
              conceptBrandVoice={conceptBrandVoice}
              onGenerate={() => handleGenerate("social")}
              generating={generating === "social"}
            />
          )}

          {active === "opening_promo" && (
            <OpeningPromoSectionView
              canEdit={canEdit}
              doc={doc}
              updateDoc={updateDoc}
              onGenerate={() => handleGenerate("opening_promo")}
              generating={generating === "opening_promo"}
            />
          )}

          {active === "press" && (
            <PressSectionView
              canEdit={canEdit}
              doc={doc}
              updateDoc={updateDoc}
              onGenerate={() => handleGenerate("press")}
              generating={generating === "press"}
            />
          )}
        </div>
      </div>

      <CoPilotDrawer
        planId={planId}
        workspaceKey="marketing_pre_launch"
        currentFocus={{ label: SECTIONS.find((s) => s.key === active)?.label ?? "Marketing & Pre-Launch" }}
        initialTrialMessagesUsed={initialTrialMessagesUsed}
      />

      <PaywallModal
        open={paywallReason !== null}
        reason={paywallReason ?? "no_subscription"}
        onClose={() => setPaywallReason(null)}
      />
    </div>
  );
}

// ── Save status ──────────────────────────────────────────────────────────────

function SaveStatus({ saving, savedAt, canEdit }: { saving: boolean; savedAt: string | null; canEdit: boolean }) {
  if (!canEdit) return <span className="italic">Read-only preview</span>;
  if (saving) return <span>Saving…</span>;
  if (savedAt) {
    const ts = new Date(savedAt);
    const hh = ts.getHours().toString().padStart(2, "0");
    const mm = ts.getMinutes().toString().padStart(2, "0");
    return (
      <span className="flex items-center gap-1">
        <Check className="w-3 h-3 text-[#155e63]" />
        Saved {hh}:{mm}
      </span>
    );
  }
  return <span>Autosaves as you type.</span>;
}

// ── Section tabs ─────────────────────────────────────────────────────────────

function SectionTabs({
  active,
  onChange,
  doc,
}: {
  active: SectionKey;
  onChange: (k: SectionKey) => void;
  doc: MarketingPreLaunchDocument;
}) {
  const filledMap = useMemo<Record<SectionKey, boolean>>(() => {
    const waitlistFilled = !!(doc.waitlist.tool || doc.waitlist.landing_headline || doc.waitlist.landing_copy);
    const gbpFilled = Object.values(doc.gbp.status).some(Boolean) || !!doc.gbp.listing_url;
    const socialFilled =
      !!doc.social.instagram_handle ||
      !!doc.social.tiktok_handle ||
      !!doc.social.bio_template ||
      doc.social.first_12_posts.length > 0;
    const promoFilled = !!(
      doc.opening_promo.promo_idea ||
      doc.opening_promo.mechanic ||
      doc.opening_promo.target_reach
    );
    const pressFilled = doc.press.contacts.length > 0;
    return {
      waitlist: waitlistFilled,
      gbp: gbpFilled,
      social: socialFilled,
      opening_promo: promoFilled,
      press: pressFilled,
    };
  }, [doc]);

  return (
    <div className={cardCls}>
      <div role="tablist" aria-label="Marketing & Pre-Launch sections" className="flex flex-wrap gap-1 p-1 overflow-x-auto">
        {SECTIONS.map((s) => {
          const isActive = active === s.key;
          const filled = filledMap[s.key];
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => onChange(s.key)}
              className={`relative text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                isActive
                  ? "bg-[#155e63] text-white"
                  : "text-[#6b6b6b] hover:bg-[#faf9f7] hover:text-[#1a1a1a]"
              }`}
            >
              {s.label}
              {filled && !isActive && (
                <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[#155e63]" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Generate button (shared) ─────────────────────────────────────────────────

function GenerateButton({
  onClick,
  generating,
  disabled,
  label = "AI suggestion",
}: {
  onClick: () => void;
  generating: boolean;
  disabled: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || generating}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#155e63] border border-[#155e63]/30 px-3 py-1.5 rounded-full hover:bg-[#155e63]/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <Sparkles className="w-3 h-3" />
      {generating ? "Generating…" : label}
    </button>
  );
}

// ── Waitlist ─────────────────────────────────────────────────────────────────

function WaitlistSectionView({
  canEdit,
  doc,
  updateDoc,
  onGenerate,
  generating,
}: {
  canEdit: boolean;
  doc: MarketingPreLaunchDocument;
  updateDoc: (mut: (d: MarketingPreLaunchDocument) => MarketingPreLaunchDocument) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const w = doc.waitlist;
  function set<K extends keyof typeof w>(field: K, value: (typeof w)[K]) {
    updateDoc((d) => ({ ...d, waitlist: { ...d.waitlist, [field]: value } }));
  }

  return (
    <div className="space-y-6">
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <span className={sectionLabelCls}>Waitlist Strategy</span>
          <GenerateButton onClick={onGenerate} generating={generating} disabled={!canEdit} />
        </div>
        <p className="text-xs text-[#6b6b6b] leading-relaxed mb-4">
          Capture local emails before opening day. The waitlist is the warm list you launch to.
        </p>
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Email tool</label>
            <select
              className={inputCls}
              disabled={!canEdit}
              value={w.tool}
              onChange={(e) => set("tool", e.target.value)}
            >
              <option value="">Pick a tool…</option>
              {WAITLIST_TOOL_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <p className={helperCls}>Mailchimp and Klaviyo are common starts. You can change later.</p>
          </div>

          <div>
            <label className={labelCls}>Landing headline</label>
            <input
              type="text"
              className={inputCls}
              disabled={!canEdit}
              placeholder="A neighborhood coffee shop is opening soon."
              value={w.landing_headline}
              onChange={(e) => set("landing_headline", e.target.value)}
            />
          </div>

          <div>
            <label className={labelCls}>Landing copy</label>
            <textarea
              className={inputCls}
              rows={4}
              disabled={!canEdit}
              placeholder="One short paragraph. Who you are, where you're opening, why it matters, and what they get for joining the list."
              value={w.landing_copy}
              onChange={(e) => set("landing_copy", e.target.value)}
            />
            <p className={helperCls}>Sentence case. Founder voice — no superlatives or hype.</p>
          </div>

          <FormFieldsEditor
            canEdit={canEdit}
            fields={w.form_fields}
            onChange={(fields) => set("form_fields", fields)}
          />

          <div>
            <label className={labelCls}>Early-bird offer</label>
            <input
              type="text"
              className={inputCls}
              disabled={!canEdit}
              placeholder="First-Week Free Drink"
              value={w.early_bird_offer}
              onChange={(e) => set("early_bird_offer", e.target.value)}
            />
            <p className={helperCls}>The thank-you for signing up. Keep it specific and easy to redeem.</p>
          </div>

          <div>
            <label className={labelCls}>Signup goal before opening</label>
            <input
              type="text"
              className={inputCls}
              disabled={!canEdit}
              placeholder="500 emails"
              value={w.signup_goal}
              onChange={(e) => set("signup_goal", e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FormFieldsEditor({
  canEdit,
  fields,
  onChange,
}: {
  canEdit: boolean;
  fields: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div>
      <label className={labelCls}>Suggested form fields</label>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((f, i) => (
          <span
            key={`${f}_${i}`}
            className="inline-flex items-center gap-1 text-xs bg-[#faf9f7] border border-[#e0e0e0] rounded-full px-2.5 py-1 text-[#1a1a1a]"
          >
            {f}
            {canEdit && (
              <button
                type="button"
                onClick={() => onChange(fields.filter((_, idx) => idx !== i))}
                className="text-[#afafaf] hover:text-[#b1454a]"
                aria-label={`Remove ${f}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        {canEdit && (
          <span className="inline-flex items-center gap-1">
            <input
              type="text"
              className="text-xs border border-[#e0e0e0] rounded-md px-2 py-1 w-32 focus:outline-none focus:border-[#155e63]"
              placeholder="Add field…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  e.preventDefault();
                  onChange([...fields, draft.trim()]);
                  setDraft("");
                }
              }}
            />
          </span>
        )}
      </div>
      <p className={helperCls}>Stay under five fields. More fields, fewer signups.</p>
    </div>
  );
}

// ── GBP ──────────────────────────────────────────────────────────────────────

function GbpSectionView({
  canEdit,
  doc,
  updateDoc,
  onGenerate,
  generating,
}: {
  canEdit: boolean;
  doc: MarketingPreLaunchDocument;
  updateDoc: (mut: (d: MarketingPreLaunchDocument) => MarketingPreLaunchDocument) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const g = doc.gbp;
  function setField<K extends keyof typeof g>(field: K, value: (typeof g)[K]) {
    updateDoc((d) => ({ ...d, gbp: { ...d.gbp, [field]: value } }));
  }
  function toggleItem(key: string) {
    updateDoc((d) => ({
      ...d,
      gbp: { ...d.gbp, status: { ...d.gbp.status, [key]: !d.gbp.status[key] } },
    }));
  }

  const completed = GBP_CHECKLIST_ITEMS.filter((i) => g.status[i.key]).length;
  const total = GBP_CHECKLIST_ITEMS.length;
  const pct = Math.round((completed / total) * 100);

  return (
    <div className="space-y-6">
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <span className={sectionLabelCls}>Google Business Profile</span>
          <GenerateButton onClick={onGenerate} generating={generating} disabled={!canEdit} label="Suggest copy" />
        </div>
        <p className="text-xs text-[#6b6b6b] leading-relaxed mb-3">
          Claim your listing before signage installs — Google flags new businesses with conflicting signage data
          and verification can stall for weeks.
        </p>

        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[#6b6b6b]">Setup progress</span>
            <span className="text-[#155e63] font-medium">
              {completed} of {total} ({pct}%)
            </span>
          </div>
          <div className="h-1.5 bg-[#f0f0f0] rounded-full overflow-hidden">
            <div className="h-full bg-[#155e63] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <ul className="space-y-2">
          {GBP_CHECKLIST_ITEMS.map((item) => {
            const checked = g.status[item.key];
            return (
              <li
                key={item.key}
                className="flex items-start gap-3 text-sm border border-[#f5f5f5] rounded-lg px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => canEdit && toggleItem(item.key)}
                  disabled={!canEdit}
                  className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                    checked
                      ? "bg-[#155e63] border-[#155e63] text-white"
                      : "border-[#e0e0e0] hover:border-[#155e63]"
                  } ${!canEdit ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                  aria-pressed={checked}
                  aria-label={item.label}
                >
                  {checked && <Check className="w-3 h-3" />}
                </button>
                <div className="flex-1">
                  <div className={`font-medium ${checked ? "text-[#afafaf] line-through" : "text-[#1a1a1a]"}`}>
                    {item.label}
                  </div>
                  <div className="text-xs text-[#6b6b6b]">{item.hint}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className={`${cardCls} p-5 space-y-4`}>
        <span className={sectionLabelCls}>Listing Details</span>
        <div>
          <label className={labelCls}>Listing URL</label>
          <input
            type="url"
            className={inputCls}
            disabled={!canEdit}
            placeholder="https://www.google.com/maps/place/…"
            value={g.listing_url}
            onChange={(e) => setField("listing_url", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Primary category</label>
          <input
            type="text"
            className={inputCls}
            disabled={!canEdit}
            placeholder="Coffee Shop"
            value={g.primary_category}
            onChange={(e) => setField("primary_category", e.target.value)}
          />
          <p className={helperCls}>
            Secondary categories you may want: Cafe, Espresso Bar, Bakery (if applicable).
          </p>
        </div>
        <div>
          <label className={labelCls}>Notes</label>
          <textarea
            className={inputCls}
            rows={3}
            disabled={!canEdit}
            placeholder="Verification code arrived 2026-06-12, photographer booked 2026-06-20…"
            value={g.notes}
            onChange={(e) => setField("notes", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Social setup ─────────────────────────────────────────────────────────────

function SocialSectionView({
  canEdit,
  doc,
  updateDoc,
  conceptShopIdentity,
  conceptBrandVoice,
  onGenerate,
  generating,
}: {
  canEdit: boolean;
  doc: MarketingPreLaunchDocument;
  updateDoc: (mut: (d: MarketingPreLaunchDocument) => MarketingPreLaunchDocument) => void;
  conceptShopIdentity: string;
  conceptBrandVoice: string;
  onGenerate: () => void;
  generating: boolean;
}) {
  const s = doc.social;
  function setField<K extends keyof typeof s>(field: K, value: (typeof s)[K]) {
    updateDoc((d) => ({ ...d, social: { ...d.social, [field]: value } }));
  }
  function updatePost(idx: number, mut: (p: SocialPostIdea) => SocialPostIdea) {
    updateDoc((d) => ({
      ...d,
      social: { ...d.social, first_12_posts: d.social.first_12_posts.map((p, i) => (i === idx ? mut(p) : p)) },
    }));
  }
  function addPost() {
    updateDoc((d) => ({
      ...d,
      social: {
        ...d.social,
        first_12_posts: [...d.social.first_12_posts, { label: "", caption: "", format: "Photo" }],
      },
    }));
  }
  function removePost(idx: number) {
    updateDoc((d) => ({
      ...d,
      social: { ...d.social, first_12_posts: d.social.first_12_posts.filter((_, i) => i !== idx) },
    }));
  }

  const hasConcept = conceptShopIdentity || conceptBrandVoice;

  return (
    <div className="space-y-6">
      {hasConcept && (
        <div className={`${cardCls} p-5`}>
          <div className="flex items-center justify-between mb-3">
            <span className={sectionLabelCls}>From Your Concept</span>
            <a href="/workspace/concept" className="flex items-center gap-1 text-xs text-[#155e63] hover:underline">
              Edit in Concept <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="space-y-3">
            {conceptShopIdentity && (
              <div>
                <span className={labelCls}>Shop identity</span>
                <p className="text-sm text-[#1a1a1a] leading-relaxed">{conceptShopIdentity}</p>
              </div>
            )}
            {conceptBrandVoice && (
              <div>
                <span className={labelCls}>Brand voice</span>
                <p className="text-sm text-[#1a1a1a] leading-relaxed">{conceptBrandVoice}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <span className={sectionLabelCls}>Handles & Bio</span>
          <GenerateButton onClick={onGenerate} generating={generating} disabled={!canEdit} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Instagram handle</label>
            <input
              type="text"
              className={inputCls}
              disabled={!canEdit}
              placeholder="@yourshopname"
              value={s.instagram_handle}
              onChange={(e) => setField("instagram_handle", e.target.value)}
            />
            <p className={helperCls}>Reserve early — handles run out.</p>
          </div>
          <div>
            <label className={labelCls}>TikTok handle</label>
            <input
              type="text"
              className={inputCls}
              disabled={!canEdit}
              placeholder="@yourshopname"
              value={s.tiktok_handle}
              onChange={(e) => setField("tiktok_handle", e.target.value)}
            />
            <p className={helperCls}>Even if you skip TikTok, hold the name.</p>
          </div>
        </div>
        <div className="mt-4">
          <label className={labelCls}>Bio template</label>
          <textarea
            className={inputCls}
            rows={3}
            disabled={!canEdit}
            placeholder="Line 1: what you are. Line 2: where you are. Line 3: link to waitlist."
            value={s.bio_template}
            onChange={(e) => setField("bio_template", e.target.value)}
          />
        </div>
        <div className="mt-4">
          <label className={labelCls}>Pre-opening cadence</label>
          <input
            type="text"
            className={inputCls}
            disabled={!canEdit}
            placeholder="3 Posts Per Week, Mondays + Wednesdays + Fridays"
            value={s.cadence}
            onChange={(e) => setField("cadence", e.target.value)}
          />
        </div>
      </div>

      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <span className={sectionLabelCls}>First 12 Posts ({s.first_12_posts.length}/12)</span>
          {canEdit && (
            <button
              type="button"
              onClick={addPost}
              disabled={s.first_12_posts.length >= 12}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#155e63] border border-[#155e63]/30 px-3 py-1.5 rounded-full hover:bg-[#155e63]/5 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" />
              Add post
            </button>
          )}
        </div>
        {s.first_12_posts.length === 0 ? (
          <p className="text-xs text-[#afafaf] italic">
            Plan your first dozen posts. Use AI to seed from your Concept, then edit each one to sound like you.
          </p>
        ) : (
          <ol className="space-y-3">
            {s.first_12_posts.map((post, i) => (
              <li key={i} className="border border-[#f5f5f5] rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#155e63]">
                    Post {i + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      className="text-xs border border-[#e0e0e0] rounded-md px-2 py-1 focus:outline-none focus:border-[#155e63]"
                      disabled={!canEdit}
                      value={post.format}
                      onChange={(e) => updatePost(i, (p) => ({ ...p, format: e.target.value as SocialPostIdea["format"] }))}
                    >
                      {(["Photo", "Reel", "Story", "Carousel"] as const).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removePost(i)}
                        className="text-[#afafaf] hover:text-[#b1454a]"
                        aria-label={`Remove post ${i + 1}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  className="text-sm font-medium border-0 border-b border-transparent focus:border-[#155e63] focus:outline-none w-full mb-2 bg-transparent"
                  placeholder="Post label, e.g. Founder Intro"
                  disabled={!canEdit}
                  value={post.label}
                  onChange={(e) => updatePost(i, (p) => ({ ...p, label: e.target.value }))}
                />
                <textarea
                  className={inputCls}
                  rows={2}
                  disabled={!canEdit}
                  placeholder="Caption draft — sentence case, no emojis."
                  value={post.caption}
                  onChange={(e) => updatePost(i, (p) => ({ ...p, caption: e.target.value }))}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ── Opening-day promo ────────────────────────────────────────────────────────

function OpeningPromoSectionView({
  canEdit,
  doc,
  updateDoc,
  onGenerate,
  generating,
}: {
  canEdit: boolean;
  doc: MarketingPreLaunchDocument;
  updateDoc: (mut: (d: MarketingPreLaunchDocument) => MarketingPreLaunchDocument) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const o = doc.opening_promo;
  function setField<K extends keyof typeof o>(field: K, value: (typeof o)[K]) {
    updateDoc((d) => ({ ...d, opening_promo: { ...d.opening_promo, [field]: value } }));
  }

  return (
    <div className={`${cardCls} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className={sectionLabelCls}>Opening-Day Promo</span>
        <GenerateButton onClick={onGenerate} generating={generating} disabled={!canEdit} />
      </div>
      <p className="text-xs text-[#6b6b6b] leading-relaxed mb-4">
        One promo that creates a reason to show up on day one. Specific beats clever.
      </p>
      <div className="space-y-4">
        <div>
          <label className={labelCls}>Promo idea</label>
          <input
            type="text"
            className={inputCls}
            disabled={!canEdit}
            placeholder="Free Drink With Any Bag of Beans"
            value={o.promo_idea}
            onChange={(e) => setField("promo_idea", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Discount mechanic</label>
          <textarea
            className={inputCls}
            rows={3}
            disabled={!canEdit}
            placeholder="How it works at the register. Be specific so staff can run it without asking you."
            value={o.mechanic}
            onChange={(e) => setField("mechanic", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Target reach</label>
          <input
            type="text"
            className={inputCls}
            disabled={!canEdit}
            placeholder="200 customers through the door on day one"
            value={o.target_reach}
            onChange={(e) => setField("target_reach", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>Partner cross-promo list</label>
          <textarea
            className={inputCls}
            rows={4}
            disabled={!canEdit}
            placeholder="One business per line: the bookstore next door, the yoga studio on the corner, the gym across the street. What you'll offer them. What they'll do for you."
            value={o.partner_crosspromo}
            onChange={(e) => setField("partner_crosspromo", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Press list ───────────────────────────────────────────────────────────────

function PressSectionView({
  canEdit,
  doc,
  updateDoc,
  onGenerate,
  generating,
}: {
  canEdit: boolean;
  doc: MarketingPreLaunchDocument;
  updateDoc: (mut: (d: MarketingPreLaunchDocument) => MarketingPreLaunchDocument) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const contacts = doc.press.contacts;
  function setContacts(next: PressContact[]) {
    updateDoc((d) => ({ ...d, press: { contacts: next } }));
  }
  function updateContact(id: string, mut: (c: PressContact) => PressContact) {
    setContacts(contacts.map((c) => (c.id === id ? mut(c) : c)));
  }
  function addContact() {
    setContacts([
      ...contacts,
      {
        id: localId(),
        name: "",
        outlet: "",
        role: "",
        contact: "",
        angle: "",
        send_by: null,
        contacted: false,
      },
    ]);
  }
  function removeContact(id: string) {
    setContacts(contacts.filter((c) => c.id !== id));
  }

  const contacted = contacts.filter((c) => c.contacted).length;

  return (
    <div className={`${cardCls} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <span className={sectionLabelCls}>Press List</span>
        <div className="flex items-center gap-2">
          <GenerateButton onClick={onGenerate} generating={generating} disabled={!canEdit} label="Suggest contacts" />
          {canEdit && (
            <button
              type="button"
              onClick={addContact}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#155e63] border border-[#155e63]/30 px-3 py-1.5 rounded-full hover:bg-[#155e63]/5"
            >
              <Plus className="w-3 h-3" />
              Add contact
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-[#6b6b6b] leading-relaxed mb-3">
        Local journalists, bloggers, and podcasters who cover your neighborhood. Specificity wins —
        a tight 8-contact list beats a 50-name spray.
      </p>
      {contacts.length > 0 && (
        <p className="text-[10px] uppercase tracking-wider text-[#155e63] font-semibold mb-3">
          {contacted} of {contacts.length} pitched
        </p>
      )}

      {contacts.length === 0 ? (
        <p className="text-xs text-[#afafaf] italic">No contacts yet. Add one or have AI seed a starter list.</p>
      ) : (
        <ol className="space-y-3">
          {contacts.map((c) => (
            <li key={c.id} className="border border-[#f5f5f5] rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  className={inputCls}
                  disabled={!canEdit}
                  placeholder="Name"
                  value={c.name}
                  onChange={(e) => updateContact(c.id, (x) => ({ ...x, name: e.target.value }))}
                />
                <input
                  type="text"
                  className={inputCls}
                  disabled={!canEdit}
                  placeholder="Outlet (e.g. Detroit Free Press)"
                  value={c.outlet}
                  onChange={(e) => updateContact(c.id, (x) => ({ ...x, outlet: e.target.value }))}
                />
                <input
                  type="text"
                  className={inputCls}
                  disabled={!canEdit}
                  placeholder="Role (e.g. Food Reporter)"
                  value={c.role}
                  onChange={(e) => updateContact(c.id, (x) => ({ ...x, role: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  className={inputCls}
                  disabled={!canEdit}
                  placeholder="Email or social handle"
                  value={c.contact}
                  onChange={(e) => updateContact(c.id, (x) => ({ ...x, contact: e.target.value }))}
                />
                <input
                  type="date"
                  className={inputCls}
                  disabled={!canEdit}
                  value={c.send_by ?? ""}
                  onChange={(e) => updateContact(c.id, (x) => ({ ...x, send_by: e.target.value || null }))}
                />
              </div>
              <textarea
                className={inputCls}
                rows={2}
                disabled={!canEdit}
                placeholder="Pitch angle. What is the hook for this specific person? One sentence."
                value={c.angle}
                onChange={(e) => updateContact(c.id, (x) => ({ ...x, angle: e.target.value }))}
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-[#6b6b6b] cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    className="rounded border-[#e0e0e0] text-[#155e63] focus:ring-[#155e63]"
                    checked={c.contacted}
                    onChange={(e) => updateContact(c.id, (x) => ({ ...x, contacted: e.target.checked }))}
                  />
                  <Mail className="w-3 h-3" />
                  Pitched
                </label>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeContact(c.id)}
                    className="text-xs text-[#afafaf] hover:text-[#b1454a] inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
