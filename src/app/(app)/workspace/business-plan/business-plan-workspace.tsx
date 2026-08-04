  const runValidationThen = useCallback(async (mode: "export" | "print"): Promise<void> => {
    setIsValidating(true);
    try {
      const res = await fetch("/api/business-plan/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ include_pass2: true }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>;
        if (res.status === 402) {
          setGlobalError("Validation requires a paid subscription. Export is paused until you upgrade.");
          return;
        }
        if (res.status === 429) {
          setGlobalError("Validation rate-limited. Please wait a moment and try again.");
          return;
        }
        setGlobalError((j.error as string) ?? "Validation failed. Try again or use Override below.");
        return;
      }
      const report = (await res.json()) as ValidationReport;
      if (report.blocking || report.qualitative_findings.length > 0) {
        setValidationReport(report);
        setPendingExportAction(mode);
        return;
      }
      await performPdfFetch(mode, false);
    } finally {
      setIsValidating(false);
    }
  }, [performPdfFetch]);

  const handlePrintPlan = useCallback(() => {
    setCoverModalAction("print");
  }, []);

  const handleExportPdf = useCallback(() => {
    setCoverModalAction("export");
  }, []);

  const handleCoverModalConfirm = useCallback(async () => {
    const mode = coverModalAction;
    setCoverModalAction(null);
    if (!mode) return;
    if (mode === "print") {
      setIsPrintingPdf(true);
      try { await runValidationThen("print"); } finally { setIsPrintingPdf(false); }
    } else {
      setIsExportingPdf(true);
      try { await runValidationThen("export"); } finally { setIsExportingPdf(false); }
    }
  }, [coverModalAction, runValidationThen]);

  const handleGateContinue = useCallback(async () => {
    const mode = pendingExportAction;
    setValidationReport(null);
    setPendingExportAction(null);
    if (!mode) return;
    if (mode === "print") setIsPrintingPdf(true); else setIsExportingPdf(true);
    try {
      await performPdfFetch(mode, true);
    } finally {
      if (mode === "print") setIsPrintingPdf(false); else setIsExportingPdf(false);
    }
  }, [pendingExportAction, performPdfFetch]);

  const handleGateCancel = useCallback(() => {
    setValidationReport(null);
    setPendingExportAction(null);
  }, []);

  function handleManualSave() {
    if (!canEdit) return;
    if (pendingSaveTimer.current) {
      clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = null;
    }
    sectionsRef.current.forEach((s) => {
      if (s.isEditing && !dirtyBuffersRef.current.has(s.key)) {
        dirtyBuffersRef.current.set(s.key, s.editBuffer || null);
      }
    });
    void persistDirty();
    if (customPendingSaveTimer.current) {
      clearTimeout(customPendingSaveTimer.current);
      customPendingSaveTimer.current = null;
    }
    customSections.forEach((cs) => {
      if (cs.isEditing && !customDirtyBuffersRef.current.has(cs.id)) {
        customDirtyBuffersRef.current.set(cs.id, cs.editBuffer || null);
      }
    });
    void persistCustomDirty();
  }

  const handleSectionPatchedFromGate = useCallback((sectionKey: string, newContent: string) => {
    setSections((prev) =>
      prev.map((s) => (s.key === sectionKey ? { ...s, userContent: newContent, editBuffer: newContent } : s)),
    );
  }, []);

  const runPreflightAudit = useCallback(async (): Promise<AuditReport | null> => {
    try {
      const res = await fetch("/api/business-plan/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { report: AuditReport | null };
      return data.report;
    } catch {
      return null;
    }
  }, []);

  const handlePreflightFixFirst = useCallback((report: AuditReport) => {
    void report;
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("copilot:open-in-mode", {
          detail: { mode: "check", scope: null },
        }),
      );
    }
  }, []);

  const handleApplyBusinessPlanSuggestions = useCallback(async (accepted: ApprovedChange[]) => {
    for (const c of accepted) {
      const sectionKey = c.fieldId as BusinessPlanSectionKey;
      const section = sections.find((s) => s.key === sectionKey);
      if (!section) continue;
      await saveSection(sectionKey, c.finalValue);
    }
  }, [sections, saveSection]);

  const updateCustomSection = useCallback((id: string, patch: Partial<CustomSectionState>) => {
    setCustomSections((prev) => prev.map((cs) => (cs.id === id ? { ...cs, ...patch } : cs)));
  }, []);

  const persistCustomDirty = useCallback(async () => {
    if (!canEdit) return;
    const snapshot = new Map(customDirtyBuffersRef.current);
    customDirtyBuffersRef.current.clear();
    if (snapshot.size === 0) return;
    setSaveState({ kind: "saving" });
    try {
      await Promise.all(
        Array.from(snapshot.entries()).map(async ([id, userContent]) => {
          const res = await fetch(`/api/business-plan/custom-sections/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_content: userContent }),
          });
          if (!res.ok) throw new Error(`custom section save failed (${res.status})`);
          setCustomSections((prev) =>
            prev.map((cs) => (cs.id !== id ? cs : { ...cs, userContent, isSaving: false }))
          );
        })
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch {
      snapshot.forEach((val, id) => {
        if (!customDirtyBuffersRef.current.has(id)) {
          customDirtyBuffersRef.current.set(id, val);
        }
      });
      setSaveState({ kind: "error", message: "Could not save. Try again." });
    }
  }, [canEdit]);

  const scheduleCustomSave = useCallback(
    (id: string, val: string | null) => {
      customDirtyBuffersRef.current.set(id, val);
      setSaveState({ kind: "dirty" });
      if (customPendingSaveTimer.current) clearTimeout(customPendingSaveTimer.current);
      customPendingSaveTimer.current = setTimeout(() => {
        customPendingSaveTimer.current = null;
        void persistCustomDirty();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [persistCustomDirty]
  );

  const handleAddCustomSection = useCallback(async () => {
    if (!canEdit || isAddingCustomSection) return;
    setIsAddingCustomSection(true);
    setCustomSectionError(null);
    try {
      const res = await fetch("/api/business-plan/custom-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Custom Section" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as Record<string, unknown>;
        setCustomSectionError((j.error as string) ?? "Could not add custom section.");
        return;
      }
      const data = await res.json() as { customSection: { id: string; title: string; user_content: string | null; is_visible: boolean; sort_order: number } };
      const cs = data.customSection;
      setCustomSections((prev) => [
        ...prev,
        {
          id: cs.id,
          title: cs.title,
          userContent: cs.user_content,
          isVisible: cs.is_visible,
          sortOrder: cs.sort_order,
          isExpanded: true,
          isEditing: false,
          editBuffer: cs.user_content ?? "",
          isTitleEditing: true,
          titleBuffer: cs.title,
          isSaving: false,
          isArchived: false,
        },
      ]);
    } catch {
      setCustomSectionError("Could not add custom section. Try again.");
    } finally {
      setIsAddingCustomSection(false);
    }
  }, [canEdit, isAddingCustomSection]);

  const handleCustomSectionTitleSave = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim() || "Custom Section";
    updateCustomSection(id, { isTitleEditing: false, title: trimmed, titleBuffer: trimmed });
    await fetch(`/api/business-plan/custom-sections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
  }, [updateCustomSection]);

  const handleDeleteCustomSection = useCallback(async (id: string) => {
    const snapshot = customSections.find((cs) => cs.id === id);
    if (!snapshot || snapshot.isDeleting) return;
    updateCustomSection(id, { isDeleting: true });
    setCustomSectionError(null);
    try {
      const res = await fetch(`/api/business-plan/custom-sections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setCustomSections((prev) => prev.filter((cs) => cs.id !== id));
    } catch {
      updateCustomSection(id, { isDeleting: false });
      setCustomSections((prev) => [...prev, snapshot].sort((a, b) => a.sortOrder - b.sortOrder));
      setCustomSectionError("Could not delete section. Try again.");
    }
  }, [customSections, updateCustomSection]);

  const handleCustomSectionVisibility = useCallback(async (id: string, current: boolean) => {
    const next = !current;
    updateCustomSection(id, { isVisible: next });
    await fetch(`/api/business-plan/custom-sections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_visible: next }),
    });
  }, [updateCustomSection]);

  const handleOpenCustomWriteAiModal = useCallback((id: string) => {
    if (!canEdit) return;
    const cs = customSections.find((c) => c.id === id);
    if (!cs) return;
    if (!cs.isExpanded) updateCustomSection(id, { isExpanded: true });
    const initial = cs.isEditing ? cs.editBuffer : (cs.userContent ?? "");
    setBpWriteAiTarget({
      kind: "custom",
      sectionId: id,
      sectionTitle: cs.title,
      initialContent: initial,
    });
  }, [canEdit, customSections, updateCustomSection]);

  const runBpFinancialPlanAnalyse = useCallback(async (sectionKey: BusinessPlanSectionKey) => {
    if (bpFpAnalyseLoading) return;
    if (bpFpAnalyseActiveKey !== sectionKey) setBpFpAnalyseResult(null);
    setBpFpAnalyseActiveKey(sectionKey);
    setBpFpAnalyseLoading(true);
    setBpFpAnalyseError("");
    try {
      const res = await fetch(`/api/ai/analyse/business-plan-financial-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        if (res.status === 402) {
          setGlobalError("Analyse with AI requires a Pro subscription.");
        } else {
          setBpFpAnalyseError((json.error as string | undefined) ?? "Analysis failed. Please try again.");
        }
        return;
      }
      const json = await res.json();
      setBpFpAnalyseResult(json as AnalyseResponse);
    } catch {
      setBpFpAnalyseError("Network error — please try again.");
    } finally {
      setBpFpAnalyseLoading(false);
    }
  }, [bpFpAnalyseLoading, bpFpAnalyseActiveKey, planId]);
