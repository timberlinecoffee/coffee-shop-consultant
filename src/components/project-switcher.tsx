// TIM-2378 2G-C: sidebar project switcher + add-project modal.
// Sidebar block: "PROJECT" eyebrow + active project name + dropdown to switch.
// Add-project modal: name + city/location, POST /api/projects, 402 → /pricing.
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProUpgradePrompt } from "@/components/pro-upgrade-prompt";

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

export function ProjectSwitcher({ isPro }: ProjectSwitcherProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {});
  }, []);

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
    setSwitching(id);
    setMenuOpen(false);
    try {
      await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      router.refresh();
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
        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border)] bg-white text-left hover:bg-[var(--surface-warm-100)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]/50"
        aria-expanded={menuOpen}
        aria-haspopup="listbox"
      >
        <span className="flex-1 min-w-0 text-sm font-medium text-[var(--foreground)] truncate">
          {activeProject?.name ?? "My Project"}
        </span>
        {activeProject?.locationLabel && (
          <span className="text-xs text-[var(--dark-grey)] truncate max-w-[80px]">
            {activeProject.locationLabel}
          </span>
        )}
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
            <button
              key={p.id}
              role="option"
              aria-selected={p.isActive}
              onClick={() => {
                if (!p.isActive && switching !== p.id) switchProject(p.id);
              }}
              disabled={p.isActive || switching === p.id}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                p.isActive
                  ? "bg-[var(--teal)]/[0.07] text-[var(--teal)] font-medium cursor-default"
                  : "text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] cursor-pointer"
              }`}
            >
              <span className="flex-1 min-w-0">
                <span className="block truncate">{p.name}</span>
                {p.locationLabel && (
                  <span className="block text-xs text-[var(--dark-grey)] truncate mt-0.5">
                    {p.locationLabel}
                  </span>
                )}
              </span>
              {p.isActive && (
                <span className="flex-shrink-0 text-[11px] font-medium text-[var(--teal)] bg-[var(--teal)]/10 px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </button>
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

      <AddProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
      <ProUpgradePrompt
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="multi_project"
      />
    </div>
  );
}

function AddProjectModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Project name must be at least 2 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          locationLabel: locationLabel.trim() || undefined,
        }),
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
      router.push("/dashboard");
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
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
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-xl text-[var(--dark-grey)] hover:text-[var(--foreground)] hover:bg-[var(--surface-warm-100)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]/50"
          aria-label="Close"
        >
          <X size={18} aria-hidden="true" />
        </button>

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
      </div>
    </div>
  );
}
