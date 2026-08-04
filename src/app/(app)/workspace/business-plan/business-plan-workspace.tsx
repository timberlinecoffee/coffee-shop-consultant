  // ── TIM-3927: One-click Auto-Write handlers ────────────────────────
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

  // ── TIM-3950: Regenerate-with-AI (warning + undo) ─────────────────
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
