function RegenerateWarningDialog({
  sectionTitle,
  onCancel,
  onConfirm,
}: {
  sectionTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bp-regenerate-warn-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="bp-regenerate-warn-title"
          className="text-base font-semibold text-[var(--foreground)]"
        >
          Regenerate {sectionTitle}?
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          This will generate a completely new version of this section using
          data from your workspaces. Your current content will be replaced.
          Are you sure?
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="text-sm font-medium text-[var(--neutral-cool-700)] px-4 py-2 rounded-xl border border-[var(--neutral-cool-200)] hover:bg-[var(--neutral-cool-50)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="text-sm font-medium text-white bg-[var(--teal)] px-4 py-2 rounded-xl hover:bg-[var(--teal-dark,var(--teal))] transition-colors"
          >
            Yes, Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

function RegenerateUndoToast({
  sectionTitle,
  onUndo,
  onDismiss,
}: {
  sectionTitle: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg max-w-sm text-sm font-medium bg-[var(--teal)] text-white"
    >
      <span className="truncate">Regenerated {sectionTitle}.</span>
      <button
        type="button"
        onClick={onUndo}
        className="inline-flex items-center gap-1.5 text-sm font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-none"
      >
        <Undo2 size={14} aria-hidden="true" />
        Undo
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="text-white/80 hover:text-white focus-visible:outline-none"
        aria-label="Dismiss"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function ArchivePanel({
  sections,
  customSections,
  sectionOrder,
  isOpen,
  onToggle,
  canEdit,
  onRestoreSection,
  onRestoreCustomSection,
  onAddOptional,
}: {
  sections: SectionState[];
  customSections: CustomSectionState[];
  sectionOrder: string[];
  isOpen: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onRestoreSection: (key: BusinessPlanSectionKey) => void;
  onRestoreCustomSection: (id: string) => void;
  onAddOptional: (key: BusinessPlanSectionKey) => void;
}) {
  const archivedStandard = sections.filter((s) => s.isArchived);
  const archivedCustom = customSections.filter((cs) => cs.isArchived);
  const hasArchived = archivedStandard.length > 0 || archivedCustom.length > 0;

  const activeOrderSet = new Set([...sectionOrder, ...DEFAULT_BUSINESS_PLAN_SECTION_ORDER]);
  const optionalSections = BUSINESS_PLAN_SECTIONS.filter(
    (meta) => meta.isOptional && !activeOrderSet.has(meta.key),
  );

  const hasContent = hasArchived || optionalSections.length > 0;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 text-xs text-[var(--neutral-cool-600)] hover:text-[var(--teal)] transition-colors"
      >
        {isOpen ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
        View archived and optional sections
      </button>

      {isOpen && (
        <div className="mt-4 space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-[var(--neutral-cool-600)] uppercase tracking-wider mb-2">
              Archived
            </h3>
            {!hasArchived ? (
              <p className="text-xs text-[var(--muted-foreground)] italic">No archived sections.</p>
            ) : (
              <div className="space-y-2">
                {archivedStandard.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-white"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{s.title}</p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                        {s.userContent ? "Has content" : "No content"}
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onRestoreSection(s.key)}
                        className="flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:text-[var(--teal-850,var(--teal))] whitespace-nowrap shrink-0"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        Restore
                      </button>
                    )}
                  </div>
                ))}
                {archivedCustom.map((cs) => (
                  <div
                    key={cs.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-white"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{cs.title}</p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Custom section</p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onRestoreCustomSection(cs.id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-[var(--teal)] hover:text-[var(--teal-850,var(--teal))] whitespace-nowrap shrink-0"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        Restore
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-[var(--neutral-cool-600)] uppercase tracking-wider mb-2">
              Optional
            </h3>
            {!hasContent && optionalSections.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)] italic">All optional sections are active.</p>
            ) : optionalSections.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)] italic">All optional sections are active.</p>
            ) : (
              <div className="space-y-2">
                {optionalSections.map((meta) => (
                  <div
                    key={meta.key}
                    className="flex items-start justify-between gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-white"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)]">{meta.title}</p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-relaxed">{meta.blurb}</p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onAddOptional(meta.key as BusinessPlanSectionKey)}
                        className="text-xs font-medium text-[var(--teal)] hover:text-[var(--teal-850,var(--teal))] whitespace-nowrap shrink-0 mt-0.5"
                      >
                        Add to Plan
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface SectionCardProps {
  section: SectionState;
  canEdit: boolean;
  bpExamples: BPFieldExample[];
  isStreaming: boolean;
  blurb: string;
  isLocked?: boolean;
  onToggleVisible: () => void;
  onToggleExpand: () => void;
  onEditStart: () => void;
  onEditChange: (val: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onResetToAuto: () => void;
  onWriteWithAi?: () => void;
  onAutoWriteSection?: () => void;
  autoWriteState?: AutoWritePhase | null;
  onAutoWriteAccept?: () => void;
  onAutoWriteRegenerate?: () => void;
  onAutoWriteEdit?: () => void;
  onAutoWriteCancel?: () => void;
  onRegenerateSection?: () => void;
  onAnalyse?: () => void;
  analyseResult?: AnalyseResponse | null;
  analyseLoading?: boolean;
  analyseError?: string;
  onArchive?: () => void;
}

function MarkdownContent({ content }: { content: string }) {
  const clean = stripSourceMarkers(content);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeSanitize]}
      components={{
        h1: ({ children }) => <h1 className="text-xl font-semibold text-[var(--foreground)] mb-2 mt-4 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-semibold text-[var(--foreground)] mb-1.5 mt-3 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1 mt-2 first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="text-sm text-[var(--foreground)] leading-relaxed mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-outside pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-outside pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-[var(--foreground)] leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-[var(--foreground)]">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
      }}
    >
      {clean}
    </ReactMarkdown>
  );
}
