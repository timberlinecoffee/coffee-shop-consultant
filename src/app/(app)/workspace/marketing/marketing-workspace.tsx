"use client";

// TIM-1417: Marketing planning workspace. Four sections: Overview, Channels,
// Story And Brand, Pre-launch Plan. Autosaves to workspace_documents under
// workspace_key='marketing'. AI seed pulls from concept + onboarding answers.
// TIM-2777: v2 layout — WorkspaceHeader + AccordionSection full-width, replacing
// the max-w-3xl tab-based pattern (matches ops-playbook TIM-2776).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Megaphone,
  Sparkles,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Printer,
  ChevronDown,
  CheckCircle,
  Circle,
  Minus,
} from "lucide-react";
import { CoPilotDrawer } from "@/components/copilot/CoPilotDrawer";
import { PaywallModal } from "@/components/paywall-modal";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import {
  WorkspaceActionButton,
  WORKSPACE_ACTION_ICON_SIZE,
} from "@/components/workspace/WorkspaceActionButton";
import { AskScoutButton } from "@/components/workspace/AskScoutButton";
import { useAIReviewModal, type ApprovedChange } from "@/hooks/useAIReviewModal";
import { SaveIndicator } from "@/components/ui/save-indicator";
import { useWorkspaceStatus } from "@/components/workspace/WorkspaceProgressProvider";
import { SectionHelp } from "@/components/ui/section-help";
import { InfoTip } from "@/components/ui/info-tip";
import {
  type MarketingDocument,
  type MarketingSectionKey,
  type MarketingMilestone,
  type MarketingChannelEntry,
  MARKETING_SECTION_KEYS,
  MARKETING_SECTION_LABELS,
  MARKETING_SECTION_TAGLINES,
  MARKETING_CHANNEL_OPTIONS,
  MARKETING_CHANNEL_FIT,
  defaultPreLaunchMilestones,
} from "@/lib/marketing";

const inputCls =
  "w-full text-sm border border-[var(--border-medium)] rounded-lg px-3 py-2 text-[var(--foreground)] placeholder-[var(--neutral-cool-400)] focus-visible:outline-none focus:border-[var(--teal)] disabled:bg-[var(--background)] disabled:text-[var(--dark-grey)] transition-colors";
const textareaCls = `${inputCls} resize-none leading-relaxed`;
const labelCls = "block text-xs font-medium text-[var(--muted-foreground)] mb-1";

function localId(): string {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Accordion types & components ─────────────────────────────────────────────
// TIM-2777: pattern lifted from OperationsPlaybookWorkspace (TIM-2776).

type SectionStatus = "complete" | "in_progress" | "empty";

function StatusBadge({ status }: { status: SectionStatus }) {
  if (status === "complete") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--teal)] bg-[var(--teal-tint-100)] border border-[var(--teal-tint)] px-2 py-0.5 rounded-full shrink-0">
        <CheckCircle size={10} aria-hidden="true" />
        Complete
      </span>
    );
  }
  if (status === "in_progress") {
    return (
      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
        <Circle size={10} aria-hidden="true" />
        In progress
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--muted-foreground)] bg-[var(--background)] border border-[var(--border)] px-2 py-0.5 rounded-full shrink-0">
      <Minus size={10} aria-hidden="true" />
      Empty
    </span>
  );
}

function AccordionSection({
  title,
  status,
  defaultOpen = false,
  children,
}: {
  title: string;
  status: SectionStatus;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--background)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <ChevronDown
            size={16}
            className={`text-[var(--muted-foreground)] transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-[var(--foreground)]">{title}</span>
        </div>
        <StatusBadge status={status} />
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-[var(--border)] space-y-5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Section status derivers ───────────────────────────────────────────────────

function getMarketingSectionStatus(
  doc: MarketingDocument,
  key: MarketingSectionKey,
): SectionStatus {
  if (key === "overview") {
    return doc.overview.narrative.trim().length > 0 ? "complete" : "empty";
  }
  if (key === "channels") {
    return doc.channels.selected.length > 0 ? "complete" : "empty";
  }
  if (key === "story") {
    const { founder_story, origin, differentiator, target_customer } = doc.story;
    const filled = [founder_story, origin, differentiator, target_customer].filter(
      (v) => v.trim().length > 0,
    ).length;
    if (filled === 4) return "complete";
    if (filled > 0) return "in_progress";
    return "empty";
  }
  if (key === "pre_launch") {
    return doc.pre_launch.milestones.length > 0 ? "complete" : "empty";
  }
  return "empty";
}

// ── Props ─────────────────────────────────────────────────────────────────────

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
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [paywallReason, setPaywallReason] = useState<
    "no_subscription" | "paused" | "expired" | null
  >(null);
  const [generating, setGenerating] = useState<MarketingSectionKey | null>(null);
  const { openAIReviewModal, AIReviewModalNode } = useAIReviewModal();

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

  // TIM-2382: apply Scout suggest_workspace_changes proposals for marketing.
  // fieldId is a top-level section key (e.g. "overview") or dot-notation sub-field
  // (e.g. "story.founder_story"). JSON proposedValues replace entire sections;
  // string values update narrative/sub-fields in place. Doc autosaves via useEffect.
  const handleApplyMarketingSuggestions = useCallback(async (accepted: ApprovedChange[]) => {
    setDoc((prev) => {
      let next = { ...prev };
      for (const c of accepted) {
        const dotIdx = c.fieldId.indexOf(".");
        const section = dotIdx === -1 ? c.fieldId : c.fieldId.slice(0, dotIdx);
        const subField = dotIdx === -1 ? "" : c.fieldId.slice(dotIdx + 1);
        if (subField) {
          const sectionVal = next[section as keyof MarketingDocument] as unknown as Record<string, unknown>;
          if (sectionVal && typeof sectionVal === "object") {
            next = { ...next, [section]: { ...sectionVal, [subField]: c.finalValue } };
          }
        } else {
          try {
            const val = JSON.parse(c.finalValue) as MarketingDocument[keyof MarketingDocument];
            next = { ...next, [section as keyof MarketingDocument]: val };
          } catch {
            if (section === "overview") {
              next = { ...next, overview: { ...next.overview, narrative: c.finalValue } };
            }
          }
        }
      }
      return next;
    });
  }, []);

  // TIM-1561: routes AI result through unified review modal before applying.
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
      const sectionLabel = section.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const currentSectionValue =
        typeof doc[section as keyof typeof doc] === "string"
          ? (doc[section as keyof typeof doc] as string)
          : JSON.stringify(doc[section as keyof typeof doc] ?? "");
      const proposedValue =
        typeof body.content[section as keyof typeof body.content] === "string"
          ? (body.content[section as keyof typeof body.content] as string)
          : JSON.stringify(body.content[section as keyof typeof body.content] ?? "");
      openAIReviewModal({
        suggestions: [
          {
            id: `marketing-${section}`,
            fieldId: section,
            fieldLabel: sectionLabel,
            originalValue: currentSectionValue,
            proposedValue,
            isStructured: false,
          },
        ],
        context: { workspace: "Marketing", section: sectionLabel },
        onApply: async (accepted) => {
          await handleApplyMarketingSuggestions(accepted);
          setSavedAt(new Date().toISOString());
        },
      });
    } finally {
      setGenerating(null);
    }
  }

  const hasContent = MARKETING_SECTION_KEYS.some((k) => {
    const s = doc[k];
    return Boolean(s);
  });

  return (
    <>
      {AIReviewModalNode}
      <div className="bg-[var(--background)] min-h-screen">
        <div className="w-full px-4 sm:px-6 pt-8 pb-16">
          {/* TIM-1894: canonical WorkspaceHeader — description in the left column
              under the title, SaveIndicator + Print action top-right, matching
              ops-playbook and Financials. */}
          <WorkspaceHeader
            Icon={Megaphone}
            title="Marketing"
            description="Plan the story, channels, and milestones that get the right people through the door. This is your plan, in your own words."
            actions={
              <>
                {/* TIM-2382: Scout-as-hub primary entry point for AI generation. */}
                <AskScoutButton
                  workspaceKey="marketing"
                  focusLabel="marketing plan"
                  hasContent={hasContent}
                />
                {/* TIM-1937 (board refinement bae7ef73): icon-only collapse <1536px. */}
                <WorkspaceActionButton
                  className="hidden sm:flex"
                  onClick={() =>
                    window.open(
                      "/workspace/marketing/print",
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  aria-label="Print view"
                  title="Open a print-friendly view of your marketing plan"
                >
                  <Printer size={WORKSPACE_ACTION_ICON_SIZE} aria-hidden="true" />
                  <span>Print view</span>
                </WorkspaceActionButton>
                <SaveIndicator saving={saving} savedAt={savedAt} canEdit={canEdit} />
              </>
            }
          />

          {/* TIM-2777: accordion layout — replaces max-w-3xl tab-based pattern */}
          <div className="space-y-3">
            {MARKETING_SECTION_KEYS.map((key, i) => {
              const label = MARKETING_SECTION_LABELS[key];
              const status = getMarketingSectionStatus(doc, key);
              return (
                <AccordionSection
                  key={key}
                  title={label}
                  status={status}
                  defaultOpen={i === 0}
                >
                  <SectionBody
                    sectionKey={key}
                    label={label}
                    tagline={MARKETING_SECTION_TAGLINES[key]}
                    canEdit={canEdit}
                    doc={doc}
                    updateDoc={updateDoc}
                    onGenerate={() => handleGenerate(key)}
                    generating={generating === key}
                  />
                </AccordionSection>
              );
            })}
          </div>
        </div>

        <CoPilotDrawer
          planId={planId}
          workspaceKey="marketing"
          currentFocus={{ label: "Marketing" }}
          initialTrialMessagesUsed={initialTrialMessagesUsed}
          onApplySuggestions={handleApplyMarketingSuggestions}
        />

        <PaywallModal
          open={paywallReason !== null}
          reason={paywallReason ?? "no_subscription"}
          onClose={() => setPaywallReason(null)}
        />
      </div>
    </>
  );
}

// ── Section body (dispatches by section key, no card wrapper) ─────────────────

interface SectionBodyProps {
  sectionKey: MarketingSectionKey;
  label: string;
  tagline: string;
  canEdit: boolean;
  doc: MarketingDocument;
  updateDoc: (mut: (d: MarketingDocument) => MarketingDocument) => void;
  onGenerate: () => void;
  generating: boolean;
}

function SectionBody(props: SectionBodyProps) {
  const { label, tagline, canEdit, onGenerate, generating, sectionKey } = props;
  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <SectionHelp title={label}>{tagline}</SectionHelp>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={!canEdit || generating}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:bg-[var(--teal)]/5 disabled:text-[var(--dark-grey)] disabled:cursor-not-allowed px-3 py-1.5 rounded-lg border border-[var(--teal)]/30 transition-colors flex-shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          {generating ? "Generating…" : "Generate with AI"}
        </button>
      </div>

      {sectionKey === "overview" && <OverviewEditor {...props} />}
      {sectionKey === "channels" && <ChannelsEditor {...props} />}
      {sectionKey === "story" && <StoryEditor {...props} />}
      {sectionKey === "pre_launch" && <PreLaunchEditor {...props} />}
    </div>
  );
}

function OverviewEditor({ canEdit, doc, updateDoc }: SectionBodyProps) {
  return (
    <div>
      {/* TIM-1477: helper one-liner moved into a "?" popup beside the question
          label, matching the Financial / Concept Suite pattern. */}
      <span className="flex items-center gap-1.5 mb-1">
        <label className={labelCls.replace(" mb-1", "")}>How you plan to market the shop</label>
        <InfoTip label="How you plan to market the shop">
          Write it like you would say it to a friend. A few paragraphs in your
          own voice. The tone you set here feeds every other marketing
          surface, from your social bio to your launch posts.
        </InfoTip>
      </span>
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
    </div>
  );
}

function ChannelsEditor({ canEdit, doc, updateDoc }: SectionBodyProps) {
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
            <span key={name} className="inline-flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => addChannel(name)}
                disabled={!canEdit}
                className="text-xs px-2.5 py-1 rounded-lg border border-[var(--border-medium)] text-[var(--muted-foreground)] hover:border-[var(--teal)] hover:text-[var(--teal)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-3 h-3 inline mr-1" />
                {name}
              </button>
              {MARKETING_CHANNEL_FIT[name] && (
                <InfoTip label={name}>{MARKETING_CHANNEL_FIT[name]}</InfoTip>
              )}
            </span>
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
        className={`${inputCls} flex-1 min-w-0`}
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

function StoryEditor({ canEdit, doc, updateDoc }: SectionBodyProps) {
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
}: SectionBodyProps) {
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
