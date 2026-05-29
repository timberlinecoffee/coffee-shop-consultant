"use client";

// TIM-1036: Marketing Suite — 5-tab workspace.

import { useState, useRef } from "react";
import { Megaphone, Plus, Trash2, ExternalLink, ChevronLeft, ChevronRight, X, Check } from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import type {
  MarketingBrand, DigitalPresenceRow, ContentPost, MarketingCampaign, MarketingBudgetLine,
  PresenceStatus, PostFormat, PostStatus, CampaignObjective, CampaignStatus,
} from "@/lib/marketing";
import {
  PRESENCE_STATUS_CONFIG, PRESENCE_STATUS_ORDER,
  POST_FORMAT_OPTIONS, POST_STATUS_CONFIG, CADENCE_TEMPLATES,
  CAMPAIGN_OBJECTIVE_OPTIONS, CAMPAIGN_OBJECTIVE_LABELS, CAMPAIGN_STATUS_CONFIG,
  totalBudgetCents, formatCents,
} from "@/lib/marketing";

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCls = "w-full text-sm border border-[var(--border-medium)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";
const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";
const sectionLabelCls = "text-[10px] font-semibold uppercase tracking-wider text-[var(--teal)] mb-3";

function makeLocalId() { return `local_${Math.random().toString(36).slice(2, 10)}`; }

// ── StatusPill ────────────────────────────────────────────────────────────────

function StatusPill<T extends string>({ status, config, onClick }: {
  status: T;
  config: Record<string, { label: string; className: string }>;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const cfg = config[status] ?? { label: status, className: "bg-[var(--neutral-cool-100)] text-[#888] border-[var(--border-medium)]" };
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.className} ${onClick ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}>
      {cfg.label}
    </button>
  );
}

// ── BrandTab ──────────────────────────────────────────────────────────────────

function BrandTab({ canEdit, brand, onBrandChange, conceptBrandVoice, conceptShopIdentity }: {
  canEdit: boolean;
  brand: MarketingBrand;
  onBrandChange: (b: MarketingBrand) => void;
  conceptBrandVoice: string;
  conceptShopIdentity: string;
}) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(field: keyof MarketingBrand, value: string) {
    const updated = { ...brand, [field]: value };
    onBrandChange(updated);
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      await fetch("/api/workspaces/marketing/brand", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    }, 600);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <span className={sectionLabelCls}>From Your Concept</span>
          <a href="/workspace/concept" className="flex items-center gap-1 text-xs text-[var(--teal)] hover:underline">
            Edit in Concept <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="space-y-3">
          <div>
            <span className={labelCls}>Shop identity</span>
            <p className="text-sm text-[var(--foreground)] leading-relaxed">
              {conceptShopIdentity || <span className="text-[var(--neutral-cool-400)]">Not set in Concept yet.</span>}
            </p>
          </div>
          <div>
            <span className={labelCls}>Brand voice</span>
            <p className="text-sm text-[var(--foreground)] leading-relaxed">
              {conceptBrandVoice || <span className="text-[var(--neutral-cool-400)]">Not set in Concept yet.</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 space-y-4">
        <span className={sectionLabelCls}>Marketing Brand</span>
        <div>
          <label className={labelCls}>Positioning statement</label>
          <textarea className={inputCls} rows={2} disabled={!canEdit}
            placeholder="One sentence: who you serve, what you do, why it matters."
            value={brand.positioning_statement} onChange={(e) => handleChange("positioning_statement", e.target.value)} />
          <p className="text-[10px] text-[var(--dark-grey)] mt-1">Keep it to one sentence. It becomes the lens for every marketing decision.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["brand_pillar_1", "brand_pillar_2", "brand_pillar_3"] as const).map((field, i) => (
            <div key={field}>
              <label className={labelCls}>Brand pillar {i + 1}</label>
              <input type="text" className={inputCls} disabled={!canEdit}
                placeholder={["The neighborhood table", "Honest coffee", "The regulars"][i]}
                value={brand[field]} onChange={(e) => handleChange(field, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Do say</label>
            <textarea className={inputCls} rows={3} disabled={!canEdit}
              placeholder="Words and phrases that fit your voice"
              value={brand.do_say} onChange={(e) => handleChange("do_say", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>{"Don't say"}</label>
            <textarea className={inputCls} rows={3} disabled={!canEdit}
              placeholder="Words to avoid: 'artisanal', 'handcrafted'"
              value={brand.dont_say} onChange={(e) => handleChange("dont_say", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DigitalPresenceTab ────────────────────────────────────────────────────────

function DigitalPresenceTab({ canEdit, rows, onRowsChange }: {
  canEdit: boolean;
  rows: DigitalPresenceRow[];
  onRowsChange: (r: DigitalPresenceRow[] | ((prev: DigitalPresenceRow[]) => DigitalPresenceRow[])) => void;
}) {
  const [newChannel, setNewChannel] = useState("");
  const [adding, setAdding] = useState(false);

  async function cycleStatus(row: DigitalPresenceRow) {
    if (!canEdit) return;
    const idx = PRESENCE_STATUS_ORDER.indexOf(row.status);
    const next = PRESENCE_STATUS_ORDER[(idx + 1) % PRESENCE_STATUS_ORDER.length] as PresenceStatus;
    onRowsChange((prev) => prev.map((r) => r.id === row.id ? { ...r, status: next } : r));
    await fetch("/api/workspaces/marketing/digital-presence", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, status: next, last_updated_at: new Date().toISOString().slice(0, 10) }),
    });
  }

  function updateField(row: DigitalPresenceRow, field: "url_or_handle" | "owner", value: string) {
    onRowsChange((prev) => prev.map((r) => r.id === row.id ? { ...r, [field]: value } : r));
  }

  async function saveField(row: DigitalPresenceRow, field: "url_or_handle" | "owner") {
    await fetch("/api/workspaces/marketing/digital-presence", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, [field]: row[field] }),
    });
  }

  async function addChannel() {
    if (!newChannel.trim() || adding) return;
    setAdding(true);
    const res = await fetch("/api/workspaces/marketing/digital-presence", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_name: newChannel.trim() }),
    });
    if (res.ok) { const row = await res.json(); onRowsChange((prev) => [...prev, row]); setNewChannel(""); }
    setAdding(false);
  }

  async function deleteRow(row: DigitalPresenceRow) {
    onRowsChange((prev) => prev.filter((r) => r.id !== row.id));
    await fetch(`/api/workspaces/marketing/digital-presence?id=${row.id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_2fr_1fr_auto] gap-2 px-4 py-2 bg-[var(--background)] border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          <span>Channel</span><span>Status</span><span>URL / Handle</span><span>Owner</span><span />
        </div>
        {rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[2fr_1fr_2fr_1fr_auto] gap-2 items-center px-4 py-3 border-b border-[var(--neutral-cool-100)] last:border-0">
            <div>
              <span className="text-sm text-[var(--foreground)] truncate block">{row.channel_name}</span>
              {row.last_updated_at && (
                <span className="text-[10px] text-[var(--dark-grey)]">Updated {row.last_updated_at}</span>
              )}
            </div>
            <StatusPill status={row.status} config={PRESENCE_STATUS_CONFIG} onClick={() => cycleStatus(row)} />
            <input type="text" disabled={!canEdit}
              className="text-sm border border-[var(--border-medium)] rounded-md px-2 py-1 focus:outline-none focus:border-[var(--teal)] disabled:bg-transparent disabled:border-transparent w-full"
              placeholder="https://..." value={row.url_or_handle ?? ""}
              onChange={(e) => updateField(row, "url_or_handle", e.target.value)}
              onBlur={() => saveField(row, "url_or_handle")} />
            <input type="text" disabled={!canEdit}
              className="text-sm border border-[var(--border-medium)] rounded-md px-2 py-1 focus:outline-none focus:border-[var(--teal)] disabled:bg-transparent disabled:border-transparent w-full"
              placeholder="Name" value={row.owner ?? ""}
              onChange={(e) => updateField(row, "owner", e.target.value)}
              onBlur={() => saveField(row, "owner")} />
            <button type="button" disabled={!canEdit} onClick={() => deleteRow(row)}
              className="text-[var(--neutral-cool-400)] hover:text-red-400 disabled:opacity-30 p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="flex gap-2">
          <input type="text" className={`${inputCls} flex-1`} placeholder="Add a channel (e.g. LinkedIn, Nextdoor)"
            value={newChannel} onChange={(e) => setNewChannel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addChannel()} />
          <button type="button" onClick={addChannel} disabled={adding || !newChannel.trim()}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-[var(--teal)] hover:bg-[var(--teal-820)] disabled:opacity-50 px-4 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      )}
    </div>
  );
}

// ── ContentCalendarTab ────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

interface PostDrawerState { mode: "new" | "edit"; date?: string; post?: ContentPost; }

function ContentCalendarTab({ canEdit, posts, onPostsChange }: {
  canEdit: boolean;
  posts: ContentPost[];
  onPostsChange: (p: ContentPost[] | ((prev: ContentPost[]) => ContentPost[])) => void;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [drawer, setDrawer] = useState<PostDrawerState | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  function getPostsForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return posts.filter((p) => p.post_date === dateStr);
  }

  async function applyTemplate(idx: number) {
    const template = CADENCE_TEMPLATES[idx];
    const created: ContentPost[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dow = new Date(year, month, day).getDay();
      const match = template.posts.find((tp) => tp.dayOfWeek === dow);
      if (match) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const res = await fetch("/api/workspaces/marketing/content-posts", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ post_date: dateStr, theme: match.theme, format: match.format, status: "planned", channels: [], caption_draft: "" }),
        });
        if (res.ok) created.push(await res.json());
      }
    }
    if (created.length > 0) onPostsChange((prev) => [...prev, ...created]);
    setShowTemplates(false);
  }

  async function deletePost(post: ContentPost) {
    onPostsChange((prev) => prev.filter((p) => p.id !== post.id));
    await fetch(`/api/workspaces/marketing/content-posts?id=${post.id}`, { method: "DELETE" });
  }

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[var(--neutral-cool-150)]"><ChevronLeft className="w-4 h-4 text-[var(--muted-foreground)]" /></button>
          <span className="text-sm font-semibold text-[var(--foreground)] w-36 text-center">{MONTH_NAMES[month]} {year}</span>
          <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[var(--neutral-cool-150)]"><ChevronRight className="w-4 h-4 text-[var(--muted-foreground)]" /></button>
        </div>
        {canEdit && (
          <button type="button" onClick={() => setShowTemplates(!showTemplates)}
            className="text-xs font-medium text-[var(--teal)] border border-[var(--teal)]/30 px-3 py-1.5 rounded-lg hover:bg-[var(--teal)]/5">
            Use template
          </button>
        )}
      </div>

      {showTemplates && (
        <div className="rounded-xl border border-[var(--border)] bg-white p-4 space-y-3">
          <span className={sectionLabelCls}>Recurring Cadence Templates</span>
          {CADENCE_TEMPLATES.map((t, i) => (
            <div key={i} className="flex items-start justify-between gap-4 pb-3 border-b border-[var(--neutral-cool-100)] last:border-0 last:pb-0">
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">{t.name}</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{t.description}</p>
              </div>
              <button type="button" onClick={() => applyTemplate(i)}
                className="flex-shrink-0 text-xs font-medium text-white bg-[var(--teal)] hover:bg-[var(--teal-820)] px-3 py-1.5 rounded-lg">Apply</button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[var(--border)]">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const dayPosts = day ? getPostsForDay(day) : [];
            const dateStr = day ? `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : "";
            return (
              <div key={i}
                className={`min-h-[72px] border-r border-b border-[var(--neutral-cool-100)] p-1.5 ${day && canEdit ? "cursor-pointer hover:bg-[var(--background)]" : ""} ${!day ? "bg-[var(--neutral-cool-50)]" : ""}`}
                onClick={() => { if (!day || !canEdit) return; setDrawer({ mode: "new", date: dateStr }); }}>
                {day && (
                  <>
                    <span className="text-[10px] text-[var(--dark-grey)] font-medium block mb-1">{day}</span>
                    {dayPosts.map((post) => (
                      <div key={post.id}
                        className="text-[10px] leading-tight px-1.5 py-0.5 rounded bg-[var(--teal)]/10 text-[var(--teal)] mb-0.5 cursor-pointer truncate"
                        onClick={(e) => { e.stopPropagation(); setDrawer({ mode: "edit", post }); }}>
                        {post.theme || post.format}
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {drawer && (
        <PostDrawerModal canEdit={canEdit} drawer={drawer}
          onClose={() => setDrawer(null)}
          onSaved={(post) => {
            if (drawer.mode === "new") onPostsChange((prev) => [...prev, post]);
            else onPostsChange((prev) => prev.map((p) => p.id === post.id ? post : p));
            setDrawer(null);
          }}
          onDelete={(post) => { deletePost(post); setDrawer(null); }}
        />
      )}
    </div>
  );
}

function PostDrawerModal({ canEdit, drawer, onClose, onSaved, onDelete }: {
  canEdit: boolean; drawer: PostDrawerState;
  onClose: () => void; onSaved: (post: ContentPost) => void; onDelete: (post: ContentPost) => void;
}) {
  const existing = drawer.post;
  const [date, setDate] = useState(existing?.post_date ?? drawer.date ?? "");
  const [theme, setTheme] = useState(existing?.theme ?? "");
  const [format, setFormat] = useState<PostFormat>(existing?.format ?? "photo");
  const [channelsRaw, setChannelsRaw] = useState((existing?.channels ?? []).join(", "));
  const [caption, setCaption] = useState(existing?.caption_draft ?? "");
  const [status, setStatus] = useState<PostStatus>(existing?.status ?? "planned");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const body = { post_date: date, theme, format, channels: channelsRaw.split(",").map((s) => s.trim()).filter(Boolean), caption_draft: caption, status };
    if (drawer.mode === "edit" && existing) {
      const res = await fetch("/api/workspaces/marketing/content-posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: existing.id, ...body }) });
      if (res.ok) onSaved(await res.json());
    } else {
      const res = await fetch("/api/workspaces/marketing/content-posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) onSaved(await res.json());
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--foreground)]">{drawer.mode === "edit" ? "Edit post" : "New post"}</span>
          <button type="button" onClick={onClose} className="text-[var(--dark-grey)] hover:text-[var(--foreground)]"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Date</label><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} disabled={!canEdit} /></div>
          <div><label className={labelCls}>Format</label>
            <select className={inputCls} value={format} onChange={(e) => setFormat(e.target.value as PostFormat)} disabled={!canEdit}>
              {POST_FORMAT_OPTIONS.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
            </select>
          </div>
        </div>
        <div><label className={labelCls}>Theme / topic</label><input type="text" className={inputCls} value={theme} onChange={(e) => setTheme(e.target.value)} disabled={!canEdit} placeholder="Menu Feature, Behind the Scenes..." /></div>
        <div><label className={labelCls}>Channels</label><input type="text" className={inputCls} value={channelsRaw} onChange={(e) => setChannelsRaw(e.target.value)} disabled={!canEdit} placeholder="Instagram, TikTok" /><p className="text-[10px] text-[var(--dark-grey)] mt-0.5">Comma-separated</p></div>
        <div><label className={labelCls}>Caption draft</label><textarea className={inputCls} rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={!canEdit} placeholder="Write your caption..." /></div>
        <div><label className={labelCls}>Status</label>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as PostStatus)} disabled={!canEdit}>
            {(Object.entries(POST_STATUS_CONFIG) as [PostStatus, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {canEdit && (
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={save} disabled={saving || !date}
              className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-[var(--teal)] hover:bg-[var(--teal-820)] disabled:opacity-50 px-4 py-2 rounded-lg">
              <Check className="w-4 h-4" />{saving ? "Saving..." : "Save"}
            </button>
            {drawer.mode === "edit" && existing && (
              <button type="button" onClick={() => onDelete(existing)}
                className="flex items-center gap-1 text-sm font-medium text-red-500 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CampaignTab ───────────────────────────────────────────────────────────────

function CampaignTab({ canEdit, campaigns, onCampaignsChange }: {
  canEdit: boolean;
  campaigns: MarketingCampaign[];
  onCampaignsChange: (c: MarketingCampaign[] | ((prev: MarketingCampaign[]) => MarketingCampaign[])) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRow, setNewRow] = useState<Partial<MarketingCampaign> | null>(null);

  function emptyNew(): Partial<MarketingCampaign> {
    return { id: makeLocalId(), name: "", objective: "awareness", channels: [], start_date: null, end_date: null, budget_cents: 0, actual_spend_cents: 0, status: "planned", key_results: "" };
  }

  async function saveNew(fields: Partial<MarketingCampaign>) {
    const merged = { ...newRow, ...fields };
    if (!merged.name?.trim()) return;
    const res = await fetch("/api/workspaces/marketing/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...merged, channels: Array.isArray(merged.channels) ? merged.channels : (merged.channels as unknown as string ?? "").split(",").map((s: string) => s.trim()).filter(Boolean) }),
    });
    if (res.ok) { const created = await res.json(); onCampaignsChange((prev) => [...prev, created]); setNewRow(null); }
  }

  async function savePatch(id: string, fields: Partial<MarketingCampaign>) {
    const res = await fetch("/api/workspaces/marketing/campaigns", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...fields }) });
    if (res.ok) { const updated = await res.json(); onCampaignsChange((prev) => prev.map((c) => c.id === id ? updated : c)); }
    setEditingId(null);
  }

  async function deleteCampaign(id: string) {
    onCampaignsChange((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/workspaces/marketing/campaigns?id=${id}`, { method: "DELETE" });
  }

  function cycleCampaignStatus(c: MarketingCampaign) {
    const order: CampaignStatus[] = ["planned", "running", "completed"];
    const next = order[(order.indexOf(c.status) + 1) % order.length];
    onCampaignsChange((prev) => prev.map((x) => x.id === c.id ? { ...x, status: next } : x));
    savePatch(c.id, { status: next });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-4 py-2 bg-[var(--background)] border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          <span>Campaign</span><span>Objective</span><span>Dates</span><span>Budget</span><span>Spent</span><span>Status</span><span />
        </div>
        {campaigns.map((c) =>
          editingId === c.id ? (
            <CampaignEditRow key={c.id} campaign={c} onSave={(fields) => savePatch(c.id, fields)} onCancel={() => setEditingId(null)} />
          ) : (
            <div key={c.id}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 items-center px-4 py-3 border-b border-[var(--neutral-cool-100)] last:border-0 hover:bg-[var(--background)] cursor-pointer"
              onClick={() => canEdit && setEditingId(c.id)}>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)] truncate">{c.name}</p>
                {c.key_results && <p className="text-[10px] text-[var(--muted-foreground)] truncate">{c.key_results}</p>}
              </div>
              <span className="text-xs text-[var(--muted-foreground)]">{CAMPAIGN_OBJECTIVE_LABELS[c.objective]}</span>
              <span className="text-xs text-[var(--muted-foreground)]">{c.start_date ? c.start_date.slice(0, 7) : "—"}</span>
              <span className="text-xs text-[var(--foreground)]">{formatCents(c.budget_cents)}</span>
              <span className="text-xs text-[var(--foreground)]">{formatCents(c.actual_spend_cents)}</span>
              <StatusPill status={c.status} config={CAMPAIGN_STATUS_CONFIG} onClick={(e) => { e.stopPropagation(); cycleCampaignStatus(c); }} />
              <button type="button" disabled={!canEdit} onClick={(e) => { e.stopPropagation(); deleteCampaign(c.id); }}
                className="text-[var(--neutral-cool-400)] hover:text-red-400 disabled:opacity-30 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )
        )}
        {newRow && <CampaignEditRow key="new" campaign={newRow as MarketingCampaign} onSave={saveNew} onCancel={() => setNewRow(null)} />}
      </div>
      {canEdit && !newRow && (
        <button type="button" onClick={() => setNewRow(emptyNew())}
          className="flex items-center gap-1.5 text-sm font-medium text-[var(--teal)] border border-[var(--teal)]/30 hover:bg-[var(--teal)]/5 px-4 py-2 rounded-lg">
          <Plus className="w-4 h-4" /> Add campaign
        </button>
      )}
    </div>
  );
}

function CampaignEditRow({ campaign, onSave, onCancel }: {
  campaign: MarketingCampaign; onSave: (fields: Partial<MarketingCampaign>) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [objective, setObjective] = useState<CampaignObjective>(campaign.objective);
  const [channelsRaw, setChannelsRaw] = useState((campaign.channels ?? []).join(", "));
  const [startDate, setStartDate] = useState(campaign.start_date ?? "");
  const [endDate, setEndDate] = useState(campaign.end_date ?? "");
  const [budget, setBudget] = useState(String(campaign.budget_cents / 100));
  const [spent, setSpent] = useState(String(campaign.actual_spend_cents / 100));
  const [status, setStatus] = useState<CampaignStatus>(campaign.status);
  const [keyResults, setKeyResults] = useState(campaign.key_results);

  function handleSave() {
    onSave({
      name, objective, channels: channelsRaw.split(",").map((s) => s.trim()).filter(Boolean),
      start_date: startDate || null, end_date: endDate || null,
      budget_cents: Math.round(parseFloat(budget || "0") * 100),
      actual_spend_cents: Math.round(parseFloat(spent || "0") * 100),
      status, key_results: keyResults,
    });
  }

  return (
    <div className="px-4 py-3 border-b border-[var(--neutral-cool-100)] bg-[var(--teal-tint-50)] space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2"><label className={labelCls}>Name</label><input type="text" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" autoFocus /></div>
        <div><label className={labelCls}>Objective</label>
          <select className={inputCls} value={objective} onChange={(e) => setObjective(e.target.value as CampaignObjective)}>
            {CAMPAIGN_OBJECTIVE_OPTIONS.map((o) => <option key={o} value={o}>{CAMPAIGN_OBJECTIVE_LABELS[o]}</option>)}
          </select>
        </div>
        <div><label className={labelCls}>Status</label>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as CampaignStatus)}>
            {(Object.entries(CAMPAIGN_STATUS_CONFIG) as [CampaignStatus, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><label className={labelCls}>Start date</label><input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
        <div><label className={labelCls}>End date</label><input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
        <div><label className={labelCls}>Budget ($)</label><input type="number" min="0" className={inputCls} value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
        <div><label className={labelCls}>Actual spend ($)</label><input type="number" min="0" className={inputCls} value={spent} onChange={(e) => setSpent(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><label className={labelCls}>Channels</label><input type="text" className={inputCls} value={channelsRaw} onChange={(e) => setChannelsRaw(e.target.value)} placeholder="Instagram, Google Ads" /></div>
        <div><label className={labelCls}>Key results / notes</label><input type="text" className={inputCls} value={keyResults} onChange={(e) => setKeyResults(e.target.value)} placeholder="e.g. 200 new follows" /></div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={handleSave} disabled={!name.trim()}
          className="flex items-center gap-1.5 text-sm font-medium text-white bg-[var(--teal)] hover:bg-[var(--teal-820)] disabled:opacity-50 px-4 py-2 rounded-lg">
          <Check className="w-4 h-4" /> Save
        </button>
        <button type="button" onClick={onCancel} className="text-sm font-medium text-[var(--muted-foreground)] border border-[var(--border-medium)] hover:bg-[var(--neutral-cool-100)] px-4 py-2 rounded-lg">Cancel</button>
      </div>
    </div>
  );
}

// ── BudgetTab ─────────────────────────────────────────────────────────────────

function BudgetTab({ canEdit, lines, onLinesChange, avgMonthlyRevenueCents }: {
  canEdit: boolean;
  lines: MarketingBudgetLine[];
  onLinesChange: (l: MarketingBudgetLine[] | ((prev: MarketingBudgetLine[]) => MarketingBudgetLine[])) => void;
  avgMonthlyRevenueCents: number;
}) {
  const [newChannel, setNewChannel] = useState("");
  const [adding, setAdding] = useState(false);
  const saveTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const total = totalBudgetCents(lines);
  const pctOfRevenue = avgMonthlyRevenueCents > 0 ? ((total / avgMonthlyRevenueCents) * 100).toFixed(1) : null;

  function updateAmount(line: MarketingBudgetLine, dollarStr: string) {
    const cents = Math.round(parseFloat(dollarStr || "0") * 100);
    onLinesChange((prev) => prev.map((l) => l.id === line.id ? { ...l, monthly_cents: cents } : l));
    if (saveTimeouts.current.has(line.id)) clearTimeout(saveTimeouts.current.get(line.id)!);
    saveTimeouts.current.set(line.id, setTimeout(async () => {
      await fetch("/api/workspaces/marketing/budget-lines", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: line.id, monthly_cents: cents }) });
    }, 600));
  }

  async function addLine() {
    if (!newChannel.trim() || adding) return;
    setAdding(true);
    const res = await fetch("/api/workspaces/marketing/budget-lines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel_name: newChannel.trim(), monthly_cents: 0 }) });
    if (res.ok) { const line = await res.json(); onLinesChange((prev) => [...prev, line]); setNewChannel(""); }
    setAdding(false);
  }

  async function deleteLine(line: MarketingBudgetLine) {
    onLinesChange((prev) => prev.filter((l) => l.id !== line.id));
    await fetch(`/api/workspaces/marketing/budget-lines?id=${line.id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex items-end justify-between">
          <div><span className={sectionLabelCls}>Monthly total</span><p className="text-3xl font-bold text-[var(--foreground)]">{formatCents(total)}</p></div>
          {pctOfRevenue !== null && (
            <div className="text-right">
              <span className={sectionLabelCls}>% of projected revenue</span>
              <p className="text-2xl font-semibold text-[var(--teal)]">{pctOfRevenue}%</p>
              <p className="text-[10px] text-[var(--dark-grey)]">based on your Financials forecast</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_auto] gap-4 px-4 py-2 bg-[var(--background)] border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          <span>Channel</span><span>Monthly ($)</span><span />
        </div>
        {lines.map((line) => (
          <div key={line.id} className="grid grid-cols-[2fr_1fr_auto] gap-4 items-center px-4 py-3 border-b border-[var(--neutral-cool-100)] last:border-0">
            <span className="text-sm text-[var(--foreground)]">{line.channel_name}</span>
            <input type="number" min="0" disabled={!canEdit}
              className="text-sm border border-[var(--border-medium)] rounded-md px-2 py-1 focus:outline-none focus:border-[var(--teal)] disabled:bg-transparent disabled:border-transparent w-full"
              value={line.monthly_cents / 100} onChange={(e) => updateAmount(line, e.target.value)} />
            <button type="button" disabled={!canEdit} onClick={() => deleteLine(line)}
              className="text-[var(--neutral-cool-400)] hover:text-red-400 disabled:opacity-30 p-1"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="flex gap-2">
          <input type="text" className={`${inputCls} flex-1`} placeholder="Add a channel (e.g. Podcast Sponsorship)"
            value={newChannel} onChange={(e) => setNewChannel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLine()} />
          <button type="button" onClick={addLine} disabled={adding || !newChannel.trim()}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-[var(--teal)] hover:bg-[var(--teal-820)] disabled:opacity-50 px-4 py-2 rounded-lg">
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>
      )}
      <p className="text-xs text-[var(--dark-grey)]">This total updates the Marketing line in your Financials forecast automatically.</p>
    </div>
  );
}

// ── MarketingWorkspace ────────────────────────────────────────────────────────

type Tab = "brand" | "presence" | "calendar" | "campaigns" | "budget";

const TABS: { id: Tab; label: string }[] = [
  { id: "brand",     label: "Brand & Positioning" },
  { id: "presence",  label: "Digital Presence" },
  { id: "calendar",  label: "Content Calendar" },
  { id: "campaigns", label: "Campaign Tracker" },
  { id: "budget",    label: "Marketing Budget" },
];

interface Props {
  planId: string; canEdit: boolean; initialTrialMessagesUsed?: number;
  initialBrand: MarketingBrand | null;
  conceptBrandVoice: string; conceptShopIdentity: string;
  initialPresence: DigitalPresenceRow[];
  initialPosts: ContentPost[];
  initialCampaigns: MarketingCampaign[];
  initialBudgetLines: MarketingBudgetLine[];
  avgMonthlyRevenueCents: number;
}

export function MarketingWorkspace({
  planId, canEdit, initialTrialMessagesUsed,
  initialBrand, conceptBrandVoice, conceptShopIdentity,
  initialPresence, initialPosts, initialCampaigns, initialBudgetLines, avgMonthlyRevenueCents,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("brand");
  const [showPaywall, setShowPaywall] = useState(false);

  const [brand, setBrand] = useState<MarketingBrand>(initialBrand ?? {
    id: "", plan_id: planId, positioning_statement: "", brand_pillar_1: "", brand_pillar_2: "", brand_pillar_3: "", do_say: "", dont_say: "", created_at: "", updated_at: "",
  });
  const [presence, setPresence] = useState<DigitalPresenceRow[]>(initialPresence);
  const [posts, setPosts] = useState<ContentPost[]>(initialPosts);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>(initialCampaigns);
  const [budgetLines, setBudgetLines] = useState<MarketingBudgetLine[]>(initialBudgetLines);

  function guardEdit(fn: () => void) { if (!canEdit) { setShowPaywall(true); return; } fn(); }

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-16">
        <header className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Megaphone className="w-5 h-5 text-[var(--teal)] flex-shrink-0" aria-hidden="true" />
            <h1 className="font-bold text-[var(--foreground)]" style={{ fontSize: "28px" }}>Marketing</h1>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            Track your brand, channels, content schedule, campaigns, and monthly spend from one place.
          </p>
        </header>

        <div className="flex gap-1 mb-6 border-b border-[var(--border)] overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
              className={`flex-shrink-0 text-sm font-medium px-4 py-2.5 border-b-2 transition-colors ${activeTab === t.id ? "border-[var(--teal)] text-[var(--teal)]" : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "brand" && <BrandTab canEdit={canEdit} brand={brand} onBrandChange={(b) => guardEdit(() => setBrand(b))} conceptBrandVoice={conceptBrandVoice} conceptShopIdentity={conceptShopIdentity} />}
        {activeTab === "presence" && <DigitalPresenceTab canEdit={canEdit} rows={presence} onRowsChange={(u) => guardEdit(() => setPresence(typeof u === "function" ? u(presence) : u))} />}
        {activeTab === "calendar" && <ContentCalendarTab canEdit={canEdit} posts={posts} onPostsChange={(u) => guardEdit(() => setPosts(typeof u === "function" ? u(posts) : u))} />}
        {activeTab === "campaigns" && <CampaignTab canEdit={canEdit} campaigns={campaigns} onCampaignsChange={(u) => guardEdit(() => setCampaigns(typeof u === "function" ? u(campaigns) : u))} />}
        {activeTab === "budget" && <BudgetTab canEdit={canEdit} lines={budgetLines} onLinesChange={(u) => guardEdit(() => setBudgetLines(typeof u === "function" ? u(budgetLines) : u))} avgMonthlyRevenueCents={avgMonthlyRevenueCents} />}
      </div>

      {showPaywall && <PaywallModal open={showPaywall} onClose={() => setShowPaywall(false)} />}

      <CoPilotDrawer planId={planId} workspaceKey="marketing"
        currentFocus={{ label: `Marketing: ${TABS.find((t) => t.id === activeTab)?.label ?? ""}` }}
        initialTrialMessagesUsed={initialTrialMessagesUsed} />
    </div>
  );
}
