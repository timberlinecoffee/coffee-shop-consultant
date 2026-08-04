// ── TIM-3490: Flat sortable section list (replaces SectionTree) ─────────────

const CUSTOM_SECTIONS_LABEL = "Custom Sections";

interface BpFlatSectionListProps {
  order: string[];
  sections: SectionState[];
  customSections: CustomSectionState[];
  canEdit: boolean;
  streamingKey: BusinessPlanSectionKey | null;
  onToggleVisibility: (key: BusinessPlanSectionKey, current: boolean) => void;
  onToggleExpand: (key: BusinessPlanSectionKey, current: boolean) => void;
  onEditStart: (key: BusinessPlanSectionKey, content: string) => void;
  onEditChange: (key: BusinessPlanSectionKey, val: string) => void;
  onEditSave: (key: BusinessPlanSectionKey, buf: string) => void;
  onEditCancel: (key: BusinessPlanSectionKey, fallback: string) => void;
  onResetToAuto: (key: BusinessPlanSectionKey) => void;
  onGenerateExec: (key: BusinessPlanSectionKey) => void;
  onImprove: (key: BusinessPlanSectionKey) => void;
  onCustomToggleExpand: (id: string, current: boolean) => void;
  onCustomToggleVisible: (id: string, current: boolean) => void;
  onCustomTitleEditStart: (id: string, title: string) => void;
  onCustomTitleChange: (id: string, val: string) => void;
  onCustomTitleSave: (id: string, buf: string) => void;
  onCustomTitleCancel: (id: string, fallback: string) => void;
  onCustomEditStart: (id: string, content: string) => void;
  onCustomEditChange: (id: string, val: string) => void;
  onCustomEditSave: (id: string, buf: string) => void;
  onCustomEditCancel: (id: string, fallback: string) => void;
  onCustomDelete: (id: string) => void;
  onCustomWriteWithAi: (id: string) => void;
  onArchiveSection: (key: BusinessPlanSectionKey, title: string) => void;
  onArchiveCustomSection: (id: string, title: string) => void;
  onBpFinancialPlanAnalyse?: (key: BusinessPlanSectionKey) => void;
  bpFpAnalyseResult?: AnalyseResponse | null;
  bpFpAnalyseLoading?: boolean;
  bpFpAnalyseError?: string;
  bpFpAnalyseActiveKey?: BusinessPlanSectionKey | null;
  onAutoWriteSection?: (key: BusinessPlanSectionKey) => void;
  onAutoWriteAccept?: (key: BusinessPlanSectionKey) => void;
  onAutoWriteRegenerate?: (key: BusinessPlanSectionKey) => void;
  onAutoWriteEdit?: (key: BusinessPlanSectionKey) => void;
  onAutoWriteCancel?: (key: BusinessPlanSectionKey) => void;
  onRegenerateSection?: (key: BusinessPlanSectionKey) => void;
  bpWriteAiSectionKey?: BusinessPlanSectionKey | null;
}

function BpFlatSectionList(props: BpFlatSectionListProps) {
  const sectionMetaByKey = useMemo(
    () => new Map(BUSINESS_PLAN_SECTIONS.map((m) => [m.key, m])),
    [],
  );
  const groupTitleByKey = useMemo(
    () => new Map(BUSINESS_PLAN_GROUPS.map((g) => [g.key, g.title])),
    [],
  );
  const sectionsByKey = useMemo(
    () => new Map(props.sections.map((s) => [s.key, s])),
    [props.sections],
  );
  const customSectionsById = useMemo(
    () => new Map(props.customSections.map((cs) => [cs.id, cs])),
    [props.customSections],
  );

  function dividerLabelFor(prev: string | null, current: string): string | null {
    const prevMeta = prev != null ? sectionMetaByKey.get(prev as BusinessPlanSectionKey) : undefined;
    const currentIsCustom = customSectionsById.has(current);
    const currentMeta = sectionMetaByKey.get(current as BusinessPlanSectionKey);
    if (currentIsCustom) {
      const prevWasCustom = prev != null && customSectionsById.has(prev);
      return prevWasCustom ? null : CUSTOM_SECTIONS_LABEL;
    }
    if (!currentMeta) return null;
    const currentGroup = currentMeta.groupKey;
    if (currentGroup == null) {
      return null;
    }
    const prevGroup = prevMeta?.groupKey ?? null;
    if (prev == null) return groupTitleByKey.get(currentGroup) ?? null;
    if (prevGroup !== currentGroup) {
      return groupTitleByKey.get(currentGroup) ?? null;
    }
    return null;
  }

  const items: Array<
    | { kind: "divider"; key: string; label: string }
    | { kind: "section"; key: string; section: SectionState }
    | { kind: "custom"; key: string; section: CustomSectionState }
  > = [];
  let prev: string | null = null;
  for (const id of props.order) {
    const standard = sectionsByKey.get(id as BusinessPlanSectionKey);
    const custom = customSectionsById.get(id);
    if (!standard && !custom) continue;
    const label = dividerLabelFor(prev, id);
    if (label) items.push({ kind: "divider", key: `divider-${id}`, label });
    if (standard) items.push({ kind: "section", key: id, section: standard });
    else if (custom) items.push({ kind: "custom", key: id, section: custom });
    prev = id;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        if (item.kind === "divider") {
          return (
            <h2
              key={item.key}
              className="text-base font-semibold text-[var(--foreground)] tracking-tight px-1 pt-3 pb-1 first:pt-0"
            >
              {item.label}
            </h2>
          );
        }
        if (item.kind === "section") {
          const section = item.section;
          const blurb = sectionMetaByKey.get(section.key)?.blurb ?? "";
          const bpExamples = BP_FIELD_EXAMPLES[section.key as BPFieldExampleKey] ?? [];
          const displayContent = section.userContent ?? section.autoContent;
          const hasPlaceholderContent =
            !displayContent ||
            displayContent.includes("workspace to populate") ||
            displayContent.includes("Click Generate") ||
            displayContent.includes("Complete the other") ||
            displayContent.includes("Complete the Marketing") ||
            displayContent.includes("click the text field");
          const hasRealContent = Boolean(displayContent?.trim()) && !hasPlaceholderContent;
          const onWriteWithAi = props.canEdit
            ? () => {
                if (!section.isExpanded) props.onToggleExpand(section.key, section.isExpanded);
                if (hasRealContent) props.onImprove(section.key);
                else props.onGenerateExec(section.key);
              }
            : undefined;
          const onAutoWrite =
            props.canEdit && props.onAutoWriteSection
              ? () => {
                  if (!section.isExpanded) props.onToggleExpand(section.key, section.isExpanded);
                  props.onAutoWriteSection!(section.key);
                }
              : undefined;
          const modalOpenForThisSection = props.bpWriteAiSectionKey === section.key;
          const onRegenerate =
            props.canEdit && props.onRegenerateSection && !modalOpenForThisSection
              ? () => {
                  if (!section.isExpanded) props.onToggleExpand(section.key, section.isExpanded);
                  props.onRegenerateSection!(section.key);
                }
              : undefined;
          const sectionMeta = sectionMetaByKey.get(section.key);
          const isFinancialPlan = sectionMeta?.groupKey === "financial-plan";
          const onAnalyse =
            isFinancialPlan && props.onBpFinancialPlanAnalyse
              ? () => {
                  if (!section.isExpanded) props.onToggleExpand(section.key, section.isExpanded);
                  props.onBpFinancialPlanAnalyse!(section.key);
                }
              : undefined;
          const isActiveAnalyse = props.bpFpAnalyseActiveKey === section.key;
          return (
            <SortableCardRow id={section.key} canEdit={props.canEdit} key={section.key}>
              <SectionCard
                section={section}
                canEdit={props.canEdit}
                bpExamples={bpExamples}
                isStreaming={props.streamingKey === section.key}
                blurb={blurb}
                isLocked={sectionMeta?.isLocked}
                onToggleVisible={() =>
                  props.onToggleVisibility(section.key, section.isVisible)
                }
                onToggleExpand={() =>
                  props.onToggleExpand(section.key, section.isExpanded)
                }
                onEditStart={() =>
                  props.onEditStart(section.key, section.userContent ?? section.autoContent)
                }
                onEditChange={(val) => props.onEditChange(section.key, val)}
                onEditSave={() => props.onEditSave(section.key, section.editBuffer)}
                onEditCancel={() =>
                  props.onEditCancel(section.key, section.userContent ?? section.autoContent)
                }
                onResetToAuto={() => props.onResetToAuto(section.key)}
                onWriteWithAi={onWriteWithAi}
                onAutoWriteSection={onAutoWrite}
                onRegenerateSection={onRegenerate}
                autoWriteState={section.autoWrite ?? null}
                onAutoWriteAccept={
                  props.onAutoWriteAccept
                    ? () => props.onAutoWriteAccept!(section.key)
                    : undefined
                }
                onAutoWriteRegenerate={
                  props.onAutoWriteRegenerate
                    ? () => props.onAutoWriteRegenerate!(section.key)
                    : undefined
                }
                onAutoWriteEdit={
                  props.onAutoWriteEdit
                    ? () => props.onAutoWriteEdit!(section.key)
                    : undefined
                }
                onAutoWriteCancel={
                  props.onAutoWriteCancel
                    ? () => props.onAutoWriteCancel!(section.key)
                    : undefined
                }
                onAnalyse={onAnalyse}
                analyseResult={isActiveAnalyse ? props.bpFpAnalyseResult : null}
                analyseLoading={isActiveAnalyse ? props.bpFpAnalyseLoading : false}
                analyseError={isActiveAnalyse ? props.bpFpAnalyseError : ""}
                onArchive={!sectionMeta?.isLocked ? () => props.onArchiveSection(section.key, section.title) : undefined}
              />
            </SortableCardRow>
          );
        }
        const cs = item.section;
        return (
          <SortableCardRow id={cs.id} canEdit={props.canEdit} key={cs.id}>
            <CustomSectionCard
              section={cs}
              canEdit={props.canEdit}
              onToggleExpand={() => props.onCustomToggleExpand(cs.id, cs.isExpanded)}
              onToggleVisible={() => props.onCustomToggleVisible(cs.id, cs.isVisible)}
              onTitleEditStart={() => props.onCustomTitleEditStart(cs.id, cs.title)}
              onTitleChange={(val) => props.onCustomTitleChange(cs.id, val)}
              onTitleSave={() => props.onCustomTitleSave(cs.id, cs.titleBuffer)}
              onTitleCancel={() => props.onCustomTitleCancel(cs.id, cs.title)}
              onEditStart={() => props.onCustomEditStart(cs.id, cs.userContent ?? "")}
              onEditChange={(val) => props.onCustomEditChange(cs.id, val)}
              onEditSave={() => props.onCustomEditSave(cs.id, cs.editBuffer)}
              onEditCancel={() => props.onCustomEditCancel(cs.id, cs.userContent ?? "")}
              onDelete={() => props.onCustomDelete(cs.id)}
              onWriteWithAi={() => props.onCustomWriteWithAi(cs.id)}
              onArchive={() => props.onArchiveCustomSection(cs.id, cs.title)}
            />
          </SortableCardRow>
        );
      })}
    </div>
  );
}

function SortableCardRow({
  id,
  canEdit,
  children,
}: {
  id: string;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !canEdit });

  const liftStyle = useSortableLift({ transform, transition, isDragging });

  return (
    <div
      ref={setNodeRef}
      style={liftStyle}
      id={`step-${id}`}
      className="group flex items-stretch gap-1.5 sm:gap-2 scroll-mt-24"
    >
      {canEdit && (
        <SortableHandle
          ref={setActivatorNodeRef}
          className="self-start mt-4 sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100 sm:transition-opacity"
          {...attributes}
          {...listeners}
        />
      )}
      <div className="flex-1 min-w-0 group">{children}</div>
    </div>
  );
}

function ResetOrderConfirmationModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
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
      aria-labelledby="bp-reset-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="bp-reset-order-title"
          className="text-lg font-semibold text-[var(--foreground)] mb-2"
        >
          Reset to default order?
        </h3>
        <p className="text-sm text-[var(--neutral-cool-700)] mb-5 leading-relaxed">
          Reset all sections to the default business plan order? Your section
          content is not affected — only the order changes.
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
            onClick={() => void onConfirm()}
            className="text-sm font-medium text-white bg-[var(--teal)] px-4 py-2 rounded-xl hover:bg-[var(--teal-darker,var(--teal))] transition-colors"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function ArchiveConfirmDialog({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
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
      aria-labelledby="bp-archive-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="bp-archive-title" className="text-base font-semibold text-[var(--foreground)]">Archive this section?</h2>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          This won&rsquo;t appear in your exported plan, but you can bring it back from the archived list anytime.
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
            className="text-sm font-medium text-white bg-[var(--foreground)] px-4 py-2 rounded-xl hover:opacity-90 transition-opacity"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}
