  const allExpanded = sections.every((s) => s.isExpanded);

  const bpOtherSectionsForContext = useMemo<BpOtherSectionExcerpt[]>(() => {
    if (!bpWriteAiTarget) return [];
    const excerpts: BpOtherSectionExcerpt[] = [];
    const targetKey =
      bpWriteAiTarget.kind === "standard" ? (bpWriteAiTarget.sectionKey as string) : null;
    const targetCustomId =
      bpWriteAiTarget.kind === "custom" ? bpWriteAiTarget.sectionId : null;
    for (const s of sections) {
      if (s.isArchived) continue;
      if (targetKey && s.key === targetKey) continue;
      const raw = (s.userContent && s.userContent.trim().length > 0
        ? s.userContent
        : s.autoContent) ?? "";
      if (!raw.trim().length) continue;
      if (isBpPlaceholderContent(raw)) continue;
      const excerpt = bpSeedExcerpt(raw);
      if (!excerpt) continue;
      excerpts.push({ title: s.title, excerpt });
    }
    for (const cs of customSections) {
      if (cs.isArchived) continue;
      if (targetCustomId && cs.id === targetCustomId) continue;
      const raw = cs.userContent ?? "";
      if (!raw.trim().length) continue;
      if (isBpPlaceholderContent(raw)) continue;
      const excerpt = bpSeedExcerpt(raw);
      if (!excerpt) continue;
      excerpts.push({ title: cs.title, excerpt });
    }
    return excerpts;
  }, [bpWriteAiTarget, sections, customSections]);

  const handleBpWriteAiApprove = useCallback(async (
    finalText: string,
    extras: WriteAiApproveExtras,
  ) => {
    if (!bpWriteAiTarget) return;
    if (bpWriteAiTarget.kind === "standard") {
      const key = bpWriteAiTarget.sectionKey;
      const res = await fetch(`/api/business-plan/sections/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_content: finalText,
          estimated_claims_json: extras.estimatedClaims,
        }),
      });
      if (!res.ok) throw new Error("Couldn't save this change. Please try again.");
      setSections((prev) =>
        prev.map((s) =>
          s.key !== key ? s : { ...s, userContent: finalText, isEditing: false, editBuffer: finalText },
        ),
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    } else {
      const id = bpWriteAiTarget.sectionId;
      const res = await fetch(`/api/business-plan/custom-sections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_content: finalText }),
      });
      if (!res.ok) throw new Error("Could not save. Please try again.");
      setCustomSections((prev) =>
        prev.map((s) =>
          s.id !== id ? s : { ...s, userContent: finalText, editBuffer: finalText, isEditing: false },
        ),
      );
      setSaveState({ kind: "saved", at: new Date().toISOString() });
    }
  }, [bpWriteAiTarget]);

  return (
    <>
    {AIReviewModalNode}
    {ProgressOverlayNode}
    {bpWriteAiTarget && (
      <BPWriteWithAIModal
        sectionKey={bpWriteAiTarget.kind === "standard" ? bpWriteAiTarget.sectionKey : "custom"}
        sectionTitle={bpWriteAiTarget.sectionTitle}
        shopName={shopName}
        initialContent={bpWriteAiTarget.initialContent}
        onClose={() => setBpWriteAiTarget(null)}
        onApprove={handleBpWriteAiApprove}
        otherSectionsForContext={bpOtherSectionsForContext}
      />
    )}
    {regenerateWarningKey && (() => {
      const activeKey = regenerateWarningKey;
      const target = sections.find((s) => s.key === activeKey);
      if (!target) return null;
      // eslint-disable-next-line react-hooks/refs
      const confirm = () => handleRegenerateConfirm(activeKey);
      return (
        <RegenerateWarningDialog
          sectionTitle={target.title}
          onCancel={() => setRegenerateWarningKey(null)}
          onConfirm={confirm}
        />
      );
    })()}
    {undoToasts.size > 0 && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col-reverse items-center gap-2 pointer-events-none">
        {Array.from(undoToasts.entries()).map(([key, entry]) => (
          <div key={key} className="pointer-events-auto">
            <RegenerateUndoToast
              sectionTitle={entry.sectionTitle}
              onUndo={() => void handleUndoRegenerate(key)}
              onDismiss={() => handleDismissUndoToast(key)}
            />
          </div>
        ))}
      </div>
    )}
    {coverModalAction && (
      <CoverConfigModal
        initialSettings={initialCoverSettings}
        logoPublicUrl={logoPublicUrl}
        shopName={shopName}
        authorFullName={authorFullName}
        action={coverModalAction}
        onConfirm={handleCoverModalConfirm}
        onCancel={() => setCoverModalAction(null)}
      />
    )}
    {validationReport && (
      <ExportGateModal
        report={validationReport}
        shopName={shopName}
        sections={orderedSectionsForAi}
        onSectionPatched={handleSectionPatchedFromGate}
        onCancel={handleGateCancel}
        onContinue={handleGateContinue}
      />
    )}
    <div className="bg-[var(--background)] min-h-screen">
      <div className="w-full px-4 sm:px-6 pt-8 pb-20">
        <WorkspaceHeader
          Icon={FileText}
          title="Business Plan"
          description="Your complete business plan, assembled from every workspace. Edit each section in place or improve it with AI."
          scout={
            <AskScoutButton
              workspaceKey="business_plan"
              focusLabel="business plan"
              hasContent={hasContent}
            />
          }
          primaryAction={
            nextUnreviewed ? (
              <WorkspaceNextStepButton
                step={nextUnreviewed}
                onGo={(key) => {
                  setSections((prev) =>
                    prev.map((s) =>
                      s.key === key ? { ...s, isExpanded: true } : s,
                    ),
                  );
                  requestAnimationFrame(() => scrollToStep(key));
                }}
              />
            ) : undefined
          }
          overflow={
            <WorkspaceActionMenu hideAdvisor>
              {({ closeMenu }) => (
                <>
                  <WorkspaceActionMenuItem
                    Icon={allExpanded ? ChevronUp : ChevronDown}
                    label={allExpanded ? "Collapse all sections" : "Expand all sections"}
                    onClick={() => {
                      closeMenu();
                      setSections((prev) =>
                        prev.map((s) => ({ ...s, isExpanded: !allExpanded })),
                      );
                    }}
                  />
                  <WorkspaceActionMenuItem
                    Icon={Download}
                    label={isExportingPdf || isValidating ? "Checking..." : "Export PDF"}
                    disabled={isExportingPdf || isValidating || !canEdit}
                    onClick={() => {
                      closeMenu();
                      handleExportPdf();
                    }}
                  />
                  <WorkspaceActionMenuItem
                    Icon={FileText}
                    label={isPrintingPdf || isValidating ? "Checking..." : "Print Business Plan"}
                    disabled={isPrintingPdf || isValidating || !canEdit}
                    onClick={() => {
                      closeMenu();
                      handlePrintPlan();
                    }}
                  />
                  <RegenerateAllButton
                    renderAs="menuitem"
                    closeMenu={closeMenu}
                    disabled={!canEdit || streamingKey !== null}
                    getCurrentSections={() => orderedSectionsForAi}
                    openAIReviewModal={openAIReviewModal}
                    openProgressOverlay={openProgressOverlay}
                    updateProgressOverlay={updateProgressOverlay}
                    closeProgressOverlay={closeProgressOverlay}
                    onSectionApplied={(key, finalValue) => {
                      setSections((prev) =>
                        prev.map((s) =>
                          s.key === key ? { ...s, userContent: finalValue } : s,
                        ),
                      );
                    }}
                    onError={(msg) => setGlobalError(msg)}
                    runPreflightAudit={runPreflightAudit}
                    onFixFirst={handlePreflightFixFirst}
                  />
                </>
              )}
            </WorkspaceActionMenu>
          }
          save={
            <SaveStatusAndButton
              saving={saveState.kind === "saving"}
              savedAt={saveState.kind === "saved" ? saveState.at : saveState.kind === "idle" ? saveState.lastSavedAt : null}
              unsaved={saveState.kind === "dirty"}
              error={saveState.kind === "error" ? saveState.message : null}
              canEdit={canEdit}
              onSave={handleManualSave}
            />
          }
          progress={{
            kind: "sections",
            done: reviewedCount,
            total: sections.length,
          }}
        />

        <PreGenerateChecklist items={preGenerateChecklist} />

        {globalError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {globalError}
            <button onClick={() => setGlobalError(null)} className="ml-3 underline text-xs">
              Dismiss
            </button>
          </div>
        )}

        <DndContext
          sensors={dndSensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={effectiveOrder} strategy={verticalListSortingStrategy}>
            <BpFlatSectionList
              order={effectiveOrder}
              sections={sections}
              customSections={customSections}
              canEdit={canEdit}
              streamingKey={streamingKey}
              onToggleVisibility={(key, current) => toggleVisibility(key, current)}
              onToggleExpand={(key, current) => updateSection(key, { isExpanded: !current })}
              onEditStart={(key, content) =>
                updateSection(key, { isEditing: true, editBuffer: content })
              }
              onEditChange={(key, val) => {
                updateSection(key, { editBuffer: val });
                scheduleSave(key, val || null);
              }}
              onEditSave={(key, buf) => saveSection(key, buf || null)}
              onEditCancel={(key, fallback) =>
                updateSection(key, { isEditing: false, editBuffer: fallback })
              }
              onResetToAuto={(key) => saveSection(key, null)}
              onGenerateExec={handleOpenWriteAiModal}
              onImprove={handleOpenWriteAiModal}
              onCustomToggleExpand={(id, current) =>
                updateCustomSection(id, { isExpanded: !current })
              }
              onCustomToggleVisible={(id, current) =>
                handleCustomSectionVisibility(id, current)
              }
              onCustomTitleEditStart={(id, title) =>
                updateCustomSection(id, { isTitleEditing: true, titleBuffer: title })
              }
              onCustomTitleChange={(id, val) =>
                updateCustomSection(id, { titleBuffer: val })
              }
              onCustomTitleSave={(id, buf) => handleCustomSectionTitleSave(id, buf)}
              onCustomTitleCancel={(id, fallback) =>
                updateCustomSection(id, { isTitleEditing: false, titleBuffer: fallback })
              }
              onCustomEditStart={(id, content) =>
                updateCustomSection(id, { isEditing: true, editBuffer: content })
              }
              onCustomEditChange={(id, val) => {
                updateCustomSection(id, { editBuffer: val });
                scheduleCustomSave(id, val || null);
              }}
              onCustomEditSave={(id, buf) => {
                customDirtyBuffersRef.current.delete(id);
                updateCustomSection(id, { isSaving: true });
                void fetch(`/api/business-plan/custom-sections/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ user_content: buf || null }),
                })
                  .then(() => {
                    setCustomSections((prev) =>
                      prev.map((s) =>
                        s.id !== id
                          ? s
                          : { ...s, userContent: buf || null, isEditing: false, isSaving: false },
                      ),
                    );
                    setSaveState({ kind: "saved", at: new Date().toISOString() });
                  })
                  .catch(() => {
                    updateCustomSection(id, { isSaving: false });
                    setSaveState({ kind: "error", message: "Could not save. Try again." });
                  });
              }}
              onCustomEditCancel={(id, fallback) => {
                customDirtyBuffersRef.current.delete(id);
                updateCustomSection(id, { isEditing: false, editBuffer: fallback });
              }}
              onCustomDelete={(id) => handleDeleteCustomSection(id)}
              onCustomWriteWithAi={handleOpenCustomWriteAiModal}
              onArchiveSection={(key, title) => setArchiveConfirmTarget({ type: "standard", key, title })}
              onArchiveCustomSection={(id, title) => setArchiveConfirmTarget({ type: "custom", id, title })}
              onBpFinancialPlanAnalyse={runBpFinancialPlanAnalyse}
              bpFpAnalyseResult={bpFpAnalyseResult}
              bpFpAnalyseLoading={bpFpAnalyseLoading}
              bpFpAnalyseError={bpFpAnalyseError}
              bpFpAnalyseActiveKey={bpFpAnalyseActiveKey}
              onAutoWriteSection={canEdit ? handleAutoWriteSection : undefined}
              onAutoWriteAccept={handleAutoWriteAccept}
              onAutoWriteRegenerate={handleAutoWriteRegenerate}
              onAutoWriteEdit={handleAutoWriteEdit}
              onAutoWriteCancel={handleAutoWriteCancel}
              onRegenerateSection={canEdit ? handleRegenerateClick : undefined}
              bpWriteAiSectionKey={bpWriteAiTarget?.kind === "standard" ? bpWriteAiTarget.sectionKey : null}
            />
          </SortableContext>
        </DndContext>

        {canEdit && (
          <div className="mt-6">
            {customSectionError && (
              <div className="mb-3 px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                {customSectionError}
                <button onClick={() => setCustomSectionError(null)} className="ml-3 underline text-xs">
                  Dismiss
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={handleAddCustomSection}
              disabled={isAddingCustomSection}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[var(--neutral-cool-400)] text-sm font-medium text-[var(--neutral-cool-600)] hover:border-[var(--teal)] hover:text-[var(--teal)] hover:bg-[var(--teal)]/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAddingCustomSection ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add Custom Section
            </button>
          </div>
        )}

        {canEdit && sectionOrder.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowResetOrderModal(true)}
              className="text-xs text-[var(--neutral-cool-600)] hover:text-[var(--teal)] underline underline-offset-2 transition-colors"
            >
              Reset to default order
            </button>
          </div>
        )}

        {showResetOrderModal && (
          <ResetOrderConfirmationModal
            onCancel={() => setShowResetOrderModal(false)}
            onConfirm={handleResetSectionOrder}
          />
        )}

        <FinancialDocumentsPanel initialDocuments={initialFinancialDocuments} />

        <ArchivePanel
          sections={sections}
          customSections={customSections}
          sectionOrder={sectionOrder}
          isOpen={archivePanelOpen}
          onToggle={() => setArchivePanelOpen((v) => !v)}
          canEdit={canEdit}
          onRestoreSection={(key) => void restoreSection(key)}
          onRestoreCustomSection={(id) => void restoreCustomSection(id)}
          onAddOptional={(key) => void addOptionalSection(key)}
        />

        {archiveConfirmTarget && (
          <ArchiveConfirmDialog
            title={archiveConfirmTarget.title}
            onCancel={() => setArchiveConfirmTarget(null)}
            onConfirm={() => {
              if (archiveConfirmTarget.type === "standard") {
                void archiveSection(archiveConfirmTarget.key);
              } else {
                void archiveCustomSection(archiveConfirmTarget.id);
              }
            }}
          />
        )}
      </div>
    </div>
    </>
  );
}
