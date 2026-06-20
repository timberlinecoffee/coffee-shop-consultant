// TIM-2378 2G-C: interactive projects table for /account/projects.
// Rename → inline PATCH, delete → typed-name confirm → DELETE.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ProjectRow {
  id: string;
  name: string;
  locationLabel: string | null;
  createdAt: string;
  isActive: boolean;
}

interface Props {
  initialProjects: ProjectRow[];
  isPro: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DeleteConfirmModal({
  project,
  onCancel,
  onDeleted,
}: {
  project: ProjectRow;
  onCancel: () => void;
  onDeleted: (id: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dependentRowCount, setDependentRowCount] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${project.id}/stats`)
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.dependentRowCount === "number") {
          setDependentRowCount(data.dependentRowCount);
        }
      })
      .catch(() => {/* fall back to generic copy */});
  }, [project.id]);

  const confirmed = typed.trim() === project.name.trim();

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "This project cannot be deleted.");
        return;
      }
      if (!res.ok) {
        setError("Something went wrong. Try again.");
        return;
      }
      onDeleted(project.id);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-project-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-8">
        <h2
          id="delete-project-title"
          className="text-lg font-bold text-[var(--foreground)] mb-2"
        >
          Delete Project
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          This will permanently delete{" "}
          <span className="font-semibold text-[var(--foreground)]">
            {project.name}
          </span>
          {dependentRowCount !== 0 && (
            <>
              {" "}
              {dependentRowCount === null
                ? "and all of its data"
                : `and its ${dependentRowCount} saved ${
                    dependentRowCount === 1 ? "record" : "records"
                  }`}
            </>
          )}
          . This cannot be undone.
        </p>
        <div className="mb-4">
          <label
            htmlFor="delete-confirm-name"
            className="block text-sm font-medium text-[var(--foreground)] mb-1.5"
          >
            Type the project name to confirm
          </label>
          <Input
            id="delete-confirm-name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={project.name}
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="flex-1"
            disabled={!confirmed || deleting}
            onClick={handleDelete}
          >
            {deleting ? "Deleting..." : "Delete Project"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RenameRow({
  project,
  onSaved,
  onCancel,
}: {
  project: ProjectRow;
  onSaved: (id: string, name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }
    if (trimmed === project.name) {
      onCancel();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not rename project.");
        return;
      }
      onSaved(project.id, trimmed);
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <td colSpan={5} className="px-4 py-3">
      <div className="flex items-center gap-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") onCancel();
          }}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </td>
  );
}

export function ProjectsTable({ initialProjects, isPro }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>(initialProjects);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<ProjectRow | null>(
    null,
  );

  function handleRenamed(id: string, name: string) {
    setProjects((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p)),
    );
    setRenamingId(null);
  }

  function handleDeleted(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setDeletingProject(null);
    router.refresh();
  }

  if (projects.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[var(--border)] p-8 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">
          No projects yet.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-[var(--border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--dark-grey)] uppercase tracking-wide">
                Name
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--dark-grey)] uppercase tracking-wide hidden sm:table-cell">
                Location
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--dark-grey)] uppercase tracking-wide hidden md:table-cell">
                Created
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--dark-grey)] uppercase tracking-wide">
                Status
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-[var(--dark-grey)] uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {projects.map((project) =>
              renamingId === project.id ? (
                <tr key={project.id}>
                  <RenameRow
                    project={project}
                    onSaved={handleRenamed}
                    onCancel={() => setRenamingId(null)}
                  />
                </tr>
              ) : (
                <tr
                  key={project.id}
                  className="hover:bg-[var(--surface-warm-100)] transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                    {project.name}
                  </td>
                  <td className="px-4 py-3 text-[var(--dark-grey)] hidden sm:table-cell">
                    {project.locationLabel ?? (
                      <span className="text-[var(--neutral-cool-400)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--dark-grey)] hidden md:table-cell">
                    {formatDate(project.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {project.isActive ? (
                      <span className="inline-flex items-center text-[11px] font-medium text-[var(--teal)] bg-[var(--teal)]/10 px-2 py-0.5 rounded-full">
                        Active
                      </span>
                    ) : (
                      <span className="text-[var(--neutral-cool-400)] text-xs">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setRenamingId(project.id)}
                      >
                        Rename
                      </Button>
                      <Button
                        size="xs"
                        variant="destructive"
                        disabled={projects.length === 1}
                        title={
                          projects.length === 1
                            ? "Cannot delete your only project"
                            : undefined
                        }
                        onClick={() => setDeletingProject(project)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      {!isPro && (
        <div className="bg-white rounded-2xl border border-[var(--border)] p-5">
          <p className="text-sm text-[var(--foreground)] font-medium mb-1">
            Multiple Projects
          </p>
          <p className="text-sm text-[var(--dark-grey)] mb-3">
            Planning a second location? Manage unlimited projects on Pro.
          </p>
          <Link
            href="/pricing?ref=multiple-projects"
            className="text-sm font-medium text-[var(--teal)] hover:underline"
          >
            See Pro plans →
          </Link>
        </div>
      )}

      {deletingProject && (
        <DeleteConfirmModal
          project={deletingProject}
          onCancel={() => setDeletingProject(null)}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
