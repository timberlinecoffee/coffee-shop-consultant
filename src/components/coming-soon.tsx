import Link from "next/link";

interface ComingSoonProps {
  title: string;
  description: string;
  icon: string;
  shipsWith: string;
}

export function ComingSoon({ title, description, icon, shipsWith }: ComingSoonProps) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <nav className="bg-white border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-[var(--teal)] font-medium hover:underline">
            ← Back to Dashboard
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl border border-[var(--border)] p-8 text-center">
          <div className="text-5xl mb-4" aria-hidden="true">{icon}</div>
          <h1 className="font-semibold text-2xl text-[var(--foreground)] mb-2">{title}</h1>
          <p className="text-sm text-[var(--muted-foreground)] mb-6 leading-relaxed">{description}</p>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-[var(--background)] rounded-full border border-[var(--border)] mb-8">
            <span className="text-xs font-medium text-[var(--teal)]">Coming soon</span>
            <span className="text-xs text-[var(--muted-foreground)]">· {shipsWith}</span>
          </div>
          <div>
            <Link
              href="/dashboard"
              className="inline-block bg-[var(--teal)] text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-[var(--teal-700)] transition-colors"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
