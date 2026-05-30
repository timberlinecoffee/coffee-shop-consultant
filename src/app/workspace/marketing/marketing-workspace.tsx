"use client";

// TIM-1417: Marketing planning workspace. Four tabs: Overview, Channels,
// Story And Brand, Pre-launch Plan. Autosaves to workspace_documents under
// workspace_key='marketing'. AI seed pulls from concept + onboarding answers.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Megaphone,
  Check,
  Sparkles,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { SaveIndicator } from "@/components/ui/save-indicator";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import { SectionHelp } from "@/components/ui/section-help";
import {
  type MarketingDocument,
  type MarketingSectionKey,
  type MarketingMilestone,
  type MarketingChannelEntry,
  MARKETING_SECTION_KEYS,
  MARKETING_SECTION_LABELS,
  MARKETING_SECTION_TAGLINES,
  MARKETING_CHANNEL_OPTIONS,
  defaultPreLaunchMilestones,
} from "@/lib/marketing";

const inputCls =
  "w-full text-sm border border-[var(--border-medium)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";
const textareaCls = `${inputCls} resize-none leading-relaxed`;
const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";
// TIM-1353 v2: section headers parse as structural headers (14px / bold / wider
// tracking + more bottom space), not floating eyebrow tags.
const sectionLabelCls =
  "text-sm font-bold uppercase tracking-[0.08em] text-[var(--teal)] mb-3 leading-tight";
const cardCls = "rounded-xl border border-[var(--border)] bg-white";
const helperCls = "text-[10px] text-[var(--dark-grey)] mt-1";

function localId(): string {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

interface Props {
  planId: string;
  canEdit: boolean;
  initialDoc: MarketingDocument;
  conceptShopIdentity: string;
  conceptBrandVoice: string;
  targetOpeningDate: string | null;
  initialTrialMessagesUsed?: number;
}

export function MarketingWorkspace({
  planId,
  canEdit,
  initialDoc,
  initialTrialMessagesUsed,
}: Props) {
  const [doc, setDoc] = useState<MarketingDocument>(initialDoc);
  const [active, setActive] = useState<MarketingSectionKey>("overview");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [paywallReason, setPaywallReason] = useState<
    "no_subscription" | "paused" | "expired" | null
  >(null);
  const [generating, setGenerating] = useState<MarketingSectionKey | null>(null);

  const { promoteOnEdit } = useWorkspaceStatus();
  // Auto-promote not_started → in_progress on first successful save.
  useEffect(() => {
    if (savedAt) promoteOnEdit("marketing");
  }, [savedAt, promoteOnEdit]);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const save = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/workspaces/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: docRef.current }),
      });
      if (res.status === 402) {
        const body = (await res.json().catch(() => null)) as { reason?: string } | null;
        setPaywallReason(
          (body?.reason as "no_subscription" | "paused" | "expired") ??
            "no_subscription",
        );
        return;
      }
      if (res.ok) {
        setSavedAt(new Date().toISOString());
      }
    } finally {
      setSaving(false);
    }
  }, [canEdit]);

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
    (mut: (d: MarketingDocument) => MarketingDocument) => setDoc((prev) => mut(prev)),
    [],
  );

  async function handleGenerate(section: MarketingSectionKey) {
    if (!canEdit || generating) return;
    setGenerating(section);
    try {
      const res = await fetch("/api/workspaces/marketing/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section }),
      });
      if (res.status === 402) {
        const body = (await res.json().catch(() => null)) as { reason?: string } | null;
        setPaywallReason(
          (body?.reason as "no_subscription" | "paused" | "expired") ??
            "no_subscription",
        );
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { content: MarketingDocument };
      setDoc(body.content);
      setSavedAt(new Date().toISOString());
    } finally {
      setGenerating(null);
    }
  }

  const activeLabel = MARKETING_SECTION_LABELS[active];

  return (
    <div className="bg-[var(--background)] min-h-screen">
      <div className="max-w-3xl mx-auto px-6 pt-8 pb-12">
        <header className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-2">
              <Megaphone
                className="w-5 h-5 text-[var(--teal)] flex-shrink-0"
                aria-hidden="true"
              />
              <h1 className="text-[28px] font-bold text-[var(--foreground)] leading-tight">
                Marketing
              </h1>
            </div>
            <Link
              href="/workspace/marketing/print"
              className="hidden sm:inline-block text-xs font-medium text-[var(--teal)] hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Print view
            </Link>
          </div>
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
            Plan the story, channels, and milestones that get the right people
            through the door. This is your plan, in your own words.
          </p>
          <div className="mt-3 flex items-center gap-3 text-xs text-[var(--dark-grey)]">
            <SaveIndicator saving={saving} savedAt={savedAt} canEdit={canEdit} />
          </div>
        </header>

        <SectionTabs active={active} onChange={setActive} doc={doc} />

        <div className="mt-6 space-y-6">
          <SectionEditor
            key={active}
            sectionKey={active}
            label={activeLabel}
            tagline={MARKETING_SECTION_TAGLINES[active]}
            canEdit={canEdit}
            doc={doc}
            updateDoc={updateDoc}
            onGenerate={() => handleGenerate(active)}
            generating={generating === active}
          />
        </div>
      </div>

      <CoPilotDrawer
        planId={planId}
        workspaceKey="marketing"
        currentFocus={{ label: activeLabel }}
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

// ── Save status — see SaveIndicator in @/components/ui/save-indicator ────────

// ── Section tabs ────────────────────────────────────────────────────────────

function SectionTabs({
  active,
  onChange,
  doc,
}: {
  active: MarketingSectionKey;
  onChange: (k: MarketingSectionKey) => void;
  doc: MarketingDocument;
}) {
  const filledMap: Record<MarketingSectionKey, boolean> = {
    overview: doc.overview.narrative.trim().length > 0,
    channels: doc.channels.selected.length > 0,
    story:
      doc.story.founder_story.trim().length > 0 ||
      doc.story.origin.trim().length > 0 ||
      doc.story.differentiator.trim().length > 0 ||
      doc.story.target_customer.trim().length > 0,
    pre_launch: doc.pre_launch.milestones.length > 0,
  };

  return (
    <div className={cardCls}>
      <div
        role="tablist"
        aria-label="Marketing sections"
        className="flex flex-wrap gap-1 p-1"
      >
        {MARKETING_SECTION_KEYS.map((key) => {
          const isActive = active === key;
          const filled = filledMap[key];
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => onChange(key)}
              className={`flex-1 min-w-[110px] flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-colors ${
                isActive
                  ? "bg-[var(--teal)] text-white"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--background)]"
              }`}
            >
              {filled && (
                <Check
                  className={`w-3 h-3 ${
                    isActive ? "text-white" : "text-[var(--teal)]"
                  }`}
                />
              )}
              {MARKETING_SECTION_LABELS[key]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Section editor (dispatches by section key) ──────────────────────────────

interface SectionEditorProps {
  sectionKey: MarketingSectionKey;
  label: string;
  tagline: string;
  canEdit: boolean;
  doc: MarketingDocument;
  updateDoc: (mut: (d: MarketingDocument) => MarketingDocument) => void;
  onGenerate: () => void;
  generating: boolean;
}

function SectionEditor(props: SectionEditorProps) {
  const { sectionKey, label, tagline, canEdit, onGenerate, generating } = props;
  return (
    <section className={`${cardCls} p-6`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <h2 className={sectionLabelCls}>{label}</h2>
          <SectionHelp title={label}>{tagline}</SectionHelp>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canEdit || generating}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 disabled:text-[var(--dark-grey)] disabled:cursor-not-allowed px-3 py-1.5 rounded-lg border border-[var(--teal)]/30 transition-colors flex-shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {generating ? "Drafting…" : "Draft with AI"}
        </button>
        <span className="sr-only" role="status">
          {generating ? `Drafting the ${label} section with AI…` : ""}
        </span>
      </div>

      {sectionKey === "overview" && <OverviewEditor {...props} />}
      {sectionKey === "channels" && <ChannelsEditor {...props} />}
      {sectionKey === "story" && <StoryEditor {...props} />}
      {sectionKey === "pre_launch" && <PreLaunchEditor {...props} />}
    </section>
  );
}

function OverviewEditor({ canEdit, doc, updateDoc }: SectionEditorProps) {
  return (
    <div>
      <label className={labelCls}>How you plan to market the shop</label>
      <textarea
        className={textareaCls}
        rows={10}
        value={doc.overview.narrative}
        onChange={(e) =>
          updateDoc((d) => ({ ...d, overview: { narrative: e.target.value } }))
        }
        disabled={!canEdit}
        placeholder="A few paragraphs in your own voice. How will people hear about this shop in the lead-up to opening, and after? What feels right for the neighborhood, the concept, the kind of regular you want?"
      />
      <p className={helperCls}>
        Tip: Write it like you would say it to a friend. The voice that comes
        through here feeds every other surface.
      </p>
    </div>
  );
}

function ChannelsEditor({ canEdit, doc, updateDoc }: SectionEditorProps) {
  const selected = doc.channels.selected;
  const selectedNames = new Set(selected.map((c) => c.name.toLowerCase()));

  function addChannel(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (selectedNames.has(trimmed.toLowerCase())) return;
    updateDoc((d) => ({
      ...d,
      channels: {
        selected: [...d.channels.selected, { name: trimmed, notes: "" }],
      },
    }));
  }

  function removeChannel(idx: number) {
    updateDoc((d) => ({
      ...d,
      channels: {
        selected: d.channels.selected.filter((_, i) => i !== idx),
      },
    }));
  }

  function patchChannel(idx: number, patch: Partial<MarketingChannelEntry>) {
    updateDoc((d) => ({
      ...d,
      channels: {
        selected: d.channels.selected.map((c, i) =>
          i === idx ? { ...c, ...patch } : c,
        ),
      },
    }));
  }

  function move(idx: number, delta: -1 | 1) {
    updateDoc((d) => {
      const next = idx + delta;
      if (next < 0 || next >= d.channels.selected.length) return d;
      const arr = d.channels.selected.slice();
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return { ...d, channels: { selected: arr } };
    });
  }

  const availablePresets = MARKETING_CHANNEL_OPTIONS.filter(
    (name) => !selectedNames.has(name.toLowerCase()),
  );

  return (
    <div>
      <div className="mb-4">
        <label className={labelCls}>Add a channel</label>
        <div className="flex flex-wrap gap-1.5">
          {availablePresets.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => addChannel(name)}
              disabled={!canEdit}
              className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border-medium)] text-[var(--muted-foreground)] hover:border-[var(--teal)] hover:text-[var(--teal)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-3 h-3 inline mr-1" />
              {name}
            </button>
          ))}
        </div>
        <CustomChannelInput onAdd={addChannel} canEdit={canEdit} />
      </div>

      {selected.length === 0 ? (
        <p className="text-xs text-[var(--dark-grey)] italic py-4 text-center">
          Pick the channels you can keep up with. Two or three you actually
          maintain beats a long list of dormant accounts.
        </p>
      ) : (
        <ol className="space-y-3">
          {selected.map((c, idx) => (
            <li
              key={`${c.name}-${idx}`}
              className="rounded-xl border border-[var(--border)] p-3 bg-[var(--background)]"
            >
              <div className="flex items-start gap-2 mb-2">
                <div className="flex flex-col gap-0.5 pt-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => move(idx, -1)}
                    disabled={!canEdit || idx === 0}
                    aria-label="Move channel up"
                    className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(idx, 1)}
                    disabled={!canEdit || idx === selected.length - 1}
                    aria-label="Move channel down"
                    className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    {c.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeChannel(idx)}
                  disabled={!canEdit}
                  aria-label={`Remove ${c.name}`}
                  className="text-[var(--dark-grey)] hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <textarea
                rows={2}
                className={textareaCls}
                value={c.notes}
                onChange={(e) => patchChannel(idx, { notes: e.target.value })}
                disabled={!canEdit}
                placeholder="Why this channel? Who runs it? What kind of post or moment shows up here?"
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function CustomChannelInput({
  onAdd,
  canEdit,
}: {
  onAdd: (name: string) => void;
  canEdit: boolean;
}) {
  const [value, setValue] = useState("");
  function submit() {
    if (!value.trim()) return;
    onAdd(value);
    setValue("");
  }
  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        disabled={!canEdit}
        placeholder="Add another channel"
        className={`${inputCls} max-w-xs`}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!canEdit || !value.trim()}
        className="text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 disabled:text-[var(--dark-grey)] disabled:cursor-not-allowed px-2.5 py-1.5 rounded-lg transition-colors"
      >
        Add
      </button>
    </div>
  );
}

function StoryEditor({ canEdit, doc, updateDoc }: SectionEditorProps) {
  function set<K extends keyof MarketingDocument["story"]>(
    key: K,
    value: MarketingDocument["story"][K],
  ) {
    updateDoc((d) => ({ ...d, story: { ...d.story, [key]: value } }));
  }
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Founder story</label>
        <textarea
          className={textareaCls}
          rows={4}
          value={doc.story.founder_story}
          onChange={(e) => set("founder_story", e.target.value)}
          disabled={!canEdit}
          placeholder="How did you get here? A few sentences a customer could read in your bio and feel like they already know you."
        />
      </div>
      <div>
        <label className={labelCls}>Origin of the shop</label>
        <textarea
          className={textareaCls}
          rows={4}
          value={doc.story.origin}
          onChange={(e) => set("origin", e.target.value)}
          disabled={!canEdit}
          placeholder="Why this shop, why this neighborhood, why now. The reason it should exist."
        />
      </div>
      <div>
        <label className={labelCls}>What makes this shop different</label>
        <textarea
          className={textareaCls}
          rows={4}
          value={doc.story.differentiator}
          onChange={(e) => set("differentiator", e.target.value)}
          disabled={!canEdit}
          placeholder="The one or two things competitors in this market cannot easily copy. Supplier relationships, people, atmosphere, expertise."
        />
      </div>
      <div>
        <label className={labelCls}>Who it is for</label>
        <textarea
          className={textareaCls}
          rows={4}
          value={doc.story.target_customer}
          onChange={(e) => set("target_customer", e.target.value)}
          disabled={!canEdit}
          placeholder="The real person you are making decisions for. Their week, their morning, what brings them in."
        />
      </div>
    </div>
  );
}

function PreLaunchEditor({
  canEdit,
  doc,
  updateDoc,
}: SectionEditorProps) {
  const milestones = doc.pre_launch.milestones;

  function patch(idx: number, patch: Partial<MarketingMilestone>) {
    updateDoc((d) => ({
      ...d,
      pre_launch: {
        milestones: d.pre_launch.milestones.map((m, i) =>
          i === idx ? { ...m, ...patch } : m,
        ),
      },
    }));
  }

  function move(idx: number, delta: -1 | 1) {
    updateDoc((d) => {
      const next = idx + delta;
      if (next < 0 || next >= d.pre_launch.milestones.length) return d;
      const arr = d.pre_launch.milestones.slice();
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return { ...d, pre_launch: { milestones: arr } };
    });
  }

  function remove(idx: number) {
    updateDoc((d) => ({
      ...d,
      pre_launch: {
        milestones: d.pre_launch.milestones.filter((_, i) => i !== idx),
      },
    }));
  }

  function addMilestone() {
    updateDoc((d) => ({
      ...d,
      pre_launch: {
        milestones: [
          ...d.pre_launch.milestones,
          {
            id: localId(),
            label: "",
            target_date: null,
            notes: "",
            completed: false,
          },
        ],
      },
    }));
  }

  function loadDefaults() {
    updateDoc((d) => ({
      ...d,
      pre_launch: { milestones: defaultPreLaunchMilestones() },
    }));
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--muted-foreground)]">
          {milestones.length}{" "}
          {milestones.length === 1 ? "milestone" : "milestones"}
        </span>
        {milestones.length === 0 && canEdit && (
          <button
            type="button"
            onClick={loadDefaults}
            className="text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            Load suggested milestones
          </button>
        )}
      </div>

      <ol className="space-y-2">
        {milestones.map((m, idx) => (
          <li
            key={m.id}
            className="rounded-xl border border-[var(--border)] p-3 bg-[var(--background)]"
          >
            <div className="flex items-start gap-2 mb-2">
              <div className="flex flex-col gap-0.5 pt-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={!canEdit || idx === 0}
                  aria-label="Move milestone up"
                  className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={!canEdit || idx === milestones.length - 1}
                  aria-label="Move milestone down"
                  className="text-[var(--dark-grey)] hover:text-[var(--teal)] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>
              <input
                type="checkbox"
                checked={m.completed}
                onChange={(e) => patch(idx, { completed: e.target.checked })}
                disabled={!canEdit}
                aria-label={`Mark "${m.label || "milestone"}" complete`}
                className="mt-2 accent-[var(--teal)] flex-shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-2">
                <input
                  type="text"
                  className={inputCls}
                  value={m.label}
                  onChange={(e) => patch(idx, { label: e.target.value })}
                  disabled={!canEdit}
                  placeholder="Milestone name"
                />
                <div className="flex items-center gap-2 text-xs">
                  <label className="text-[var(--muted-foreground)] whitespace-nowrap">
                    Target date
                  </label>
                  <input
                    type="date"
                    className={`${inputCls} max-w-[180px]`}
                    value={m.target_date ?? ""}
                    onChange={(e) =>
                      patch(idx, { target_date: e.target.value || null })
                    }
                    disabled={!canEdit}
                  />
                </div>
                <textarea
                  rows={2}
                  className={textareaCls}
                  value={m.notes}
                  onChange={(e) => patch(idx, { notes: e.target.value })}
                  disabled={!canEdit}
                  placeholder="What happens here? Who shows up, what gets tested, what would make it feel right?"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                disabled={!canEdit}
                aria-label="Remove milestone"
                className="text-[var(--dark-grey)] hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0 mt-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ol>

      {milestones.length === 0 && (
        <p className="text-xs text-[var(--dark-grey)] italic py-4 text-center">
          No milestones yet. Add your first one below or load a suggested set
          you can edit.
        </p>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={addMilestone}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add milestone
        </button>
      )}
    </div>
  );
}
