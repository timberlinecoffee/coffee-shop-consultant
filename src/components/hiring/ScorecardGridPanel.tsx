"use client";

// TIM-3370: Interview scorecard grid — candidates × competencies, 1–5 + multipliers.
// Rows = candidates, Columns = competencies. Inline editing, autosave, print mode.

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus,
  Trash2,
  Printer,
  Info,
  X,
  Check,
} from "lucide-react";
import type {
  ScorecardCompetency,
  ScorecardGridCandidate,
  ScorecardCellScore,
  InterviewQuestion,
} from "@/lib/hiring";

// ── helpers ───────────────────────────────────────────────────────────────────

function localId() {
  return `local_${Math.random().toString(36).slice(2, 10)}`;
}

function cellKey(candidateId: string, competencyId: string) {
  return `${candidateId}:${competencyId}`;
}

function weightedTotal(
  candidateId: string,
  competencies: ScorecardCompetency[],
  scores: Record<string, ScorecardCellScore>
): number {
  return competencies.reduce((sum, c) => {
    const cell = scores[cellKey(candidateId, c.id)];
    if (!cell?.score) return sum;
    return sum + cell.score * Number(c.multiplier);
  }, 0);
}

function maxPossible(competencies: ScorecardCompetency[]): number {
  return competencies.reduce((sum, c) => sum + 5 * Number(c.multiplier), 0);
}

// ── ScoreInput ────────────────────────────────────────────────────────────────
// Segmented 1–5 control + notes popover trigger.

function ScoreInput({
  score,
  notes,
  canEdit,
  isPrint,
  onScore,
  onNotes,
}: {
  score: number | null;
  notes: string | null;
  canEdit: boolean;
  isPrint: boolean;
  onScore: (v: number | null) => void;
  onNotes: (v: string) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftNotes(notes ?? "");
  }, [notes]);

  useEffect(() => {
    if (!notesOpen) return;
    function close(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onNotes(draftNotes);
        setNotesOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [notesOpen, draftNotes, onNotes]);

  if (isPrint) {
    return (
      <div className="flex items-center gap-0.5 justify-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            className={`w-5 h-5 rounded-full border ${
              score !== null && n <= score
                ? "border-[var(--teal)] bg-[var(--teal)]"
                : "border-[var(--border-medium)]"
            }`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 relative">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={!canEdit}
            onClick={() => onScore(score === n ? null : n)}
            className={`w-6 h-6 rounded text-[11px] font-semibold transition-colors
              ${score !== null && n <= score
                ? "bg-[var(--teal)] text-white"
                : "bg-[var(--neutral-cool-100)] text-[var(--muted-foreground)] hover:bg-[var(--teal-bg-50)]"
              }
              disabled:cursor-default disabled:opacity-60`}
          >
            {n}
          </button>
        ))}
        {canEdit && (
          <button
            type="button"
            title={notes ? "Notes" : "Add notes"}
            onClick={() => setNotesOpen(true)}
            className={`ml-0.5 w-5 h-5 rounded text-[10px] flex items-center justify-center
              ${notes ? "text-[var(--teal)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
          >
            <Info size={10} />
          </button>
        )}
      </div>

      {notesOpen && (
        <div
          ref={popoverRef}
          className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-white border border-[var(--border)] rounded-xl shadow-lg p-3 w-56"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-[var(--foreground)]">Notes</span>
            <button
              type="button"
              onClick={() => { onNotes(draftNotes); setNotesOpen(false); }}
              className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X size={11} />
            </button>
          </div>
          <textarea
            autoFocus
            className="w-full text-xs border border-[var(--border-medium)] rounded px-2 py-1.5 resize-none focus-visible:outline-none focus:border-[var(--teal)] text-[var(--foreground)]"
            rows={3}
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            placeholder="Add notes for this score…"
          />
          <button
            type="button"
            onClick={() => { onNotes(draftNotes); setNotesOpen(false); }}
            className="mt-2 w-full text-xs font-semibold text-[var(--teal)] hover:underline flex items-center justify-center gap-1"
          >
            <Check size={11} /> Save
          </button>
        </div>
      )}
    </div>
  );
}

// ── QuestionTooltip ───────────────────────────────────────────────────────────
// Shows linked interview questions on hover over the competency header.

function QuestionTooltip({
  linkedIds,
  questions,
  allQuestions,
  canEdit,
  onLink,
}: {
  linkedIds: string[];
  questions: InterviewQuestion[];
  allQuestions: InterviewQuestion[];
  canEdit: boolean;
  onLink: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const linked = allQuestions.filter((q) => linkedIds.includes(q.id));

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!canEdit && linked.length === 0) return null;

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`ml-1 text-[10px] ${linked.length > 0 ? "text-[var(--teal)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
        title={linked.length > 0 ? `${linked.length} linked question(s)` : "Link interview questions"}
      >
        <Info size={10} />
      </button>
      {open && (
        <div className="absolute left-0 top-5 z-50 bg-white border border-[var(--border)] rounded-xl shadow-lg p-3 w-64 text-left">
          <p className="text-[11px] font-semibold text-[var(--foreground)] mb-2">Linked Questions</p>
          {allQuestions.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">No questions in this scorecard yet.</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {allQuestions.map((q) => (
                <label key={q.id} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={linkedIds.includes(q.id)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...linkedIds, q.id]
                        : linkedIds.filter((id) => id !== q.id);
                      onLink(next);
                    }}
                    disabled={!canEdit}
                    className="mt-0.5 accent-[var(--teal)]"
                  />
                  <span className="text-xs text-[var(--foreground)] leading-snug">
                    {q.prompt || "Untitled question"}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ScorecardGridPanel ────────────────────────────────────────────────────────

export function ScorecardGridPanel({
  scorecardId,
  planId,
  questions,
  canEdit,
}: {
  scorecardId: string;
  planId: string;
  questions: InterviewQuestion[];
  canEdit: boolean;
}) {
  const [competencies, setCompetencies] = useState<ScorecardCompetency[]>([]);
  const [candidates, setCandidates] = useState<ScorecardGridCandidate[]>([]);
  const [scores, setScores] = useState<Record<string, ScorecardCellScore>>({});
  const [loading, setLoading] = useState(true);

  // Load all grid data when scorecard changes.
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/workspaces/hiring/scorecard-grid/competencies?scorecard_id=${scorecardId}`).then((r) => r.json()),
      fetch(`/api/workspaces/hiring/scorecard-grid/candidates?scorecard_id=${scorecardId}`).then((r) => r.json()),
      fetch(`/api/workspaces/hiring/scorecard-grid/scores?scorecard_id=${scorecardId}`).then((r) => r.json()),
    ]).then(([comps, cands, rawScores]) => {
      setCompetencies(Array.isArray(comps) ? comps : []);
      setCandidates(Array.isArray(cands) ? cands : []);
      const scoreMap: Record<string, ScorecardCellScore> = {};
      if (Array.isArray(rawScores)) {
        for (const s of rawScores as ScorecardCellScore[]) {
          scoreMap[cellKey(s.candidate_id, s.competency_id)] = s;
        }
      }
      setScores(scoreMap);
    }).finally(() => setLoading(false));
  }, [scorecardId]);

  // ── Competency CRUD ──────────────────────────────────────────────────────────

  async function addCompetency() {
    const optimistic: ScorecardCompetency = {
      id: localId(),
      scorecard_id: scorecardId,
      plan_id: planId,
      label: "",
      multiplier: 1,
      description: null,
      linked_question_ids: [],
      order_index: competencies.length,
      created_at: "",
      updated_at: "",
    };
    setCompetencies((prev) => [...prev, optimistic]);
    const res = await fetch("/api/workspaces/hiring/scorecard-grid/competencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scorecard_id: scorecardId,
        label: "",
        multiplier: 1,
        order_index: competencies.length,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as ScorecardCompetency;
      setCompetencies((prev) => prev.map((c) => (c.id === optimistic.id ? created : c)));
    } else {
      setCompetencies((prev) => prev.filter((c) => c.id !== optimistic.id));
    }
  }

  const updateCompetency = useCallback(async (id: string, patch: Partial<ScorecardCompetency>) => {
    setCompetencies((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fetch("/api/workspaces/hiring/scorecard-grid/competencies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }, []);

  async function deleteCompetency(id: string) {
    setCompetencies((prev) => prev.filter((c) => c.id !== id));
    const newScores = { ...scores };
    for (const key of Object.keys(newScores)) {
      if (key.endsWith(`:${id}`)) delete newScores[key];
    }
    setScores(newScores);
    await fetch(`/api/workspaces/hiring/scorecard-grid/competencies?id=${id}`, { method: "DELETE" });
  }

  // ── Candidate CRUD ───────────────────────────────────────────────────────────

  async function addCandidate() {
    const optimistic: ScorecardGridCandidate = {
      id: localId(),
      scorecard_id: scorecardId,
      plan_id: planId,
      name: "",
      email: null,
      interviewed_at: null,
      interviewer: null,
      order_index: candidates.length,
      created_at: "",
      updated_at: "",
    };
    setCandidates((prev) => [...prev, optimistic]);
    const res = await fetch("/api/workspaces/hiring/scorecard-grid/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scorecard_id: scorecardId,
        name: "",
        order_index: candidates.length,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as ScorecardGridCandidate;
      setCandidates((prev) => prev.map((c) => (c.id === optimistic.id ? created : c)));
    } else {
      setCandidates((prev) => prev.filter((c) => c.id !== optimistic.id));
    }
  }

  const updateCandidate = useCallback(async (id: string, patch: Partial<ScorecardGridCandidate>) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fetch("/api/workspaces/hiring/scorecard-grid/candidates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
  }, []);

  async function deleteCandidate(id: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
    const newScores = { ...scores };
    for (const key of Object.keys(newScores)) {
      if (key.startsWith(`${id}:`)) delete newScores[key];
    }
    setScores(newScores);
    await fetch(`/api/workspaces/hiring/scorecard-grid/candidates?id=${id}`, { method: "DELETE" });
  }

  // ── Score upsert ─────────────────────────────────────────────────────────────

  const upsertScore = useCallback(async (
    candidateId: string,
    competencyId: string,
    score: number | null,
    notes: string | null
  ) => {
    const key = cellKey(candidateId, competencyId);
    const prev = scores[key];
    const optimistic: ScorecardCellScore = {
      id: prev?.id ?? localId(),
      scorecard_id: scorecardId,
      candidate_id: candidateId,
      competency_id: competencyId,
      plan_id: planId,
      score,
      notes: notes ?? prev?.notes ?? null,
      created_at: prev?.created_at ?? "",
      updated_at: "",
    };
    setScores((s) => ({ ...s, [key]: optimistic }));

    const res = await fetch("/api/workspaces/hiring/scorecard-grid/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scorecard_id: scorecardId,
        candidate_id: candidateId,
        competency_id: competencyId,
        score,
        notes: notes ?? prev?.notes ?? null,
      }),
    });
    if (res.ok) {
      const saved = (await res.json()) as ScorecardCellScore;
      setScores((s) => ({ ...s, [key]: saved }));
    }
  }, [scores, scorecardId, planId]);

  // ── Empty state ──────────────────────────────────────────────────────────────

  if (loading) {
    return <p className="text-sm text-[var(--muted-foreground)] py-4 text-center">Loading scorecard…</p>;
  }

  const maxTotal = maxPossible(competencies);

  // ── Print styles ──────────────────────────────────────────────────────────────

  return (
    <div className="scorecard-grid-panel">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .scorecard-grid-panel, .scorecard-grid-panel * { visibility: visible !important; }
          .scorecard-grid-panel { position: fixed; top: 0; left: 0; width: 100%; }
          .scorecard-print-hide { display: none !important; }
          .scorecard-print-table { font-size: 10px; }
        }
        @media (max-width: 375px) {
          .scorecard-desktop { display: none; }
          .scorecard-mobile { display: block; }
        }
        @media (min-width: 376px) {
          .scorecard-mobile { display: none; }
        }
      `}</style>

      {/* Header actions */}
      <div className="flex items-center justify-between mb-3 scorecard-print-hide">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--teal)]">
          Interview Grid
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--dark-grey)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-lg px-3 py-1.5"
        >
          <Printer size={12} />
          Print scorecard
        </button>
      </div>

      {/* Empty state */}
      {competencies.length === 0 && candidates.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border-medium)] py-10 text-center mb-3">
          <p className="text-sm text-[var(--dark-grey)] mb-1">No competencies or candidates yet.</p>
          {canEdit && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Add competencies (columns) and candidates (rows) below to start scoring.
            </p>
          )}
        </div>
      )}

      {/* Desktop grid */}
      {(competencies.length > 0 || candidates.length > 0) && (
        <div className="scorecard-desktop overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
          <table className="scorecard-print-table min-w-full border-collapse text-sm">
            <thead>
              <tr className="bg-[var(--neutral-cool-100)] border-b border-[var(--border)]">
                {/* Candidate column header */}
                <th className="sticky left-0 z-10 bg-[var(--neutral-cool-100)] px-3 py-2.5 text-left text-xs font-semibold text-[var(--foreground)] min-w-[140px] border-r border-[var(--border)]">
                  Candidate
                </th>
                {/* Competency headers */}
                {competencies.map((comp) => (
                  <th key={comp.id} className="px-2 py-2 text-center min-w-[110px] border-r border-[var(--border)]">
                    <div className="flex flex-col items-center gap-0.5">
                      {canEdit ? (
                        <div className="flex items-center gap-1 scorecard-print-hide">
                          <input
                            className="text-xs font-semibold text-[var(--foreground)] bg-transparent text-center border-b border-transparent hover:border-[var(--border-medium)] focus:border-[var(--teal)] focus-visible:outline-none w-20"
                            value={comp.label}
                            placeholder="Competency"
                            onChange={(e) => updateCompetency(comp.id, { label: e.target.value })}
                            onBlur={() => {}} // autosave on change already
                          />
                          <button
                            type="button"
                            onClick={() => deleteCompetency(comp.id)}
                            className="text-[var(--dark-grey)] hover:text-[var(--error)] shrink-0 scorecard-print-hide"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-[var(--foreground)]">{comp.label || "—"}</span>
                      )}
                      {/* Print-only label */}
                      <span className="hidden print:block text-xs font-semibold text-[var(--foreground)]">{comp.label || "—"}</span>
                      <div className="flex items-center gap-0.5">
                        {canEdit ? (
                          <div className="flex items-center gap-0.5 scorecard-print-hide">
                            <span className="text-[10px] text-[var(--muted-foreground)]">×</span>
                            <input
                              type="number"
                              min="0.1"
                              max="10"
                              step="0.1"
                              className="text-[10px] text-[var(--muted-foreground)] bg-transparent text-center border-b border-transparent hover:border-[var(--border-medium)] focus:border-[var(--teal)] focus-visible:outline-none w-10"
                              value={comp.multiplier}
                              onChange={(e) => updateCompetency(comp.id, { multiplier: parseFloat(e.target.value) || 1 })}
                            />
                          </div>
                        ) : (
                          <span className="text-[10px] text-[var(--muted-foreground)]">×{comp.multiplier}</span>
                        )}
                        <QuestionTooltip
                          linkedIds={comp.linked_question_ids}
                          questions={questions.filter((q) => q.scorecard_id === scorecardId || q.role_id !== null)}
                          allQuestions={questions}
                          canEdit={canEdit}
                          onLink={(ids) => updateCompetency(comp.id, { linked_question_ids: ids })}
                        />
                      </div>
                      {/* Print multiplier */}
                      <span className="hidden print:block text-[10px] text-[var(--muted-foreground)]">×{comp.multiplier}</span>
                    </div>
                  </th>
                ))}
                {/* Score column */}
                {candidates.length > 0 && (
                  <th className="px-3 py-2.5 text-center text-xs font-semibold text-[var(--foreground)] min-w-[90px]">
                    Score
                  </th>
                )}
                {/* Add competency CTA */}
                {canEdit && (
                  <th className="px-2 py-2 text-center scorecard-print-hide">
                    <button
                      type="button"
                      onClick={addCompetency}
                      className="flex items-center gap-1 text-xs font-semibold text-[var(--teal)] hover:text-[var(--teal-dark)] whitespace-nowrap"
                    >
                      <Plus size={11} /> Add
                    </button>
                  </th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--neutral-cool-100)]">
              {candidates.map((candidate) => {
                const total = weightedTotal(candidate.id, competencies, scores);
                const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
                return (
                  <tr key={candidate.id} className="hover:bg-[var(--neutral-cool-100)] transition-colors">
                    {/* Candidate name */}
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-[var(--border)]">
                      <div className="flex items-center gap-1">
                        {canEdit ? (
                          <>
                            <input
                              className="text-sm text-[var(--foreground)] bg-transparent border-b border-transparent hover:border-[var(--border-medium)] focus:border-[var(--teal)] focus-visible:outline-none flex-1 min-w-[100px] scorecard-print-hide"
                              value={candidate.name}
                              placeholder="Candidate name"
                              onChange={(e) => updateCandidate(candidate.id, { name: e.target.value })}
                            />
                            <span className="hidden print:block text-sm text-[var(--foreground)]">{candidate.name || "—"}</span>
                            <button
                              type="button"
                              onClick={() => deleteCandidate(candidate.id)}
                              className="text-[var(--dark-grey)] hover:text-[var(--error)] shrink-0 scorecard-print-hide"
                            >
                              <Trash2 size={11} />
                            </button>
                          </>
                        ) : (
                          <span className="text-sm text-[var(--foreground)]">{candidate.name || "—"}</span>
                        )}
                      </div>
                    </td>

                    {/* Score cells */}
                    {competencies.map((comp) => {
                      const cell = scores[cellKey(candidate.id, comp.id)];
                      return (
                        <td key={comp.id} className="px-2 py-2 text-center border-r border-[var(--border)]">
                          <ScoreInput
                            score={cell?.score ?? null}
                            notes={cell?.notes ?? null}
                            canEdit={canEdit}
                            isPrint={false}
                            onScore={(v) => upsertScore(candidate.id, comp.id, v, cell?.notes ?? null)}
                            onNotes={(v) => upsertScore(candidate.id, comp.id, cell?.score ?? null, v)}
                          />
                        </td>
                      );
                    })}

                    {/* Weighted total */}
                    {candidates.length > 0 && (
                      <td className="px-3 py-2 text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-sm font-semibold text-[var(--foreground)]">
                            {total.toFixed(total % 1 === 0 ? 0 : 1)}
                          </span>
                          {maxTotal > 0 && (
                            <span className="text-[10px] text-[var(--muted-foreground)]">{pct}%</span>
                          )}
                        </div>
                      </td>
                    )}
                    {canEdit && <td className="scorecard-print-hide" />}
                  </tr>
                );
              })}
            </tbody>

            {/* Footer: max possible per competency */}
            {competencies.length > 0 && candidates.length > 0 && (
              <tfoot>
                <tr className="bg-[var(--neutral-cool-100)] border-t border-[var(--border)]">
                  <td className="sticky left-0 z-10 bg-[var(--neutral-cool-100)] px-3 py-2 text-xs text-[var(--muted-foreground)] font-semibold border-r border-[var(--border)]">
                    Max possible
                  </td>
                  {competencies.map((comp) => (
                    <td key={comp.id} className="px-2 py-2 text-center text-xs text-[var(--muted-foreground)] border-r border-[var(--border)]">
                      {(5 * Number(comp.multiplier)).toFixed(1).replace(/\.0$/, "")}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center">
                    <span className="text-xs font-semibold text-[var(--muted-foreground)]">
                      {maxTotal.toFixed(maxTotal % 1 === 0 ? 0 : 1)}
                    </span>
                  </td>
                  {canEdit && <td className="scorecard-print-hide" />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Add candidate CTA */}
      {canEdit && (
        <button
          type="button"
          onClick={addCandidate}
          className="mt-2 flex items-center gap-1 text-xs font-semibold text-[var(--teal)] hover:text-[var(--teal-dark)] scorecard-print-hide"
        >
          <Plus size={12} /> Add candidate
        </button>
      )}

      {/* Mobile layout (≤375px) — per-candidate vertical cards */}
      <div className="scorecard-mobile space-y-3 mt-1">
        {candidates.map((candidate) => {
          const total = weightedTotal(candidate.id, competencies, scores);
          const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
          return (
            <div key={candidate.id} className="rounded-xl border border-[var(--border)] bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                {canEdit ? (
                  <input
                    className="text-sm font-semibold text-[var(--foreground)] bg-transparent border-b border-transparent hover:border-[var(--border-medium)] focus:border-[var(--teal)] focus-visible:outline-none flex-1"
                    value={candidate.name}
                    placeholder="Candidate name"
                    onChange={(e) => updateCandidate(candidate.id, { name: e.target.value })}
                  />
                ) : (
                  <span className="text-sm font-semibold text-[var(--foreground)]">{candidate.name || "—"}</span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => deleteCandidate(candidate.id)}
                    className="text-[var(--dark-grey)] hover:text-[var(--error)] ml-2"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {competencies.map((comp) => {
                  const cell = scores[cellKey(candidate.id, comp.id)];
                  return (
                    <div key={comp.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--foreground)] flex-1">{comp.label || "—"}</span>
                      <ScoreInput
                        score={cell?.score ?? null}
                        notes={cell?.notes ?? null}
                        canEdit={canEdit}
                        isPrint={false}
                        onScore={(v) => upsertScore(candidate.id, comp.id, v, cell?.notes ?? null)}
                        onNotes={(v) => upsertScore(candidate.id, comp.id, cell?.score ?? null, v)}
                      />
                    </div>
                  );
                })}
              </div>
              {maxTotal > 0 && (
                <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between">
                  <span className="text-xs text-[var(--muted-foreground)]">Score</span>
                  <span className="text-sm font-semibold text-[var(--foreground)]">
                    {total.toFixed(total % 1 === 0 ? 0 : 1)} / {maxTotal.toFixed(maxTotal % 1 === 0 ? 0 : 1)} ({pct}%)
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {canEdit && (
          <button
            type="button"
            onClick={addCandidate}
            className="flex items-center gap-1 text-xs font-semibold text-[var(--teal)] hover:text-[var(--teal-dark)]"
          >
            <Plus size={12} /> Add candidate
          </button>
        )}
      </div>
    </div>
  );
}
