function SectionCard({
  section,
  canEdit,
  bpExamples,
  isStreaming,
  blurb,
  isLocked,
  onToggleVisible,
  onToggleExpand,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onResetToAuto,
  onWriteWithAi,
  onAutoWriteSection,
  onRegenerateSection,
  autoWriteState,
  onAutoWriteAccept,
  onAutoWriteRegenerate,
  onAutoWriteEdit,
  onAutoWriteCancel,
  onAnalyse,
  analyseResult,
  analyseLoading,
  analyseError,
  onArchive,
}: SectionCardProps) {
  const [openExample, setOpenExample] = useState(false);
  const [exampleIdx, setExampleIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasUserOverride = section.userContent !== null;
  const displayContent = section.isEditing
    ? section.editBuffer
    : (section.userContent ?? section.autoContent);

  const isPlaceholder =
    !displayContent ||
    displayContent.includes("workspace to populate") ||
    displayContent.includes("Click Generate") ||
    displayContent.includes("Complete the other") ||
    displayContent.includes("Complete the Marketing") ||
    displayContent.includes("click the text field");

  useEffect(() => {
    if (!menuOpen) return;
    const onMouse = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const canReset = hasUserOverride && !section.isEditing && !section.isGenerating && !isStreaming;

  return (
    <div
      className={`group relative rounded-xl border bg-white ${
        section.isVisible ? "border-[var(--border)]" : "border-[var(--neutral-cool-200)]"
      }`}
    >
      {canEdit && (
        <div ref={menuRef} className="absolute top-1.5 right-1.5 z-20">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label={`Section options for ${section.title}`}
            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] p-2.5 rounded-lg text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors"
          >
            <MoreVertical size={18} aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 z-30 bg-white border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[220px]">
              <button
                type="button"
                onClick={() => {
                  onToggleVisible();
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--neutral-cool-50)] flex items-center gap-2"
              >
                {section.isVisible ? (
                  <>
                    <EyeOff size={14} aria-hidden="true" className="text-[var(--neutral-cool-600)]" />
                    Hide from PDF
                  </>
                ) : (
                  <>
                    <Eye size={14} aria-hidden="true" className="text-[var(--neutral-cool-600)]" />
                    Show in PDF
                  </>
                )}
              </button>
              {!isLocked && onArchive && (
                <button
                  type="button"
                  onClick={() => {
                    onArchive();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--neutral-cool-50)] flex items-center gap-2"
                >
                  <Archive size={14} aria-hidden="true" className="text-[var(--neutral-cool-600)]" />
                  Archive section
                </button>
              )}
              {hasUserOverride && (
                <button
                  type="button"
                  disabled={!canReset}
                  title={
                    section.isEditing
                      ? "Save or cancel your edit before resetting"
                      : section.isGenerating || isStreaming
                        ? "Wait for the current generation to finish"
                        : undefined
                  }
                  onClick={() => {
                    onResetToAuto();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-[var(--foreground)] hover:bg-[var(--neutral-cool-50)] flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <RotateCcw size={14} aria-hidden="true" className="text-[var(--neutral-cool-600)]" />
                  Reset to AI-generated
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className={`transition-opacity ${section.isVisible ? "opacity-100" : "opacity-60"}`}>
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-center gap-2 sm:gap-3 pr-12">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={section.isExpanded}
            aria-label={section.isExpanded ? `Collapse ${section.title}` : `Expand ${section.title}`}
            className="flex-shrink-0 p-0.5 rounded hover:bg-[var(--neutral-cool-100)] transition-colors"
          >
            {section.isExpanded ? (
              <ChevronUp className="w-4 h-4 text-[var(--neutral-cool-600)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--neutral-cool-600)]" />
            )}
          </button>
          <SectionHeader
            title={section.title}
            helpContent={blurb || undefined}
            headingLevel={2}
            className="flex-1"
            aiActions={[
              ...(onAnalyse != null
                ? [{ kind: "analyse" as const, onClick: onAnalyse, disabled: analyseLoading ?? false }]
                : []),
              ...(BP_AI_SPLIT
                ? [
                    ...(onWriteWithAi != null
                      ? [{
                          kind: "write" as const,
                          onClick: onWriteWithAi,
                          disabled: !canEdit || isStreaming || autoWriteState != null,
                        }]
                      : []),
                    ...(onRegenerateSection != null
                      ? [{
                          kind: "regenerate" as const,
                          onClick: onRegenerateSection,
                          disabled: !canEdit || isStreaming || autoWriteState != null,
                        }]
                      : []),
                  ]
                : onAutoWriteSection != null
                ? [{
                    kind: "write" as const,
                    label: "Auto-Write This Section",
                    onClick: onAutoWriteSection,
                    disabled: !canEdit || isStreaming || autoWriteState != null,
                  }]
                : onWriteWithAi != null
                ? [{ kind: "write" as const, onClick: onWriteWithAi, disabled: !canEdit || isStreaming }]
                : []),
            ] satisfies AiAction[]}
          />
        </div>

        {section.isExpanded ? (
          <div className="flex items-center gap-2 mt-1 pl-7 sm:pl-8 flex-wrap">
            <p className="text-xs text-[var(--dark-grey)]">{section.sourceLabel}</p>
            {hasUserOverride && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--success-bg-3)] text-[var(--success-dark)] border border-[var(--success-bg)]">
                Edited
              </span>
            )}
            {!BP_AI_SPLIT && onWriteWithAi && canEdit && !isStreaming && !autoWriteState && (
              <button
                type="button"
                onClick={onWriteWithAi}
                className="text-xs text-[var(--teal)] hover:underline focus-visible:outline-none"
              >
                Customize Sources
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5 pl-6 sm:pl-7">{blurb}</p>
        )}

        {section.isExpanded && bpExamples.length > 0 && (
          <div className="pl-7 sm:pl-8 mt-1">
            <button
              type="button"
              onClick={() => {
                setOpenExample((v) => !v);
                if (!openExample) setExampleIdx(0);
              }}
              className="text-xs text-[var(--teal)] font-medium hover:underline focus-visible:outline-none focus:underline"
            >
              {openExample ? "Hide example" : "See an example"}
            </button>
          </div>
        )}
      </div>

      {section.isExpanded && (
        <div className="px-5 pb-5">
          {autoWriteState && onAutoWriteAccept && onAutoWriteRegenerate && onAutoWriteEdit && onAutoWriteCancel && (
            <AutoWriteInlineCard
              state={autoWriteState}
              onAccept={onAutoWriteAccept}
              onRegenerate={onAutoWriteRegenerate}
              onEdit={onAutoWriteEdit}
              onCancel={onAutoWriteCancel}
            />
          )}
          {!autoWriteState && analyseError && (
            <p className="text-xs text-red-600 mb-3">{analyseError}</p>
          )}
          {!autoWriteState && analyseResult && (
            <div className="mb-4">
              <InlineAnalysisCard
                result={analyseResult}
                loading={analyseLoading ?? false}
                onRegenerate={() => onAnalyse?.()}
              />
            </div>
          )}
          {!autoWriteState && openExample && bpExamples.length > 0 && (() => {
            const ex = bpExamples[exampleIdx % Math.max(bpExamples.length, 1)];
            if (!ex) return null;
            return (
              <div
                className="mb-4 bg-[var(--warm-250)] border border-[var(--warm-800)] rounded-xl p-4"
                role="region"
                aria-label="Sample answer from a fictional coffee shop"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-[10px] font-semibold text-[var(--teal)] uppercase tracking-[0.1em] leading-none">
                      {ex.shopName}
                    </p>
                    <p className="text-[10px] text-[var(--muted-foreground)] italic mt-0.5">
                      {ex.shopType}
                    </p>
                  </div>
                  <CollapseButton
                    onClick={() => setOpenExample(false)}
                    size={13}
                    aria-label="Close example"
                    className="text-[var(--dark-grey)] hover:text-[var(--foreground)] focus-visible:outline-none ml-2 shrink-0"
                  />
                </div>
                <p className="text-sm text-[var(--gray-1200)] leading-relaxed italic border-l-2 border-[var(--warm-950)] pl-3">
                  {ex.answer}
                </p>
                <div className="flex items-center justify-between mt-3">
                  {bpExamples.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setExampleIdx((i) => (i + 1) % bpExamples.length)}
                      className="text-xs text-[var(--teal)] hover:underline focus-visible:outline-none focus:text-[var(--teal-dark)]"
                    >
                      See another shop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenExample(false)}
                    className="text-xs font-medium text-[var(--foreground)] hover:text-[var(--teal)] transition-colors focus-visible:outline-none ml-auto"
                  >
                    Got it
                  </button>
                </div>
              </div>
            );
          })()}

          {!autoWriteState && <div className="border-t border-[var(--neutral-cool-150)] pt-4">
            {isStreaming && !section.editBuffer && (
              <div className="flex items-center gap-2 mb-3" role="status">
                <div className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[var(--teal)] animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
                <span className="text-xs text-[var(--muted-foreground)]">Writing...</span>
              </div>
            )}

            {section.isEditing ? (
              <div>
                <MobileExpandableTextarea
                  value={section.editBuffer}
                  onChange={onEditChange}
                  label={section.title ?? "Section content"}
                  placeholder="Add content for this section..."
                  minRows={6}
                  className="min-h-[160px]"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={onEditSave}
                    disabled={section.isSaving}
                    className="px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white text-xs font-medium hover:bg-[var(--teal-850)] transition-colors disabled:opacity-50"
                  >
                    {section.isSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={onEditCancel}
                    className="px-3 py-1.5 rounded-lg border border-[var(--gray-750)] text-[var(--gray-1150)] text-xs font-medium hover:bg-[var(--neutral-cool-100)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={canEdit && !isStreaming ? onEditStart : undefined}
                className={`${
                  canEdit && !isStreaming
                    ? "cursor-text rounded-lg hover:bg-[var(--neutral-cool-50)] -mx-1 px-1 py-0.5 transition-colors"
                    : ""
                }`}
                title={canEdit && !isPlaceholder ? "Click to edit" : undefined}
              >
                {displayContent && !isPlaceholder ? (
                  <MarkdownContent content={displayContent} />
                ) : (
                  <span className="text-[var(--dark-grey)] italic text-sm">
                    {BP_AI_SPLIT
                      ? "No content yet. Use Write with AI or Regenerate with AI to draft this section."
                      : "No content yet. Use Auto-Write to generate this section."}
                  </span>
                )}
              </div>
            )}
          </div>}
        </div>
      )}
      </div>
    </div>
  );
}

function AutoWriteInlineCard({
  state,
  onAccept,
  onRegenerate,
  onEdit,
  onCancel,
}: {
  state: AutoWritePhase;
  onAccept: () => void;
  onRegenerate: () => void;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const isCommitting = state.phase === "committing";

  if (state.phase === "generating") {
    return (
      <div className="rounded-xl border border-[var(--teal-tint)] bg-[var(--teal)]/[0.03] p-4 mb-4" role="status">
        <div className="flex items-center gap-2.5">
          <Loader2 className="w-4 h-4 text-[var(--teal)] animate-spin flex-shrink-0" aria-hidden="true" />
          <p className="text-xs font-medium text-[var(--teal)]">
            Pulling data from your workspaces and writing this section…
          </p>
        </div>
        {state.streamingBuf && (
          <p className="mt-3 text-sm text-[var(--muted-foreground)] leading-relaxed line-clamp-4 border-t border-[var(--teal-tint)] pt-3">
            {state.streamingBuf}
          </p>
        )}
        <div className="mt-3">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--teal-tint)] bg-white p-4 mb-4">
      <p className="text-xs font-semibold text-[var(--teal)] mb-2">AI draft ready. Review before accepting.</p>
      <div className="text-sm text-[var(--foreground)] leading-relaxed max-h-48 overflow-y-auto mb-4 whitespace-pre-wrap border border-[var(--border)] rounded-lg p-3 bg-[var(--neutral-cool-50)]">
        {state.proposedText}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={isCommitting}
          onClick={onAccept}
          className="px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white text-xs font-medium hover:bg-[var(--teal-850,var(--teal))] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCommitting ? "Saving…" : "Accept"}
        </button>
        <button
          type="button"
          disabled={isCommitting}
          onClick={onRegenerate}
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--foreground)] text-xs font-medium hover:bg-[var(--neutral-cool-50)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Regenerate
        </button>
        <button
          type="button"
          disabled={isCommitting}
          onClick={onEdit}
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--foreground)] text-xs font-medium hover:bg-[var(--neutral-cool-50)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Edit
        </button>
        <button
          type="button"
          disabled={isCommitting}
          onClick={onCancel}
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors ml-1 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

interface CustomSectionCardProps {
  section: CustomSectionState;
  canEdit: boolean;
  isStreaming?: boolean;
  onToggleExpand: () => void;
  onToggleVisible: () => void;
  onTitleEditStart: () => void;
  onTitleChange: (val: string) => void;
  onTitleSave: () => void;
  onTitleCancel: () => void;
  onEditStart: () => void;
  onEditChange: (val: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
  onWriteWithAi?: () => void;
  onArchive?: () => void;
}

function CustomSectionCard({
  section,
  canEdit,
  onToggleExpand,
  onToggleVisible,
  onTitleEditStart,
  onTitleChange,
  onTitleSave,
  onTitleCancel,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
  onWriteWithAi,
  onArchive,
}: CustomSectionCardProps) {
  const displayContent = section.isEditing ? section.editBuffer : (section.userContent ?? "");
  const hasContent = Boolean(displayContent.trim());

  return (
    <div
      className={`group rounded-xl border bg-white ${
        section.isVisible ? "border-[var(--border)]" : "border-[var(--neutral-cool-200)]"
      }`}
    >
      <div className={`transition-opacity ${section.isVisible ? "opacity-100" : "opacity-60"}`}>
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onToggleExpand}
            className="flex-1 flex items-center gap-2 text-left min-w-0"
            aria-expanded={section.isExpanded}
          >
            {section.isExpanded ? (
              <ChevronUp className="w-4 h-4 text-[var(--neutral-cool-600)] flex-shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--neutral-cool-600)] flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              {section.isTitleEditing ? (
                <input
                  type="text"
                  value={section.titleBuffer}
                  onChange={(e) => onTitleChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); onTitleSave(); }
                    if (e.key === "Escape") onTitleCancel();
                  }}
                  onBlur={onTitleSave}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  maxLength={200}
                  placeholder="Section name"
                  className="w-full text-base font-semibold text-[var(--foreground)] border-b border-[var(--teal)] bg-transparent outline-none pb-0.5"
                />
              ) : (
                <h2 className="text-base font-semibold text-[var(--foreground)] truncate">
                  {section.title}
                </h2>
              )}
              {!section.isExpanded && !section.isTitleEditing && (
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {hasContent ? "Has content" : "No content yet"}
                </p>
              )}
            </div>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            {canEdit && section.isExpanded && !section.isTitleEditing && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onTitleEditStart(); }}
                title="Rename section"
                className="p-1.5 rounded-xl text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canEdit && section.isExpanded && !section.isTitleEditing && onWriteWithAi && !section.isGenerating && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onWriteWithAi(); }}
                className="hidden sm:inline-flex text-xs font-medium text-[var(--teal)] border border-[var(--teal-tint)] rounded-xl px-3 py-1 hover:bg-[var(--teal)]/5 transition-all whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                Write with AI
              </button>
            )}
            {section.isGenerating && (
              <Loader2 className="w-3.5 h-3.5 text-[var(--teal)] animate-spin" />
            )}
            {canEdit && (
              <button
                type="button"
                onClick={onToggleVisible}
                title={section.isVisible ? "Hide from PDF" : "Show in PDF"}
                aria-label={section.isVisible ? `Hide ${section.title} from PDF` : `Show ${section.title} in PDF`}
                className={`p-1.5 rounded-xl text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors ${
                  section.isVisible
                    ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    : "opacity-100"
                }`}
              >
                {section.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
            )}
            {canEdit && onArchive && (
              <button
                type="button"
                onClick={onArchive}
                title="Archive section"
                className="p-1.5 rounded-xl text-[var(--neutral-cool-600)] hover:text-[var(--foreground)] hover:bg-[var(--neutral-cool-100)] transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={onDelete}
                title="Delete section"
                className="p-1.5 rounded-xl text-[var(--neutral-cool-600)] hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {section.isExpanded && (
        <div className="px-5 pb-5">
          <div className="border-t border-[var(--neutral-cool-150)] pt-4">
            {section.isEditing ? (
              <div>
                <textarea
                  value={section.editBuffer}
                  onChange={(e) => onEditChange(e.target.value)}
                  className="w-full min-h-[160px] text-sm text-[var(--foreground)] border border-[var(--gray-750)] rounded-xl px-3 py-2.5 resize-y focus-visible:outline-none focus:ring-1 focus:ring-[var(--teal)] leading-relaxed"
                  placeholder="Write your custom section content here..."
                  disabled={section.isSaving}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={onEditSave}
                    disabled={section.isSaving}
                    className="px-3 py-1.5 rounded-lg bg-[var(--teal)] text-white text-xs font-medium hover:bg-[var(--teal-850)] transition-colors disabled:opacity-50"
                  >
                    {section.isSaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={onEditCancel}
                    className="px-3 py-1.5 rounded-lg border border-[var(--gray-750)] text-[var(--gray-1150)] text-xs font-medium hover:bg-[var(--neutral-cool-100)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={canEdit ? onEditStart : undefined}
                className={canEdit ? "cursor-text rounded-lg hover:bg-[var(--neutral-cool-50)] -mx-1 px-1 py-0.5 transition-colors" : ""}
                title={canEdit ? "Click to edit" : undefined}
              >
                {hasContent ? (
                  <MarkdownContent content={displayContent} />
                ) : (
                  <span className="text-[var(--dark-grey)] italic text-sm">
                    Click to add content for this section.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
