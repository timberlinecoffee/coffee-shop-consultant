export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-neutral-100 pb-16 lg:pb-0 animate-pulse">
      {/* Top bar */}
      <nav className="bg-white border-b border-grey-light px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="w-32 h-5 bg-grey-light rounded" />
          <div className="flex gap-4">
            <div className="w-16 h-4 bg-grey-light rounded" />
            <div className="w-16 h-4 bg-grey-light rounded" />
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Welcome + stats */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-6">
          <div>
            <div className="w-40 h-7 bg-grey-light rounded mb-2" />
            <div className="w-64 h-4 bg-grey-light rounded" />
          </div>
          <div className="flex gap-4">
            <div className="bg-white rounded-2xl border border-grey-light p-5 w-48 h-28" />
            <div className="bg-white rounded-2xl border border-grey-light p-5 w-40 h-28" />
          </div>
        </div>

        {/* Opening timeline placeholder */}
        <div className="bg-white rounded-xl border border-grey-light px-5 py-4 mb-10 h-16" />

        {/* Module grid */}
        <div className="w-40 h-5 bg-grey-light rounded mb-4" />
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-grey-light p-6 flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-grey-light flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="w-3/4 h-4 bg-grey-light rounded" />
                <div className="w-full h-3 bg-grey-light rounded" />
                <div className="w-2/3 h-3 bg-grey-light rounded" />
              </div>
            </div>
          ))}
        </div>

        {/* Quick links */}
        <div className="w-24 h-5 bg-grey-light rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-grey-light p-4 h-20" />
          ))}
        </div>
      </div>
    </div>
  );
}
