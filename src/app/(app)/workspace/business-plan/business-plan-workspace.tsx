        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let eventType = "";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) dataLine = line.slice(6).trim();
          }
          if (!dataLine) continue;
          if (eventType === "text") {
            const parsed = JSON.parse(dataLine) as { text: string };
            streamingBuf += parsed.text;
            const snap = streamingBuf;
            setSections((prev) =>
              prev.map((s) =>
                s.key === key ? { ...s, autoWrite: { phase: "generating", streamingBuf: snap } } : s,
              ),
            );
          } else if (eventType === "done") {
            const parsed = JSON.parse(dataLine) as {
              text: string;
              estimated_claims?: unknown[];
              consistency_contradictions?: unknown[];
            };
            const finalText = parsed.text || streamingBuf;
            setSections((prev) =>
              prev.map((s) =>
                s.key === key
                  ? {
                      ...s,
                      autoWrite: {
                        phase: "preview",
                        proposedText: finalText,
                        estimatedClaims: Array.isArray(parsed.estimated_claims)
                          ? parsed.estimated_claims
                          : [],
                        contradictions: sanitizeAutoWriteContradictions(
                          parsed.consistency_contradictions,
                        ),
                      },
                    }
                  : s,
              ),
            );
            reader.releaseLock();
            return;
          } else if (eventType === "error") {
            const parsed = JSON.parse(dataLine) as { message?: string };
            throw new Error(parsed.message ?? "Generation failed. Please try again.");
          }
        }
      }
    } catch (err: unknown) {
      if (abort.signal.aborted) return;
      console.error("[auto-write]", err);
      updateSection(key, { autoWrite: null });
      setGlobalError(
        err instanceof Error ? err.message : "Could not generate this section. Try again.",
      );
    }
  }, [canEdit, updateSection, shopName]);

  const handleAutoWriteAccept = useCallback(async (key: BusinessPlanSectionKey) => {
    const section = sectionsRef.current.find((s) => s.key === key);
    if (!section?.autoWrite || section.autoWrite.phase === "generating") return;
    const { proposedText, estimatedClaims, contradictions } = section.autoWrite;
    updateSection(key, {
      autoWrite: { phase: "committing", proposedText, estimatedClaims, contradictions },
    });
    try {
      const res = await fetch(`/api/business-plan/sections/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_content: proposedText,
          estimated_claims_json: estimatedClaims,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(
          res.status === 402
            ? "Saving requires a Pro subscription."
            : res.status === 429
              ? "Too many requests — wait a moment and try again."
              : (j.error as string | undefined) ?? "Couldn't save this section. Please try again.",
        );
      }
      setSections((prev) =>
        prev.map((s) =>
          s.key !== key
            ? s
            : { ...s, userContent: proposedText, editBuffer: proposedText, isEditing: false, autoWrite: null },
        ),
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch (err: unknown) {
      // Revert to preview on failure.
      updateSection(key, {
        autoWrite: { phase: "preview", proposedText, estimatedClaims, contradictions },
      });
      setGlobalError(
        err instanceof Error ? err.message : "Could not save. Try again.",
      );
    }
  }, [updateSection]);

  const handleAutoWriteRegenerate = useCallback((key: BusinessPlanSectionKey) => {
    void handleAutoWriteSection(key);
  }, [handleAutoWriteSection]);

  const handleAutoWriteEdit = useCallback((key: BusinessPlanSectionKey) => {
    const section = sectionsRef.current.find((s) => s.key === key);
    if (!section?.autoWrite || section.autoWrite.phase === "generating") return;
    const { proposedText } = section.autoWrite;
    updateSection(key, { autoWrite: null, isEditing: true, editBuffer: proposedText });
  }, [updateSection]);

  const handleAutoWriteCancel = useCallback((key: BusinessPlanSectionKey) => {
    autoWriteAbortRefs.current.get(key)?.abort();
    updateSection(key, { autoWrite: null });
  }, [updateSection]);

  // ── TIM-3950: Regenerate-with-AI (warning + undo) ─────────────────────────
  //
  // Two-button split flow — the destructive "Regenerate with AI" path. On
  // click:
  //   1. If the section has real content, open a confirmation dialog first.
  //   2. On confirm (or immediately if the section is empty), stream a fresh
  //      generation from workspace data (same route as TIM-3927 Auto-Write).
  //   3. On done, snapshot the pre-regenerate content, PATCH the new content,
  //      and surface an Undo toast for 15s.
  //   4. Undo restores the snapshot in a single PATCH.
  //
  // The intermediate "Accept preview" step from TIM-3927 is intentionally
  // omitted here — the board directive (TIM-3949) makes Regenerate a fast,
  // one-click flow protected by warn-before + undo-after. The gated iterative
  // path lives in Write-with-AI (BPWriteWithAIModal).

  const clearUndoToastFor = useCallback((key: BusinessPlanSectionKey) => {
    const t = undoToastTimersRef.current.get(key);
    if (t) {
      clearTimeout(t);
      undoToastTimersRef.current.delete(key);
    }
    setUndoToasts((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const scheduleUndoToastClearFor = useCallback((key: BusinessPlanSectionKey) => {
    const existing = undoToastTimersRef.current.get(key);
    if (existing) clearTimeout(existing);
    const id = setTimeout(() => {
      undoToastTimersRef.current.delete(key);
      setUndoToasts((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }, 15_000);
    undoToastTimersRef.current.set(key, id);
  }, []);

  // TIM-3950 review-fix: `estimatedClaims === undefined` means "leave the DB
  // column unchanged"; passing an array (including `[]`) overwrites it. Undo
  // passes `[]` to explicitly clear the claims that the discarded regenerate
  // wrote, otherwise the reverted content would be paired with stale claims
  // (TIM-2342 export-gate would then surface phantom items).
  const patchSectionContent = useCallback(async (
    key: BusinessPlanSectionKey,
    userContent: string | null,
    estimatedClaims: unknown[] | undefined,
  ) => {
    const body: Record<string, unknown> = { user_content: userContent };
    if (estimatedClaims !== undefined) body.estimated_claims_json = estimatedClaims;
    const res = await fetch(`/api/business-plan/sections/${key}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        res.status === 402
          ? "Saving requires a Pro subscription."
          : res.status === 429
            ? "Too many requests. Wait a moment and try again."
            : (j.error as string | undefined) ?? "Couldn't save this section. Please try again.",
      );
    }
  }, []);

  const runRegenerateSectionStream = useCallback(async (key: BusinessPlanSectionKey) => {
    if (!canEdit) return;
    autoWriteAbortRefs.current.get(key)?.abort();
    const abort = new AbortController();
    autoWriteAbortRefs.current.set(key, abort);

    // Snapshot BEFORE overwriting so Undo can restore even if the section
    // state advances during the SSE stream. TIM-3950 review-fix: capture the
    // in-flight editBuffer and isEditing too, otherwise a mid-edit user's
    // unsaved edits (which handleRegenerateClick's warning check DID read)
    // become unrecoverable — Undo would restore the last SAVED value only.
    const preSection = sectionsRef.current.find((s) => s.key === key);
    if (!preSection) return;
    const previousUserContent = preSection.userContent;
    const previousEditBuffer = preSection.editBuffer;
    const wasEditing = preSection.isEditing;
    const previousTitle = preSection.title;

    setSections((prev) =>
      prev.map((s) =>
        s.key === key
          ? { ...s, isExpanded: true, autoWrite: { phase: "generating", streamingBuf: "" } }
          : s,
      ),
    );

    try {
      const res = await fetch("/api/business-plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionKey: key }),
        signal: abort.signal,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(
          res.status === 402
            ? "Regenerate requires a Pro subscription."
            : res.status === 429
              ? "Too many requests. Wait a moment and try again."
              : (j.error as string | undefined) ?? "Regeneration failed. Please try again.",
        );
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let streamingBuf = "";
      let finalText = "";
      let finalClaims: unknown[] = [];
      let doneReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (abort.signal.aborted) return;
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const chunks = sseBuffer.split("\n\n");
        sseBuffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let eventType = "";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) dataLine = line.slice(6).trim();
          }
          if (!dataLine) continue;
          if (eventType === "text") {
            const parsed = JSON.parse(dataLine) as { text: string };
            streamingBuf += parsed.text;
            const snap = streamingBuf;
            setSections((prev) =>
              prev.map((s) =>
                s.key === key ? { ...s, autoWrite: { phase: "generating", streamingBuf: snap } } : s,
              ),
            );
          } else if (eventType === "done") {
            const parsed = JSON.parse(dataLine) as {
              text: string;
              estimated_claims?: unknown[];
            };
            finalText = parsed.text || streamingBuf;
            finalClaims = Array.isArray(parsed.estimated_claims) ? parsed.estimated_claims : [];
            reader.releaseLock();
            doneReceived = true;
            break;
          } else if (eventType === "error") {
            const parsed = JSON.parse(dataLine) as { message?: string };
            throw new Error(parsed.message ?? "Regeneration failed. Please try again.");
          }
        }
        if (doneReceived) break;
      }

      if (!finalText) throw new Error("Regeneration ended without a draft. Please try again.");

      // Commit + swap the section content in a single beat, then surface the
      // undo toast. If the PATCH fails, restore the draft to preview so the
      // user can retry without burning another AI credit.
      try {
        await patchSectionContent(key, finalText, finalClaims);
      } catch (patchErr: unknown) {
        if (abort.signal.aborted) return;
        console.error("[regenerate/patch]", patchErr);
        setSections((prev) =>
          prev.map((s) =>
            s.key !== key
              ? s
              : {
                  ...s,
                  autoWrite: {
                    phase: "preview",
                    proposedText: finalText,
                    estimatedClaims: finalClaims,
                    contradictions: [],
                  },
                },
          ),
        );
        setGlobalError(
          patchErr instanceof Error ? patchErr.message : "Could not save. Accept the preview to retry.",
        );
        return;
      }
      setSections((prev) =>
        prev.map((s) =>
          s.key !== key
            ? s
            : { ...s, userContent: finalText, editBuffer: finalText, isEditing: false, autoWrite: null },
        ),
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
      // Replace any prior undo entry for THIS section only. A pending undo on
      // a different section is unaffected (per-key timer and map entry).
      setUndoToasts((prev) => {
        const next = new Map(prev);
        next.set(key, {
          previousUserContent,
          previousEditBuffer,
          wasEditing,
          sectionTitle: previousTitle,
        });
        return next;
      });
      scheduleUndoToastClearFor(key);
    } catch (err: unknown) {
      if (abort.signal.aborted) return;
      console.error("[regenerate]", err);
      updateSection(key, { autoWrite: null });
      setGlobalError(
        err instanceof Error ? err.message : "Could not regenerate this section. Try again.",
      );
    }
  }, [canEdit, patchSectionContent, scheduleUndoToastClearFor, updateSection]);

  const handleRegenerateClick = useCallback((key: BusinessPlanSectionKey) => {
    if (!canEdit) return;
    const section = sectionsRef.current.find((s) => s.key === key);
    if (!section) return;
    const raw = section.isEditing
      ? section.editBuffer
      : (section.userContent ?? "");
    // Skip the warning when there's nothing to lose. Guard on userContent only
    // (not autoContent): a section the founder has never typed into has no
    // user work to protect, so falling back to autoContent would trigger a
    // false warning on workspace-generated narratives.
    const looksEmpty = raw.trim().length === 0 || isBpPlaceholderContent(raw);
    if (looksEmpty) {
      void runRegenerateSectionStream(key);
      return;
    }
    setRegenerateWarningKey(key);
  }, [canEdit, runRegenerateSectionStream]);

  const handleRegenerateConfirm = useCallback((key: BusinessPlanSectionKey) => {
    setRegenerateWarningKey(null);
    void runRegenerateSectionStream(key);
  }, [runRegenerateSectionStream]);

  const handleUndoRegenerate = useCallback(async (key: BusinessPlanSectionKey) => {
    const entry = undoToasts.get(key);
    if (!entry) return;
    // Clear this section's toast + timer optimistically so a rapid Undo
    // re-click can't double-fire the PATCH. Other sections' entries stay.
    clearUndoToastFor(key);
    try {
      // TIM-3950 review-fix: pass `[]` to clear estimated_claims_json — the
      // discarded regenerate's claims are stale against the reverted content.
      await patchSectionContent(key, entry.previousUserContent, []);
      setSections((prev) =>
        prev.map((s) =>
          s.key !== key
            ? s
            : {
                ...s,
                userContent: entry.previousUserContent,
                // Restore the exact editBuffer + isEditing state the user
                // was in at Regenerate-click time (protects unsaved edits).
                editBuffer: entry.wasEditing
                  ? entry.previousEditBuffer
                  : (entry.previousUserContent ?? s.autoContent ?? ""),
                isEditing: entry.wasEditing,
              },
        ),
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } catch (err: unknown) {
      // Restore the toast so the user can try again — the snapshot is still
      // recoverable client-side.
      setUndoToasts((prev) => {
        const next = new Map(prev);
        next.set(key, entry);
        return next;
      });
      scheduleUndoToastClearFor(key);
      setGlobalError(
        err instanceof Error ? err.message : "Undo failed. Try again.",
      );
    }
  }, [clearUndoToastFor, patchSectionContent, scheduleUndoToastClearFor, undoToasts]);

  const handleDismissUndoToast = useCallback((key: BusinessPlanSectionKey) => {
    clearUndoToastFor(key);
  }, [clearUndoToastFor]);

  // ── PDF export / print ──────────────────────────────────────────────────────

  // TIM-1551: Both Print and Export drive through the same React-PDF renderer.
  // TIM-2336: Both now run through the validation gate first. The gate runs
  // Pass 1 (programmatic reconciliation) + Pass 2 (LLM critical-reader) before
  // we hit the PDF route, and surfaces a modal when blocking numerical
  // contradictions exist. Once the user resolves each (Apply / Override) we
  // re-fire the export with ?force=1 — the server-side gate stays as a
  // defense in depth, but the user's explicit confirmation suppresses it.
  const performPdfFetch = useCallback(async (mode: "export" | "print", force: boolean): Promise<void> => {
    const url = force ? "/api/pdf/business_plan_full?force=1" : "/api/pdf/business_plan_full";
    const res = await fetch(url);
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as Record<string, unknown>;
      if (res.status === 402) {
        setGlobalError("PDF export requires a paid subscription.");
      } else if (res.status === 422 && j.error === "validation_blocked") {
        // Server-side gate fired (force=false). Surface the modal with the
        // report — the validate endpoint typically runs first client-side
        // and supersedes this, but keep the fallback intact.
        setValidationReport(j.report as ValidationReport);
        setPendingExportAction(mode);
      } else {
        setGlobalError((j.error as string) ?? "PDF generation failed");
      }
      return;
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    if (mode === "print") {
      window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } else {
      const a = document.createElement("a");
      a.href = blobUrl;
      const slug = shopName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "business-plan";
      a.download = `${slug}-business-plan.pdf`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    }
  }, [shopName]);

  const runValidationThen = useCallback(async (mode: "export" | "print"): Promise<void> => {
    setIsValidating(true);
    try {
      const res = await fetch("/api/business-plan/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ include_pass2: true }),
      });
      if (!res.ok) {
        // Validation itself failing should not block export — fall back to
        // the server-side gate in /api/pdf/business_plan_full which will
        // re-run Pass 1 cheaply. Surface the error to the user.
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
        // Show the modal even for advisory-only (qualitative) findings so the
        // user sees the critical-reader notes before exporting.
        setValidationReport(report);
        setPendingExportAction(mode);
        return;
      }
      await performPdfFetch(mode, false);
    } finally {
      setIsValidating(false);
    }
  }, [performPdfFetch]);

  // TIM-3576: open cover config modal before running validation + export/print.
  const handlePrintPlan = useCallback(() => {
    setCoverModalAction("print");
  }, []);

  const handleExportPdf = useCallback(() => {
    setCoverModalAction("export");
  }, []);

  // Called when user clicks "Continue" in cover config modal.
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
    // Include any section currently open in edit mode.
    sectionsRef.current.forEach((s) => {
      if (s.isEditing && !dirtyBuffersRef.current.has(s.key)) {
        dirtyBuffersRef.current.set(s.key, s.editBuffer || null);
      }
    });
    void persistDirty();
    // Flush custom section dirty buffers too.
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

  // TIM-2416 — Plan Quality Check was removed from the BP workspace surface.
  // Apply / Go-to-source / standalone "Check Plan" all live inside the AI
  // companion now (Check mode). What remains here: the pre-flight gate that
  // runs Check on source suites before regen and offers Fix-first / Generate-
  // anyway. Fix-first opens the companion in Check mode (no in-page tab).

  // TIM-2394: pre-flight handler invoked by RegenerateAllButton before any
  // estimate is fetched. Hits the same /api/business-plan/audit endpoint
  // QualityCheckPanel uses, so a recent run is served from cache.
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

  // TIM-2416 — when the user accepts the pre-flight gate's "Fix first"
  // recommendation, open the AI companion in Check mode. The companion's
  // Check engine calls the same /api/business-plan/audit cache, so it returns
  // the same finding set instantly. `report` arg is intentionally unused —
  // the companion drives its own fetch so the cards round-trip through the
  // companion's Apply path (the canonical Apply path going forward).
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

  // TIM-2382: apply Scout suggest_workspace_changes proposals for business plan.
  // fieldId = BusinessPlanSectionKey; finalValue = proposed section text.
  const handleApplyBusinessPlanSuggestions = useCallback(async (accepted: ApprovedChange[]) => {
    for (const c of accepted) {
      const sectionKey = c.fieldId as BusinessPlanSectionKey;
      const section = sections.find((s) => s.key === sectionKey);
      if (!section) continue;
      await saveSection(sectionKey, c.finalValue);
    }
  }, [sections, saveSection]);

  // ── TIM-3111: Custom section handlers ───────────────────────────────────

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
      // Re-queue failed entries so the next manual save or debounce can retry them.
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

  // TIM-3490: handleCustomSectionReorder removed — custom-section sort_order
  // PATCHes are replaced by the unified per-plan section_order on
  // coffee_shop_plans (drag-to-reorder via the shared sortable canon).

  // TIM-3675: open the Write-with-AI modal for a custom section. Same shape
  // as handleOpenWriteAiModal for standard sections, but the modal wires
  // approve to the custom-sections PATCH endpoint.
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

  // TIM-3893: Analyse-with-AI handler for Financial Plan sections.
  const runBpFinancialPlanAnalyse = useCallback(async (sectionKey: BusinessPlanSectionKey) => {
    if (bpFpAnalyseLoading) return;
    // Clear stale result only when switching to a different section; preserve it
    // when regenerating the same section so InlineAnalysisCard can show a spinner.
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
