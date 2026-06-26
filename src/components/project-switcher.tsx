// TIM-2378 2G-C: sidebar project switcher + add-project modal.
// TIM-2915: per-plan delete control + reliable switching + toast on failure.
//   Switch now navigates to /dashboard to force a clean unmount of any
//   workspace page that has client-side state hydrated from the previous
//   active plan; router.refresh() alone left form state stale across switch.
//   Delete UI lives next to each non-active plan with a confirm modal;
//   wires to existing DELETE /api/projects/[id] which fails-over the active
//   pointer when the active plan is removed.
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Lock, X, Trash2 } from "lucide-react";
import { CollapseButton } from "@/components/ui/CollapseButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProUpgradePrompt } from "@/components/pro-upgrade-prompt";
import { OnboardingFlow } from "@/app/onboarding/onboarding-flow";

interface Project {
  id: string;
  name: string;
  locationLabel: string | null;
  createdAt: string;
  isActive: boolean;
}

interface ProjectSwitcherProps {
  isPro: boolean;
}

type Toast = { kind: "success" | "error"; message: string } | null;

export function ProjectSwitcher({ isPro }: ProjectSwitcherProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [interviewProjectId, setInterviewProjectId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // TIM-2915: dismiss toast after 4s. Re-set on every new toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const refetchProjects = useCallback(async () => {
    try {
      const r = await fetch("/api/projects");
      const d = await r.json();
      setProjects(d.projects ?? []);
    } catch {
      /* silent — sidebar will retry on next mount */
    }
  }, []);

  useEffect(() => {
    refetchProjects();
  }, [refetchProjects]);

  useEffect(() => {
    if (!menuOpen) return;
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  async function switchProject(id: string) {
    const target = projects.find((p) => p.id === id);
    setSwitching(id);
    setMenuOpen(false);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) {
        setToast({
          kind: "error",
          message: "Could not switch projects. Try again.",
        });
        setSwitching(null);
        return;
      }
      // TIM-2915: optimistically flip the active flag in local state so the
      // sidebar reflects the new active even though the ProjectSwitcher
      // component itself does not unmount on navigation (it lives in the
      // layout). Without this the switcher kept showing the old active
      // after PATCH 200, which is what the board reported as "click does
      // nothing." Then re-fetch to reconcile with the server.
      setProjects((prev) =>
        prev.map((p) => ({ ...p, isActive: p.id === id })),
      );
      setToast({
        kind: "success",
        message: target ? `Switched to ${target.name}` : "Project switched",
      });
      // Hard-navigate to /dashboard so any workspace page that hydrated
      // client state from the previous active plan unmounts. router.refresh()
      // alone re-runs server components but leaves stale useState in client
      // editors (concept, financials, etc).
      router.push("/dashboard");
      router.refresh();
      // Reconcile in the background — if the optimistic update is wrong for
      // any reason, the server response wins.
      refetchProjects();
    } catch {
      setToast({
        kind: "error",
        message: "Could not switch projects. Try again.",
      });
    } finally {
      setSwitching(null);
    }
  }

  const activeProject = projects.find((p) => p.isActive) ?? projects[0];

  if (projects.length === 0) return null;

  return (
    <div className="mb-6 relative" ref={menuRef}>
      <p className="section-eyebrow mb-1.5">Project</p>

      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl border border-[var(--border)] bg-white text-left hover:bg-[var(--surface-warm-100)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]/50"
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
      >
        <span className="flex-1 min-w-0 text-sm font-medium text-[var(--foreground)] truncate">
          {activeProject?.name ?? "My Project"}
        </span>
        <ChevronDown
          size={14}
          className={`flex-shrink-0 text-[var(--dark-grey)] transition-transform ${menuOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {menuOpen && (
        <div
          role="listbox"
          aria-label="Projects"
          className="absolute top-full left-0 right-0 mt-1 z-20 bg-white border border-[var(--border)] rounded-xl shadow-lg overflow-hidden"
        >
          {projects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              switching={switching === p.id}
              canDelete={projects.length > 1}
              onSwitch={() => {
                if (!p.isActive && switching !== p.id) switchProject(p.id);
              }}
              onDelete={() => {
                setMenuOpen(false);
                setDeleteTarget(p);
              }}
            />
          ))}

          <div className="border-t border-[var(--border)]" />

          {isPro ? (
            <button
              onClick={() => {
                setMenuOpen(false);
                setModalOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--teal)] hover:bg-[var(--surface-warm-100)] transition-colors"
            >
              <Plus size={14} aria-hidden="true" />
              Add Project
            </button>
          ) : (
            <button
              onClick={() => {
                setMenuOpen(false);
                setUpgradeOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--dark-grey)] hover:bg-[var(--surface-warm-100)] transition-colors"
            >
              <Lock size={14} aria-hidden="true" />
              <span className="text-xs">Upgrade to Pro for unlimited projects</span>
            </button>
          )}
        </div>
      )}

      {interviewProjectId && (
        <div
          className="fixed inset-0 z-[60] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Project interview"
        >
          <OnboardingFlow
            projectId={interviewProjectId}
            onDismiss={() => {
              setInterviewProjectId(null);
              router.push("/dashboard");
              router.refresh();
            }}
          />
        </div>
      )}
      <AddProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onOpenInterview={(projectId) => setInterviewProjectId(projectId)}
        onCreated={(project, activatedNow) => {
          // TIM-2962: upsert by id. AddProjectModal calls onCreated twice for
          // the same project — once on create (activatedNow=false) and again
          // on "Open Project" (activatedNow=true). Unconditional prepend left
          // two visible entries for one DB row. Strip any prior entry for
          // this id before prepending so the row appears exactly once.
          setProjects((prev) => {
            const others = prev.filter((p) => p.id !== project.id);
            return [
              { ...project, isActive: activatedNow },
              ...others.map((p) => ({ ...p, isActive: activatedNow ? false : p.isActive })),
            ];
          });
        }}
      />
      <ProUpgradePrompt
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="multi_project"
      />
      <DeleteProjectModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={async (deleted) => {
          setDeleteTarget(null);
          setToast({
            kind: "success",
            message: `Deleted ${deleted.name}`,
          });
          await refetchProjects();
          // If the deleted project was the active one, the server picked a
          // new active for us — push to /dashboard so any current workspace
          // page (which was rendering the now-deleted plan) unmounts.
          if (deleted.isActive) {
            router.push("/dashboard");
            router.refresh();
          }
        }}
        onError={(msg) => {
          setDeleteTarget(null);
          setToast({ kind: "error", message: msg });
        }}
      />

      {toast && (
        <div
          role="status"
          data-testid="project-switcher-toast"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg max-w-sm text-sm font-medium ${
            toast.kind === "success"
              ? "bg-[var(--teal)] text-white"
              : "bg-red-600 text-white"
          }`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-white/80 hover:text-white focus-visible:outline-none"
            aria-label="Dismiss"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  project,
  switching,
  canDelete,
  onSwitch,
  onDelete,
}: {
  project: Project;
  switching: boolean;
  canDelete: boolean;
  onSwitch: () => void;
  onDelete: () => void;
}) {
  // TIM-2915: row is a single button for switch; delete is a separate button
  // overlaid on the right so a click on the trash icon does NOT switch.
  return (
    <div
      role="option"
      aria-selected={project.isActive}
      className={`group relative flex items-center gap-2 ${
        project.isActive
          ? "bg-[var(--teal)]/[0.07]"
          : "hover:bg-[var(--surface-warm-100)]"
      }`}
    >
      <button
        onClick={onSwitch}
        disabled={project.isActive || switching}
        className={`flex-1 flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
          project.isActive
            ? "text-[var(--teal)] font-medium cursor-default"
            : "text-[var(--foreground)] cursor-pointer"
        }`}
      >
        <span className="flex-1 min-w-0 truncate">{project.name}</span>
        {project.isActive && (
          <span className="flex-shrink-0 text-[11px] font-medium text-[var(--teal)] bg-[var(--teal)]/10 px-1.5 py-0.5 rounded-full">
            Active
          </span>
        )}
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex-shrink-0 p-2 mr-1 rounded-lg text-[var(--dark-grey)] hover:text-red-600 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 opacity-100"
          aria-label={`Delete ${project.name}`}
          title={`Delete ${project.name}`}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function DeleteProjectModal({
  target,
  onClose,
  onDeleted,
  onError,
}: {
  target: Project | null;
  onClose: () => void;
  onDeleted: (deleted: Project) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  useEffect(() => {
    if (target) {
      setDeleting(false);
      deletingRef.current = false;
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deletingRef.current) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  async function confirmDelete() {
    if (!target || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${target.id}`, { method: "DELETE" });
      if (res.status === 204) {
        await onDeleted(target);
        return;
      }
      const data = await res.json().catch(() => ({}));
      onError(data.error ?? "Could not delete project. Try again.");
    } catch {
      onError("Could not delete project. Try again.");
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  if (!target) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-project-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={deleting ? undefined : onClose}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-8">
        <button
          onClick={onClose}
          disabled={deleting}
          className="absolute top-4 right-4 p-1 rounded-xl text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]/50 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Close"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <h2
          id="delete-project-modal-title"
          className="text-lg font-bold text-[var(--foreground)] mb-1"
        >
          Delete project?
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-2">
          This permanently removes{" "}
          <span className="font-medium text-[var(--foreground)]">{target.name}</span>
          {target.locationLabel ? <> in {target.locationLabel}</> : null} and all its
          plan data. This cannot be undone.
        </p>
        {target.isActive && (
          <p className="text-sm text-[var(--foreground)] bg-[var(--surface-warm-100)] border border-[var(--border)] rounded-lg px-3 py-2 mb-2">
            This is your active project. We will switch you to your next-newest
            project after deleting it.
          </p>
        )}

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="lg"
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={confirmDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AddProjectModal({
  open,
  onClose,
  onCreated,
  onOpenInterview,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project, activatedNow: boolean) => void;
  onOpenInterview?: (projectId: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  const [switching, setSwitching] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  // TIM-2865: synchronous re-entry guard. setSubmitting/disabled don't block
  // a second submit in the same JS turn (rapid double-click / Enter+Enter).
  // The ref check fires before any await, so a second handler exits immediately.
  const submittingRef = useRef(false);
  // TIM-2865: per-form-mount idempotency key. Sent on every retry from this
  // modal instance so the server can dedup, and so any future migration that
  // adds a unique index can backfill cleanly.
  const idempotencyKeyRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submittingRef.current) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey]);

  useEffect(() => {
    if (open) {
      setName("");
      setLocationLabel("");
      setError(null);
      setCreatedProject(null);
      setSwitching(false);
      submittingRef.current = false;
      idempotencyKeyRef.current =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setTimeout(() => nameRef.current?.focus(), 50);
    } else {
      // Cancel any in-flight create when modal closes.
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TIM-2865: synchronous double-submit guard. Without this, Enter+Enter or
    // rage-clicks fire two POSTs before React commits `disabled={submitting}`,
    // which is exactly how a Pro user got two identical empty projects.
    if (submittingRef.current) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Project name must be at least 2 characters.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          name: trimmed,
          locationLabel: locationLabel.trim() || undefined,
          idempotencyKey: idempotencyKeyRef.current,
        }),
        signal: controller.signal,
      });
      if (res.status === 402) {
        router.push("/pricing");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      const project = data.project as Project | undefined;
      if (project?.id) {
        // TIM-2865: do NOT auto-switch the active project. Board reported on
        // TIM-2854 that the silent context switch made their original project
        // look "erased". Show an explicit success state with a clear choice.
        setCreatedProject(project);
        onCreated(project, false);
      } else {
        onClose();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Something went wrong. Try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function openCreatedProject() {
    if (!createdProject || switching) return;
    setSwitching(true);
    try {
      const res = await fetch(`/api/projects/${createdProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) {
        setError("Could not switch to the new project. Try again.");
        setSwitching(false);
        return;
      }
      onCreated(createdProject, true);
      onClose();
      if (onOpenInterview) {
        // TIM-3155: Pro new project → launch trimmed interview before navigating.
        onOpenInterview(createdProject.id);
      } else {
        // TIM-2915: hard-navigate so any workspace page that loaded with the
        // previous active plan's data unmounts.
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Could not switch to the new project. Try again.");
      setSwitching(false);
    }
  }

  function stayOnCurrentProject() {
    onClose();
    router.refresh();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-project-modal-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-8">
        <CollapseButton
          onClick={onClose}
          disabled={submitting}
          size={18}
          className="absolute top-4 right-4 p-1 rounded-xl text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]/50 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Close"
        />

        {createdProject ? (
          <>
            <h2
              id="add-project-modal-title"
              className="text-lg font-bold text-[var(--foreground)] mb-1"
            >
              Project Created
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">
              <span className="font-medium text-[var(--foreground)]">
                {createdProject.name}
              </span>
              {createdProject.locationLabel ? (
                <> in {createdProject.locationLabel}</>
              ) : null}{" "}
              is ready. Your current project is unchanged.
            </p>

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={stayOnCurrentProject}
                disabled={switching}
              >
                Stay Here
              </Button>
              <Button
                type="button"
                size="lg"
                className="flex-1"
                onClick={openCreatedProject}
                disabled={switching}
              >
                {switching ? "Opening..." : "Open Project"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h2
              id="add-project-modal-title"
              className="text-lg font-bold text-[var(--foreground)] mb-1"
            >
              Add Project
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">
              Create a new project to plan a second location.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="add-project-name"
              className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
            >
              Project name <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <Input
              ref={nameRef}
              id="add-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Downtown Location"
              required
              minLength={2}
            />
          </div>
          <div>
            <label
              htmlFor="add-project-location"
              className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
            >
              City or location{" "}
              <span className="text-[var(--dark-grey)] font-normal">
                (optional)
              </span>
            </label>
            <Input
              id="add-project-location"
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="e.g. Portland, OR"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              className="flex-1"
              disabled={submitting}
            >
              {submitting ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
          </>
        )}
      </div>
    </div>
  );
}
