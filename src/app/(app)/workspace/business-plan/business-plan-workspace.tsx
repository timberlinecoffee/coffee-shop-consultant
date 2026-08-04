  // TIM-3950: Regenerate-with-warning target. When set, RegenerateWarningDialog
  // opens. Null when no warning is pending. The warning is skipped when the
  // section is currently empty — see handleRegenerateClick.
  const [regenerateWarningKey, setRegenerateWarningKey] = useState<BusinessPlanSectionKey | null>(null);
  // TIM-3950 review-fix: Per-section undo toasts, keyed by section key so a
  // second Regenerate on a DIFFERENT section never overwrites the first
  // section's undo affordance. Each entry captures both the pre-regenerate
  // saved userContent AND the in-flight editBuffer (with `wasEditing`) so
  // Undo can restore an unsaved edit that would otherwise be silently lost.
  interface UndoToastEntry {
    previousUserContent: string | null;
    previousEditBuffer: string;
    wasEditing: boolean;
    sectionTitle: string;
  }
  const [undoToasts, setUndoToasts] = useState<Map<BusinessPlanSectionKey, UndoToastEntry>>(
    () => new Map(),
  );
  const undoToastTimersRef = useRef<Map<BusinessPlanSectionKey, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  useEffect(() => {
    const timers = undoToastTimersRef.current;
    return () => {
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
    };
  }, []);

  // TIM-3954: Abort all in-flight regenerate streams on unmount to prevent
  // setSections/setUndoToasts firing on an unmounted component.
  useEffect(() => {
    const refs = autoWriteAbortRefs.current;
    return () => {
      refs.forEach((ctrl) => ctrl.abort());
      refs.clear();
    };
  }, []);

  // ── Section helpers ─────────────────────────────────────────────────────

  const updateSection = useCallback((key: BusinessPlanSectionKey, patch: Partial<SectionState>) => {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }, []);

  const saveSection = useCallback(async (key: BusinessPlanSectionKey, userContent: string | null) => {
    // Remove this section from the pending autosave queue; manual save takes over.
    dirtyBuffersRef.current.delete(key);
    updateSection(key, { isSaving: true });
    setSaveState({ kind: "saving" });
    try {
      await fetch(`/api/business-plan/sections/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_content: userContent }),
      });
      setSections((prev) =>
        prev.map((s) => {
          if (s.key !== key) return s;
          return {
            ...s,
            userContent,
            editBuffer: userContent ?? s.autoContent,
            isEditing: false,
            isSaving: false,
          };
        })
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch {
      updateSection(key, { isSaving: false });
      setSaveState({ kind: "error", message: "Could not save. Try again." });
    }
  }, [updateSection]);

  const toggleVisibility = useCallback(async (key: BusinessPlanSectionKey, current: boolean) => {
    const next = !current;
    updateSection(key, { isVisible: next });
    await fetch(`/api/business-plan/sections/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_visible: next }),
    });
  }, [updateSection]);

  // ── TIM-3575: Archive / restore helpers ──────────────────────────────────

  const archiveSection = useCallback(async (key: BusinessPlanSectionKey) => {
    updateSection(key, { isArchived: true, isExpanded: false });
    setArchiveConfirmTarget(null);
    await fetch(`/api/business-plan/sections/${key}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
  }, [updateSection]);

  const restoreSection = useCallback(async (key: BusinessPlanSectionKey) => {
    updateSection(key, { isArchived: false, isExpanded: true });
    await fetch(`/api/business-plan/sections/${key}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
  }, [updateSection]);

  const archiveCustomSection = useCallback(async (id: string) => {
    setCustomSections((prev) => prev.map((cs) => cs.id !== id ? cs : { ...cs, isArchived: true, isExpanded: false }));
    setArchiveConfirmTarget(null);
    await fetch(`/api/business-plan/custom-sections/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
  }, []);

  const restoreCustomSection = useCallback(async (id: string) => {
    setCustomSections((prev) => prev.map((cs) => cs.id !== id ? cs : { ...cs, isArchived: false, isExpanded: true }));
    await fetch(`/api/business-plan/custom-sections/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
  }, []);

  const addOptionalSection = useCallback(async (sectionKey: BusinessPlanSectionKey) => {
    // Optimistically mark the section as not-archived and add to order.
    updateSection(sectionKey, { isArchived: false, isExpanded: true });
    setSectionOrder((prev) => [...prev, sectionKey]);
    await fetch(`/api/business-plan/sections/${sectionKey}/add-optional`, {
      method: "POST",
    });
  }, [updateSection]);

  // ── TIM-3490: Drag-to-reorder helpers ───────────────────────────────────

  // Effective merged order: standard keys + custom UUIDs in the persisted
  // order, with any missing entries appended at the tail in default order.
  // This is what the AI assemblers and the workspace UI iterate.
  const customIds = useMemo(
    () => customSections.map((cs) => cs.id),
    [customSections],
  );
  // TIM-3575: archived section IDs (standard keys + custom UUIDs) are filtered
  // out of the active order so the workspace only renders non-archived sections.
  const archivedIds = useMemo(
    () => [
      ...sections.filter((s) => s.isArchived).map((s) => s.key as string),
      ...customSections.filter((cs) => cs.isArchived).map((cs) => cs.id),
    ],
    [sections, customSections],
  );
  const effectiveOrder = useMemo(
    () =>
      resolveSectionOrder(
        sectionOrder,
        DEFAULT_BUSINESS_PLAN_SECTION_ORDER,
        customIds,
        archivedIds,
        ALL_BUSINESS_PLAN_SECTION_KEYS,
      ),
    [sectionOrder, customIds, archivedIds],
  );

  // TIM-3490: ordered projection of standard sections for AI prompt
  // assemblers (RegenerateAll + ExportGate). Custom sections are excluded
  // because the regen / export flows operate on the fixed taxonomy only.
  // TIM-3575: include optional keys in the allowlist so Add-to-Plan
  // sections are handed to assemblers instead of silently dropped.
  const orderedSectionsForAi = useMemo(() => {
    const byKey = new Map(sections.map((s) => [s.key, s]));
    const standardKeys = new Set<string>(ALL_BUSINESS_PLAN_SECTION_KEYS);
    const ordered: Array<{ key: BusinessPlanSectionKey; title: string; currentContent: string }> = [];
    for (const id of effectiveOrder) {
      if (!standardKeys.has(id)) continue;
      const s = byKey.get(id as BusinessPlanSectionKey);
      if (!s) continue;
      ordered.push({
        key: s.key,
        title: s.title,
        currentContent: s.userContent ?? s.autoContent,
      });
    }
    return ordered;
  }, [sections, effectiveOrder]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    // DoD: expanded section auto-collapses on drag start. Re-expand is
    // user-initiated post-drop.
    const standardSection = sectionsRef.current.find((s) => s.key === id);
    if (standardSection?.isExpanded) {
      updateSection(id as BusinessPlanSectionKey, { isExpanded: false });
    }
    setCustomSections((prev) =>
      prev.map((cs) => (cs.id === id && cs.isExpanded ? { ...cs, isExpanded: false } : cs)),
    );
  }, [updateSection]);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      if (!overId || activeId === overId) return;

      const fromIdx = effectiveOrder.indexOf(activeId);
      const toIdx = effectiveOrder.indexOf(overId);
      if (fromIdx < 0 || toIdx < 0) return;

      // Optimistic local update. Roll back on PATCH failure.
      const next = arrayMove(effectiveOrder, fromIdx, toIdx);
      const previous = sectionOrder;
      setSectionOrder(next);
      setSaveState({ kind: "saving" });
      try {
        const res = await fetch("/api/business-plan/section-order", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: next }),
        });
        if (!res.ok) throw new Error(`section-order PATCH ${res.status}`);
        setSaveState({ kind: "saved", at: new Date().toISOString() });
      } catch {
        // Revert optimistic update on failure.
        setSectionOrder(previous);
        setSaveState({ kind: "error", message: "Could not save section order. Try again." });
      }
    },
    [effectiveOrder, sectionOrder],
  );

  const handleResetSectionOrder = useCallback(async () => {
    const previous = sectionOrder;
    setSectionOrder([]);
    setShowResetOrderModal(false);
    setSaveState({ kind: "saving" });
    try {
      const res = await fetch("/api/business-plan/section-order", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`section-order DELETE ${res.status}`);
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch {
      setSectionOrder(previous);
      setSaveState({ kind: "error", message: "Could not reset section order. Try again." });
    }
  }, [sectionOrder]);

  // ── Autosave helpers ───────────────────────────────────────────────────────

  const persistDirty = useCallback(async () => {
    if (!canEdit) return;
    const snapshot = new Map(dirtyBuffersRef.current);
    dirtyBuffersRef.current.clear();
    if (snapshot.size === 0) return;
    // Skip sections currently being regenerated to avoid clobbering AI content.
    const currentSections = sectionsRef.current;
    const entries = Array.from(snapshot.entries()).filter(([key]) => {
      const sec = currentSections.find((s) => s.key === key);
      return !sec?.isGenerating;
    });
    if (entries.length === 0) return;
    setSaveState({ kind: "saving" });
    try {
      await Promise.all(
        entries.map(async ([key, userContent]) => {
          const res = await fetch(`/api/business-plan/sections/${key}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_content: userContent }),
          });
          if (!res.ok) throw new Error(`save failed (${res.status})`);
          setSections((prev) =>
            prev.map((s) => (s.key !== key ? s : { ...s, userContent, isSaving: false }))
          );
        })
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch {
      setSaveState({ kind: "error", message: "Could not save. Try again." });
    }
  }, [canEdit]);

  const scheduleSave = useCallback(
    (key: BusinessPlanSectionKey, val: string | null) => {
      dirtyBuffersRef.current.set(key, val);
      setSaveState({ kind: "dirty" });
      if (pendingSaveTimer.current) clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = setTimeout(() => {
        pendingSaveTimer.current = null;
        void persistDirty();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [persistDirty]
  );

  // ── Per-section Write-with-AI (TIM-3675) ──────────────────────────────────
  //
  // TIM-3675 replaces the pre-existing inline stream + AIReviewModal path
  // with a dedicated per-section modal. The modal itself owns the SSE call
  // (see BPWriteWithAIModal.tsx) — parent-side we only need to open it and
  // handle approve. Handlers below.

  const handleOpenWriteAiModal = useCallback((key: BusinessPlanSectionKey) => {
    if (!canEdit) return;
    const section = sections.find((s) => s.key === key);
    if (!section) return;
    // Auto-expand on open so the eventual saved content anchors visually to
    // the section the user acted on (parity with the pre-TIM-3675 behavior).
    if (!section.isExpanded) updateSection(key, { isExpanded: true });
    // Prefer the in-progress edit buffer when the user has been typing, so
    // the modal's pre-populated content matches what's on screen. Fall back
    // to saved user content, then to the auto-assembled draft.
    const raw = section.isEditing
      ? section.editBuffer
      : (section.userContent ?? section.autoContent ?? "");
    // TIM-3675 review-fix: don't pre-populate the modal with the assembled
    // "Complete the Marketing workspace to populate this section" style
    // placeholders; feeding them to /improve would produce a rewrite of the
    // placeholder itself. Empty initial content routes the modal to
    // /generate → workspace-snapshot synthesis, which is the correct path.
    const initial = isBpPlaceholderContent(raw) ? "" : raw;
    setBpWriteAiTarget({
      kind: "standard",
      sectionKey: key,
      sectionTitle: section.title,
      initialContent: initial,
    });
  }, [canEdit, sections, updateSection]);

  // ── TIM-3927: One-click Auto-Write handlers ────────────────────────────────
  //
  // Collapses the TIM-3854 seed-then-generate two-step modal into a single
  // click. The generate/improve routes already fetch workspace data from the
  // DB server-side, so we go straight to SSE — no seed-context prefetch.

  const handleAutoWriteSection = useCallback(async (key: BusinessPlanSectionKey) => {
    if (!canEdit) return;
    // Abort any existing stream for this key before starting fresh.
    autoWriteAbortRefs.current.get(key)?.abort();
    const abort = new AbortController();
    autoWriteAbortRefs.current.set(key, abort);

    // Expand so the inline state card is visible, then enter generating phase.
    setSections((prev) =>
      prev.map((s) =>
        s.key === key
          ? { ...s, isExpanded: true, autoWrite: { phase: "generating", streamingBuf: "" } }
          : s,
      ),
    );

    try {
      const section = sectionsRef.current.find((s) => s.key === key);
      if (!section) return;
      const raw = section.isEditing
        ? section.editBuffer
        : (section.userContent ?? section.autoContent ?? "");
      const useImprove = !isBpPlaceholderContent(raw) && raw.trim().length > 0;
      const url = useImprove ? "/api/business-plan/improve" : "/api/business-plan/generate";
      const body: Record<string, unknown> = useImprove
        ? { sectionKey: key, sectionTitle: section.title, currentContent: raw, shopName }
        : { sectionKey: key };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: abort.signal,
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(
          res.status === 402
            ? "Auto-Write requires a Pro subscription."
            : res.status === 429
              ? "Too many requests — wait a moment and try again."
              : (j.error as string | undefined) ?? "Generation failed. Please try again.",
        );
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let streamingBuf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (abort.signal.aborted) return;
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const chunks = sseBuffer.split("\n\n");
        sseBuffer = chunks.pop() ?? "";
