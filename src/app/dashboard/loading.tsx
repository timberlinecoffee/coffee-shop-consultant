export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-[var(--background)] pb-16 lg:pb-0 animate-pulse">
      {/* Top bar */}
      <nav className="bg-white border-b border-[var(--border)] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="w-32 h-5 bg-[var(--border)] rounded" />
          <div className="flex gap-4">
            <div className="w-16 h-4 bg-[var(--border)] rounded" />
            <div className="w-16 h-4 bg-[var(--border)] rounded" />
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Hero greeting + fact */}
        <div className="mb-10">
          <div className="w-72 h-8 bg-[var(--border)] rounded mb-3" />
          <div className="w-full max-w-2xl h-4 bg-[var(--border)] rounded" />
        </div>

        {/* Workspace list — grouped by phase */}
        <div className="w-40 h-4 bg-[var(--border)] rounded mb-4" />
        <div className="space-y-6 mb-10">
          {[3, 4, 3].map((rows, g) => (
            <div key={g}>
              <div className="w-24 h-4 bg-[var(--border)] rounded mb-1 ml-1" />
              <div className="w-56 h-3 bg-[var(--border)] rounded mb-2.5 ml-1" />
              <div className="bg-white rounded-xl border border-[var(--warm-550)] divide-y divide-[var(--warm-500)]">
                {Array.from({ length: rows }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-lg bg-[var(--border)] flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="w-1/3 h-3.5 bg-[var(--border)] rounded" />
                      <div className="w-2/3 h-3 bg-[var(--border)] rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="w-24 h-5 bg-[var(--border)] rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-[var(--border)] p-4 h-20" />
          ))}
        </div>
      </div>
    </div>
  );
}
